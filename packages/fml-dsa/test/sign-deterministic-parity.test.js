// SPDX-License-Identifier: GPL-3.0-only
// packages/fml-dsa/test/sign-deterministic-parity.test.js
//
// The deterministic ML-DSA signature is fully specified: same key, same message,
// same `rnd = 0^32` ⇒ one byte string. This test pins that byte string against
// @noble/post-quantum for all three parameter sets.
//
// It exists because three deviations were invisible to verification:
//   - ρ'' was H(K ‖ μ) instead of H(K ‖ rnd ‖ μ), omitting the 32-byte rnd field
//   - κ started at 1 and advanced by 1 instead of by ℓ
//   - ExpandMask hashed ρ ‖ [κ_hi, κ_lo] ‖ [r_lo, r_hi] instead of ρ ‖ LE16(κ+r),
//     and its coefficient was t − (γ₁−1) instead of γ₁ − t
// Verification never calls ExpandMask and never recomputes ρ'', so every one of
// those produced signatures that verified everywhere while being unreproducible
// from a vector file. Byte equality with an independent implementation is the
// only cheap check that catches this class.

import { ml_dsa44, ml_dsa65, ml_dsa87 } from '../src/index.js';
import { ml_dsa44 as n44, ml_dsa65 as n65, ml_dsa87 as n87 } from '@noble/post-quantum/ml-dsa.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS', msg); }
  else { failed++; console.error('  FAIL', msg); }
}
const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));

const cases = [
  ['ML-DSA-44', ml_dsa44, n44, 2560],
  ['ML-DSA-65', ml_dsa65, n65, 4032],
  ['ML-DSA-87', ml_dsa87, n87, 4896],
];

const msg = new Uint8Array([70, 73, 66, 69, 77, 65, 84, 69, 32, 50, 48, 50, 54]); // "FIBEMATE 2026"

console.log('=== deterministic signature parity with @noble/post-quantum ===\n');

for (const [label, ours, noble, skBytes] of cases) {
  console.log(`${label}`);

  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 3) & 0xff;

  const a = ours.keygen(seed);
  const b = noble.keygen(seed);
  assert(eq(a.publicKey, b.publicKey), `${label}: seeded keygen pk byte-identical`);
  assert(a.secretKey.length === skBytes, `${label}: secretKey is ${skBytes} bytes`);

  // Deterministic: rnd = 0^32
  const sigOurs = ours.sign(msg, a.secretKey, { extraEntropy: false });
  const sigNoble = noble.sign(msg, b.secretKey, { extraEntropy: false });
  assert(eq(sigOurs, sigNoble), `${label}: deterministic signature byte-identical to noble`);
  assert(ours.verify(sigNoble, msg, b.publicKey) === true, `${label}: noble signature verifies here`);
  assert(noble.verify(sigOurs, msg, a.publicKey) === true, `${label}: our signature verifies in noble`);

  // Same input twice must produce the same bytes (determinism, no hidden RNG).
  assert(eq(sigOurs, ours.sign(msg, a.secretKey, { extraEntropy: false })),
    `${label}: signature is reproducible`);

  // Hedged signing must differ from deterministic but still verify, and must match
  // noble when both are given the same explicit rnd.
  const hedged = ours.sign(msg, a.secretKey, { extraEntropy: true });
  assert(!eq(hedged, sigOurs), `${label}: hedged signature differs from deterministic`);
  assert(ours.verify(hedged, msg, a.publicKey) === true, `${label}: hedged signature verifies`);

  const rnd = new Uint8Array(32);
  for (let i = 0; i < 32; i++) rnd[i] = (i * 11 + 5) & 0xff;
  const sigRnd = ours.sign(msg, a.secretKey, { extraEntropy: rnd });
  const sigRndNoble = noble.sign(msg, b.secretKey, { extraEntropy: rnd });
  assert(eq(sigRnd, sigRndNoble), `${label}: caller-supplied rnd signature byte-identical to noble`);

  // Context must reach the hash for real (not just be accepted).
  const ctx = new Uint8Array([0x41, 0x42, 0x43]);
  const sigCtx = ours.sign(msg, a.secretKey, { context: ctx, extraEntropy: false });
  const sigCtxNoble = noble.sign(msg, b.secretKey, { context: ctx, extraEntropy: false });
  assert(eq(sigCtx, sigCtxNoble), `${label}: context signature byte-identical to noble`);
  assert(ours.verify(sigCtx, msg, a.publicKey) === false,
    `${label}: context signature rejected without context`);

  console.log('');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
