// SPDX-License-Identifier: GPL-3.0-only
// packages/fml-dsa/src/core/precomputed.js
// Precomputed tables: zetas, invZetas, bitRev — self-verified
// ZETA = 1753 (FIPS 204 §B.1 — 512-th primitive root in Z_q[x]/(x^256+1))

import { Q, N, ZETA } from './params.js';

// --- bit-reversal table (N=256, 8 bits) ---
export const bitRev = new Uint16Array(N);
for (let i = 0; i < N; i++) {
  let rev = 0;
  for (let j = 0; j < 8; j++) rev = (rev << 1) | ((i >>> j) & 1);
  bitRev[i] = rev;
}

// --- zeta table: zetas[i] = ζ^(bitRev[i]) mod Q ---
export const zetas = new Int32Array(N);
for (let i = 0; i < N; i++) {
  let z = 1;
  for (let j = 0; j < bitRev[i]; j++) z = (z * ZETA) % Q;
  zetas[i] = z;
}

// --- modular inverse ---
function modInverse(a, q) {
  let old_r = a, r = q;
  let old_s = 1, s = 0;
  while (r !== 0) {
    const quotient = Math.floor(old_r / r);
    [old_r, r] = [r, old_r - quotient * r];
    [old_s, s] = [s, old_s - quotient * s];
  }
  return old_s < 0 ? old_s + q : old_s;
}

// --- invZetas table: zetaInv^(bitRev[i]) mod Q ---
const ZETA_INV = modInverse(ZETA, Q);
export const invZetas = new Int32Array(N);
for (let i = 0; i < N; i++) {
  let z = 1;
  for (let j = 0; j < bitRev[i]; j++) z = (z * ZETA_INV) % Q;
  invZetas[i] = z;
}

// --- self-test ---
(function selfTest() {
  // ζ^256 ≡ -1 (Q-1) mod Q  (512-th root property)
  let pow = 1;
  for (let i = 0; i < 256; i++) pow = (pow * ZETA) % Q;
  if (pow !== Q - 1) throw new Error(`ZETA self-test FAIL: ζ^256 = ${pow} ≠ ${Q - 1}`);

  // zetas[i] * invZetas[i] ≡ 1 for all i
  for (let i = 0; i < N; i++) {
    if ((zetas[i] * invZetas[i]) % Q !== 1) {
      throw new Error(`precomputed[${i}]: z × inv_z ≠ 1 (${zetas[i]} × ${invZetas[i]} = ${(zetas[i] * invZetas[i]) % Q})`);
    }
  }

  // zetas[0] = 1 (ζ^0)
  if (zetas[0] !== 1) throw new Error(`zetas[0] = ${zetas[0]} ≠ 1`);

  console.log('✅ precomputed: all self-tests passed (ζ=1753, Q=8380417)');
})();
