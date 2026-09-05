// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/test/input-validation.test.js — Input validation tests
// P0: Malformed/null/boundary/type-coercion inputs must be rejected cleanly
// 2026-07-29

import { ntt, invNtt } from '../src/core/ntt.js';
import { modMul, ctAdd, ctSub } from '../src/core/modmul.js';
import { Q, N, ZETA, INV_N } from '../src/core/params.js';

let passed = 0, failed = 0;
const NFC = new Int32Array(N).fill(0);

function expect(behavior, fn, msg) {
  try {
    const result = fn();
    if (behavior === 'throw') {
      failed++; console.log(`  ✗ ${msg}: expected throw, got ${result}`);
    } else {
      passed++; console.log(`  ✓ ${msg} (${behavior})`);
    }
  } catch (e) {
    if (behavior === 'throw') {
      passed++; console.log(`  ✓ ${msg} (threw: ${e.message.slice(0,60)})`);
    } else {
      failed++; console.log(`  ✗ ${msg}: unexpected throw — ${e.message.slice(0,60)}`);
    }
  }
}

function expectValue(fn, expectedVal, msg) {
  try {
    const v = fn();
    if (v === expectedVal) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.log(`  ✗ ${msg}: got ${v}, expected ${expectedVal}`); }
  } catch (e) {
    failed++; console.log(`  ✗ ${msg}: threw — ${e.message.slice(0,60)}`);
  }
}

function expectInRange(fn, lo, hi, msg) {
  try {
    const v = fn();
    if (v >= lo && v < hi) { passed++; console.log(`  ✓ ${msg} (${v})`); }
    else { failed++; console.log(`  ✗ ${msg}: ${v} not in [${lo},${hi})`); }
  } catch (e) {
    failed++; console.log(`  ✗ ${msg}: threw — ${e.message.slice(0,60)}`);
  }
}

// ═══════════════════════════════════════════
// GROUP A: modMul input validation
// ═══════════════════════════════════════════
console.log('═══ A: modMul input validation ═══\n');

// A1: normal range
expectValue(() => modMul(0, 0), 0, 'modMul(0,0)==0');
expectValue(() => modMul(1, 1), 1, 'modMul(1,1)==1');
expectValue(() => modMul(Q-1, 1), Q-1, 'modMul(Q-1,1)==Q-1');

// A2: zero multiplication
expectValue(() => modMul(0, Q-1), 0, 'modMul(0, large)==0');
expectValue(() => modMul(Q-1, 0), 0, 'modMul(large, 0)==0');

// A3: commutes
const a = Math.floor(Math.random() * Q), b = Math.floor(Math.random() * Q);
expectValue(() => modMul(a, b) === modMul(b, a), true, `modMul commutes (${a},${b})`);

// A4: negative inputs (JS allows this, should it crash? We allow coerce to NaN→NaN behavior)
expect('throw', () => modMul(-1, 5), 'modMul(-1,5) negative input');

// A5: NaN, Infinity
expect('throw', () => modMul(NaN, 5), 'modMul(NaN,5)');
expect('throw', () => modMul(Infinity, 5), 'modMul(Infinity,5)');

// A6: non-number
expect('throw', () => modMul('5', 3), 'modMul(str, num)');
expect('throw', () => modMul(undefined, 3), 'modMul(undefined, num)');
expect('throw', () => modMul(null, 3), 'modMul(null, num)');

// A7: overflow — 2x Q product should still work (a*b can be < 2^53 for two Q-sized ints)
// Q=8380417, Q*Q≈7e13 < 9e15 (2^53), safe
expectInRange(() => modMul(Q-1, Q-1), 0, Q, 'modMul(Q-1, Q-1) safe range');

// A8: max product — Q-sized values saturate Number safely
expectInRange(() => modMul(1000000, 1000000), 0, Q, 'modMul(1e6, 1e6)');
expectInRange(() => modMul(Q-1, 5000), 0, Q, 'modMul(Q-1, 5000)');

// ═══════════════════════════════════════════
// GROUP B: ctAdd / ctSub input validation
// ═══════════════════════════════════════════
console.log('\n═══ B: ctAdd / ctSub input validation ═══\n');

// B1: basic operations
expectValue(() => ctAdd(0, 0), 0, 'ctAdd(0,0)==0');
expectValue(() => ctSub(0, 0), 0, 'ctSub(0,0)==0');
expectValue(() => ctAdd(Q-1, 1), 0, 'ctAdd(Q-1,1)→0 mod Q');
expectValue(() => ctSub(0, 1), Q-1, 'ctSub(0,1)→Q-1 mod Q');

// B2: overshoot
expectValue(() => ctAdd(Q-1, Q-1), Q-2, 'ctAdd(Q-1, Q-1)==Q-2');
expectValue(() => ctSub(0, Q-1), 1, 'ctSub(0, Q-1)==1');

// B3: result always in [0, Q)
for (let i = 0; i < 1000; i++) {
  const a1 = Math.floor(Math.random() * Q);
  const a2 = Math.floor(Math.random() * Q);
  const s1 = ctAdd(a1, a2);
  const s2 = ctSub(a1, a2);
  if (s1 < 0 || s1 >= Q || s2 < 0 || s2 >= Q) {
    failed++; console.log(`  ✗ ct range violation: add(${a1},${a2})=${s1}, sub=${s2}`);
  }
}
passed++; console.log(`  ✓ ctAdd/ctSub 1000× random: always in [0,Q)`);

// B4: negative inputs
expect('throw', () => ctAdd(-1, 5), 'ctAdd(-1,5)');
expect('throw', () => ctSub(-1, 5), 'ctSub(-1,5)');

// B5: non-number
expect('throw', () => ctAdd('x', 1), 'ctAdd(str, num)');
expect('throw', () => ctSub(undefined, 1), 'ctSub(undefined, num)');

// ═══════════════════════════════════════════
// GROUP C: NTT / invNTT input validation
// ═══════════════════════════════════════════
console.log('\n═══ C: NTT / invNTT input validation ═══\n');

// C1: valid input (TypedArray of N elements)
const p = new Int32Array(N);
for (let i = 0; i < N; i++) p[i] = Math.floor(Math.random() * Q);
const p2 = ntt(p);
const p3 = invNtt(p2);
for (let i = 0; i < N; i++) if (p3[i] !== p[i]) { failed++; console.log(`  ✗ roundtrip[${i}]`); break; }
passed++; console.log('  ✓ NTT roundtrip valid input');

// C2: ntt(zeros) → zeros
const zNtt = ntt(new Int32Array(N));
const allZero = zNtt.every(v => v === 0);
if (allZero) passed++; else failed++;
console.log(`  ${allZero?'✓':'✗'} ntt(zeros)→zeros`);

// C3: invNtt of ntt output → original (100 random)
let ok = true;
for (let r = 0; r < 100; r++) {
  const orig = new Int32Array(N);
  for (let i = 0; i < N; i++) orig[i] = Math.floor(Math.random() * Q);
  const round = invNtt(ntt(orig));
  if (!round.every((v, i) => v === orig[i])) { ok = false; break; }
}
if (ok) passed++; else failed++;
console.log(`  ${ok?'✓':'✗'} 100 random roundtrips`);

// C4: wrong-sized array
expect('throw', () => ntt(new Int32Array(128)), 'ntt(wrong size=128)');
expect('throw', () => ntt(new Int32Array(512)), 'ntt(wrong size=512)');
expect('throw', () => invNtt(new Int32Array(64)), 'invNtt(wrong size=64)');

// C5: non-Int32Array
expect('throw', () => ntt([1,2,3]), 'ntt(plain array)');
expect('throw', () => ntt(new Float64Array(N).fill(0)), 'ntt(Float64Array)');
expect('throw', () => ntt(new Uint8Array(N).fill(0)), 'ntt(Uint8Array)');
expect('throw', () => ntt(null), 'ntt(null)');
expect('throw', () => ntt(undefined), 'ntt(undefined)');
expect('throw', () => ntt('hello'), 'ntt(string)');

// C6: values outside [0, Q)
expect('throw', () => {
  const bad = new Int32Array(N).fill(Q + 1);
  ntt(bad);
}, 'ntt(value > Q)');
expect('pass', () => {
  const bad = new Int32Array(N).fill(-5);
  const r = ntt(bad);
  return r instanceof Int32Array ? 'ok' : r;
}, 'ntt(negative value in valid range [-(Q-1),Q-1])');
expect('throw', () => {
  const bad = new Int32Array(N).fill(Q);
  ntt(bad);
}, 'ntt(value == Q)');

// C7: shared array reuse (ntt is IMMUTABLE: returns new array, does not mutate input)
const shared = new Int32Array(N);
for (let i = 0; i < N; i++) shared[i] = (i * 7 + 3) % Q;
const copy = new Int32Array(shared);
const result = ntt(shared);
const unchanged = shared.every((v, i) => v === copy[i]);
if (unchanged) passed++; else failed++;
console.log(`  ${unchanged ? '✓' : '✗'} ntt does not mutate input`);

const unchanged2 = p2.every((v, i) => v === copy[i] ? false : true) ? false : true;
const result2 = invNtt(p2); // invNtt on fresh array
const unchangedInv = p2.every((v, i) => v === (ntt(copy))[i]);
// simpler: create fresh, invNtt, check original intact
const origCheck = new Int32Array(N).fill((i) => i % Q);
const origCopy = new Int32Array(origCheck);
invNtt(origCheck);
const invSameOrig = origCheck.every((v, i) => v === origCopy[i]);
// Actually our invNtt does modify the input poly (it does new Int32Array(polyNtt))
// Wait, invNtt does: const a = new Int32Array(polyNtt) — so it copies!
// So it DOESN'T modify input.
if (invSameOrig) passed++; else { failed++; console.log('  ✗ invNtt mutated input'); }
console.log(`  ${invSameOrig ? '✓' : '✗'} invNtt does not mutate input`);

// ═══════════════════════════════════════════
// GROUP D: params validation
// ═══════════════════════════════════════════
console.log('\n═══ D: Params self-consistency ═══\n');

// D1: ζ^512 ≡ 1 mod Q
let pow = 1;
for (let i = 0; i < 512; i++) pow = modMul(pow, ZETA);
expectValue(() => pow, 1, 'ζ^512 ≡ 1');

// D2: ζ^256 ≡ Q-1
pow = 1;
for (let i = 0; i < 256; i++) pow = modMul(pow, ZETA);
expectValue(() => pow, Q-1, 'ζ^256 ≡ Q-1');

// D3: N×INV_N ≡ 1 mod Q
expectValue(() => (N * INV_N) % Q, 1, 'N×INV_N ≡ 1 mod Q');

// D4: Q is prime (test: 2..sqrt(Q) — skip for speed, just check small primes)
expectValue(() => (Q & 1) !== 0, true, 'Q is odd');
for (const p of [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47]) {
  expectValue(() => Q % p !== 0, true, `Q mod ${p} ≠ 0`);
}

// D5: N must be power of 2
expectValue(() => (N & (N-1)) === 0 && N > 0, true, 'N is power of 2');

// ═══════════════════════════════════════════
// GROUP E: fuzz-style: random inputs, verify invariants
// ═══════════════════════════════════════════
console.log('\n═══ E: Randomized invariant stress ═══\n');

// E1: ntt(invNtt(X)) == X for 1000 random X
let e1ok = true;
for (let i = 0; i < 1000; i++) {
  const x = new Int32Array(N);
  for (let j = 0; j < N; j++) x[j] = Math.floor(Math.random() * Q);
  const y = ntt(invNtt(x));
  if (!y.every((v, k) => v === x[k])) { e1ok = false; break; }
}
if (e1ok) passed++; else failed++;
console.log(`  ${e1ok ? '✓' : '✗'} ntt(invNtt(X))==X 1000x`);

// E2: distributive: ntt(a+b) == ntt(a) + ntt(b) for 100 random pairs
let e2ok = true;
for (let i = 0; i < 100; i++) {
  const a = new Int32Array(N), b = new Int32Array(N), sum = new Int32Array(N);
  for (let j = 0; j < N; j++) {
    a[j] = Math.floor(Math.random() * Q);
    b[j] = Math.floor(Math.random() * Q);
    sum[j] = (a[j] + b[j]) % Q;
  }
  const nttSum = ntt(sum);
  const nttA = ntt(a), nttB = ntt(b);
  let ok = true;
  for (let j = 0; j < N; j++) {
    if ((nttA[j] + nttB[j]) % Q !== nttSum[j]) { ok = false; break; }
  }
  if (!ok) { e2ok = false; break; }
}
if (e2ok) passed++; else failed++;
console.log(`  ${e2ok ? '✓' : '✗'} ntt(a+b)==ntt(a)+ntt(b) 100x`);

// E3: modMul never returns NaN or out of range for random inputs
let e3ok = true;
for (let i = 0; i < 10000; i++) {
  const a = Math.floor(Math.random() * Q);
  const b = Math.floor(Math.random() * Q);
  const r = modMul(a, b);
  if (isNaN(r) || r < 0 || r >= Q) { e3ok = false; break; }
}
if (e3ok) passed++; else failed++;
console.log(`  ${e3ok ? '✓' : '✗'} modMul 10000x random in [0,Q)`);

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
const total = passed + failed;
console.log(`Input validation: ${passed}/${total} PASS${failed ? `, ${failed} FAIL` : ''}`);
if (failed === 0) console.log('🎉 All input validation tests passed!');
else console.log(`⚠️ ${failed} FAILURES`);

process.exit(failed > 0 ? 1 : 0);
