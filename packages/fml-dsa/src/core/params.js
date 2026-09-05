// SPDX-License-Identifier: GPL-3.0-only
// packages/fml-dsa/src/core/params.js
// FIPS 204 (ML-DSA) core parameters — verified 2026-07-29

export const Q = 8380417;        // prime modulus
export const N = 256;            // ring dimension (x^256 + 1)
export const SEED_LENGTH = 32;
export const ZETA = 1753;        // 512-th primitive root of unity (ζ^256 ≡ -1 mod Q)
export const INV_N = 8347681;    // N⁻¹ mod Q (verified: 256 × 8347681 ≡ 1 mod Q)

// ML-DSA parameter sets (FIPS 204 §4, Table 1)
// cTildeBytes = λ/8 where λ = security level (128/192/256 bits)
// d (Power2Round dropped bits) = 13 for all parameter sets (FIPS 204 §5.4.1)
// t1 bit-width (FIPS 204 §5.2.1) = ceil(log2((Q-1)/2^13)) = 10
export const MLDSA_PARAMS = {
  'ML-DSA-44': {
    k: 4, l: 4, d: 13,
    eta: 2,
    tau: 39,
    gamma1: 1 << 17,              // 2^17
    gamma2: (Q - 1) / 88,         // = 95232
    beta: 78,
    omega: 80,
    cTildeBytes: 32,              // λ=128 → 32B
    pubBytes: 1312,
    secBytes: 2560,
    sigBytes: 2420,
    level: 2
  },
  'ML-DSA-65': {
    k: 6, l: 5, d: 13,
    eta: 4,
    tau: 49,
    gamma1: 1 << 19,              // 2^19
    gamma2: (Q - 1) / 32,         // = 261888
    beta: 196,
    omega: 55,
    cTildeBytes: 48,              // λ=192 → 48B (FIPS 204: c̃ = 384 bits)
    pubBytes: 1952,
    secBytes: 4032,
    sigBytes: 3309,
    level: 3
  },
  'ML-DSA-87': {
    k: 8, l: 7, d: 13,
    eta: 2,
    tau: 60,
    gamma1: 1 << 19,              // 2^19
    gamma2: (Q - 1) / 32,         // = 261888
    beta: 120,
    omega: 75,
    cTildeBytes: 64,              // λ=256 → 64B (FIPS 204: c̃ = 512 bits)
    pubBytes: 2592,
    secBytes: 4896,
    sigBytes: 4627,
    level: 5
  }
};

// t1 coefficient bit-width (always 10, since t1 holds HighBits(t) where t ∈ [0, Q))
// Independent of d (which is the Power2Round drop count).
export const T1_BITS = 10;
