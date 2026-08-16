//! VWZ Tensor Definition (Definition 3) and evaluation.
//!
//! A Vandermonde-Weyman-Zelevinsky tensor ϕ⟨Λ⟩ of format
//! (k1+1)×(k2+1)×(k3+1) with k1 = k2 + k3.
//!
//! Entry: ϕ⟨Λ⟩_{i1,i2,i3} = λ_{i1,2}^{i2} · λ_{i1,3}^{i3}
//!
//! Evaluation (Equation 2.1):
//!   f^1_ϕ(w2, w3) = (P2(λ_{i1,2}) · P3(λ_{i1,3}))_{i1=0..k1}
//!   where P2(X) = Σ_i2 w2_i2 · X^{i2}, P3(X) = Σ_i3 w3_i3 · X^{i3}

use crate::field::{self, Q};
use crate::preimage::PreimageVec;

/// Vandermonde-Weyman-Zelevinsky tensor.
#[derive(Clone, Debug)]
pub struct VwzTensor {
    /// k2 = k3 = k for boundary format
    pub k: usize,
    /// k1 = 2k
    pub k1: usize,
    /// Λ matrix of shape (k1+1) × 2
    /// lambda[i1][0] = λ_{i1,2}, lambda[i1][1] = λ_{i1,3}
    pub lambda: Vec<[u16; 2]>,
}

impl VwzTensor {
    /// Create a new tensor from Λ matrix.
    pub fn new(k: usize, lambda: Vec<[u16; 2]>) -> Self {
        let k1 = 2 * k;
        debug_assert_eq!(lambda.len(), k1 + 1);
        Self { k, k1, lambda }
    }

    /// Entry ϕ⟨Λ⟩_{i1,i2,i3} = λ_{i1,2}^{i2} · λ_{i1,3}^{i3}.
    #[inline]
    pub fn entry(&self, i1: usize, i2: usize, i3: usize) -> u16 {
        field::mul(
            field::pow(self.lambda[i1][0], i2 as u16),
            field::pow(self.lambda[i1][1], i3 as u16),
        )
    }

    /// Check non-singularity: each column of Λ has distinct entries.
    pub fn is_nonsingular(&self) -> bool {
        let n = self.k1 + 1;
        let mut col0: Vec<u16> = self.lambda.iter().map(|r| r[0]).collect();
        let mut col1: Vec<u16> = self.lambda.iter().map(|r| r[1]).collect();
        col0.sort_unstable();
        col1.sort_unstable();
        col0.windows(2).all(|w| w[0] != w[1]) && col1.windows(2).all(|w| w[0] != w[1])
    }
}

/// Fully-expanded ψ tensor (public key form) as flat 3D array.
#[derive(Clone, Debug)]
pub struct PubTensor {
    pub k: usize,
    pub k1: usize,
    /// psi[i1][i2][i3], shape (k1+1)×(k2+1)×(k3+1)
    pub data: Vec<Vec<Vec<u16>>>,
}

impl PubTensor {
    pub fn new(k: usize, data: Vec<Vec<Vec<u16>>>) -> Self {
        let k1 = 2 * k;
        debug_assert_eq!(data.len(), k1 + 1);
        debug_assert!(data.iter().all(|r| r.len() == k + 1));
        debug_assert!(data.iter().all(|r| r.iter().all(|s| s.len() == k + 1)));
        Self { k, k1, data }
    }
}

/// Evaluate tensor on preimage vectors (w2, w3).
///
/// Decoupled form (Equation 2.1):
///   result[i1] = (Σ_i2 w2_i2·λ_{i1,2}^{i2}) · (Σ_i3 w3_i3·λ_{i1,3}^{i3})
pub fn tensor_eval(tensor: &VwzTensor, w2: &PreimageVec, w3: &PreimageVec) -> Vec<u16> {
    let len = tensor.k1 + 1;
    let m = tensor.k + 1;
    let mut result = vec![0u16; len];

    for i1 in 0..len {
        let lam2 = tensor.lambda[i1][0];
        let lam3 = tensor.lambda[i1][1];

        // P2(λ_{i1,2}) with Horner's method
        let mut p2 = 0u16;
        for idx in (0..m).rev() {
            p2 = field::mul(p2, lam2);
            p2 = field::add(p2, w2[idx]);
        }

        // P3(λ_{i1,3})
        let mut p3 = 0u16;
        for idx in (0..m).rev() {
            p3 = field::mul(p3, lam3);
            p3 = field::add(p3, w3[idx]);
        }

        result[i1] = field::mul(p2, p3);
    }
    result
}

/// Evaluate public tensor on (w2, w3): result[i1]= Σ_{i2,i3} ψ_{i1,i2,i3}·w2_{i2}·w3_{i3}
pub fn public_tensor_eval(pk: &PubTensor, w2: &PreimageVec, w3: &PreimageVec) -> Vec<u16> {
    let m = pk.k + 1;
    let len = pk.k1 + 1;
    let mut result = vec![0u16; len];

    for i1 in 0..len {
        let mut sum = 0u16;
        for i2 in 0..m {
            let w2i = w2[i2];
            if w2i == 0 {
                continue;
            }
            for i3 in 0..m {
                let term = field::mul(field::mul(w2i, w3[i3]), pk.data[i1][i2][i3]);
                sum = field::add(sum, term);
            }
        }
        result[i1] = sum;
    }
    result
}

/// Evaluate public tensor directly from borrowed, fully-expanded ψ data (zero-clone).
///
/// Semantically identical to [`public_tensor_eval`], but takes the raw 3D slice
/// instead of a `PubTensor` wrapper — avoiding the `pk.data.clone()` deep copy
/// that `PubTensor::new` would otherwise force on every call.
///
/// `data` has shape (2k+1)×(k+1)×(k+1).
pub fn public_tensor_eval_data(
    k: usize,
    data: &[Vec<Vec<u16>>],
    w2: &PreimageVec,
    w3: &PreimageVec,
) -> Vec<u16> {
    let m = k + 1;
    let len = 2 * k + 1;
    let mut result = vec![0u16; len];

    for i1 in 0..len {
        let mut sum = 0u16;
        for i2 in 0..m {
            let w2i = w2[i2];
            if w2i == 0 {
                continue;
            }
            for i3 in 0..m {
                let term = field::mul(field::mul(w2i, w3[i3]), data[i1][i2][i3]);
                sum = field::add(sum, term);
            }
        }
        result[i1] = sum;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trapdoor::generate_trapdoor;

    #[test]
    fn test_tensor_creation() {
        let lambda = vec![[1u16, 2]; 5]; // k=2, k1=4, N=5
        let t = VwzTensor::new(2, lambda.clone());
        assert_eq!(t.k, 2);
        assert_eq!(t.k1, 4);
        assert!(!t.is_nonsingular()); // all entries same → singular

        let lambda2 = vec![[1, 2], [3, 4], [5, 6], [1, 7], [8, 9]];
        let t2 = VwzTensor::new(2, lambda2);
        assert!(!t2.is_nonsingular()); // col0 has duplicate 1
    }

    #[test]
    fn test_trapgen_nonsingular() {
        let (psi, _td) = generate_trapdoor(2, None);
        assert_eq!(psi.len(), 5); // k1+1=5
    }
}
