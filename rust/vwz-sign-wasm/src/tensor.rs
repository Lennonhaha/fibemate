//! Mixed Vandermonde tensor — public key definition and evaluation.
//!
//! Security-hardened construction (see `security-assessment/fix/`):
//! each public-key slice ψ[i1] is **rank-2** — the sum of two rank-1
//! outer products — so the verification equation is a *sum* of two
//! bilinear terms and cannot be separated by the old rank-1 attack:
//!
//!   ψ[i1] = x1[i1] · ( (X2aᵀ·u_a[i1])⊗(X3aᵀ·v_a[i1])
//!                     + (X2bᵀ·u_b[i1])⊗(X3bᵀ·v_b[i1]) )
//!
//! with u_a[i1]=vand(λa[i1]), v_a[i1]=vand(λc[i1]),
//!      u_b[i1]=vand(λb[i1]), v_b[i1]=vand(λc[i1]).
//!
//! Dimensions: w2/w3 ∈ F_q^{m}, m = 2k+1; target ∈ F_q^{n}, n = 2k+2.
//! n > m keeps the "fix w2, solve w3" attack over-determined.

use crate::field;
use crate::preimage::PreimageVec;

/// Mixed Vandermonde tensor: three distinct λ lists over F_q.
#[derive(Clone, Debug)]
pub struct MixedTensor {
    pub k: usize,
    /// m = 2k+1 — dimension of w2/w3.
    pub m: usize,
    /// n = 2k+2 — length of the target vector.
    pub n: usize,
    /// λa: evaluation points for the first polynomial pair (P2a).
    pub la: Vec<u16>,
    /// λb: evaluation points for the second polynomial pair (P2b).
    pub lb: Vec<u16>,
    /// λc: shared evaluation points for P3a / P3b.
    pub lc: Vec<u16>,
}

impl MixedTensor {
    /// Create a mixed tensor from three distinct λ lists (each length n).
    pub fn new(k: usize, la: Vec<u16>, lb: Vec<u16>, lc: Vec<u16>) -> Self {
        let m = 2 * k + 1;
        let n = 2 * k + 2;
        debug_assert_eq!(la.len(), n);
        debug_assert_eq!(lb.len(), n);
        debug_assert_eq!(lc.len(), n);
        Self { k, m, n, la, lb, lc }
    }

    /// Are all three λ lists pairwise distinct (non-singular tensor)?
    pub fn is_nonsingular(&self) -> bool {
        let distinct = |v: &Vec<u16>| {
            let mut s = v.clone();
            s.sort_unstable();
            s.windows(2).all(|w| w[0] != w[1])
        };
        distinct(&self.la) && distinct(&self.lb) && distinct(&self.lc)
    }
}

/// Fully-expanded ψ tensor (public key) as flat 3D array.
#[derive(Clone, Debug)]
pub struct PubTensor {
    pub k: usize,
    /// n = 2k+2
    pub n: usize,
    /// m = 2k+1
    pub m: usize,
    /// psi[i1][i2][i3], shape n×m×m
    pub data: Vec<Vec<Vec<u16>>>,
}

impl PubTensor {
    pub fn new(k: usize, data: Vec<Vec<Vec<u16>>>) -> Self {
        let n = 2 * k + 2;
        let m = 2 * k + 1;
        debug_assert_eq!(data.len(), n);
        debug_assert!(data.iter().all(|r| r.len() == m));
        debug_assert!(data.iter().all(|r| r.iter().all(|s| s.len() == m)));
        Self { k, n, m, data }
    }
}

/// Evaluate the public tensor on (w2, w3): result[i1] = Σ_{i2,i3} ψ_{i1,i2,i3}·w2_{i2}·w3_{i3}
pub fn public_tensor_eval(pk: &PubTensor, w2: &PreimageVec, w3: &PreimageVec) -> Vec<u16> {
    let m = pk.m;
    let len = pk.n;
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

/// Evaluate the public tensor directly from the raw 3D slice (zero-clone).
///
/// Semantically identical to [`public_tensor_eval`], but takes the raw
/// fully-expanded ψ data. `data` has shape (2k+2)×(2k+1)×(2k+1).
pub fn public_tensor_eval_data(
    k: usize,
    data: &[Vec<Vec<u16>>],
    w2: &PreimageVec,
    w3: &PreimageVec,
) -> Vec<u16> {
    let m = 2 * k + 1;
    let len = 2 * k + 2;
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
    fn test_mixed_tensor_dims() {
        let (psi, td) = generate_trapdoor(2, Some(42));
        assert_eq!(td.tensor.n, 6);
        assert_eq!(td.tensor.m, 5);
        assert_eq!(psi.len(), 6);
        assert!(td.tensor.is_nonsingular());
    }

    #[test]
    fn test_public_eval_dims() {
        let (psi_data, _td) = generate_trapdoor(3, Some(7));
        let pk = PubTensor::new(3, psi_data);
        let w2 = vec![1u16; pk.m];
        let w3 = vec![1u16; pk.m];
        let r = public_tensor_eval(&pk, &w2, &w3);
        assert_eq!(r.len(), 2 * 3 + 2);
        // raw eval agrees with wrapped eval
        let r2 = public_tensor_eval_data(3, &pk.data, &w2, &w3);
        assert_eq!(r, r2);
    }
}
