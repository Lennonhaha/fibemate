// SPDX-License-Identifier: GPL-3.0-only
const Q = 3329;
// Barrett: Q = 3329 needs K >= 2*bit_width(Q) = 24
// K=24, MU = floor(2^24 / 3329) = floor(16777216/3329) = 5039
// Verify: 5039*3329 = 16,774,831 < 2^24 = 16,777,216 ✓
const K = 24;
const MU = 5039;  // floor(2^24 / 3329)

function modMulBarrett(a, b) {
  const prod = a * b;  // < 11M, exact in f64
  const q = Math.floor(prod * MU / (1 << K));  // Barrett quotient
  let r = prod - q * Q;
  if (r >= Q) r -= Q;  // q may be 1 too low → r up to 2Q-1
  if (r >= Q) r -= Q;  // double safety
  return r;
}

// 1. Exhaustive correctness test against BigInt
let err = 0;
for (let a = 0; a <= Q - 1; a++) {
  for (let b = 0; b <= Q - 1; b++) {
    const expected = Number((BigInt(a) * BigInt(b)) % BigInt(Q));
    const actual = modMulBarrett(a, b);
    if (expected !== actual) { err++; if (err <= 5) console.log('FAIL', a, b, expected, actual); }
  }
}
console.log('Correctness: ' + err + ' errors / ' + (Q * Q));

// 2. Micro-benchmark (1M ops)
const rounds = 1000000;
const A = new Int16Array(rounds), B = new Int16Array(rounds);
for (let i = 0; i < rounds; i++) { A[i] = ((i * 173) % Q); B[i] = ((i * 271) % Q); }

function benchBigInt() {
  for (let i = 0; i < rounds; i++) {
    const na = ((A[i] | 0) % Q + Q) % Q, nb = ((B[i] | 0) % Q + Q) % Q;
    Number((BigInt(na) * BigInt(nb)) % BigInt(Q));
  }
}

function benchBarrett() {
  for (let i = 0; i < rounds; i++) modMulBarrett(A[i], B[i]);
}

// Warmup
benchBigInt(); benchBarrett();

let t1 = Date.now(); benchBigInt();
let bigintMs = Date.now() - t1;
let t2 = Date.now(); benchBarrett();
let barrettMs = Date.now() - t2;

console.log('BigInt 1M ops: ' + bigintMs + 'ms (' + (1000*rounds/bigintMs/1000|0) + 'K ops/s)');
console.log('Barrett 1M ops: ' + barrettMs + 'ms (' + (1000*rounds/barrettMs/1000|0) + 'K ops/s)');
console.log('Speedup: ' + (bigintMs / barrettMs).toFixed(2) + 'x');
