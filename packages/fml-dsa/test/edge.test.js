// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/test/edge.test.js — ML-DSA boundary tests (FIPS 204 Phase 2)
// 2026-07-29: P0 edge cases — empty msg, invalid keys, tampered sigs
// Runs against noble oracle; Phase 2 re-runs against fml-dsa native

import { ml_dsa44, ml_dsa65, ml_dsa87 } from '../src/index.js';

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  ✗ FAIL:', msg); } }
function ok(label, cond) { console.log(`  ${cond ? '✓' : '✗'} ${label}`); if (cond) passed++; else failed++; }

const APIs = [ml_dsa44, ml_dsa65, ml_dsa87];

// ── Test group runner ──
function forEachApi(fn) { for (const api of APIs) fn(api, api.name); }

console.log('=== ML-DSA Edge Tests (P0) ===\n');

// ═══ T1: Empty message ═══
console.log('--- T1: Empty message ---');
forEachApi((api, name) => {
  const seed = new Uint8Array(32).fill(0xAB);
  const keys = api.keygen(seed);
  const empty = new Uint8Array(0);
  const sig = api.sign(empty, keys.secretKey);
  assert(sig.length > 0, `${name} empty msg sig len=${sig.length}>0`);
  const v = api.verify(sig, empty, keys.publicKey);
  assert(v, `${name} empty msg verify`);
});

// ═══ T2: Single-byte message ═══
console.log('\n--- T2: Single-byte message ---');
forEachApi((api, name) => {
  const seed = new Uint8Array(32).fill(0xCD);
  const keys = api.keygen(seed);
  for (const b of [0x00, 0x01, 0xFF, 0x80]) {
    const msg = new Uint8Array([b]);
    const sig = api.sign(msg, keys.secretKey);
    const v = api.verify(sig, msg, keys.publicKey);
    assert(v, `${name} msg=[0x${b.toString(16)}] verify`);
  }
});

// ═══ T3: 10KB message ═══
console.log('\n--- T3: 10KB message ---');
forEachApi((api, name) => {
  const seed = new Uint8Array(32).fill(0xEF);
  const msg = new Uint8Array(10240);
  crypto.getRandomValues(msg);
  const keys = api.keygen(seed);
  const sig = api.sign(msg, keys.secretKey);
  assert(sig.length > 0, `${name} sig len=${sig.length}`);
  const v = api.verify(sig, msg, keys.publicKey);
  assert(v, `${name} 10KB verify`);
});

// ═══ T4: Invalid public key ═══
console.log('\n--- T4: Invalid public key ---');
forEachApi((api, name) => {
  const seed = new Uint8Array(32).fill(1);
  const keys = api.keygen(seed);
  const msg = new Uint8Array([0x01, 0x02, 0x03]);
  const sig = api.sign(msg, keys.secretKey);

  // Wrong length
  const short = new Uint8Array(keys.publicKey.length - 1);
  // Wrong content
  const zeros = new Uint8Array(keys.publicKey.length);
  // Random garbage
  const random = new Uint8Array(keys.publicKey.length);
  crypto.getRandomValues(random);

  try { assert(!api.verify(sig, msg, short), `${name} short pk → false`); } catch(e) { passed++; }
  try { assert(!api.verify(sig, msg, zeros), `${name} zero pk → false`); } catch(e) { passed++; }
  try { assert(!api.verify(sig, msg, random), `${name} random pk → false`); } catch(e) { passed++; }
});

// ═══ T5: Invalid secret key ═══
console.log('\n--- T5: Invalid secret key ---');
forEachApi((api, name) => {
  const msg = new Uint8Array([0x01, 0x02, 0x03]);
  const short = new Uint8Array(32); // way too short
  try { api.sign(msg, short); assert(false, `${name} short sk → should throw`); }
  catch(e) { passed++; }
});

// ═══ T6: Tampered signature (single bit flip) ═══
console.log('\n--- T6: Tampered signature (bit flips) ---');
forEachApi((api, name) => {
  const seed = new Uint8Array(32).fill(0x42);
  const msg = new Uint8Array(64);
  crypto.getRandomValues(msg);
  const keys = api.keygen(seed);
  const sig = api.sign(msg, keys.secretKey);

  // Flip bits at 0%, 25%, 50%, 75%, 100% of sig
  for (const frac of [0, 0.25, 0.5, 0.75, 0.99]) {
    const pos = Math.floor(frac * sig.length);
    const tampered = new Uint8Array(sig);
    tampered[pos] ^= 1;
    const v = api.verify(tampered, msg, keys.publicKey);
    assert(!v, `${name} sig tamper@${(frac*100).toFixed(0)}% → false`);
  }
});

// ═══ T7: Wrong key pair mismatch ═══
console.log('\n--- T7: Key pair mismatch ---');
forEachApi((api, name) => {
  const seed1 = new Uint8Array(32).fill(0x11);
  const seed2 = new Uint8Array(32).fill(0x22);
  const keys1 = api.keygen(seed1);
  const keys2 = api.keygen(seed2);
  const msg = new Uint8Array(16);

  // Sign with sk1, verify with pk2 → must fail
  const sig = api.sign(msg, keys1.secretKey);
  try {
    assert(!api.verify(sig, msg, keys2.publicKey), `${name} sk1 + pk2 → false`);
  } catch(e) { passed++; }

  // Sign with sk2, verify with pk1 → must fail
  const sig2 = api.sign(msg, keys2.secretKey);
  try {
    assert(!api.verify(sig2, msg, keys1.publicKey), `${name} sk2 + pk1 → false`);
  } catch(e) { passed++; }
});

// ═══ T8: Deterministic keygen (same seed → same keys) ═══
console.log('\n--- T8: Deterministic keygen ---');
forEachApi((api, name) => {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  const k1 = api.keygen(seed);
  const k2 = api.keygen(seed);
  const pkEq = k1.publicKey.every((b,i) => b === k2.publicKey[i]);
  const skEq = k1.secretKey.every((b,i) => b === k2.secretKey[i]);
  assert(pkEq && skEq, `${name} deterministic keygen`);
});

// ═══ T9: All-zero message (not empty, actual zeros) ═══
console.log('\n--- T9: All-zero message ---');
forEachApi((api, name) => {
  const seed = new Uint8Array(32).fill(0x99);
  const msg = new Uint8Array(32).fill(0);
  const keys = api.keygen(seed);
  const sig = api.sign(msg, keys.secretKey);
  assert(api.verify(sig, msg, keys.publicKey), `${name} all-zeros verify`);
});

// ═══ T10: Nonce variation (different msgs → different sigs) ═══
console.log('\n--- T10: Nonce variation ---');
forEachApi((api, name) => {
  const seed = new Uint8Array(32).fill(0x37);
  const keys = api.keygen(seed);
  const sigs = [];
  for (let i = 0; i < 10; i++) {
    const msg = new Uint8Array([i]);
    sigs.push(api.sign(msg, keys.secretKey));
  }
  // All sigs should be different (hedged nonce or at least different msg)
  const unique = new Set(sigs.map(s => Buffer.from(s).toString('hex'))).size;
  assert(unique === 10, `${name} 10 msgs → ${unique}/10 unique sigs`);
  // Verify all
  for (let i = 0; i < 10; i++) {
    assert(api.verify(sigs[i], new Uint8Array([i]), keys.publicKey), `${name} sig${i} verify`);
  }
});

// ═══ Summary ═══
console.log(`\n${'='.repeat(50)}`);
const total = passed + failed;
console.log(`Edge tests: ${passed}/${total} PASS${failed ? `, ${failed} FAIL` : ''}`);
if (failed === 0) console.log('🎉 All P0 edge tests passed!');
else console.log(`⚠️ ${failed} FAILURES`);

process.exit(failed > 0 ? 1 : 0);
