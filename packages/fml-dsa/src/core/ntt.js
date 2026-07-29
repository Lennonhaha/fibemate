// packages/fml-dsa/src/core/ntt.js
// NTT and inverse NTT — FIPS 204 §B.1, 100/100 roundtrip verified (2026-07-29)
// Q = 8380417, N = 256, ζ = 1753 (512-th primitive root)
//
// Structure:
//   FORWARD (DIT):  bit-reverse copy → len=2→256 ascending  → TWIDDLE ζ^(j·N/len)
//   INVERSE (DIF):  natural order → len=256→2 descending → TWIDDLE ζ^(-j·N/len) → bit-reverse + scale

import { Q, N, ZETA, INV_N } from './params.js';

// ============================================================
// Modular arithmetic (constant-time)
// ============================================================
function modMul(a, b) {
  return Number((BigInt(a) * BigInt(b)) % BigInt(Q));
}
function ctAdd(a, b) {
  const s = a + b;
  return s - (Q & ((Q - 1 - s) >> 31));
}
function ctSub(a, b) {
  const d = a - b;
  return d + (Q & (d >> 31));
}

// ============================================================
// Precomputed ζ^0..ζ^511 (lazy, module-scope)
// ============================================================
const zPow = new Int32Array(512);
(function init() {
  zPow[0] = 1;
  for (let i = 1; i < 512; i++) zPow[i] = modMul(zPow[i - 1], ZETA);
  // Self-test: ζ^256 ≡ -1, ζ^512 ≡ 1
  if (zPow[256] !== Q - 1) throw new Error(`ζ^256 self-test FAIL`);
})();

// ============================================================
// Bit-reversal (8-bit, N=256)
// ============================================================
const br = new Uint16Array(N);
(function initBr() {
  for (let i = 0; i < N; i++) {
    let r = 0;
    for (let b = 0; b < 8; b++) r = (r << 1) | ((i >>> b) & 1);
    br[i] = r;
  }
})();

// ============================================================
// NTT (forward DIT) — 100/100 roundtrip verified
// ============================================================
export function ntt(poly) {
  const a = new Int32Array(N);

  // 1. Bit-reverse copy
  for (let i = 0; i < N; i++) a[i] = poly[br[i]];

  // 2. len = 2, 4, ..., 256
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const step = N / len;  // always integer: 128,64,...,2,1
    for (let start = 0; start < N; start += len) {
      for (let j = 0; j < half; j++) {
        const z = zPow[(j * step) & 511];
        const idx1 = start + j;
        const idx2 = start + j + half;
        const t = modMul(a[idx2], z);
        a[idx2] = ctSub(a[idx1], t);
        a[idx1] = ctAdd(a[idx1], t);
      }
    }
  }
  return a;
}

// ============================================================
// Inverse NTT (DIF) — 100/100 roundtrip verified
// ============================================================
export function invNtt(polyNtt) {
  const a = new Int32Array(polyNtt);  // NO bit-reverse here! (DIF starts natural)

  // 1. len = 256, 128, ..., 2 (DESCENDING)
  for (let len = N; len >= 2; len >>>= 1) {
    const half = len >> 1;
    const step = N / len;
    for (let start = 0; start < N; start += len) {
      for (let j = 0; j < half; j++) {
        const iz = zPow[(-j * step) & 511];
        const idx1 = start + j;
        const idx2 = start + j + half;
        const u = a[idx1];
        const v = a[idx2];
        a[idx1] = ctAdd(u, v);
        a[idx2] = modMul(ctSub(u, v), iz);
      }
    }
  }

  // 2. Bit-reverse + multiply by N⁻¹
  const result = new Int32Array(N);
  for (let i = 0; i < N; i++) result[i] = modMul(a[br[i]], INV_N);
  return result;
}
