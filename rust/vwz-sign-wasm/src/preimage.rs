//! Sparse Preimage Sampling (Lemma 1, Theorem 2).
//!
//! Given a tensor ϕ⟨Λ⟩ and a SPARSE target vector t ∈ F_q^{k1+1}
//! (Hamming weight ≤ k+1), finds (w2, w3) such that:
//!
//!   tensor_eval(ϕ, w2, w3) = t
//!
//! Algorithm (Lemma 1):
//!   1. Partition index set: I2 ∪ I3 = {0,...,k1}
//!      |I2| = k+1 (contains all nonzero target indices)
//!      |I3| = k
//!   2. Build P3(X) = ∏_{i1∈I3} (X − λ_{i1,3})
//!      → w3 = coefficients of P3
//!   3. For i1∈I2: compute adjusted target = t[i1] / P3(λ_{i1,3})
//!   4. Lagrange-interpolate P2(X) on {λ_{i1,2} : i1∈I2}
//!      with values adjusted_target[i1]
//!      → w2 = coefficients of P2

use crate::field::{self, inv, mul, Q};
use crate::tensor::VwzTensor;

/// Preimage vector type alias.
pub type PreimageVec = Vec<u16>;

/// Lagrange interpolation via master polynomial synthetic division.
///
/// Given points (xs[i], ys[i]) for i=0..n-1, find polynomial
/// P(X) = Σ_{j=0}^{n-1} c_j·X^j such that P(xs[i]) = ys[i].
///
/// Uses synthetic division: O(n²) field ops.
///
/// Returns coefficients [c0, c1, ..., c_{n-1}].
fn lagrange_interpolate(xs: &[u16], ys: &[u16]) -> Vec<u16> {
    let n = xs.len();
    let n_deg = n; // degree ≤ n-1, result has n coefficients

    // 1. Master polynomial: M(X) = ∏_m (X − x_m) [degree n, n+1 coeffs]
    let mut m_coeffs: Vec<u16> = vec![1];
    for &x_m in xs {
        let neg_x = if x_m == 0 { 0u16 } else { Q - x_m };
        let mut new_m = vec![0u16; m_coeffs.len() + 1];
        for (i, &c) in m_coeffs.iter().enumerate() {
            new_m[i] = field::add(new_m[i], mul(c, neg_x));
            new_m[i + 1] = field::add(new_m[i + 1], c);
        }
        m_coeffs = new_m;
    }

    // M has degree n, coefficients m_coeffs[0..=n]
    let m_n = m_coeffs[n]; // leading coefficient

    // 2. Precompute denominators d_j = ∏_{m≠j} (x_j − x_m)
    let mut denoms = vec![1u16; n];
    for j in 0..n {
        for m in 0..n {
            if m == j {
                continue;
            }
            denoms[j] = mul(denoms[j], field::sub(xs[j], xs[m]));
        }
    }

    // 3. For each j: Q_j(X) = M(X)/(X−x_j) via synthetic division
    //    result += y_j · Q_j(X) · denom_j^{-1}
    let mut result = vec![0u16; n_deg];
    for j in 0..n {
        // Synthetic division: Q has degree n-1 (= n coefficients)
        let mut q = vec![0u16; n];
        q[n - 1] = m_n;
        for i in (1..n).rev() {
            q[i - 1] = field::add(m_coeffs[i], mul(q[i], xs[j]));
        }

        let inv_denom = inv(denoms[j]);
        let scale = mul(ys[j], inv_denom);
        for i in 0..n {
            result[i] = field::add(result[i], mul(q[i], scale));
        }
    }

    result
}

/// Find preimage (w2, w3) for a sparse target vector.
///
/// # Arguments
/// * `tensor` — original VWZ tensor ϕ⟨Λ⟩ (from trapdoor)
/// * `target` — sparse vector of length k1+1, Hamming weight ≤ k+1
///
/// # Returns
/// `Some((w2, w3))` of length k+1 each, or `None` if singular.
pub fn solve_preimage_sparse(
    tensor: &VwzTensor,
    target: &[u16],
) -> Option<(PreimageVec, PreimageVec)> {
    let k = tensor.k;
    let k1 = tensor.k1;
    let n = k1 + 1; // = 2k + 1
    let m = k + 1;

    // Collect nonzero indices and verify sparsity
    let nonzero: Vec<usize> = (0..n).filter(|&i| target[i] != 0).collect();
    if nonzero.len() > m {
        return None; // too dense for Lemma 1
    }

    let target_is_zero = nonzero.is_empty();

    // Step 1: Partition I2 (size k+1) and I3 (size k).
    // I2 = nonzero indices ∪ zero indices padded to exactly k+1 elements
    let zeros: Vec<usize> = (0..n).filter(|&i| target[i] == 0).collect();
    let pad_count = m - nonzero.len();
    let pad = &zeros[..pad_count.min(zeros.len())];

    let mut i2: Vec<usize> = nonzero.iter().copied().chain(pad.iter().copied()).collect();
    i2.sort_unstable();

    let mut i2_set = vec![false; n];
    for &i in &i2 {
        i2_set[i] = true;
    }
    let i3: Vec<usize> = (0..n).filter(|&i| !i2_set[i]).collect();

    // Validate partition sizes
    if i2.len() != m || i3.len() != k {
        return None;
    }

    // Step 2: Build w3 = coefficients of P3(X) = ∏_{i1∈I3} (X − λ_{i1,3})
    // |I3| = k, so degree = k, needs k+1 coefficients
    let mut w3: Vec<u16> = vec![1]; // constant term
    for &i1 in &i3 {
        let lambda3 = tensor.lambda[i1][1];
        let neg_lambda = if lambda3 == 0 { 0u16 } else { Q - lambda3 };
        let mut new_w3 = vec![0u16; w3.len() + 1];
        for (i, &c) in w3.iter().enumerate() {
            new_w3[i] = field::add(new_w3[i], mul(c, neg_lambda));
            new_w3[i + 1] = field::add(new_w3[i + 1], c);
        }
        w3 = new_w3;
    }
    // Pad to exactly m coefficients
    w3.resize(m, 0);

    // Step 3: Evaluate P3(λ_{i1,3}) for i1 ∈ I2
    let mut p3_i2 = vec![0u16; m];
    let mut adjusted_y = vec![0u16; m];
    let mut xs_i2 = vec![0u16; m];

    for (idx, &i1) in i2.iter().enumerate() {
        let lam3 = tensor.lambda[i1][1];
        // Horner evaluation of P3 at lam3
        let mut p3_val = 0u16;
        for coeff_idx in (0..w3.len()).rev() {
            p3_val = field::mul(p3_val, lam3);
            p3_val = field::add(p3_val, w3[coeff_idx]);
        }
        p3_i2[idx] = p3_val;

        // P3(λ_{i1,3}) should be nonzero since I2 ∩ I3 = ∅
        // and Λ columns have distinct entries (non-singular tensor)
        if p3_val == 0 {
            return None; // singular case
        }

        adjusted_y[idx] = mul(target[i1], inv(p3_val));
        xs_i2[idx] = tensor.lambda[i1][0]; // λ_{i1,2}
    }

    // Step 4: For all-zero target, w2 = zero polynomial
    let w2 = if target_is_zero {
        vec![0u16; m]
    } else {
        lagrange_interpolate(&xs_i2, &adjusted_y)
    };

    Some((w2, w3))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tensor::{tensor_eval, VwzTensor};
    use crate::trapdoor::generate_trapdoor;

    #[test]
    fn test_lagrange_interpolation() {
        // Interpolate P(0)=5, P(1)=10, P(2)=17 over F_q
        // P(X) = X² + 4X + 5 → coeffs [5, 4, 1]
        let xs = vec![0u16, 1, 2];
        let ys = vec![5u16, 10, 17];
        let coeffs = lagrange_interpolate(&xs, &ys);
        assert_eq!(coeffs, vec![5, 4, 1]);

        // Verify evaluation
        for (&x, &y) in xs.iter().zip(ys.iter()) {
            let mut val = 0u16;
            for (i, &c) in coeffs.iter().enumerate() {
                val = field::add(val, mul(c, field::pow(x, i as u16)));
            }
            assert_eq!(val, y, "P({x}) should be {y}");
        }
    }

    #[test]
    fn test_preimage_roundtrip_k2() {
        let (psi_data, td) = generate_trapdoor(2, Some(42));

        // Create a sparse target: only index 0 = 100, rest zero
        let n = 2 * 2 + 1; // 5
        let mut target = vec![0u16; n];
        target[0] = 100;

        let (w2, w3) = solve_preimage_sparse(&td.tensor, &target).expect("solve failed");

        // Verify: tensor_eval(phi, w2, w3) == target
        let result = tensor_eval(&td.tensor, &w2, &w3);
        assert_eq!(result, target, "Preimage verification failed!");

        assert_eq!(w2.len(), td.k + 1);
        assert_eq!(w3.len(), td.k + 1);
    }

    #[test]
    fn test_preimage_all_zero_target() {
        let (psi_data, td) = generate_trapdoor(2, Some(99));
        let n = 5;
        let target = vec![0u16; n];

        let (w2, w3) = solve_preimage_sparse(&td.tensor, &target).expect("solve failed");
        let result = tensor_eval(&td.tensor, &w2, &w3);
        assert_eq!(result, target, "Zero preimage should map to all-zero");
    }

    #[test]
    fn test_preimage_multiple_nonzeros() {
        let (psi_data, td) = generate_trapdoor(4, Some(777));
        let n = 9; // 2*4+1
        let mut target = vec![0u16; n];
        target[0] = 50;
        target[3] = 200;
        target[7] = 150;
        // 3 nonzeros ≤ k+1=5 ✓

        let (w2, w3) = solve_preimage_sparse(&td.tensor, &target).expect("solve failed");
        let result = tensor_eval(&td.tensor, &w2, &w3);
        assert_eq!(result, target, "Multi-nonzero preimage failed");
    }

    #[test]
    fn test_preimage_max_sparsity() {
        let (psi_data, td) = generate_trapdoor(4, Some(123));
        let n = 9;
        let mut target = vec![0u16; n];
        // Max Hamming weight = k+1 = 5
        for i in 0..5 {
            target[i] = ((i + 1) * 50) as u16;
        }
        let (w2, w3) = solve_preimage_sparse(&td.tensor, &target).expect("solve failed");
        let result = tensor_eval(&td.tensor, &w2, &w3);
        assert_eq!(result, target);
    }

    #[test]
    fn test_too_dense_rejected() {
        let (psi_data, td) = generate_trapdoor(2, Some(42));
        let n = 5;
        let mut target = vec![3u16; n]; // all nonzero, HW=5 > k+1=3
        let result = solve_preimage_sparse(&td.tensor, &target);
        assert!(result.is_none(), "Too-dense target should be rejected");
    }
}
