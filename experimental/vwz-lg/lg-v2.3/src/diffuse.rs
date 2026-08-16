// lg-v2.3/src/diffuse.rs — Seed-derived full-block diffusion layer (Stage-3 hardening)
//
// Black-box attack root cause (see security-assessment/lg-hardening-review.md):
// every LG v2.3 stage is per-byte bijective + position permutation, with NO
// cross-byte value diffusion. A single-byte perturbation therefore affects
// exactly one output byte, letting an attacker locate the permutation sigma
// and rebuild each F_i in O(N·256) oracle calls.
//
// This layer introduces full-block diffusion via two invertible triangular
// linear maps over GF(256) (AES polynomial 0x11b):
//   pass1 (lower-triangular): t[i] = in[i] ^ Σ_{j<i} A1[i][j]·in[j] ^ b1[i]
//   pass2 (upper-triangular): out[i] = t[i] ^ Σ_{j>i} A2[i][j]·t[j] ^ b2[i]
// Each output byte depends on every input byte (single-byte perturbation
// spreads to ~all N output bytes), so the original sigma-localization attack
// cannot locate a 1-byte dependency and fails.
//
// The maps are derived from (seed, session_key) via per-row seeds, so an
// attacker cannot peel them off the way a fixed MDS matrix can be peeled.
// Both passes are exactly invertible; memory is O(N) (coefficients are
// regenerated deterministically per row, no N×N matrix is materialized).

use crate::wreath::XorShift64;

/// GF(256) reduction polynomial 0x11b (byte form).
const GF_POLY: u8 = 0x1B;

/// GF(256) multiplication with AES polynomial 0x11b.
#[inline]
pub fn gf_mul(mut a: u8, mut b: u8) -> u8 {
    let mut p = 0u8;
    while b != 0 {
        if b & 1 != 0 {
            p ^= a;
        }
        let hi = a & 0x80;
        a <<= 1;
        if hi != 0 {
            a ^= GF_POLY;
        }
        b >>= 1;
    }
    p
}

/// splitmix64-style avalanche of (master, pass, row) into a per-row seed.
#[inline]
fn row_seed(master: u64, pass: u64, row: usize) -> u64 {
    let mut s = master
        ^ pass.wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ (row as u64 + 1).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    s ^= s >> 30;
    s = s.wrapping_mul(0xBF58_476D_1CE4_E5B9);
    s ^= s >> 27;
    s = s.wrapping_mul(0x94D0_49BB_1331_11EB);
    s ^= s >> 31;
    s
}

/// Forward full-block diffusion (invertible).
pub fn diffuse_forward(data: &mut [u8], seed: u64, session_key: u64) {
    let n = data.len();
    if n == 0 {
        return;
    }
    let master = seed ^ session_key ^ 0x11A7_E0F0_5EED_11A7;
    let mut t = vec![0u8; n];

    // pass1: lower-triangular  t[i] = b1[i] ^ Σ_{j<i} A1[i][j]·in[j] ^ in[i]
    for i in 0..n {
        let mut rng = XorShift64::new(row_seed(master, 1, i));
        let b1 = rng.next_u8();
        let mut s = b1;
        for j in 0..i {
            let c = rng.next_u8();
            s ^= gf_mul(c, data[j]);
        }
        t[i] = s ^ data[i];
    }

    // pass2: upper-triangular  out[i] = b2[i] ^ Σ_{j>i} A2[i][j]·t[j] ^ t[i]
    for i in 0..n {
        let mut rng = XorShift64::new(row_seed(master, 2, i));
        let b2 = rng.next_u8();
        let mut s = b2;
        for j in (i + 1)..n {
            let c = rng.next_u8();
            s ^= gf_mul(c, t[j]);
        }
        data[i] = s ^ t[i];
    }
}

/// Inverse of diffuse_forward (exact reverse, same (seed, session_key)).
pub fn diffuse_inverse(data: &mut [u8], seed: u64, session_key: u64) {
    let n = data.len();
    if n == 0 {
        return;
    }
    let master = seed ^ session_key ^ 0x11A7_E0F0_5EED_11A7;
    let mut t = vec![0u8; n];

    // undo pass2 (upper-triangular): t[i] = out[i] ^ b2[i] ^ Σ_{j>i} A2[i][j]·t[j]
    for i in (0..n).rev() {
        let mut rng = XorShift64::new(row_seed(master, 2, i));
        let b2 = rng.next_u8();
        let mut s = b2;
        for j in (i + 1)..n {
            let c = rng.next_u8();
            s ^= gf_mul(c, t[j]);
        }
        t[i] = data[i] ^ s;
    }

    // undo pass1 (lower-triangular): in[i] = t[i] ^ b1[i] ^ Σ_{j<i} A1[i][j]·in[j]
    for i in 0..n {
        let mut rng = XorShift64::new(row_seed(master, 1, i));
        let b1 = rng.next_u8();
        let mut s = b1;
        for j in 0..i {
            let c = rng.next_u8();
            s ^= gf_mul(c, data[j]); // data[j] for j<i already recovered
        }
        data[i] = t[i] ^ s;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(n: usize) -> Vec<u8> {
        (0..n).map(|i| (i * 7) as u8).collect()
    }

    #[test]
    fn test_gf_mul_basic() {
        // Known AES-GF values.
        assert_eq!(gf_mul(0x57, 0x13), 0xFE);
        assert_eq!(gf_mul(0x57, 0x01), 0x57);
        assert_eq!(gf_mul(0x00, 0xAB), 0x00);
        assert_eq!(gf_mul(0x01, 0xAB), 0xAB);
        // 0x02 * x is left-shift with reduction.
        assert_eq!(gf_mul(0x02, 0x80), 0x1B);
        assert_eq!(gf_mul(0x02, 0x40), 0x80);
    }

    #[test]
    fn test_diffuse_roundtrip_various_sizes() {
        for n in [1usize, 4, 16, 64, 256, 1000] {
            let data = sample(n);
            for seed in [0u64, 1, 0x1234, 0xDEADBEEF] {
                for sk in [0u64, 0xDEAD, 0xCAFE] {
                    let mut c = data.clone();
                    diffuse_forward(&mut c, seed, sk);
                    diffuse_inverse(&mut c, seed, sk);
                    assert_eq!(c, data, "diffuse roundtrip failed (n={}, seed={}, sk={})", n, seed, sk);
                }
            }
        }
    }

    #[test]
    fn test_diffuse_changes_data() {
        let data = sample(64);
        let mut c = data.clone();
        diffuse_forward(&mut c, 0x1234, 0xDEAD);
        assert_ne!(c, data, "diffuse must change data");
    }

    #[test]
    fn test_diffuse_deterministic() {
        let data = sample(256);
        let mut a = data.clone();
        let mut b = data.clone();
        diffuse_forward(&mut a, 0x1234, 0xDEAD);
        diffuse_forward(&mut b, 0x1234, 0xDEAD);
        assert_eq!(a, b, "same seed+session must be deterministic");
    }

    #[test]
    fn test_diffuse_seed_session_sensitivity() {
        let data = sample(256);
        let mut a = data.clone();
        let mut b = data.clone();
        let mut c = data.clone();
        diffuse_forward(&mut a, 0x1234, 0xDEAD);
        diffuse_forward(&mut b, 0x5678, 0xDEAD); // different seed
        diffuse_forward(&mut c, 0x1234, 0xBEEF); // different session
        assert_ne!(a, b, "different seed must differ");
        assert_ne!(a, c, "different session must differ");
    }

    #[test]
    fn test_diffuse_full_block_spread() {
        // Single-byte perturbation must spread to ~all N output bytes.
        let n = 64;
        let seed = 0x1234u64;
        let sk = 0xDEADu64;
        let base = vec![0u8; n];
        let mut b0 = base.clone();
        diffuse_forward(&mut b0, seed, sk);
        let mut min_changed = usize::MAX;
        for i in 0..n {
            let mut inp = base.clone();
            inp[i] ^= 1;
            let mut out = inp.clone();
            diffuse_forward(&mut out, seed, sk);
            let changed = (0..n).filter(|&j| out[j] != b0[j]).count();
            min_changed = min_changed.min(changed);
        }
        // Lower/upper triangular random maps: each input byte reaches at least
        // ~50% of outputs; require far above the 1-byte baseline (attack needs
        // exactly 1). Use a generous threshold.
        assert!(
            min_changed >= n / 2,
            "single-byte perturbation only affected {} of {} bytes — diffusion too weak",
            min_changed,
            n
        );
    }
}
