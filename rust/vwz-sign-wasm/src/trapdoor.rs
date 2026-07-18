//! Trapdoor generation (Definition 5) and preimage sampling (Theorem 2).
//!
//! Generates:
//! 1. A random nonsingular VWZ tensor ϕ⟨Λ⟩
//! 2. Random basis change (X1, X2, X3)
//! 3. Public twisted tensor ψ = ϕ^(X1,X2,X3)
//! 4. Trapdoor = (Λ, X2, X3, X2⁻¹, X3⁻¹)
//!
//! Preimage sampling (Theorem 2):
//!   1. adapted = X1⁻¹ · target  (diagonal, preserves sparsity)
//!   2. Solve on plain ϕ via Lemma 1 → (w2′, w3′)
//!   3. w2 = X2⁻¹ · w2′, w3 = X3⁻¹ · w3′

use crate::field::{self, inv, mul, Q};
use crate::preimage::solve_preimage_sparse;
use crate::tensor::VwzTensor;

pub type PreimageVec = Vec<u16>;

/// Trapdoor secret key.
#[derive(Clone, Debug)]
pub struct Trapdoor {
    pub k: usize,
    pub tensor: VwzTensor,
    pub x1_diag: Vec<u16>,
    pub x2: Vec<Vec<u16>>,
    pub x3: Vec<Vec<u16>>,
    pub x2_inv: Vec<Vec<u16>>,
    pub x3_inv: Vec<Vec<u16>>,
}

/// Deterministic LCRNG for portability.
struct SeedRng { state: u64 }

impl SeedRng {
    fn new(seed: u64) -> Self { Self { state: seed.wrapping_add(0xDEADBEEF_CAFEBABE) } }
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.state
    }
    fn next_u16_mod(&mut self, modulus: u16) -> u16 {
        (self.next_u64() as u32 % modulus as u32) as u16
    }
    fn randrange(&mut self, lo: u16, hi: u16) -> u16 { lo + self.next_u16_mod(hi - lo) }
}

fn random_vwz(k: usize, rng: &mut SeedRng) -> VwzTensor {
    let n = 2 * k + 1;
    loop {
        let col2: Vec<u16> = (0..n).map(|_| rng.randrange(1, Q)).collect();
        let col3: Vec<u16> = (0..n).map(|_| rng.randrange(1, Q)).collect();
        let set2: std::collections::HashSet<u16> = col2.iter().copied().collect();
        let set3: std::collections::HashSet<u16> = col3.iter().copied().collect();
        if set2.len() == n && set3.len() == n {
            let lambda: Vec<[u16; 2]> = (0..n).map(|i| [col2[i], col3[i]]).collect();
            return VwzTensor::new(k, lambda);
        }
    }
}

fn random_invertible_matrix(n: usize, rng: &mut SeedRng) -> Vec<Vec<u16>> {
    let mut mat = vec![vec![0u16; n]; n];
    for i in 0..n { mat[i][i] = 1; }
    for _ in 0..(n * n) {
        let i = rng.next_u16_mod(n as u16) as usize;
        let j = rng.next_u16_mod(n as u16) as usize;
        if i == j { continue; }
        let factor = rng.randrange(1, Q);
        for c in 0..n {
            mat[i][c] = ((mat[i][c] as u32 + factor as u32 * mat[j][c] as u32) % Q as u32) as u16;
        }
    }
    mat
}

fn matrix_inverse(mat: &[Vec<u16>]) -> Vec<Vec<u16>> {
    let n = mat.len();
    let mut aug: Vec<Vec<u16>> = (0..n)
        .map(|i| { let mut row = mat[i].clone(); row.extend((0..n).map(|j| if i == j { 1u16 } else { 0 })); row })
        .collect();
    for col in 0..n {
        let pivot_row = aug.iter().skip(col).position(|r| r[col] != 0).expect("Matrix not invertible") + col;
        aug.swap(col, pivot_row);
        let pivot_inv = inv(aug[col][col]);
        for j in col..(2 * n) { aug[col][j] = mul(aug[col][j], pivot_inv); }
        for row in 0..n {
            if row == col { continue; }
            let factor = aug[row][col];
            if factor == 0 { continue; }
            for j in col..(2 * n) {
                let sub = mul(factor, aug[col][j]);
                aug[row][j] = ((aug[row][j] as u32 + Q as u32 - sub as u32) % Q as u32) as u16;
            }
        }
    }
    aug.iter().map(|r| r[n..].to_vec()).collect()
}

fn apply_basis_change(tensor: &VwzTensor, x1_diag: &[u16], x2: &[Vec<u16>], x3: &[Vec<u16>]) -> Vec<Vec<Vec<u16>>> {
    let k = tensor.k;
    let k1 = tensor.k1;
    let m = k + 1;
    let mut psi = vec![vec![vec![0u16; m]; m]; k1 + 1];
    for i1 in 0..=k1 {
        for i2 in 0..m {
            for i3 in 0..m {
                let mut val = 0u64;
                for j2 in 0..m {
                    let x2_ji = x2[j2][i2];
                    if x2_ji == 0 { continue; }
                    for j3 in 0..m {
                        let x3_ji = x3[j3][i3];
                        if x3_ji == 0 { continue; }
                        val = (val + tensor.entry(i1, j2, j3) as u64 * x2_ji as u64 * x3_ji as u64) % Q as u64;
                    }
                }
                psi[i1][i2][i3] = ((val * x1_diag[i1] as u64) % Q as u64) as u16;
            }
        }
    }
    psi
}

/// Generate a full VWZ trapdoor keypair.
pub fn generate_trapdoor(k: usize, seed: Option<u64>) -> (Vec<Vec<Vec<u16>>>, Trapdoor) {
    let actual_seed = seed.unwrap_or_else(|| {
        #[cfg(target_arch = "wasm32")]
        { (js_sys::Math::random() * u64::MAX as f64) as u64 }
        #[cfg(not(target_arch = "wasm32"))]
        { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos() as u64 }
    });
    let mut rng = SeedRng::new(actual_seed);
    let n = 2 * k + 1; let m = k + 1;
    let tensor = random_vwz(k, &mut rng);
    let x1_diag: Vec<u16> = (0..n).map(|_| rng.randrange(1, Q)).collect();
    let x2 = random_invertible_matrix(m, &mut rng);
    let x3 = random_invertible_matrix(m, &mut rng);
    let x2_inv = matrix_inverse(&x2);
    let x3_inv = matrix_inverse(&x3);
    let psi = apply_basis_change(&tensor, &x1_diag, &x2, &x3);
    (psi, Trapdoor { k, tensor, x1_diag, x2, x3, x2_inv, x3_inv })
}

/// Matrix-vector multiplication: y = A · x mod Q.
pub fn matrix_mul_vec(a: &[Vec<u16>], x: &[u16]) -> Vec<u16> {
    let n = a.len();
    (0..n).map(|i| {
        let mut sum = 0u64;
        for j in 0..x.len() { sum += a[i][j] as u64 * x[j] as u64; }
        (sum % Q as u64) as u16
    }).collect()
}

/// Sample preimage via full trapdoor (Theorem 2).
pub fn sample_preimage(td: &Trapdoor, target: &[u16]) -> Option<(PreimageVec, PreimageVec)> {
    let k = td.k; let n = 2 * k + 1;
    // Step 1: adapted = X1^{-1} · target
    let adapted: Vec<u16> = (0..n).map(|i| mul(target[i], inv(td.x1_diag[i]))).collect();
    // Step 2: Solve on plain phi via Lemma 1
    let (w2p, w3p) = solve_preimage_sparse(&td.tensor, &adapted)?;
    // Step 3: Invert basis change
    Some((matrix_mul_vec(&td.x2_inv, &w2p), matrix_mul_vec(&td.x3_inv, &w3p)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tensor::{tensor_eval, PubTensor};

    #[test]
    fn test_matrix_inverse() {
        let id: Vec<Vec<u16>> = vec![vec![1, 0, 0], vec![0, 1, 0], vec![0, 0, 1]];
        assert_eq!(matrix_inverse(&id), id);
    }

    #[test]
    fn test_trapgen_roundtrip() {
        let (_psi, td) = generate_trapdoor(2, Some(42));
        assert_eq!(tensor_eval(&td.tensor, &vec![1, 0, 0], &vec![1, 0, 0]).len(), 5);
    }

    #[test]
    fn test_trapgen_for_various_k() {
        for k in [2, 3, 4] {
            let (psi, td) = generate_trapdoor(k, Some(12345));
            assert_eq!(psi.len(), 2 * k + 1);
            assert_eq!(td.x2.len(), k + 1);
            assert_eq!(td.x2_inv.len(), k + 1);
        }
    }
}
