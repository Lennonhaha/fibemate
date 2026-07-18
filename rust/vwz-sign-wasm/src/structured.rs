//! Structured Vandermonde Λ construction (hardware-optimized).
//!
//! Uses λ_{i1,2} = α_i, λ_{i1,3} = α_i² (mod q) where all α_i are
//! distinct AND no two are additive inverses.
//!
//! The "no ± pairs" constraint ensures col3 entries are all distinct
//! (Theorem 1: non-singular tensor). Without it, α² = (-α)² would
//! produce duplicate column-3 entries.
//!
//! Why Vandermonde: eliminates random matrix storage, enables
//! precomputed λ_power tables for zero-pow() signing.

use crate::field::{self, Q};
use crate::tensor::VwzTensor;

/// Sample 2k+1 unique non-zero field elements with no square collisions.
///
/// A square collision happens when a ≡ −b (mod q), since a² ≡ (−a)².
/// We reject such pairs to ensure |{α²}| = 2k+1.
///
/// Returns alphas in canonical (sorted) order for determinism.
pub fn safe_alphas(k: usize, seed: u64) -> Vec<u16> {
    let need = 2 * k + 1;
    let max_possible = (Q as usize - 1) / 2;
    assert!(
        need <= max_possible,
        "Need {need} collision-free squares, only {max_possible} exist mod {Q}"
    );

    // Use a simple LCG-based permutation generator
    let mut state = seed.wrapping_add(0x9E3779B97F4A7C15);
    let mut rng = || {
        state = state.wrapping_mul(0x5851F42D4C957F2D).wrapping_add(0x14057B7EF767814F);
        state
    };

    let mut seen_squares = vec![false; Q as usize];
    let mut alphas = Vec::with_capacity(need);

    // Generate candidates until we have enough
    let mut attempts = 0u32;
    while alphas.len() < need {
        attempts += 1;
        if attempts > 10_000_000 {
            panic!("safe_alphas: exhausted {attempts} attempts for k={k}");
        }
        let a = ((rng() >> 16) % (Q as u64 - 1) + 1) as u16;
        let sq = field::mul(a, a) as usize;
        if seen_squares[sq] {
            continue; // square collision
        }
        seen_squares[sq] = true;
        alphas.push(a);
    }

    alphas.sort_unstable(); // canonical order
    alphas
}

/// Build Vandermonde Λ: λ_{i1,0}=α_{i1}, λ_{i1,1}=α_{i1}².
pub fn vandermonde_lambda(alphas: &[u16]) -> Vec<[u16; 2]> {
    alphas
        .iter()
        .map(|&a| [a, field::mul(a, a)])
        .collect()
}

/// Create a VWZ tensor from structured Vandermonde Λ.
pub fn vandermonde_tensor(k: usize, seed: u64) -> VwzTensor {
    let alphas = safe_alphas(k, seed);
    let lambda = vandermonde_lambda(&alphas);
    VwzTensor::new(k, lambda)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_alphas_all_k() {
        for k in [2, 4, 8, 16, 32] {
            let alphas = safe_alphas(k, 42 + k as u64);
            let n = 2 * k + 1;
            assert_eq!(alphas.len(), n);
            assert!(alphas.iter().all(|&a| a > 0 && a < Q));

            // No square collisions
            let mut squares: Vec<u16> = alphas.iter().map(|&a| field::mul(a, a)).collect();
            squares.sort_unstable();
            squares.dedup();
            assert_eq!(squares.len(), n,
                "k={k}: square collision detected in alphas");

            // No ± pairs
            let mut seen = vec![false; Q as usize];
            for &a in &alphas {
                seen[a as usize] = true;
                let neg = (Q - a) % Q;
                if a != neg && seen[neg as usize] {
                    panic!("k={k}: ± pair {a}↔{neg}");
                }
            }
        }
    }

    #[test]
    fn test_vandermonde_is_nonsingular() {
        for k in [2, 4, 8, 16, 32] {
            let t = vandermonde_tensor(k, 12345 + k as u64);
            assert!(t.is_nonsingular(), "k={k}: Vandermonde tensor should be non-singular");
        }
    }
}
