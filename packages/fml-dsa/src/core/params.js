// packages/fml-dsa/src/core/params.js
// FIPS 204 (ML-DSA) core parameters — verified 2026-07-29

export const Q = 8380417;        // prime modulus
export const N = 256;            // ring dimension (x^256 + 1)
export const SEED_LENGTH = 32;
export const ZETA = 1753;        // 512-th primitive root of unity (ζ^256 ≡ -1 mod Q)
export const INV_N = 8347681;    // N⁻¹ mod Q (verified: 256 × 8347681 ≡ 1 mod Q)

// ML-DSA parameter sets (FIPS 204 §4, Table 1)
export const MLDSA_PARAMS = {
  'ML-DSA-44': {
    k: 4, l: 4,
    eta: 2,
    tau: 39,
    gamma1: 1 << 17,              // 2^17
    gamma2: (Q - 1) / 88,         // = 95232
    beta: 78,
    omega: 80,
    // derived
    pubBytes: 1312,
    secBytes: 2560,
    sigBytes: 2420,
    level: 2
  },
  'ML-DSA-65': {
    k: 6, l: 5,
    eta: 4,
    tau: 49,
    gamma1: 1 << 19,              // 2^19
    gamma2: (Q - 1) / 32,         // = 261888
    beta: 196,
    omega: 55,
    pubBytes: 1952,
    secBytes: 4032,
    sigBytes: 3309,
    level: 3
  },
  'ML-DSA-87': {
    k: 8, l: 7,
    eta: 2,
    tau: 60,
    gamma1: 1 << 19,              // 2^19
    gamma2: (Q - 1) / 32,         // = 261888
    beta: 120,
    omega: 75,
    pubBytes: 2592,
    secBytes: 4896,
    sigBytes: 4627,
    level: 5
  }
};
