// SPDX-License-Identifier: GPL-3.0-only
// packages/fml-dsa/test/context-passthrough.test.js
// Regression for issue #242: the public API must forward FIPS 204 options
// ({ context, extraEntropy }) to @noble/post-quantum instead of dropping them.
//
// Covers:
//   1. deterministic signing via { extraEntropy: false } through the public API
//   2. byte parity with a direct noble call
//   3. context domain separation on sign()/verify()
//   4. empty-context roundtrip (unchanged behaviour)
//
// Before the fix, sign(msg, sk, opts) / verify(sig, msg, pk, opts) ignored opts,
// so context-bearing signatures always failed verification and extraEntropy:false
// had no effect.

import { ml_dsa65 } from '../src/index.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); } else { failed++; console.error('  ✗ FAIL:', msg); }
}

const noble = globalThis.__NOBLE_PQ__ && globalThis.__NOBLE_PQ__.ml_dsa65;
if (!noble) throw new Error('noble bundle was not loaded by src/core/native.js');

const hex = (u) => Buffer.from(u).toString('hex');
const msg = new Uint8Array([70, 73, 66, 69, 77, 65, 84, 69]); // "FIBEMATE"
const ctx = new Uint8Array([0x41, 0x42, 0x43]);               // "ABC"

console.log('=== fml-dsa FIPS 204 opts passthrough (issue #242) ===\n');

const { publicKey: pk, secretKey: sk } = ml_dsa65.keygen();
assert(pk.length === 1952, 'ML-DSA-65 public key length = 1952');
assert(sk.length === 4032, 'ML-DSA-65 secret key length = 4032');

// 1. extraEntropy:false -> deterministic signature through the public API
const d1 = ml_dsa65.sign(msg, sk, { extraEntropy: false });
const d2 = ml_dsa65.sign(msg, sk, { extraEntropy: false });
assert(hex(d1) === hex(d2), 'sign(msg, sk, {extraEntropy:false}) is deterministic');
assert(d1.length === 3309, 'ML-DSA-65 signature length = 3309');

// 2. parity with a direct noble call
const dn = noble.sign(msg, sk, { extraEntropy: false });
assert(hex(d1) === hex(dn), 'wrapper signature === direct @noble/post-quantum signature');

// 3. context domain separation
const sigCtx = ml_dsa65.sign(msg, sk, { context: ctx, extraEntropy: false });
assert(ml_dsa65.verify(sigCtx, msg, pk, { context: ctx }) === true,
  'verify(sig, msg, pk, {context}) === true');
assert(ml_dsa65.verify(sigCtx, msg, pk) === false,
  'verify without context fails (context domain separation)');

// 4. empty-context roundtrip still works
const sigNoCtx = ml_dsa65.sign(msg, sk, { extraEntropy: false });
assert(ml_dsa65.verify(sigNoCtx, msg, pk) === true, 'no-context sign/verify roundtrip');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
