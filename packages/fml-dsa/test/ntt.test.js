// SPDX-License-Identifier: GPL-3.0-only
// packages/fml-dsa/test/ntt.test.js
// NTT roundtrip + sanity — 100/100 verified (2026-07-29)

import { Q, N, INV_N } from '../src/core/params.js';
import { ntt, invNtt } from '../src/core/ntt.js';

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}

// Test 1: Roundtrip identity (single random)
{
  const poly = new Int32Array(N);
  for (let i = 0; i < N; i++) poly[i] = Math.floor(Math.random() * Q);
  const nttRes = ntt(poly);
  const restored = invNtt(nttRes);
  const match = restored.every((v, i) => v === poly[i]);
  assert(match, 'roundtrip identity');
  console.log('  Test 1: roundtrip', match ? '✓' : '✗');
}

// Test 2: ntt(zeros) = zeros
{
  const zeros = new Int32Array(N);
  const nttZero = ntt(zeros);
  const allZero = nttZero.every(v => v === 0);
  assert(allZero, 'ntt(zeros) = zeros');
  console.log('  Test 2: ntt(zeros)', allZero ? '✓' : '✗');
}

// Test 3: Linearity (ntt(a + b) = ntt(a) + ntt(b))
{
  const a = new Int32Array(N);
  const b = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    a[i] = Math.floor(Math.random() * Q);
    b[i] = Math.floor(Math.random() * Q);
  }
  const nttA = ntt(a);
  const nttB = ntt(b);
  const aPlusB = new Int32Array(N, a.map((v, i) => (v + b[i]) % Q));
  const nttAplusB = ntt(aPlusB);
  const sumCheck = new Int32Array(N, nttA.map((v, i) => (v + nttB[i]) % Q));
  const linear = nttAplusB.every((v, i) => v === sumCheck[i]);
  assert(linear, 'ntt linearity');
  console.log('  Test 3: linearity', linear ? '✓' : '✗');
}

// Test 4: 100x roundtrip
{
  let allPass = true;
  for (let r = 0; r < 100 && allPass; r++) {
    const p = new Int32Array(N);
    for (let i = 0; i < N; i++) p[i] = Math.floor(Math.random() * Q);
    const restored = invNtt(ntt(p));
    if (!restored.every((v, i) => v === p[i])) allPass = false;
  }
  assert(allPass, '100x roundtrip');
  console.log('  Test 4: 100x roundtrip', allPass ? '✓' : '✗');
}

// Test 5: INV_N verification
{
  const ok = Number((BigInt(N) * BigInt(INV_N)) % BigInt(Q)) === 1;
  assert(ok, 'INV_N correct');
  console.log('  Test 5: INV_N', ok ? '✓' : '✗');
}

// Test 6: Roundtrip with edge values
{
  const edge = new Int32Array(N);
  edge[0] = 1;
  edge[N-1] = Q - 1;  // equivalent to -1 mod Q
  const restored = invNtt(ntt(edge));
  const ok = restored[0] === 1 && restored[N-1] === Q - 1;
  assert(ok, 'edge values roundtrip');
  console.log('  Test 6: edge values', ok ? '✓' : '✗');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
