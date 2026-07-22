// SPDX-License-Identifier: GPL-3.0-only
// P0-03a: modInv benchmark — Fermat vs extEuclid
'use strict';

// Simulate extEuclidInv (the old, removed version) for comparison
function extEuclidInv(a, m) {
  let t = 0n, nt = 1n, r = m, nr = a % m;
  while (nr !== 0n) {
    const q = r / nr;
    [t, nt] = [nt, t - q * nt];
    [r, nr] = [nr, r - q * nr];
  }
  return t < 0n ? t + m : t;
}

// Fermat modInv (new version)
function modInv(a, m) {
  let base = a % m;
  if (base < 0n) base = base + m;
  let exp = m - 2n;
  let result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    base = (base * base) % m;
    exp >>= 1n;
  }
  return result;
}

const SM2_N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123n;
const ITER = 100;

// Generate random test values in [1, SM2_N-1]
function randInN() {
  const buf = require('crypto').randomBytes(32);
  let v = BigInt('0x' + buf.toString('hex')) % SM2_N;
  if (v === 0n) v = 1n;
  return v;
}

const values = [];
for (let i = 0; i < ITER; i++) values.push(randInN());

// Warm-up
modInv(values[0], SM2_N);
extEuclidInv(values[0], SM2_N);

// Bench Fermat
const t0 = process.hrtime.bigint();
for (const v of values) modInv(v, SM2_N);
const fermatNs = Number(process.hrtime.bigint() - t0);

// Bench extEuclid
const t1 = process.hrtime.bigint();
for (const v of values) extEuclidInv(v, SM2_N);
const euclidNs = Number(process.hrtime.bigint() - t1);

// Verify correctness
let correct = true;
for (const v of values) {
  const fm = modInv(v, SM2_N);
  const em = extEuclidInv(v, SM2_N);
  if (fm !== em) { correct = false; break; }
}

const fermatUs = (fermatNs / ITER / 1000).toFixed(1);
const euclidUs = (euclidNs / ITER / 1000).toFixed(1);
const ratio = (fermatNs / euclidNs).toFixed(1);

console.log('=== modInv Benchmark (SM2_N, 256-bit) ===');
console.log('');
console.log('Iterations: ' + ITER);
console.log('');
console.log('extEuclidInv (old, variable-time):');
console.log('  Total: ' + (euclidNs / 1e6).toFixed(1) + ' ms');
console.log('  Per call: ' + euclidUs + ' us');
console.log('');
console.log('modInv (Fermat, constant-time):');
console.log('  Total: ' + (fermatNs / 1e6).toFixed(1) + ' ms');
console.log('  Per call: ' + fermatUs + ' us');
console.log('');
console.log('Slowdown: ' + ratio + 'x');
console.log('Correct: ' + (correct ? 'YES' : 'NO'));
console.log('');
console.log('=== Impact assessment ===');
const extraUs = (Number(fermatUs) - Number(euclidUs)).toFixed(1);
if (Number(fermatUs) < 1000) {
  console.log('Per signature: +' + extraUs + ' us (negligible for interactive use)');
} else if (Number(fermatUs) < 10000) {
  console.log('Per signature: +' + extraUs + ' us (acceptable, <10ms overhead)');
} else {
  console.log('Per signature: +' + extraUs + ' us (NOTICEABLE — consider caching da1Inv)');
}
