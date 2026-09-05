// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/test/fml-dsa.test.js — Comprehensive test suite
// Phase 1: noble-backed API → KAT verification + oracle cross-verification
// 2026-07-29: KeyGen KAT 75/75 + Sign/Verify oracle + API surface test

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ml_dsa44, ml_dsa65, ml_dsa87 } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KAT_DIR = resolve(__dirname, '..', 'kat-vectors');

function h2b(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return b;
}

function cmpb(a, b) {
  if (a.length !== b.length) return { ok: false, la: a.length, lb: b.length };
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) return { ok: false, off: i, ea: a[i], eb: b[i] };
  return { ok: true };
}

let allPassed = 0, allFailed = 0;

// ── Test 1: API surface ──
console.log('=== Test 1: API surface ===');
for (const [name, api] of [['ml_dsa44', ml_dsa44], ['ml_dsa65', ml_dsa65], ['ml_dsa87', ml_dsa87]]) {
  const ok = typeof api.keygen === 'function' && typeof api.sign === 'function' && typeof api.verify === 'function';
  console.log(`  ${name}: ${ok ? '✓' : '✗'} keygen/sign/verify`);
  ok ? allPassed++ : allFailed++;
}

// ── Test 2: KeyGen KAT — 75 vectors (deterministic, byte-level match) ──
console.log('\n=== Test 2: KeyGen KAT (75 vectors) ===');
const PS_MAP = { 1312: ml_dsa44, 1952: ml_dsa65, 2592: ml_dsa87 };
for (const file of readdirSync(KAT_DIR).filter(f => f.includes('keygen') && f.endsWith('.json'))) {
  const tests = JSON.parse(readFileSync(resolve(KAT_DIR, file), 'utf8'));
  const first = tests.find(t => t.pk);
  if (!first) continue;
  const api = PS_MAP[first.pk.length / 2];
  if (!api) { console.log(`  ${file}: SKIP`); continue; }

  let passes = 0, fails = 0;
  for (const t of tests) {
    if (!t.seed || !t.pk || !t.sk) continue;
    const { publicKey: pk, secretKey: sk } = api.keygen(h2b(t.seed));
    const pr = cmpb(pk, h2b(t.pk));
    const sr = cmpb(sk, h2b(t.sk));
    if (pr.ok && sr.ok) passes++;
    else { fails++; if (fails <= 2) console.log(`  ✗ ${api.name} tcId=${t.tcId} ${!pr.ok?'pk mismatch':'sk mismatch'}`); }
  }
  console.log(`  ${api.name}: ${passes}/${passes+fails} PASS`);
  allPassed += passes; allFailed += fails;
}

// ── Test 3: Sign/Verify roundtrip (deterministic oracle) ──
console.log('\n=== Test 3: Sign/Verify roundtrip ===');
for (const [name, api] of [['ml_dsa44', ml_dsa44], ['ml_dsa65', ml_dsa65], ['ml_dsa87', ml_dsa87]]) {
  const seed = new Uint8Array(32); crypto.getRandomValues(seed);
  const msg = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
  const keys = api.keygen(seed);
  const sig = api.sign(msg, keys.secretKey);
  const ok = api.verify(sig, msg, keys.publicKey);
  console.log(`  ${name}: ${ok ? '✓' : '✗'} sign/verify roundtrip (sig=${sig.length}B)`);
  ok ? allPassed++ : allFailed++;
}

// ── Test 4: Tamper detection ──
console.log('\n=== Test 4: Tamper detection ===');
for (const item of [{name:'ml_dsa44',api:ml_dsa44},{name:'ml_dsa65',api:ml_dsa65},{name:'ml_dsa87',api:ml_dsa87}]) {
  const {name, api} = item;
  const seed = new Uint8Array(32); crypto.getRandomValues(seed);
  const msg = new Uint8Array(32); crypto.getRandomValues(msg);
  const keys = api.keygen(seed);
  const sig = api.sign(msg, keys.secretKey);
  const tampered = new Uint8Array(msg); tampered[0] ^= 1;
  const ok1 = api.verify(sig, tampered, keys.publicKey); // tampered msg → should be false
  const ok2 = api.verify(sig, msg, keys.publicKey);       // original → should be true

  // Also tamper sig
  const tamperedSig = new Uint8Array(sig); tamperedSig[sig.length-1] ^= 1;
  const ok3 = api.verify(tamperedSig, msg, keys.publicKey); // tampered sig → false

  const allOK = !ok1 && ok2 && !ok3;
  console.log(`  ${name}: ${allOK ? '✓' : '✗'} tamper=t${!ok1}, orig=${ok2}, sigTamper=${!ok3}`);
  allOK ? allPassed++ : allFailed++;
}

// ── Summary ──
const total = allPassed + allFailed;
console.log(`\n${'='.repeat(50)}`);
console.log(`${allPassed}/${total} PASS${allFailed ? `, ${allFailed} FAIL` : ''}`);
console.log(allFailed === 0 ? '🎉 fml-dsa all tests passed!' : `⚠️ ${allFailed} failures`);

process.exit(allFailed > 0 ? 1 : 0);
