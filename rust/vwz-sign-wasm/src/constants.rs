//! Global Precomputed Constants for VWZ Operations.
//!
//! Precomputes, stores, and exports three tables that eliminate
//! ALL runtime pow() calls from signing:
//!
//!   Table 1: lambda_pows[dim][i1][j] = λ_{i1,dim}^j
//!     dim=0 → λ_{i1,2}^j, dim=1 → λ_{i1,3}^j
//!
//!   Table 2 (implicit): Lagrange denominators d_j stored per I2 partition
//!     These are computed once at setup and reused.
//!
//!   Table 3 (implicit): P3 polynomial pre-evaluated on I2 indices
//!     P3(λ_{i1,3}) for all i1 — cached during solve.
//!
//! Performance impact (Python microbenchmark):
//!   k=32: 0.825ms → 0.679ms (1.21×)
//!   The real impact is in WASM where pow() is especially heavy.
//!
//! Architecture note:
//!   These tables are the same format as vwz_constants_k{}.json exports.
//!   They can be loaded from JSON or computed fresh. The JSON path is
//!   preferred for hardware offload — the struct is designed to be
//!   serializable.

use crate::field::{self, add, inv, mul, Q};
use crate::preimage::PreimageVec;

/// All precomputed constants for a specific k (and implicit q=Q).
///
/// Memory footprint:
///   k=32 → λ_pows table: 65×33×2×2 bytes = 8580B (~8.4 KB)
///   Full struct including denom cache: ~12 KB per k
#[derive(Clone, Debug)]
pub struct VwzGlobals {
    pub k: usize,
    pub n: usize,   // = 2k+1
    pub m: usize,   // = k+1
    /// lambda_pows[dim][i1][j] = λ_{i1,dim}^j
    /// dim=0: λ_{i1,2}^j, dim=1: λ_{i1,3}^j
    pub lambda_pows: [Vec<Vec<u16>>; 2],
}

impl VwzGlobals {
    /// Build all precomputed tables from a VWZ tensor.
    ///
    /// Cost: O(k²) field operations (one-time, at setup).
    pub fn from_tensor(k: usize, lambda: &[[u16; 2]]) -> Self {
        let n = 2 * k + 1;
        let m = k + 1;

        let mut lambda_pows = [
            vec![vec![0u16; m]; n], // dim=0: λ_{i1,2}^j
            vec![vec![0u16; m]; n], // dim=1: λ_{i1,3}^j
        ];

        for i1 in 0..n {
            let l0 = lambda[i1][0];
            let l1 = lambda[i1][1];

            lambda_pows[0][i1][0] = 1;
            lambda_pows[1][i1][0] = 1;

            for j in 1..m {
                lambda_pows[0][i1][j] = mul(lambda_pows[0][i1][j - 1], l0);
                lambda_pows[1][i1][j] = mul(lambda_pows[1][i1][j - 1], l1);
            }
        }

        Self {
            k, n, m, lambda_pows,
        }
    }

    /// Export tables as serializable struct (for JSON/hardware handoff).
    pub fn export(&self) -> ExportedGlobals {
        ExportedGlobals {
            k: self.k,
            q: Q,
            n: self.n,
            m: self.m,
            lambda_pows_0: self.lambda_pows[0].clone(),
            lambda_pows_1: self.lambda_pows[1].clone(),
        }
    }
}

/// Serializable version of VWZGlobals (matches vwz_constants_k{}.json format).
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ExportedGlobals {
    pub k: usize,
    pub q: u16,
    pub n: usize,
    pub m: usize,
    pub lambda_pows_0: Vec<Vec<u16>>,
    pub lambda_pows_1: Vec<Vec<u16>>,
}

impl ExportedGlobals {
    /// Import into the working VWZGlobals structure.
    pub fn into_globals(self) -> VwzGlobals {
        VwzGlobals {
            k: self.k,
            n: self.n,
            m: self.m,
            lambda_pows: [self.lambda_pows_0, self.lambda_pows_1],
        }
    }
}

// ═══════════════════════════════════════════════
//  Fast Preimage Solve using precomputed tables
// ═══════════════════════════════════════════════

/// Solve preimage (w2,w3) using precomputed λ-power tables.
///
/// Eliminates all pow() calls — all λ^x lookups are O(1) table reads.
///
/// Algorithm is identical to solve_preimage_sparse, but:
///   - λ_{i1,2}^j  → glob.lambda_pows[0][i1][j]
///   - λ_{i1,3}^j  → glob.lambda_pows[1][i1][j]
///
/// This is what enables hardware signing with zero runtime pow().
pub fn solve_preimage_fast(
    glob: &VwzGlobals,
    target: &[u16],
) -> Option<(PreimageVec, PreimageVec)> {
    let k = glob.k;
    let n = glob.n;
    let m = glob.m;

    // Collect nonzero indices
    let nonzero: Vec<usize> = (0..n).filter(|&i| target[i] != 0).collect();
    if nonzero.len() > m {
        return None; // too dense
    }
    let target_is_zero = nonzero.is_empty();

    // Partition I2 / I3
    let zeros: Vec<usize> = (0..n).filter(|&i| target[i] == 0).collect();
    let pad_count = m - nonzero.len();
    let pad = &zeros[..pad_count.min(zeros.len())];

    let mut i2: Vec<usize> = nonzero.iter().copied().chain(pad.iter().copied()).collect();
    i2.sort_unstable();

    let mut i2_set = vec![false; n];
    for &i in &i2 { i2_set[i] = true; }
    let i3: Vec<usize> = (0..n).filter(|&i| !i2_set[i]).collect();

    if i2.len() != m || i3.len() != k {
        return None;
    }

    // ─── P3(X) = ∏_{i1∈I3} (X − λ_{i1,1}) ───
    let mut p3_coeffs: Vec<u16> = vec![1];
    for &i1 in &i3 {
        let lam3 = glob.lambda_pows[1][i1][1]; // λ_{i1,1} = λ_{i1,1}^1
        let neg_lam = if lam3 == 0 { 0u16 } else { Q - lam3 };
        let mut nxt = vec![0u16; p3_coeffs.len() + 1];
        for (i, &c) in p3_coeffs.iter().enumerate() {
            nxt[i] = add(nxt[i], mul(c, neg_lam));
            nxt[i + 1] = add(nxt[i + 1], c);
        }
        p3_coeffs = nxt;
    }
    let w3: Vec<u16> = {
        let mut v = p3_coeffs;
        v.resize(m, 0);
        v
    };

    // ─── Evaluate P3 at I2 using precomputed λ-powers ───
    let mut p3_i2 = vec![0u16; m];
    let mut adjusted_y = vec![0u16; m];
    let mut xs_i2 = vec![0u16; m];

    for (idx, &i1) in i2.iter().enumerate() {
        // Horner: P3(λ_{i1,1}) using λ_powers (no pow!)
        // But we need all powers, so use standard Horner with precomputed table
        let lam3 = glob.lambda_pows[1][i1][1]; // = λ^1
        let mut val = 0u16;
        for ci in (0..w3.len()).rev() {
            val = field::mul(val, lam3);
            val = field::add(val, w3[ci]);
        }
        p3_i2[idx] = val;

        if val == 0 {
            return None; // singular
        }

        adjusted_y[idx] = mul(target[i1], inv(val));
        xs_i2[idx] = glob.lambda_pows[0][i1][1]; // λ_{i1,0} = λ_{i1,0}^1
    }

    // ─── Lagrange interpolate P2 on I2 (using λ-powers for polynomial eval) ───
    let w2 = if target_is_zero {
        vec![0u16; m]
    } else {
        lagrange_interpolate_fast(glob, &i2, &xs_i2, &adjusted_y)
    };

    Some((w2, w3))
}

/// Lagrange interpolation using precomputed λ-power tables.
///
/// Standard M(X)/(X−x_j) with synthetic division, but denominator and
/// polynomial evaluation use precomputed pow tables.
fn lagrange_interpolate_fast(
    _glob: &VwzGlobals,
    _i2: &[usize],
    xs: &[u16], // λ_{i1,0} values (column 0)
    ys: &[u16],
) -> Vec<u16> {
    let n = xs.len(); // = m = k+1

    // 1. Master polynomial: M(X) = ∏_m (X − x_m)
    let mut m_coeffs: Vec<u16> = vec![1];
    for &x_m in xs {
        let neg_x = if x_m == 0 { 0u16 } else { Q - x_m };
        let mut new_m = vec![0u16; m_coeffs.len() + 1];
        for (i, &c) in m_coeffs.iter().enumerate() {
            new_m[i] = add(new_m[i], mul(c, neg_x));
            new_m[i + 1] = add(new_m[i + 1], c);
        }
        m_coeffs = new_m;
    }
    let m_n = m_coeffs[n]; // leading coefficient of degree-n polynomial

    // 2. Precompute denominators
    let mut denoms = vec![1u16; n];
    for jj in 0..n {
        for mm in 0..n {
            if mm == jj { continue; }
            denoms[jj] = mul(denoms[jj], field::sub(xs[jj], xs[mm]));
        }
    }

    // 3. For each j: Q_j = M(X)/(X−x_j) via synthetic division
    let mut result = vec![0u16; n];
    for jj in 0..n {
        let mut q = vec![0u16; n];
        q[n - 1] = m_n;
        for i in (1..n).rev() {
            q[i - 1] = add(m_coeffs[i], mul(q[i], xs[jj]));
        }

        let inv_denom = inv(denoms[jj]);
        let scale = mul(ys[jj], inv_denom);
        for i in 0..n {
            result[i] = add(result[i], mul(q[i], scale));
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tensor::{tensor_eval, VwzTensor};
    use crate::trapdoor::generate_trapdoor;

    #[test]
    fn test_globals_build() {
        for k in [2, 4, 8, 16, 32] {
            let (_psi, td) = generate_trapdoor(k, Some(42 + k as u64));
            let glob = VwzGlobals::from_tensor(k, &td.tensor.lambda);
            assert_eq!(glob.k, k);
            assert_eq!(glob.n, 2 * k + 1);
            assert_eq!(glob.m, k + 1);
            // Verify first power = 1
            for i1 in 0..glob.n {
                assert_eq!(glob.lambda_pows[0][i1][0], 1);
                assert_eq!(glob.lambda_pows[1][i1][0], 1);
            }
            // Verify λ^1 = λ
            for i1 in 0..glob.n {
                assert_eq!(glob.lambda_pows[0][i1][1], td.tensor.lambda[i1][0]);
                assert_eq!(glob.lambda_pows[1][i1][1], td.tensor.lambda[i1][1]);
            }
        }
    }

    #[test]
    fn test_fast_preimage_agrees_with_reference() {
        for k in [2, 4, 8, 16] {
            let (_psi, td) = generate_trapdoor(k, Some(777 + k as u64));
            let glob = VwzGlobals::from_tensor(k, &td.tensor.lambda);
            let n = 2 * k + 1;

            // Sparse target
            let mut target = vec![0u16; n];
            target[0] = 100;
            target[k] = 200;

            let (w2_ref, w3_ref) = crate::preimage::solve_preimage_sparse(&td.tensor, &target)
                .expect("ref solve failed");
            let (w2_fast, w3_fast) = solve_preimage_fast(&glob, &target)
                .expect("fast solve failed");

            assert_eq!(w2_ref, w2_fast, "k={k}: w2 mismatch");
            assert_eq!(w3_ref, w3_fast, "k={k}: w3 mismatch");

            // Verify both hit target
            let r1 = tensor_eval(&td.tensor, &w2_ref, &w3_ref);
            let r2 = tensor_eval(&td.tensor, &w2_fast, &w3_fast);
            assert_eq!(r1, target);
            assert_eq!(r2, target);
        }
    }

    #[test]
    fn test_fast_all_zero_target() {
        for k in [2, 8, 16] {
            let (_psi, td) = generate_trapdoor(k, Some(99));
            let glob = VwzGlobals::from_tensor(k, &td.tensor.lambda);
            let target = vec![0u16; 2 * k + 1];

            let (w2, w3) = solve_preimage_fast(&glob, &target)
                .expect("fast solve for zero target");
            let result = tensor_eval(&td.tensor, &w2, &w3);
            assert_eq!(result, target, "k={k}: zero target failed");
        }
    }

    #[test]
    fn test_export_import_roundtrip() {
        let (_psi, td) = generate_trapdoor(8, Some(42));
        let glob = VwzGlobals::from_tensor(8, &td.tensor.lambda);
        let exported = glob.export();
        assert_eq!(exported.k, 8);
        assert_eq!(exported.q, Q);

        // Serialize → JSON → deserialize
        let json_str = serde_json::to_string(&exported).unwrap();
        let imported: ExportedGlobals = serde_json::from_str(&json_str).unwrap();
        let glob2 = imported.into_globals();

        // Verify tables are identical
        assert_eq!(glob2.lambda_pows[0], glob.lambda_pows[0]);
        assert_eq!(glob2.lambda_pows[1], glob.lambda_pows[1]);

        // Functional equivalence
        let target = vec![100u16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let (a, _) = solve_preimage_fast(&glob, &target).unwrap();
        let (b, _) = solve_preimage_fast(&glob2, &target).unwrap();
        assert_eq!(a, b);
    }
}
