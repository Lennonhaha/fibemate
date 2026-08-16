//! Hash message → sparse target vector (deterministic).
//!
//! Uses SHAKE-256 XOF to deterministically derive:
//!   1. k+1 distinct positions in [0, 2k+1]
//!   2. Nonzero values in [1, q-1] at those positions
//!
//! Result: target vector t ∈ F_q^{2k+2} with Hamming weight exactly k+1.

use crate::field::Q;
use sha3::digest::{ExtendableOutput, Update, XofReader};
use sha3::Shake256;

/// Hash a message to a sparse target vector.
///
/// Produces t ∈ F_q^{2k+2} with exactly k+1 nonzero entries.
/// Deterministic: same message → same target.
pub fn hash_to_sparse_target(msg: &[u8], k: usize) -> Vec<u16> {
    let n = 2 * k + 2;
    let weight = k + 1;

    // SHAKE-256 XOF
    let mut xof = Shake256::default();
    xof.update(msg);
    let mut reader = xof.finalize_xof();

    // Read bytes from XOF
    let mut read_bytes = |nbytes: usize| -> Vec<u8> {
        let mut buf = vec![0u8; nbytes];
        reader.read(&mut buf);
        buf
    };

    let u16_from_bytes = |b: &[u8]| -> u16 {
        ((b[0] as u16) << 8) | (b[1] as u16)
    };

    // Step 1: Select k+1 distinct positions via Fisher-Yates shuffle
    let mut positions: Vec<usize> = (0..n).collect();
    let mut xof_bytes = read_bytes(128);

    for i in 0..weight {
        if 2 * i + 2 > xof_bytes.len() {
            // Replenish XOF
            let mut xof2 = Shake256::default();
            xof2.update(&xof_bytes);
            xof2.update(msg);
            xof_bytes = {
                let mut buf = vec![0u8; 128];
                xof2.finalize_xof().read(&mut buf);
                buf
            };
        }
        let rand_val = u16_from_bytes(&xof_bytes[2 * i..2 * i + 2]);
        let j = i + (rand_val as usize % (n - i));
        positions.swap(i, j);
    }

    let selected = &mut positions[..weight];
    selected.sort_unstable();

    // Step 2: Assign nonzero values from XOF
    let mut xof2 = Shake256::default();
    xof2.update(&xof_bytes);
    xof2.update(msg);
    let mut xof_bytes2 = {
        let mut buf = vec![0u8; 128];
        xof2.finalize_xof().read(&mut buf);
        buf
    };

    let mut target = vec![0u16; n];
    for (pos, idx) in selected.iter().enumerate() {
        if 2 * pos + 2 > xof_bytes2.len() {
            let mut xof3 = Shake256::default();
            xof3.update(&xof_bytes2);
            xof3.update(msg);
            xof_bytes2 = {
                let mut buf = vec![0u8; 128];
                xof3.finalize_xof().read(&mut buf);
                buf
            };
        }
        let val = u16_from_bytes(&xof_bytes2[2 * pos..2 * pos + 2]) % (Q - 1) + 1;
        target[*idx] = val;
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
}
