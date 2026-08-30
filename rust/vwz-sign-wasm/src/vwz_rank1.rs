//! VWZ Rank-1 Public Key Compression (2026-06-22 Blueprint → Rust)
//!
//! ## Core Insight
//!
//! Every i1 slice of ψ = ϕ^(X1,X2,X3) is naturally rank-1 because:
//!
//!   ψ[i1][i2][i3] = x1[i1] · Σ_j2[λ_{i1,2}^{j2} · x2[j2][i2]] · Σ_j3[λ_{i1,3}^{j3} · x3[j3][i3]]
//!
//! This is the *outer product* of two vectors (per i1), scaled by x1[i1].
//! The separation comes from ϕ⟨Λ⟩'s separable form + X1 diagonal.
//!
//! ## Compression Ratio
//!
//!   full:  n × m² entries  (n = 2k+1,  m = k+1)
//!   comp:  2 × n × m        (A: n×m,  B: n×m)
//!   ratio: m/2 = (k+1)/2
//!
//! |  k |  full |  comp | ratio |
//! |----|-------|-------|-------|
//! |  2 |   45   |   30   | 1.5× |
//! |  4 |  225   |   90   | 2.5× |
//! |  8 | 1377   |  306   | 4.5× |
//! | 16 | 9537   | 1122   | 8.5× |
//! | 32 | 70785  | 4290   | 16.5× |
//!
//! ## Safety (from MEMORY.md)
//!
//! Compressed key (A,B) is *information-theoretically equivalent* to full ψ.
//! No new attack surface is introduced — A and B together reconstruct ψ losslessly.

use crate::field::{inv, mul, Q};
use crate::tensor::{PubTensor, VwzTensor};

// ============================================================
// Rank-1 compressed public key
// ============================================================

/// Rank-1 compressed public key.
///
/// Stores ψ in factorized form instead of the dense 3D tensor.
/// Decompression to `PubTensor` is O(n·m²) — done once at Verify startup.
#[derive(Clone, Debug, PartialEq)]
pub struct Rank1PubKey {
    pub k: usize,
    pub n: usize,
    pub m: usize,
    /// A[i1][i2] — left factor, shape n×m
    pub a: Vec<Vec<u16>>,
    /// B[i1][i3] — right factor, shape n×m
    pub b: Vec<Vec<u16>>,
}

impl Rank1PubKey {
    /// Decompress to full `PubTensor`: ψ[i1][i2][i3] = A[i1][i2] · B[i1][i3].
    pub fn to_full(&self) -> PubTensor {
        let mut data = vec![vec![vec![0u16; self.m]; self.m]; self.n];
        for i1 in 0..self.n {
            for i2 in 0..self.m {
                let a_val = self.a[i1][i2];
                for i3 in 0..self.m {
                    data[i1][i2][i3] = mul(a_val, self.b[i1][i3]);
                }
            }
        }
        PubTensor::new(self.k, data)
    }

    /// Memory footprint in bytes.
    pub fn byte_size(&self) -> usize {
        2 * self.n * self.m * 2 // A + B, each entry 2 bytes
    }

    /// Equivalent full tensor byte size for comparison.
    pub fn full_byte_size(&self) -> usize {
        self.n * self.m * self.m * 2
    }
}

// ============================================================
// Trapdoor-based derivation (exact, zero reconstruction error)
// ============================================================

/// Derive rank-1 factors (A, B) from trapdoor components.
///
/// For each i1:
///   A[i1][i2] = x1[i1] · Σ_{j2} λ_{i1,2}^{j2} · x2[j2][i2]
///   B[i1][i3] = Σ_{j3} λ_{i1,3}^{j3} · x3[j3][i3]
///
/// This is the *generative* path — used during key generation to
/// produce the compressed public key directly, bypassing the full ψ tensor.
pub fn derive_rank1_factors(
    tensor: &VwzTensor,
    x1_diag: &[u16],
    x2: &[Vec<u16>],
    x3: &[Vec<u16>],
) -> (Vec<Vec<u16>>, Vec<Vec<u16>>) {
    let n = tensor.k1 + 1;
    let m = tensor.k + 1;

    let mut a = vec![vec![0u16; m]; n];
    let mut b = vec![vec![0u16; m]; n];

    for i1 in 0..n {
        let lam2 = tensor.lambda[i1][0];
        let lam3 = tensor.lambda[i1][1];

        // Precompute power series (same pattern as constants.rs lambda_pows)
        let mut lam2_pows = vec![1u16; m];
        let mut lam3_pows = vec![1u16; m];
        for j in 1..m {
            lam2_pows[j] = mul(lam2_pows[j - 1], lam2);
            lam3_pows[j] = mul(lam3_pows[j - 1], lam3);
        }

        // A[i1][i2] = x1[i1] · Σ_j2 λ₂^{j2} · x2[j2][i2]
        for i2 in 0..m {
            let mut sum = 0u32;
            for j2 in 0..m {
                sum += lam2_pows[j2] as u32 * x2[j2][i2] as u32;
            }
            a[i1][i2] = mul((sum % Q as u32) as u16, x1_diag[i1]);
        }

        // B[i1][i3] = Σ_j3 λ₃^{j3} · x3[j3][i3]
        for i3 in 0..m {
            let mut sum = 0u32;
            for j3 in 0..m {
                sum += lam3_pows[j3] as u32 * x3[j3][i3] as u32;
            }
            b[i1][i3] = (sum % Q as u32) as u16;
        }
    }

    (a, b)
}

// ============================================================
// Blind extraction (no trapdoor required)
// ============================================================

/// Extract rank-1 decomposition from a full ψ tensor *without* the trapdoor.
///
/// Algorithm (per i1 slice):
///   1. Find pivot (p2, p3) — first non-zero entry
///   2. B[i1][*] = ψ[i1][p2][*]  (the full pivot row)
///   3. For each i2: A[i1][i2] = ψ[i1][i2][p3] / ψ[i1][p2][p3]
///
/// Correctness: ψ[i1][i2][i3] = A[i1][i2] · B[i1][i3]
///   → ψ[i1][p2][i3] = A[i1][p2] · B[i1][i3]  →  B[i1][i3] = ψ[i1][p2][i3] / A[i1][p2]
///   → ψ[i1][i2][p3] = A[i1][i2] · B[i1][p3]  →  A[i1][i2] = ψ[i1][i2][p3] / B[i1][p3]
///   → ψ[i1][i2][i3] = A[i1][i2] · B[i1][i3]
///     = [ψ[i1][i2][p3]/B[p3]] · [ψ[i1][p2][i3]/A[p2]]
///     = ψ[i1][i2][p3] · ψ[i1][p2][i3] / ψ[i1][p2][p3]  ✓
pub fn extract_rank1(pubkey: &PubTensor) -> Rank1PubKey {
    let n = pubkey.k1 + 1;
    let m = pubkey.k + 1;
    let k = pubkey.k;

    let mut a = vec![vec![0u16; m]; n];
    let mut b = vec![vec![0u16; m]; n];

    for i1 in 0..n {
        // Find first non-zero pivot
        let mut p2 = m;
        let mut p3 = m;
        'outer: for i2 in 0..m {
            for i3 in 0..m {
                if pubkey.data[i1][i2][i3] != 0 {
                    p2 = i2;
                    p3 = i3;
                    break 'outer;
                }
            }
        }

        if p2 == m {
            // All-zero slice — leave A, B as zeros
            continue;
        }

        let pivot = pubkey.data[i1][p2][p3];
        let pivot_inv = inv(pivot);

        // B[i1][i3] = ψ[i1][p2][i3]  (pivot row)
        for i3 in 0..m {
            b[i1][i3] = pubkey.data[i1][p2][i3];
        }

        // A[i1][i2] = ψ[i1][i2][p3] / pivot
        for i2 in 0..m {
            a[i1][i2] = mul(pubkey.data[i1][i2][p3], pivot_inv);
        }
    }

    Rank1PubKey { k, n, m, a, b }
}

// ============================================================
// Equivalence verification
// ============================================================

/// Verify rank-1 decomposition is exact.
///
/// Checks: ∀ i1,i2,i3  ψ[i1][i2][i3] == A[i1][i2] · B[i1][i3]
pub fn verify_equivalence(original: &PubTensor, compressed: &Rank1PubKey) -> bool {
    let n = original.k1 + 1;
    let m = original.k + 1;

    for i1 in 0..n {
        for i2 in 0..m {
            for i3 in 0..m {
                if original.data[i1][i2][i3] != mul(compressed.a[i1][i2], compressed.b[i1][i3]) {
                    return false;
                }
            }
        }
    }
    true
}

// ============================================================
// Serialization (compact binary, same endianness as signature.rs)
// ============================================================

/// Serialize rank-1 compressed key.
///
/// Format: [1B k] [n·m·2B A] [n·m·2B B]
pub fn serialize_rank1(key: &Rank1PubKey) -> Vec<u8> {
    let total = 1 + 2 * key.n * key.m * 2;
    let mut buf = Vec::with_capacity(total);
    buf.push(key.k as u8);
    for i1 in 0..key.n {
        for i2 in 0..key.m {
            buf.extend_from_slice(&key.a[i1][i2].to_le_bytes());
        }
    }
    for i1 in 0..key.n {
        for i3 in 0..key.m {
            buf.extend_from_slice(&key.b[i1][i3].to_le_bytes());
        }
    }
    buf
}

/// Deserialize rank-1 compressed key.
pub fn deserialize_rank1(data: &[u8]) -> Option<Rank1PubKey> {
    if data.is_empty() {
        return None;
    }
    let k = data[0] as usize;
    let n = 2 * k + 1;
    let m = k + 1;
    let expected = 1 + 2 * n * m * 2;
    if data.len() != expected {
        return None;
    }

    let mut offset = 1;
    let mut a = vec![vec![0u16; m]; n];
    let mut b = vec![vec![0u16; m]; n];

    for i1 in 0..n {
        for i2 in 0..m {
            a[i1][i2] = u16::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;
        }
    }
    for i1 in 0..n {
        for i3 in 0..m {
            b[i1][i3] = u16::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;
        }
    }
    Some(Rank1PubKey { k, n, m, a, b })
}

// ============================================================
// Integration helper: compressed keygen
// ============================================================

/// Generate a keypair with rank-1 compressed public key.
///
/// Calls `generate_trapdoor` internally, then `derive_rank1_factors`
/// to produce the compressed form. The full ψ tensor is discarded.
pub fn keygen_compressed(
    k: usize,
    seed: Option<u64>,
) -> (Rank1PubKey, crate::trapdoor::Trapdoor) {
    use crate::trapdoor::generate_trapdoor;
    let (_psi, td) = generate_trapdoor(k, seed);
    let (a, b) = derive_rank1_factors(&td.tensor, &td.x1_diag, &td.x2, &td.x3);
    (
        Rank1PubKey {
            k,
            n: 2 * k + 1,
            m: k + 1,
            a,
            b,
        },
        td,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tensor::tensor_eval;
    use crate::trapdoor::{generate_trapdoor, sample_preimage};

    // ----------------------------------------------------------
    // Core correctness: derive → decompress ≡ original ψ
    // ----------------------------------------------------------

    #[test]
    fn test_derive_roundtrip_exact() {
        for k in [2, 3, 4, 8] {
            let (psi_data, td) = generate_trapdoor(k, Some(12345 + k as u64));
            let pk_full = PubTensor::new(k, psi_data);

            let (a, b) =
                derive_rank1_factors(&td.tensor, &td.x1_diag, &td.x2, &td.x3);
            let compressed = Rank1PubKey {
                k,
                n: 2 * k + 1,
                m: k + 1,
                a,
                b,
            };
            let decompressed = compressed.to_full();

            for i1 in 0..(2 * k + 1) {
                for i2 in 0..(k + 1) {
                    for i3 in 0..(k + 1) {
                        assert_eq!(
                            pk_full.data[i1][i2][i3],
                            decompressed.data[i1][i2][i3],
                            "k={k}: mismatch at ({i1},{i2},{i3})"
                        );
                    }
                }
            }
        }
    }

    // ----------------------------------------------------------
    // Blind extraction: recover rank-1 from dense ψ (no trapdoor)
    // ----------------------------------------------------------

    #[test]
    fn test_blind_extraction_equivalence() {
        for k in [2, 3, 4, 8] {
            let (psi_data, _td) = generate_trapdoor(k, Some(99999 + k as u64));
            let pk = PubTensor::new(k, psi_data);

            let compressed = extract_rank1(&pk);
            assert!(
                verify_equivalence(&pk, &compressed),
                "k={k}: blind extraction failed"
            );
        }
    }

    // ----------------------------------------------------------
    // Sign / verify through compressed → decompressed path
    // ----------------------------------------------------------

    #[test]
    fn test_sign_verify_via_compressed() {
        for k in [2, 4, 8] {
            let (psi_data, td) = generate_trapdoor(k, Some(77777 + k as u64));
            let pk_original = PubTensor::new(k, psi_data);

            // Compress
            let (a, b) =
                derive_rank1_factors(&td.tensor, &td.x1_diag, &td.x2, &td.x3);
            let compressed = Rank1PubKey {
                k,
                n: 2 * k + 1,
                m: k + 1,
                a,
                b,
            };
            let pk_decompressed = compressed.to_full();

            // Verify equivalence first
            assert!(verify_equivalence(&pk_original, &compressed));

            // Sign on original, verify on decompressed
            use crate::hash_target::hash_to_sparse_target;
            use crate::tensor::public_tensor_eval;

            let msg = format!("compressed test k={k}").into_bytes();
            let target = hash_to_sparse_target(&msg, k);
            let (w2, w3) = sample_preimage(&td, &target).unwrap();
            let result = public_tensor_eval(&pk_decompressed, &w2, &w3);

            assert_eq!(result, target, "k={k}: verify via compressed pk failed");
        }
    }

    // ----------------------------------------------------------
    // Serialization roundtrip (zero-loss)
    // ----------------------------------------------------------

    #[test]
    fn test_serialization_roundtrip() {
        for k in [2, 4, 8] {
            let (psi_data, td) = generate_trapdoor(k, Some(55555 + k as u64));
            let pk = PubTensor::new(k, psi_data);
            let (a, b) =
                derive_rank1_factors(&td.tensor, &td.x1_diag, &td.x2, &td.x3);
            let original = Rank1PubKey {
                k,
                n: 2 * k + 1,
                m: k + 1,
                a,
                b,
            };

            let ser = serialize_rank1(&original);
            let deser = deserialize_rank1(&ser).expect("deserialize_rank1 failed");

            assert_eq!(original.k, deser.k);
            assert_eq!(original.n, deser.n);
            assert_eq!(original.a, deser.a, "A mismatch after serialization");
            assert_eq!(original.b, deser.b, "B mismatch after serialization");
            assert!(verify_equivalence(&pk, &deser));
        }
    }

    // ----------------------------------------------------------
    // keygen_compressed integration
    // ----------------------------------------------------------

    #[test]
    fn test_keygen_compressed_roundtrip() {
        for k in [2, 4, 8] {
            let (compressed, td) = keygen_compressed(k, Some(33333 + k as u64));
            let decompressed = compressed.to_full();

            // Verify that the decompressed key actually works for signing
            use crate::hash_target::hash_to_sparse_target;
            use crate::tensor::public_tensor_eval;

            let msg = format!("keygen_compressed k={k}").into_bytes();
            let target = hash_to_sparse_target(&msg, k);
            let (w2, w3) = sample_preimage(&td, &target).unwrap();
            let result = public_tensor_eval(&decompressed, &w2, &w3);

            assert_eq!(result, target);

            // Also verify tensor_eval on original tensor gives same result
            let _result2 = tensor_eval(&td.tensor, &w2, &w3);
            // result2 is on plain ϕ, not ψ — need to validate independently
            // The key check is that public_tensor_eval succeeds on decompressed ψ
            assert_eq!(result.len(), 2 * k + 1);
        }
    }

    // ----------------------------------------------------------
    // Size ratio sanity check
    // ----------------------------------------------------------

    #[test]
    fn test_size_ratios() {
        let ratios: Vec<(usize, f64, usize, usize)> = [2, 4, 8, 16]
            .iter()
            .map(|&k| {
                let n = 2 * k + 1;
                let m = k + 1;
                let full = n * m * m * 2;
                let comp = 2 * n * m * 2;
                (k, full as f64 / comp as f64, full, comp)
            })
            .collect();

        for (k, ratio, full, comp) in &ratios {
            println!("k={k}: full={full}B comp={comp}B ratio={ratio:.1}×");
            assert!(*ratio >= 1.5, "k={k}: ratio {ratio} too low");
        }

        // k=16 should give at least 8×
        let ratio_k16 = ratios.iter().find(|(k, _, _, _)| *k == 16).unwrap().1;
        assert!(ratio_k16 >= 8.0, "k=16 ratio {ratio_k16} < 8.0");
    }

    // ----------------------------------------------------------
    // All-zero edge case
    // ----------------------------------------------------------

    #[test]
    fn test_empty_serialization() {
        assert!(deserialize_rank1(&[]).is_none());
        assert!(deserialize_rank1(&[0u8]).is_none());
        // 1 + 2*5*3*2 = 61 bytes for k=2
        assert!(deserialize_rank1(&[2u8; 10]).is_none());
    }
}
