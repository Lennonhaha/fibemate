//! Preimage sampling for the mixed Vandermonde tensor (hardened scheme).
//!
//! Given the trapdoor `Trapdoor` and a SPARSE target vector
//! t ∈ F_q^{2k+2} (Hamming weight = k+1), finds (w2, w3) ∈ (F_q^{2k+1})²
//! such that `public_eval(pk, w2, w3) = t`.
//!
//! The public tensor is rank-2 per slice (sum of two rank-1 outer
//! products), so the verification equation is a *sum* of two bilinear
//! terms and cannot be separated by an attacker:
//!
//!   t[i1] = x1[i1] · ( P2a(λa[i1])·P3a(λc[i1]) + P2b(λb[i1])·P3b(λc[i1]) )
//!
//! where u2 = X2a·w2, u3 = X3a·w3, and
//!   P2a(λa) = Σ_j u2[j]·λa^j,  P3a(λc) = Σ_j u3[j]·λc^j,
//!   P2b(λb) = Σ_j (M2·u2)[j]·λb^j,  P3b(λc) = Σ_j (M3·u3)[j]·λc^j
//!
//! Sampling algorithm (Z = zero positions, S = nonzero positions):
//!   1. Split Z into Za ∪ Zb with |Za|+|Zb| = |Z|+1 (exactly one overlap),
//!      so that |Z_only_a| + |Z_only_b| + |S| = m — a square u2 system.
//!   2. Choose u3 in the nullspace of
//!        { vand(λc[i1])        : i1 ∈ Za }  ∪
//!        { M3ᵀ·vand(λc[i1])    : i1 ∈ Zb }
//!      (random nonzero combination) such that P3a, P3b ≠ 0 on all of S.
//!   3. Solve the m×m linear system for u2:
//!        i1 ∈ S:        P2a(λa)·P3a + P2b(λb)·P3b = target[i1]/x1[i1]
//!        i1 ∈ Za \ Zb:  P2b(λb[i1]) = 0
//!        i1 ∈ Zb \ Za:  P2a(λa[i1]) = 0
//!   4. w2 = X2a⁻¹·u2, w3 = X3a⁻¹·u3.
//!
//! The RNG used for the nullspace combination is seeded deterministically
//! from the trapdoor keygen seed and the target, keeping Hash-and-Sign
//! deterministic.

use crate::field::{self, add, inv, mul, Q};
use crate::trapdoor::Trapdoor;

/// Preimage vector type alias.
pub type PreimageVec = Vec<u16>;

// ============================================================
// Deterministic RNG (same LCRNG as trapdoor keygen)
// ============================================================

#[derive(Clone)]
pub(crate) struct SeedRng {
    state: u64,
}

impl SeedRng {
    pub(crate) fn new(seed: u64) -> Self {
        Self { state: seed.wrapping_add(0xDEADBEEF_CAFEBABE) }
    }
    pub(crate) fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.state
    }
    pub(crate) fn next_u16_mod(&mut self, modulus: u16) -> u16 {
        (self.next_u64() as u32 % modulus as u32) as u16
    }
    pub(crate) fn randrange(&mut self, lo: u16, hi: u16) -> u16 {
        lo + self.next_u16_mod(hi - lo)
    }
}

/// Derive a deterministic sampling seed from (keygen seed, target).
fn sample_seed(keygen_seed: u64, target: &[u16]) -> u64 {
    let mut h = keygen_seed.wrapping_add(0x9E3779B97F4A7C15);
    for &t in target {
        h = h.wrapping_mul(0x5851F42D4C957F2D).wrapping_add(t as u64).wrapping_add(0x14057B7EF767814F);
    }
    h
}

// ============================================================
// Linear algebra over F_q
// ============================================================

/// vand(λ, m) = [1, λ, λ², ..., λ^{m-1}] mod Q.
pub fn vand(lam: u16, m: usize) -> Vec<u16> {
    let mut v = vec![1u16; m];
    for j in 1..m {
        v[j] = field::mul(v[j - 1], lam);
    }
    v
}

/// Dot product mod Q.
pub fn dot(a: &[u16], b: &[u16]) -> u16 {
    let mut s = 0u64;
    for i in 0..a.len() {
        s += a[i] as u64 * b[i] as u64;
    }
    (s % Q as u64) as u16
}

/// y = A · x mod Q.
pub fn mat_vec(a: &[Vec<u16>], x: &[u16]) -> Vec<u16> {
    a.iter().map(|row| dot(row, x)).collect()
}

/// y = Aᵀ · x mod Q  (column-oriented).
pub fn mat_t_vec(a: &[Vec<u16>], x: &[u16]) -> Vec<u16> {
    let ncols = a[0].len();
    (0..ncols)
        .map(|j| {
            let mut s = 0u64;
            for (i, row) in a.iter().enumerate() {
                s += row[j] as u64 * x[i] as u64;
            }
            (s % Q as u64) as u16
        })
        .collect()
}

/// Transpose of a matrix.
pub fn transpose(a: &[Vec<u16>]) -> Vec<Vec<u16>> {
    if a.is_empty() {
        return vec![];
    }
    let nrows = a.len();
    let ncols = a[0].len();
    (0..ncols)
        .map(|j| (0..nrows).map(|i| a[i][j]).collect())
        .collect()
}

/// C = A · B mod Q.
pub fn mat_mul(a: &[Vec<u16>], b: &[Vec<u16>]) -> Vec<Vec<u16>> {
    let n = a.len();
    let m = b[0].len();
    let k = a[0].len();
    let bt = transpose(b);
    (0..n)
        .map(|i| {
            (0..m)
                .map(|j| {
                    let mut s = 0u64;
                    for t in 0..k {
                        s += a[i][t] as u64 * bt[j][t] as u64;
                    }
                    (s % Q as u64) as u16
                })
                .collect()
        })
        .collect()
}

/// Matrix inverse via Gauss-Jordan. Returns `None` if singular.
pub fn mat_inv(a: &[Vec<u16>]) -> Option<Vec<Vec<u16>>> {
    let n = a.len();
    let mut aug: Vec<Vec<u16>> = (0..n)
        .map(|i| {
            let mut row = a[i].clone();
            row.extend((0..n).map(|j| if i == j { 1u16 } else { 0 }));
            row
        })
        .collect();
    for col in 0..n {
        let pivot_row = aug.iter().skip(col).position(|r| r[col] != 0)? + col;
        aug.swap(col, pivot_row);
        let pivot_inv = inv(aug[col][col]);
        for j in col..(2 * n) {
            aug[col][j] = mul(aug[col][j], pivot_inv);
        }
        for row in 0..n {
            if row == col {
                continue;
            }
            let factor = aug[row][col];
            if factor == 0 {
                continue;
            }
            for j in col..(2 * n) {
                let sub = mul(factor, aug[col][j]);
                aug[row][j] = field::sub(aug[row][j], sub);
            }
        }
    }
    Some(aug.iter().map(|r| r[n..].to_vec()).collect())
}

/// Basis of the right nullspace of the row-space of `rows` (RREF method).
///
/// Returns one vector per free column. The span of the returned vectors is
/// exactly { x : rows · x = 0 }. Deterministic.
pub fn rref_and_ns(rows: &[Vec<u16>]) -> Vec<Vec<u16>> {
    let n = rows.len();
    if n == 0 {
        return vec![];
    }
    let m = rows[0].len();
    let mut mat: Vec<Vec<u16>> = rows.to_vec();
    let mut pivot_row: Vec<(usize, usize)> = Vec::new(); // (col, row)
    let mut r = 0;
    for c in 0..m {
        let p = (r..n).find(|&rr| mat[rr][c] != 0);
        let p = match p {
            Some(p) => p,
            None => continue,
        };
        mat.swap(r, p);
        let iv = inv(mat[r][c]);
        for j in 0..m {
            mat[r][j] = mul(mat[r][j], iv);
        }
        for rr in 0..n {
            if rr != r && mat[rr][c] != 0 {
                let f = mat[rr][c];
                for j in 0..m {
                    let sub = mul(f, mat[r][j]);
                    mat[rr][j] = field::sub(mat[rr][j], sub);
                }
            }
        }
        pivot_row.push((c, r));
        r += 1;
        if r == n {
            break;
        }
    }
    let piv_cols: std::collections::HashSet<usize> = pivot_row.iter().map(|(c, _)| *c).collect();
    let free: Vec<usize> = (0..m).filter(|c| !piv_cols.contains(c)).collect();
    let mut basis: Vec<Vec<u16>> = Vec::with_capacity(free.len());
    for &fc in &free {
        let mut vec = vec![0u16; m];
        vec[fc] = 1;
        for &(pc, rr) in &pivot_row {
            vec[pc] = field::neg(mat[rr][fc]);
        }
        basis.push(vec);
    }
    basis
}

/// Solve A·x = b (possibly under-determined / rectangular).
///
/// Returns one particular solution if the system is consistent, else `None`.
pub fn solve_linear(a: &[Vec<u16>], b: &[u16]) -> Option<Vec<u16>> {
    let n = a.len();
    if n == 0 {
        return Some(vec![]);
    }
    let m = a[0].len();
    let mut mat: Vec<Vec<u16>> = (0..n)
        .map(|r| {
            let mut row = a[r].clone();
            row.push(b[r]);
            row
        })
        .collect();
    let mut piv: Vec<usize> = Vec::new();
    let mut r = 0;
    for c in 0..m {
        let p = (r..n).find(|&rr| mat[rr][c] != 0);
        let p = match p {
            Some(p) => p,
            None => continue,
        };
        mat.swap(r, p);
        let iv = inv(mat[r][c]);
        for j in 0..(m + 1) {
            mat[r][j] = mul(mat[r][j], iv);
        }
        for rr in 0..n {
            if rr != r && mat[rr][c] != 0 {
                let f = mat[rr][c];
                for j in 0..(m + 1) {
                    let sub = mul(f, mat[r][j]);
                    mat[rr][j] = field::sub(mat[rr][j], sub);
                }
            }
        }
        piv.push(c);
        r += 1;
        if r == n {
            break;
        }
    }
    // Consistency check: any all-zero coefficient row with nonzero rhs?
    for rr in 0..n {
        if mat[rr][..m].iter().all(|&v| v == 0) && mat[rr][m] != 0 {
            return None;
        }
    }
    let mut sol = vec![0u16; m];
    for (i, &c) in piv.iter().enumerate() {
        sol[c] = mat[i][m];
    }
    Some(sol)
}

// ============================================================
// Mixed-tensor preimage sampling
// ============================================================

/// Sample a preimage for the mixed (rank-2) public tensor.
///
/// See module docs for the algorithm. Returns `None` if no sample found
/// (target too dense, singular split, or RNG exhaustion).
pub fn solve_preimage_mixed(td: &Trapdoor, target: &[u16]) -> Option<(PreimageVec, PreimageVec)> {
    let m = td.tensor.m; // 2k+1
    let n = td.tensor.n; // 2k+2

    if target.len() != n {
        return None;
    }

    // adapted[i1] = target[i1] / x1[i1]
    let mut adapted = vec![0u16; n];
    for i1 in 0..n {
        adapted[i1] = mul(target[i1], inv(td.x1[i1]));
    }

    let z: Vec<usize> = (0..n).filter(|&i| adapted[i] == 0).collect();
    let s: Vec<usize> = (0..n).filter(|&i| adapted[i] != 0).collect();
    if z.len() < 2 {
        return None;
    }

    let m3t = transpose(&td.m3);
    let m2t = transpose(&td.m2);
    let zl = z.len();
    let mut rng = SeedRng::new(sample_seed(td.seed, target));

    for a in 1..zl {
        // Za = z[0..a], Zb = z[a-1..]; |Za|+|Zb| = zl+1, |Za∩Zb| = 1
        let za = &z[..a];
        let zb = &z[a - 1..];
        if za.len() + zb.len() != zl + 1 {
            continue;
        }

        // u3 constraints: zero P3a on Za and P3b on Zb.
        let mut rows3: Vec<Vec<u16>> = Vec::with_capacity(za.len() + zb.len());
        for &i1 in za {
            rows3.push(vand(td.tensor.lc[i1], m));
        }
        for &i1 in zb {
            let vb = vand(td.tensor.lc[i1], m);
            rows3.push(mat_vec(&m3t, &vb));
        }
        let ns3 = rref_and_ns(&rows3);
        if ns3.is_empty() {
            continue;
        }

        let z_only_a: Vec<usize> = za.iter().copied().filter(|i| !zb.contains(i)).collect();
        let z_only_b: Vec<usize> = zb.iter().copied().filter(|i| !za.contains(i)).collect();

        for _attempt in 0..400 {
            // Random nonzero combination of the nullspace basis.
            let mut u3 = vec![0u16; m];
            let mut nonzero = false;
            for basis in &ns3 {
                let c = rng.randrange(1, Q);
                if c != 0 {
                    nonzero = true;
                }
                for j in 0..m {
                    u3[j] = add(u3[j], mul(c, basis[j]));
                }
            }
            if !nonzero || u3.iter().all(|&x| x == 0) {
                continue;
            }

            let m3u3 = mat_vec(&td.m3, &u3);

            // Need P3a, P3b ≠ 0 on all of S.
            let mut p3a_s = vec![0u16; s.len()];
            let mut p3b_s = vec![0u16; s.len()];
            let mut ok = true;
            for (idx, &i1) in s.iter().enumerate() {
                let vc = vand(td.tensor.lc[i1], m);
                let pa = dot(&vc, &u3);
                let pb = dot(&vc, &m3u3);
                if pa == 0 || pb == 0 {
                    ok = false;
                    break;
                }
                p3a_s[idx] = pa;
                p3b_s[idx] = pb;
            }
            if !ok {
                continue;
            }

            // u2 system: |S| + |Z_only_a| + |Z_only_b| = m (square).
            let mut rows2: Vec<Vec<u16>> = Vec::with_capacity(m);
            let mut b2: Vec<u16> = Vec::with_capacity(m);
            for (idx, &i1) in s.iter().enumerate() {
                let va = vand(td.tensor.la[i1], m);
                let vb = vand(td.tensor.lb[i1], m);
                let m2t_vb = mat_vec(&m2t, &vb);
                let mut row = vec![0u16; m];
                for j in 0..m {
                    row[j] = add(mul(va[j], p3a_s[idx]), mul(m2t_vb[j], p3b_s[idx]));
                }
                rows2.push(row);
                b2.push(adapted[i1]);
            }
            for &i1 in &z_only_a {
                rows2.push(mat_vec(&m2t, &vand(td.tensor.lb[i1], m)));
                b2.push(0);
            }
            for &i1 in &z_only_b {
                rows2.push(vand(td.tensor.la[i1], m));
                b2.push(0);
            }
            let u2 = match solve_linear(&rows2, &b2) {
                Some(u2) => u2,
                None => continue,
            };

            let w2 = mat_vec(&td.x2a_inv, &u2);
            let w3 = mat_vec(&td.x3a_inv, &u3);
            return Some((w2, w3));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::field::Q;

    #[test]
    fn test_vand() {
        let v = vand(2, 4);
        assert_eq!(v, vec![1, 2, 4, 8]);
        let v = vand(Q - 1, 3);
        assert_eq!(v, vec![1, Q - 1, 1]);
    }

    #[test]
    fn test_mat_inv_roundtrip() {
        let a = vec![vec![1, 2, 3], vec![0, 5, 6], vec![1, 0, 9]];
        let ai = mat_inv(&a).expect("invertible");
        let prod = mat_mul(&a, &ai);
        for i in 0..3 {
            for j in 0..3 {
                let expect = if i == j { 1u16 } else { 0 };
                assert_eq!(prod[i][j], expect);
            }
        }
    }

    #[test]
    fn test_mat_inv_singular() {
        let a = vec![vec![1, 1], vec![1, 1]];
        assert!(mat_inv(&a).is_none());
    }

    #[test]
    fn test_rref_and_ns() {
        // x1 - x2 = 0 over F_q → nullspace span {(1,1,0),(0,0,1)}-ish
        let rows = vec![vec![1u16, Q - 1, 0]];
        let ns = rref_and_ns(&rows);
        assert_eq!(ns.len(), 2);
        for bv in &ns {
            assert_eq!(dot(bv, &rows[0]), 0);
        }
    }

    #[test]
    fn test_solve_linear_consistent() {
        // 2x + y = 5, x = 1
        let a = vec![vec![2, 1], vec![1, 0]];
        let b = vec![5, 1];
        let x = solve_linear(&a, &b).expect("consistent");
        assert_eq!(dot(&a[0], &x), 5);
        assert_eq!(dot(&a[1], &x), 1);
    }

    #[test]
    fn test_solve_linear_inconsistent() {
        // x = 0, x = 1 → inconsistent
        let a = vec![vec![1, 0], vec![1, 0]];
        let b = vec![0, 1];
        assert!(solve_linear(&a, &b).is_none());
    }

    #[test]
    fn test_seed_deterministic() {
        let t1 = vec![1, 0, 3, 7];
        let t2 = vec![1, 0, 3, 7];
        assert_eq!(sample_seed(42, &t1), sample_seed(42, &t2));
        assert_ne!(sample_seed(42, &t1), sample_seed(43, &t1));
    }
}
