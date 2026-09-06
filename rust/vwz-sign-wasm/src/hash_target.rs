//! Hash message → sparse target vector (deterministic).
//!
//! Uses SHAKE-256 XOF to deterministically derive:
//!   1. k+1 distinct positions in [0, 2k+1]
//!   2. Nonzero values in [1, q-1] at those positions
//!
//! Result: target vector t ∈ F_q^{2k+2} with Hamming weight exactly k+1.
//!
//! Both random choices are made via uniform rejection sampling on the XOF
//! to eliminate the modulo bias that would result from `rand % n` when `n`
//! does not divide 2^16 exactly. (P1 #2 fix.) For n = Q - 1 = 3328, raw
//! `u16 % 3328` would give the first 2304 values a 20/65536 probability and
//! the remaining 1024 values a 19/65536 probability — a 5.3% bias that
//! weakens the uniform-target assumption underpinning the hash-and-sign
//! security proof.

use crate::field::Q;
use sha3::digest::{ExtendableOutput, Update, XofReader};
use sha3::Shake256;

/// Sample a u16 uniformly in `[0, n)` via rejection sampling on the XOF.
///
/// Reads 2 bytes from `reader` at a time. The accepted range is
/// `[0, threshold)` where `threshold = floor(2^16 / n) * n`; values `>=`
/// threshold are rejected and a fresh 2-byte sample is drawn. The accepted
/// value `v mod n` is uniform in `[0, n)`.
///
/// Rejection rate: `1 - threshold / 2^16`:
///
/// | n      | threshold | rejection rate |
/// |--------|-----------|----------------|
/// | 2      | 65536     | 0.0%           |
/// | 10     | 65530     | 0.009%         |
/// | 100    | 65500     | 0.055%         |
/// | 3328   | 63232     | 3.52%          |
/// | 32768  | 32768     | 50.0%          |
///
/// The n=32768 case is degenerate (always 50% rejection) but `n` here is
/// at most `Q - 1 = 3328` (caller chooses), so this is not exercised in
/// practice.
fn sample_uniform_below<R: XofReader>(reader: &mut R, n: u16) -> u16 {
    debug_assert!(n > 0, "sample_uniform_below: n must be positive");
    if n == 1 {
        return 0;
    }
    let n_u32 = n as u32;
    let total = u16::MAX as u32 + 1; // 2^16 = 65536
    let threshold = (total / n_u32) * n_u32; // largest multiple of n ≤ 2^16
    debug_assert!(
        threshold > 0 && threshold <= total,
        "threshold overflow: n={n}"
    );
    loop {
        let mut buf = [0u8; 2];
        reader.read(&mut buf);
        let v = ((buf[0] as u32) << 8) | (buf[1] as u32);
        if v < threshold {
            return (v % n_u32) as u16;
        }
        // Rejected: try again. Rejection rate is ≤ 3.5% for n = Q - 1.
    }
}

/// Hash a message to a sparse target vector.
///
/// Produces `t ∈ F_q^{2k+2}` with exactly `k+1` nonzero entries.
/// Deterministic: same message → same target.
pub fn hash_to_sparse_target(msg: &[u8], k: usize) -> Vec<u16> {
    let n = 2 * k + 2;
    let weight = k + 1;

    let mut xof = Shake256::default();
    xof.update(msg);
    let mut reader = xof.finalize_xof();

    // Step 1: Select k+1 distinct positions via Fisher-Yates shuffle.
    let mut positions: Vec<usize> = (0..n).collect();
    for i in 0..weight {
        // `u` uniform in `[0, n - i)`.
        let u = sample_uniform_below(&mut reader, (n - i) as u16) as usize;
        positions.swap(i, i + u);
    }
    positions[..weight].sort_unstable();

    // Step 2: Assign uniform nonzero values from `[1, q-1]`.
    let mut target = vec![0u16; n];
    for &idx in &positions[..weight] {
        // `v` uniform in `[0, q-1)`, then `+1` to shift into `[1, q-1]`.
        let v = sample_uniform_below(&mut reader, Q - 1) as u16;
        target[idx] = v + 1;
    }

    target
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic() {
        let t1 = hash_to_sparse_target(b"hello", 4);
        let t2 = hash_to_sparse_target(b"hello", 4);
        assert_eq!(t1, t2, "Same message must produce same target");
    }

    #[test]
    fn test_different_messages_different() {
        let t1 = hash_to_sparse_target(b"hello", 4);
        let t2 = hash_to_sparse_target(b"world", 4);
        assert_ne!(t1, t2, "Different messages should produce different targets");
    }

    #[test]
    fn test_sparsity() {
        for k in [2, 4, 8] {
            let t = hash_to_sparse_target(b"test message", k);
            let n = 2 * k + 2;
            let weight = k + 1;
            assert_eq!(t.len(), n);
            let nonzero: Vec<_> = t.iter().filter(|&&v| v != 0).collect();
            assert_eq!(nonzero.len(), weight, "k={k}: expected {weight} nonzeros");
        }
    }

    #[test]
    fn test_values_in_range() {
        let t = hash_to_sparse_target(b"range test", 8);
        for &v in &t {
            if v != 0 {
                assert!(v > 0 && v < Q, "Value {v} out of range [1, q-1]");
            }
        }
    }

    // ───── P1 #2 regression tests ──────────────────────────────────────
    //
    // Guard against re-introducing raw modulo bias on either position
    // selection (line 54 of pre-fix code) or value assignment (line 83 of
    // pre-fix code). The earlier `rand % n` pattern systematically gave the
    // first `2^16 mod n` outputs an extra count, with bias ratio:
    //   bias = ceil(2^16/n) / floor(2^16/n)
    // For n = Q - 1 = 3328: bias = 20/19 ≈ 1.053.
    //
    // Tests verify statistical uniformity via chi-square goodness-of-fit.

    #[test]
    fn test_rejection_sampling_uniform_for_small_n() {
        // Direct test of the helper: bias is most pronounced when n is
        // small (n=10, n=100). Run 100k samples and chi-square against
        // uniform — rejection sampling must keep chi-sq well below the
        // 99% critical value.
        use sha3::digest::ExtendableOutput;
        use sha3::Shake256;

        for &n in &[10u16, 100, 1000, 3328] {
            let n_us = n as usize;
            let mut counts = vec![0u32; n_us];
            let trials = 100_000usize;
            for trial in 0..trials {
                let mut xof = Shake256::default();
                xof.update(&(trial as u64).to_le_bytes());
                let mut reader = xof.finalize_xof();
                let v = sample_uniform_below(&mut reader, n) as usize;
                counts[v] += 1;
            }
            let expected = trials as f64 / n as f64;
            let chi_sq: f64 = counts
                .iter()
                .map(|&c| {
                    let diff = c as f64 - expected;
                    diff * diff / expected
                })
                .sum();
            // 99% critical value for chi-sq(n_bins - 1) using Wilson-Hilferty
            // approximation: k + 2.33 * sqrt(2k), where k = n_bins - 1.
            let k = (n_us - 1) as f64;
            let critical = k + 2.33 * (2.0 * k).sqrt();
            assert!(
                chi_sq < critical,
                "n={n}: chi_sq={chi_sq:.1} exceeds 99% critical {critical:.1} \
                 (dof={k:.0}) — sampling biased"
            );
        }
    }

    #[test]
    fn test_no_modulo_bias_in_value_assignment() {
        // Hash-driven test: produce many hash invocations and verify
        // that the nonzero values land uniformly in [1, Q-1].
        //
        // With raw `u16 % (Q-1)`, the first 2304 values would get 20/65536
        // probability vs 19/65536 for the rest — a 5.3% bias. With rejection
        // sampling, all 3328 nonzero values should appear with equal
        // frequency within statistical noise.
        let mut counts = vec![0u32; (Q - 1) as usize];
        let trials = 200_000usize;
        for trial in 0..trials {
            let t = hash_to_sparse_target(
                format!("bias_test_{trial}").as_bytes(),
                4, // k=4 → n=10, weight=5 → 5 samples per trial
            );
            for &v in &t {
                if v > 0 && v < Q {
                    counts[(v - 1) as usize] += 1;
                }
            }
        }
        let total: u64 = counts.iter().map(|&c| c as u64).sum();
        let n_bins = (Q - 1) as usize;
        let expected = total as f64 / n_bins as f64;
        let chi_sq: f64 = counts
            .iter()
            .map(|&c| {
                let diff = c as f64 - expected;
                diff * diff / expected
            })
            .sum();
        // 99.99% critical value for chi-sq(3327):
        //   k + 3.72 * sqrt(2k), k = 3327
        //   ≈ 3327 + 3.72 * sqrt(6654)
        //   ≈ 3327 + 303.4
        //   ≈ 3630
        // Raw modulo bias contributes ~2000 to chi-sq, so this catches it
        // with very high confidence. False positive rate ≈ 0.01%.
        let critical = 3_700.0;
        assert!(
            chi_sq < critical,
            "chi_sq={chi_sq:.1} exceeds {critical:.1} — likely modulo bias detected"
        );
        // Also verify we actually saw all (Q-1) nonzero values; if rejection
        // sampling were broken (e.g. off-by-one in threshold), some values
        // would never appear.
        let observed = counts.iter().filter(|&&c| c > 0).count();
        assert_eq!(
            observed, n_bins,
            "saw {observed}/{n_bins} distinct values — coverage gap"
        );
    }
}