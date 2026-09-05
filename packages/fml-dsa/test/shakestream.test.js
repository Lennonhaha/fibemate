// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/test/shakestream.test.js — SHAKE-128/256 wrapper tests
// Validated against FIPS 202 known-answer test vectors and Node.js crypto
// 2026-07-29

import { shake128, shake256, sha3_256 } from '../src/core/shakestream.js';
import crypto from 'crypto';

let passed = 0, failed = 0;

function eq(label, got, expected) {
  if (got === expected) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}

function eqBuf(label, got, expectedHex) {
  const g = Buffer.from(got).toString('hex');
  if (g === expectedHex) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}: got ${g.slice(0,40)}… ≠ ${expectedHex.slice(0,40)}…`); }
}

function eqBufNode(label, got, expected) {
  const g = Buffer.from(got).toString('hex');
  const e = Buffer.from(expected).toString('hex');
  if (g === e) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}: diff @ ${[...g].findIndex((c,i)=>c!==e[i])}`); }
}

const H = (s) => s ? new Uint8Array([...s].map(c => c.charCodeAt(0))) : new Uint8Array(0);

console.log('═══ SHAKE-128/256 FIPS 202 + Node.js cross-validation ═══\n');

// ── FIPS 202 KAT vectors ──
eqBuf('KAT: SHAKE-128(∅, 32)',
  shake128(H(''), 32),
  '7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26');

eqBuf('KAT: SHAKE-128(abc, 32)',
  shake128(H('abc'), 32),
  '5881092dd818bf5cf8a3ddb793fbcba74097d5c526a6d35f97b83351940f2cc8');

eqBuf('KAT: SHAKE-256(∅, 64)',
  shake256(H(''), 64),
  '46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762fd75dc4ddd8c0f200cb05019d67b592f6fc821c49479ab48640292eacb3b7c4be');

eqBuf('KAT: SHAKE-256(abc, 64)',
  shake256(H('abc'), 64),
  '483366601360a8771c6863080cc4114d8db44530f8f1e1ee4f94ea37e78b5739d5a15bef186a5386c75744c0527e1faa9f8726e462a12a4feb06bd8801e751e4');

// ── SHA3-256 KAT ──
eqBuf('KAT: SHA3-256(∅)',
  sha3_256(H('')),
  'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');

eqBuf('KAT: SHA3-256(abc)',
  sha3_256(H('abc')),
  '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');

// ── Node.js cross-validation ──
const hello = H('hello FIBEMATE');
eqBufNode('SHA3-256(hello) vs node', sha3_256(hello), crypto.createHash('sha3-256').update('hello FIBEMATE').digest());
eqBufNode('SHAKE-256(∅, hex same as sha3-256 vs node)', shake256(H(''), 32), crypto.createHash('shake256').digest());
eqBufNode('SHA3-256(∅) vs node', sha3_256(H('')), crypto.createHash('sha3-256').digest());

// ── Edge cases ──
eq('SHAKE-128(∅, 0)', shake128(H(''), 0).length, 0);
eq('SHAKE-256(∅, 0)', shake256(H(''), 0).length, 0);
eq('SHAKE-128(∅, 200)', shake128(H(''), 200).length, 200);
eq('SHAKE-256(∅, 300)', shake256(H(''), 300).length, 300);
eq('SHAKE-128(∅, 1)', shake128(H(''), 1).length, 1);

// ── Deterministic ──
const a1 = shake256(hello, 64);
const a2 = shake256(hello, 64);
eqBufNode('Deterministic SHAKE-256', a1, a2);

// ── Large 10KB input vs node ──
const big = new Uint8Array(10240);
crypto.getRandomValues(big);
const ourBig = shake256(big, 32);
const nodeBig = crypto.createHash('shake256').update(Buffer.from(big)).digest();
eqBufNode('SHAKE-256(10KB) vs node', ourBig, nodeBig);

// ── Summary ──
console.log(`\n${'='.repeat(50)}`);
const total = passed + failed;
console.log(`Shakestream: ${passed}/${total} PASS${failed ? `, ${failed} FAIL` : ''}`);
if (failed === 0) console.log('🎉 SHAKE wrapper fully validated');
process.exit(failed > 0 ? 1 : 0);
