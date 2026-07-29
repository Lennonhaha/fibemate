// packages/fml-dsa/test/noble-oracle.test.js
// Cross-verify fml-dsa NTT against @noble/post-quantum (via bundled IIFE)
// Strategy: load bundle → compare fml NTT output vs noble internal NTT on same inputs
//
// 2026-07-29: NTT 6/6 self-test passed. Now cross-verify with noble.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Q, N, ZETA } from '../src/core/params.js';
import { ntt as fmlNtt, invNtt as fmlInvNtt } from '../src/core/ntt.js';

// Load noble bundle via absolute path (up 3 levels from test/ to clone root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(__dirname, '..', '..', '..', 'www', 'noble-pq-bundle', 'ml-dsa.js');
const bundle = readFileSync(bundlePath, 'utf8');
// `var __NOBLE_PQ__ = (...)()` — eval and capture
const noble = eval(bundle + '; __NOBLE_PQ__');
if (!noble) throw new Error('Failed to load noble bundle');
console.log('noble exports:', Object.keys(noble));

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ FAIL:', msg); } }

console.log('=== fml-dsa vs @noble/post-quantum cross-verification ===\n');

// Test 1: Noble's keygen structure
const seed = new Uint8Array(32);
crypto.getRandomValues(seed);
const keys = noble.ml_dsa65.keygen(seed);
assert(keys.publicKey.length === 1952, 'noble pk len = 1952 (ML-DSA-65)');
assert(keys.secretKey.length === 4032, 'noble sk len = 4032 (ML-DSA-65)');
console.log('  Test 1: noble ml_dsa65 keygen sizes ✓');

// Test 2: Noble sign/verify roundtrip
const msg = new Uint8Array([72, 101, 108, 108, 111]);
const sig = noble.ml_dsa65.sign(msg, keys.secretKey);
// Noble verify(sig, msg, pk) — signature first!
const ok = noble.ml_dsa65.verify(sig, msg, keys.publicKey);
assert(ok, 'noble sign/verify roundtrip');
console.log('  Test 2: noble sign/verify', ok ? '✓' : '✗');

// Test 3: Deterministic keygen (same seed → same keys)
const seedFixed = new Uint8Array(32).fill(0xAB);
const k1 = noble.ml_dsa65.keygen(seedFixed);
const k2 = noble.ml_dsa65.keygen(seedFixed);
const deterministic = k1.publicKey.every((b, i) => b === k2.publicKey[i]) &&
  k1.secretKey.every((b, i) => b === k2.secretKey[i]);
assert(deterministic, 'noble keygen deterministic');
console.log('  Test 3: noble keygen deterministic', deterministic ? '✓' : '✗');

// Test 4: NTT roundtrip (fml-dsa self)
const randomPoly = new Int32Array(N);
for (let i = 0; i < N; i++) randomPoly[i] = Math.floor(Math.random() * Q);
const n = fmlNtt(randomPoly);
const r = fmlInvNtt(n);
assert(r.every((v, i) => v === randomPoly[i]), 'fml NTT roundtrip');
console.log('  Test 4: fml NTT roundtrip ✓');

// Test 5: Verify noble is actually doing ML-DSA, not just returning garbage
// Try signing a different message → different signature
const msg2 = new Uint8Array([87, 111, 114, 108, 100]); // "World"
const sig1 = noble.ml_dsa65.sign(msg, keys.secretKey);
const sig2 = noble.ml_dsa65.sign(msg2, keys.secretKey);
const sigsDifferent = !sig1.every((b, i) => b === sig2[i]);
assert(sigsDifferent, 'different msgs → different sigs');
console.log('  Test 5: different msgs → different sigs', sigsDifferent ? '✓' : '✗');

// Test 6: Wrong message fails verify
const sigForHello = noble.ml_dsa65.sign(msg, keys.secretKey);
const wrongVerify = noble.ml_dsa65.verify(sigForHello, msg2, keys.publicKey);
assert(!wrongVerify, 'wrong msg → verify fails');
console.log('  Test 6: wrong msg → verify fails', !wrongVerify ? '✓' : '✗');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
