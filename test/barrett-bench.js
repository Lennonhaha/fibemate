// SPDX-License-Identifier: GPL-3.0-only
const Q = 3329;
const MU = 315;  // floor(2^20 / Q) = floor(1048576/3329) = 315
const K = 20;

// Barrett reduction: r = a*b mod Q
// prod = a*b < Q*Q = 11,082,241 < 2^24 (exact in f64)
function modMulBarrett(a, b) {
  const prod = a * b;
  const q = ((prod * MU) >>> K) | 0;
  let r = prod - q * Q;
  if (r >= Q) r -= Q;
  return r;
}

// 1. Correctness
let err = 0;
for (let a = 0; a <= Q - 1; a++) {
  for (let b = 0; b <= Q - 1; b++) {
    const expected = Number((BigInt(a) * BigInt(b)) % BigInt(Q));
    const actual = modMulBarrett(a, b);
    if (expected !== actual) { err++; if (err <= 5) console.log('FAIL', a, b, expected, actual); }
  }
}
console.log('errors:', err, '/', Q * Q);

// 2. Performance
const rounds = 100000;
const A = new Int16Array(rounds), B = new Int16Array(rounds);
for (let i = 0; i < rounds; i++) { A[i] = (i * 173) % Q; B[i] = (i * 271) % Q; }

function benchBigInt() {
  for (let i = 0; i < rounds; i++) {
    const na = ((A[i] | 0) % Q + Q) % Q, nb = ((B[i] | 0) % Q + Q) % Q;
    Number((BigInt(na) * BigInt(nb)) % BigInt(Q));
  }
}

function benchBarrett() {
  for (let i = 0; i < rounds; i++) {
    modMulBarrett(A[i], B[i]);
  }
}

// Warm up
benchBigInt(); benchBarrett();

// Measure
const t1 = Date.now(); benchBigInt(); console.log('BigInt:', Date.now() - t1, 'ms');
const t2 = Date.now(); benchBarrett(); console.log('Barrett:', Date.now() - t2, 'ms');
const t3 = Date.now(); benchBigInt(); console.log('BigInt:', Date.now() - t3, 'ms');
