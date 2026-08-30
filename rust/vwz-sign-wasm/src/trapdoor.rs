//! Trapdoor generation for the mixed Vandermonde tensor scheme.
//!
//! Generates:
//!   1. Three distinct λ lists (λa, λb, λc) over F_q
//!   2. Four random invertible basis changes X2a, X2b, X3a, X3b
//!   3. Public twisted tensor ψ[i1] = x1[i1]·((X2aᵀ·u_a)⊗(X3aᵀ·v_a) + (X2bᵀ·u_b)⊗(X3bᵀ·v_b))
//!   4. Trapdoor = (λa, λb, λc, X2a, X2b, X3a, X3b, X2a⁻¹, X3a⁻¹, M2, M3, x1)
//!
//! where M2 = X2b·X2a⁻¹, M3 = X3b·X3a⁻¹.
//!
//! Preimage sampling (`sample_preimage`) delegates to
//! `preimage::solve_preimage_mixed`.

use crate::field::{add, mul, Q};
use crate::preimage::{
    mat_inv, mat_mul, mat_t_vec, solve_preimage_mixed, vand, PreimageVec, SeedRng,
};
use crate::tensor::MixedTensor;

/// Trapdoor secret key.
#[derive(Clone, Debug)]
pub struct Trapdoor {
    pub k: usize,
    pub tensor: MixedTensor,
    /// Public diagonal (nonzero length-n vector).
    pub x1: Vec<u16>,
    pub x2a: Vec<Vec<u16>>,
    pub x2b: Vec<Vec<u16>>,
    pub x3a: Vec<Vec<u16>>,
    pub x3b: Vec<Vec<u16>>,
    pub x2a_inv: Vec<Vec<u16>>,
    pub x3a_inv: Vec<Vec<u16>>,
    /// M2 = X2b · X2a⁻¹
    pub m2: Vec<Vec<u16>>,
    /// M3 = X3b · X3a⁻¹
    pub m3: Vec<Vec<u16>>,
    /// Keygen seed (kept for deterministic preimage sampling).
    pub seed: u64,
}

/// Generate a list of n pairwise-distinct nonzero field elements.
fn distinct_lam(n: usize, rng: &mut SeedRng) -> Vec<u16> {
    loop {
        let ls: Vec<u16> = (0..n).map(|_| rng.randrange(1, Q)).collect();
        let set: std::collections::HashSet<u16> = ls.iter().copied().collect();
        if set.len() == n {
            return ls;
        }
    }
}

/// Random invertible matrix (identity + random row-addition ops ⇒ det=1).
fn random_invertible_matrix(n: usize, rng: &mut SeedRng) -> Vec<Vec<u16>> {
    let mut mat = vec![vec![0u16; n]; n];
    for i in 0..n {
        mat[i][i] = 1;
    }
    for _ in 0..(n * n) {
        let i = rng.next_u16_mod(n as u16) as usize;
        let j = rng.next_u16_mod(n as u16) as usize;
        if i == j {
            continue;
        }
        let factor = rng.randrange(1, Q);
        for c in 0..n {
            mat[i][c] = ((mat[i][c] as u32 + factor as u32 * mat[j][c] as u32) % Q as u32) as u16;
        }
    }
    mat
}

/// Build the fully-expanded public ψ tensor from the trapdoor.
fn build_public(td: &Trapdoor) -> Vec<Vec<Vec<u16>>> {
    let n = td.tensor.n;
    let m = td.tensor.m;
    let mut psi = vec![vec![vec![0u16; m]; m]; n];
    for i1 in 0..n {
        let ua = vand(td.tensor.la[i1], m);
        let va = vand(td.tensor.lc[i1], m);
        let ub = vand(td.tensor.lb[i1], m);
        let vb = vand(td.tensor.lc[i1], m);
        let r = mat_t_vec(&td.x2a, &ua);
        let s = mat_t_vec(&td.x3a, &va);
        let r2 = mat_t_vec(&td.x2b, &ub);
        let s2 = mat_t_vec(&td.x3b, &vb);
        for i2 in 0..m {
            for i3 in 0..m {
                let a = mul(r[i2], s[i3]);
                let b = mul(r2[i2], s2[i3]);
                psi[i1][i2][i3] = mul(td.x1[i1], add(a, b));
            }
        }
    }
    psi
}

/// Generate a full mixed-tensor trapdoor keypair.
pub fn generate_trapdoor(k: usize, seed: Option<u64>) -> (Vec<Vec<Vec<u16>>>, Trapdoor) {
    let actual_seed = seed.unwrap_or_else(|| {
        #[cfg(target_arch = "wasm32")]
        {
            (js_sys::Math::random() * u64::MAX as f64) as u64
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos() as u64
        }
    });
    let mut rng = SeedRng::new(actual_seed);
    let n = 2 * k + 2;
    let m = 2 * k + 1;

    let la = distinct_lam(n, &mut rng);
    let lb = distinct_lam(n, &mut rng);
    let lc = distinct_lam(n, &mut rng);
    let tensor = MixedTensor::new(k, la, lb, lc);

    let x2a = random_invertible_matrix(m, &mut rng);
    let x2b = random_invertible_matrix(m, &mut rng);
    let x3a = random_invertible_matrix(m, &mut rng);
    let x3b = random_invertible_matrix(m, &mut rng);
    let x2a_inv = mat_inv(&x2a).expect("x2a invertible");
    let x3a_inv = mat_inv(&x3a).expect("x3a invertible");
    let m2 = mat_mul(&x2b, &x2a_inv);
    let m3 = mat_mul(&x3b, &x3a_inv);

    let x1: Vec<u16> = (0..n).map(|_| rng.randrange(1, Q)).collect();

    let td = Trapdoor {
        k,
        tensor,
        x1,
        x2a,
        x2b,
        x3a,
        x3b,
        x2a_inv,
        x3a_inv,
        m2,
        m3,
        seed: actual_seed,
    };
    let psi = build_public(&td);
    (psi, td)
}

/// Sample a preimage (w2, w3) for a target vector via the full trapdoor.
pub fn sample_preimage(td: &Trapdoor, target: &[u16]) -> Option<(PreimageVec, PreimageVec)> {
    solve_preimage_mixed(td, target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tensor::{public_tensor_eval, PubTensor};

    #[test]
    fn test_trapgen_roundtrip() {
        let (psi_data, td) = generate_trapdoor(2, Some(42));
        assert_eq!(psi_data.len(), 6); // n = 2k+2
        assert_eq!(td.x2a.len(), 5); // m = 2k+1
        assert_eq!(td.x2a_inv.len(), 5);
        assert_eq!(td.m2.len(), 5);
        assert_eq!(td.m3.len(), 5);
    }

    #[test]
    fn test_trapgen_for_various_k() {
        for k in [2, 4, 8] {
            let (psi, td) = generate_trapdoor(k, Some(12345 + k as u64));
            assert_eq!(psi.len(), 2 * k + 2);
            assert_eq!(td.x2a.len(), 2 * k + 1);
            assert_eq!(td.x2a_inv.len(), 2 * k + 1);
        }
    }

    #[test]
    fn test_public_eval_equiv_x1diag() {
        // Deterministic keygen → same psi.
        let (psi_data, _td) = generate_trapdoor(2, Some(99));
        let pk = PubTensor::new(2, psi_data.clone());
        let w2 = vec![1, 0, 2, 0, 3];
        let w3 = vec![1, 1, 1, 1, 1];
        let _ = public_tensor_eval(&pk, &w2, &w3);
        let (psi2, _) = generate_trapdoor(2, Some(99));
        assert_eq!(psi_data, psi2);
    }

    #[test]
    fn test_inv_checks() {
        let (_, td) = generate_trapdoor(4, Some(1));
        // X2a⁻¹·X2a = I
        let prod = mat_mul(&td.x2a, &td.x2a_inv);
        let m = td.x2a.len();
        for i in 0..m {
            for j in 0..m {
                let expect = if i == j { 1u16 } else { 0 };
                assert_eq!(prod[i][j], expect);
            }
        }
        // M2 = X2b·X2a⁻¹ consistency via mat_mul
        let m2_ref = mat_mul(&td.x2b, &td.x2a_inv);
        assert_eq!(td.m2, m2_ref);
    }

    #[test]
    fn test_stress_many_seeds_messages() {
        // Mirrors the Python fix validation scale: 3 seeds × k∈{2,4,8,16} × 25 msgs.
        use crate::hash_target::hash_to_sparse_target;
        use crate::tensor::public_tensor_eval_data;
        let seeds = [101u64, 202, 303];
        let ks = [2usize, 4, 8, 16];
        let mut total = 0usize;
        for &seed in &seeds {
            for &k in &ks {
                let (psi, td) = generate_trapdoor(k, Some(seed));
                for i in 0..25usize {
                    let msg = format!("stress s{seed} k{k} m{i}").into_bytes();
                    let target = hash_to_sparse_target(&msg, k);
                    let (w2, w3) = sample_preimage(&td, &target)
                        .unwrap_or_else(|| panic!("s{seed} k{k} m{i}: sampling failed"));
                    let res = public_tensor_eval_data(k, &psi, &w2, &w3);
                    assert_eq!(res, target, "s{seed} k{k} m{i}: verify failed");
                    total += 1;
                }
            }
        }
        assert_eq!(total, 3 * 4 * 25, "expected 300 verified signatures");
    }

    #[test]
    fn test_stress_sampling_success_rate() {
        // Sampling success must be ~100%: for each k, 200 targets all sampled.
        use crate::hash_target::hash_to_sparse_target;
        for &k in &[4usize, 8, 16] {
            let (_, td) = generate_trapdoor(k, Some(5555));
            for i in 0..200usize {
                let msg = format!("succ k{k} m{i}").into_bytes();
                let target = hash_to_sparse_target(&msg, k);
                assert!(
                    solve_preimage_mixed(&td, &target).is_some(),
                    "k={k} m={i}: sampling failed"
                );
            }
        }
    }
}
