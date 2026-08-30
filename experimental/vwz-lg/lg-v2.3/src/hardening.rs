// lg-v2.3/src/hardening.rs — Multi-round full-block hardening layer
//
// Complete landing of the Stage-3 hardening recommended in
// security-assessment/lg-hardening-review.md §2.4 / §5.5:
//
//   [ full-block GF(256) diffusion  +  per-byte nonlinear S-box mix ]  × ROUNDS
//
// Rationale (vs the single-diffuse landing):
//   - A single linear diffusion layer is still recoverable by chosen-plaintext
//     linear algebra (N×N matrix solve). Alternating diffusion with a
//     per-byte nonlinear S-box round breaks linearity, pushing recovery
//     toward a nonlinear system of equations.
//   - Round keys are derived from (seed, session_key, round) via Keccak-256
//     (domain-separated), not bare XorShift64 — so an attacker cannot guess
//     or reconstruct the per-round diffusion coefficients from a weak PRNG.
//   - Every confusion variant in lib.rs now routes through this layer, so the
//     "no cross-byte diffusion" flaw is removed uniformly (not just pipeline).
//
// Invertible: inverse applies S-box⁻¹ then diffusion⁻¹ per round, in reverse
// round order.

use crate::bind::keccak256;
use crate::diffuse::{diffuse_forward, diffuse_inverse};
use crate::sbox::{SBOX, INV_SBOX};
use crate::wreath::XorShift64;

/// Number of diffusion↔S-box rounds (≥2 per the hardening review §2.4).
pub const HARDEN_ROUNDS: usize = 2;

/// Domain-separation label for round-key derivation.
const DOMAIN: &[u8] = b"LGV3-HARDEN-v1";

/// Derive a strong per-round key from (seed, session_key, round) via Keccak-256.
#[inline]
pub fn round_key(seed: u64, session_key: u64, round: usize) -> u64 {
    let mut input = Vec::with_capacity(DOMAIN.len() + 24);
    input.extend_from_slice(DOMAIN);
    input.extend_from_slice(&seed.to_le_bytes());
    input.extend_from_slice(&session_key.to_le_bytes());
    input.extend_from_slice(&(round as u64).to_le_bytes());
    let h = keccak256(&input);
    u64::from_le_bytes(h[..8].try_into().unwrap())
}

/// Per-byte nonlinear mix: XOR keystream then AES S-box (invertible).
fn sbox_mix(data: &mut [u8], rk: u64) {
    let mut rng = XorShift64::new(rk);
    for b in data.iter_mut() {
        *b = SBOX[(*b ^ rng.next_u8()) as usize];
    }
}

/// Inverse of sbox_mix: INV_SBOX then XOR same keystream.
fn inv_sbox_mix(data: &mut [u8], rk: u64) {
    let mut rng = XorShift64::new(rk);
    for b in data.iter_mut() {
        *b = INV_SBOX[*b as usize] ^ rng.next_u8();
    }
}

/// Forward hardening: [diffuse(rk) -> S-box(rk)] × rounds.
/// Every output byte depends on every input byte; the per-round S-box
/// makes the composite transform nonlinear.
pub fn harden_forward(data: &mut [u8], seed: u64, session_key: u64, rounds: usize) {
    if data.is_empty() {
        return;
    }
    for r in 0..rounds {
        let rk = round_key(seed, session_key, r);
        diffuse_forward(data, rk, session_key);
        sbox_mix(data, rk);
    }
}

/// Inverse hardening: [S-box⁻¹(rk) -> diffuse⁻¹(rk)] × rounds, reverse order.
pub fn harden_inverse(data: &mut [u8], seed: u64, session_key: u64, rounds: usize) {
    if data.is_empty() {
        return;
    }
    for r in (0..rounds).rev() {
        let rk = round_key(seed, session_key, r);
        inv_sbox_mix(data, rk);
        diffuse_inverse(data, rk, session_key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(n: usize) -> Vec<u8> {
        (0..n).map(|i| (i * 7) as u8).collect()
    }

    #[test]
    fn test_round_key_differs_per_round_and_params() {
        let k0 = round_key(0x1234, 0xDEAD, 0);
        let k1 = round_key(0x1234, 0xDEAD, 1);
        assert_ne!(k0, k1, "round keys must differ per round");
        let k0b = round_key(0x1234, 0xBEEF, 0);
        assert_ne!(k0, k0b, "round keys must differ per session_key");
        let k0c = round_key(0x5678, 0xDEAD, 0);
        assert_ne!(k0, k0c, "round keys must differ per seed");
    }

    #[test]
    fn test_harden_roundtrip_various_sizes() {
        for n in [1usize, 4, 16, 64, 256, 1000] {
            let data = sample(n);
            for seed in [0u64, 1, 0x1234, 0xDEADBEEF] {
                for sk in [0u64, 0xDEAD, 0xCAFE] {
                    let mut c = data.clone();
                    harden_forward(&mut c, seed, sk, HARDEN_ROUNDS);
                    harden_inverse(&mut c, seed, sk, HARDEN_ROUNDS);
                    assert_eq!(c, data, "harden roundtrip failed (n={}, seed={}, sk={})", n, seed, sk);
                }
            }
        }
    }

    #[test]
    fn test_harden_changes_data_and_deterministic() {
        let data = sample(64);
        let mut c = data.clone();
        harden_forward(&mut c, 0x1234, 0xDEAD, HARDEN_ROUNDS);
        assert_ne!(c, data, "harden must change data");
        let mut c2 = data.clone();
        harden_forward(&mut c2, 0x1234, 0xDEAD, HARDEN_ROUNDS);
        assert_eq!(c, c2, "same params must be deterministic");
    }

    #[test]
    fn test_harden_seed_session_sensitivity() {
        let data = sample(256);
        let mut a = data.clone();
        let mut b = data.clone();
        let mut c = data.clone();
        harden_forward(&mut a, 0x1234, 0xDEAD, HARDEN_ROUNDS);
        harden_forward(&mut b, 0x5678, 0xDEAD, HARDEN_ROUNDS);
        harden_forward(&mut c, 0x1234, 0xBEEF, HARDEN_ROUNDS);
        assert_ne!(a, b, "different seed must differ");
        assert_ne!(a, c, "different session must differ");
    }

    #[test]
    fn test_harden_full_block_spread() {
        // Single-byte perturbation must spread to ~full block through harden().
        let n = 64;
        let seed = 0x1234u64;
        let sk = 0xDEADu64;
        let base = vec![0u8; n];
        let mut b0 = base.clone();
        harden_forward(&mut b0, seed, sk, HARDEN_ROUNDS);
        let mut min_changed = usize::MAX;
        for i in 0..n {
            let mut inp = base.clone();
            inp[i] ^= 1;
            let mut out = inp.clone();
            harden_forward(&mut out, seed, sk, HARDEN_ROUNDS);
            let changed = (0..n).filter(|&j| out[j] != b0[j]).count();
            min_changed = min_changed.min(changed);
        }
        assert!(
            min_changed >= n / 2,
            "harden single-byte perturbation only affected {} of {} bytes",
            min_changed,
            n
        );
    }

    #[test]
    fn test_harden_sigma_localization_fails() {
        // Black-box attack step 1 (exactly-one changed byte) must fail.
        let n = 64;
        let seed = 0x1234u64;
        let sk = 0xDEADu64;
        let base = vec![0u8; n];
        let mut b0 = base.clone();
        harden_forward(&mut b0, seed, sk, HARDEN_ROUNDS);
        for i in 0..n {
            let mut inp = base.clone();
            inp[i] ^= 1;
            let mut out = inp.clone();
            harden_forward(&mut out, seed, sk, HARDEN_ROUNDS);
            let changed = (0..n).filter(|&j| out[j] != b0[j]).count();
            assert_ne!(changed, 1, "position {} has exactly-one changed byte — attack would succeed", i);
        }
    }
}
