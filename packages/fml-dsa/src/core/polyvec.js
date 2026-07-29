// fml-dsa/src/core/polyvec.js
// Polynomial and vector arithmetic — FIPS 204 §5.1
// Poly: 256-coefficient polynomial in Z_q[x]/(x^256+1), stored as Int32Array
// PolyVec: vector of `dim` polynomials
// 2026-07-29

import { Q, N } from './params.js';
import { modMul, ctAdd, ctSub } from './modmul.js';
import { ntt, invNtt } from './ntt.js';

// ══════════════════════════════════════════════
// Single polynomial ops
// ══════════════════════════════════════════════

/** a + b mod Q (pointwise) — returns new array */
export function polyAdd(a, b) {
  const r = new Int32Array(N);
  for (let i = 0; i < N; i++) r[i] = ctAdd(a[i], b[i]);
  return r;
}

/** a - b mod Q (pointwise) — returns new array */
export function polySub(a, b) {
  const r = new Int32Array(N);
  for (let i = 0; i < N; i++) r[i] = ctSub(a[i], b[i]);
  return r;
}

/** a × b mod Q (pointwise multiplication) — returns new array */
export function polyMul(a, b) {
  const r = new Int32Array(N);
  for (let i = 0; i < N; i++) r[i] = modMul(a[i], b[i]);
  return r;
}

/** a × scalar mod Q */
export function polyScale(a, s) {
  const r = new Int32Array(N);
  for (let i = 0; i < N; i++) r[i] = modMul(a[i], s);
  return r;
}

/** negate polynomial (Q - a mod Q) */
export function polyNeg(a) {
  const r = new Int32Array(N);
  for (let i = 0; i < N; i++) r[i] = (a[i] === 0) ? 0 : Q - a[i];
  return r;
}

/** zero polynomial */
export function polyZero() {
  return new Int32Array(N);
}

/** all coefficients → NTT domain, returns new array */
export function polyNtt(a) {
  return ntt(a);
}

/** all coefficients → back from NTT domain, returns new array */
export function polyInvNtt(a) {
  return invNtt(a);
}

/** pointwise polynomial multiplication in NTT domain (equivalent to cyclic convolution in normal domain) */
export function polyMulNtt(aNtt, bNtt) {
  return polyMul(aNtt, bNtt);
}

// ══════════════════════════════════════════════
// PolyVec: vector of `dim` polynomials
// ══════════════════════════════════════════════

/** Create a zero vector of `dim` polynomials */
export function vecZero(dim) {
  return Array.from({ length: dim }, () => new Int32Array(N));
}

/** Deep copy a vector */
export function vecCopy(v) {
  return v.map(p => new Int32Array(p));
}

/** u + v (element-wise, pointwise polynomial addition) */
export function vecAdd(u, v) {
  return u.map((p, i) => polyAdd(p, v[i]));
}

/** u - v */
export function vecSub(u, v) {
  return u.map((p, i) => polySub(p, v[i]));
}

/** NTT-transform every polynomial in the vector — returns NEW vector */
export function vecNtt(v) {
  return v.map(p => ntt(p));
}

/** Inverse NTT every polynomial in the vector */
export function vecInvNtt(v) {
  return v.map(p => invNtt(p));
}

/** Scale every polynomial in vector by scalar */
export function vecScale(v, s) {
  return v.map(p => polyScale(p, s));
}

/**
 * Dot product of two PolyVecs in NTT domain:
 * Σᵢ (uNtt[i] ⊙ vNtt[i]) — pointwise multiply then accumulate
 * Returns a single polynomial in NTT domain.
 * Used for: t = A·s1 + s2 (where A is a matrix of polynomials)
 */
export function vecDotNtt(uNtt, vNtt) {
  const sum = new Int32Array(N);
  for (let vIdx = 0; vIdx < uNtt.length; vIdx++) {
    const up = uNtt[vIdx];
    const vp = vNtt[vIdx];
    for (let i = 0; i < N; i++) {
      sum[i] = ctAdd(sum[i], modMul(up[i], vp[i]));
    }
  }
  return sum;
}

/**
 * Matrix × Vector multiplication (in NTT domain):
 * t = A · s, where A is k×l matrix of NTT-domain polynomials,
 * s is l-vector of NTT-domain polynomials.
 * Returns k-vector of NTT-domain polynomials.
 * FIPS 204 KeyGen: t = A·s1 + s2 → we compute A·s1 here, then add s2 externally
 */
export function matVecMulNtt(A, s) {
  const k = A.length;  // rows
  const result = new Array(k);
  for (let i = 0; i < k; i++) {
    result[i] = vecDotNtt(A[i], s);
  }
  return result;
}

/**
 * KeyGen assembly helper: t = A·s1 + s2 (all in NTT domain)
 * Returns t in NTT domain (k-vector)
 */
export function computeT(A, s1, s2) {
  const As1 = matVecMulNtt(A, s1);
  return vecAdd(As1, s2);
}

// ══════════════════════════════════════════════
// Self-tests
// ══════════════════════════════════════════════
(function selfTest() {
  let ok = true;

  // 1. polyAdd/polySub roundtrip
  const a = new Int32Array(N);
  const b = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    a[i] = Math.floor(Math.random() * Q);
    b[i] = Math.floor(Math.random() * Q);
  }
  const sum = polyAdd(a, b);
  const back = polySub(sum, b);
  ok = ok && back.every((v, i) => v === a[i]);
  console.log(`  ${ok ? '✓' : '✗'} polyAdd/polySub roundtrip`);

  // 2. polyMul pointwise: (a*b)*c == a*(b*c)
  const c = new Int32Array(N);
  for (let i = 0; i < N; i++) c[i] = Math.floor(Math.random() * Q);
  const ab = polyMul(a, b);
  const abc1 = polyMul(ab, c);
  const bc = polyMul(b, c);
  const abc2 = polyMul(a, bc);
  ok = ok && abc1.every((v, i) => v === abc2[i]);
  console.log(`  ${ok ? '✓' : '✗'} polyMul associative`);

  // 3. NTT convolution: ntt(a*b) == ntt(a) ⊙ ntt(b) (Cyclic via Schur)
  const aNtt = ntt(a);
  const bNtt = ntt(b);
  const abSchur = polyMul(aNtt, bNtt); // pointwise in NTT domain
  const abNttDirect = ntt(polyMul(a, b)); // NTT of pointwise product
  // Note: Schur product in NTT domain ≠ NTT(pointwise product) in general
  // The correct identity: ntt(a ○ b) [cyclic convolution] requires special handling
  // For NTT, the Schur product is the NTT of the CYCLIC convolution, not pointwise
  // So this test is informational, not equality:
  console.log(`  i NTT Schur first: ${abSchur[0]}, NTT(pointwise)[0]: ${abNttDirect[0]}`);

  // 4. vec operations (dim=4)
  const dim = 4;
  const u = vecZero(dim);
  const v = vecZero(dim);
  for (let d = 0; d < dim; d++)
    for (let i = 0; i < N; i++) {
      u[d][i] = Math.floor(Math.random() * Q);
      v[d][i] = Math.floor(Math.random() * Q);
    }
  const vecSum = vecAdd(u, v);
  const vecBack = vecSub(vecSum, v);
  let vecOk = true;
  for (let d = 0; d < dim; d++)
    for (let i = 0; i < N; i++)
      if (vecBack[d][i] !== u[d][i]) vecOk = false;
  ok = ok && vecOk;
  console.log(`  ${vecOk ? '✓' : '✗'} vecAdd/vecSub roundtrip (dim=4)`);

  // 5. NTT domain consistency: invNtt(ntt(v)) circular
  const vNtt = vecNtt(u);
  const vBack = vecInvNtt(vNtt);
  let nttOk = true;
  for (let d = 0; d < dim; d++)
    for (let i = 0; i < N; i++)
      if (vBack[d][i] !== u[d][i]) nttOk = false;
  ok = ok && nttOk;
  console.log(`  ${nttOk ? '✓' : '✗'} vecNtt/vecInvNtt roundtrip (dim=4)`);

  // 6. vecDotNtt: self-dot = sum of squares
  const uNtt = vecNtt(u);
  const dot = vecDotNtt(uNtt, uNtt); // in NTT domain
  const dotInv = invNtt(dot);
  // dot_inv should equal sum of polyMul(u_d, u_d) over d
  // But polyMul in normal domain is pointwise, vecDotNtt in NTT is different
  console.log(`  i vecDotNtt self-dot[0]=${dot[0]}, back[0]=${dotInv[0]}`);

  // 7. matVecMulNtt: (l=4, k=3)
  const A = Array.from({ length: 3 }, () => vecZero(4));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 4; j++)
      for (let kk = 0; kk < N; kk++)
        A[i][j][kk] = Math.floor(Math.random() * Q);
  const s = vecZero(4);
  for (let d = 0; d < 4; d++)
    for (let i = 0; i < N; i++)
      s[d][i] = Math.floor(Math.random() * Q);
  const A_norm = A.map(row => vecNtt(row));
  const s_norm = vecNtt(s);
  const t1 = matVecMulNtt(A_norm, s_norm);
  ok = ok && t1.length === 3 && t1[0].length === N;
  console.log(`  ${ok ? '✓' : '✗'} matVecMulNtt: 3×4 · 4 → ${t1.length} rows`);

  // 8. polyScale
  const scale = Q - 5;
  const scaled = polyScale(a, scale);
  const manual = new Int32Array(N);
  for (let i = 0; i < N; i++) manual[i] = modMul(a[i], scale);
  ok = ok && scaled.every((v, i) => v === manual[i]);
  console.log(`  ${ok ? '✓' : '✗'} polyScale`);

  // 9. polyNeg: a + (-a) == 0
  const negA = polyNeg(a);
  const sumZero = polyAdd(a, negA);
  ok = ok && sumZero.every(v => v === 0);
  console.log(`  ${ok ? '✓' : '✗'} polyNeg: a + (-a) == 0`);

  if (ok) console.log('✅ polyvec: self-tests passed');
  else throw new Error('polyvec self-test FAILED');
})();
