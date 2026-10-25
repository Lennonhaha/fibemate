// SPDX-License-Identifier: GPL-3.0-only
/**
 * fibemate-pqc-kem -- FIPS 203 internal-step invariants (ML-KEM-768, pure JS)
 *
 * Why this file exists
 * --------------------
 * The ACVP cases in test/vectors/ pin inputs to outputs, and encapsKeyCheck /
 * decapsKeyCheck pin key validity. Neither of them looks inside the arithmetic:
 * the NTT, the bit codec, compress/decompress, the centred binomial sampler and
 * SampleNTT are constrained today only by "the code follows the pseudocode".
 * That means a refactor (swap the Keccak backend, reorder a loop, move a
 * rounding constant) can change internal behaviour with every external vector
 * still green.
 *
 * The checks below are invariants of the standard itself, not echoes of the
 * implementation:
 *
 *   - NTT and its inverse are a bijection, and the inverse carries exactly the
 *     scaling 128^-1 that FIPS 203 prescribes. Verified against the derivation,
 *     not against a recording of current output.
 *   - Pointwise NTT multiplication is compared with a schoolbook negacyclic
 *     convolution written here from the definition. This is an independent
 *     oracle: it shares no code with src/.
 *   - Compress_d has a provable error bound; the test scans every input value
 *     (q = 3329, so exhaustive is cheap) instead of sampling.
 *   - The 12-bit codec must be the identity on canonical coefficients, and must
 *     be seen to normalise non-canonical ones -- which is why the key check
 *     compares bytes rather than coefficients.
 *   - CBD_eta must stay inside [-eta, eta]; SampleNTT must stay in [0, q).
 *
 * The implementation under test is the JavaScript backend, required directly
 * from src/. When the native addon is present, require('..') would hand back the
 * C code instead, and these checks would silently stop covering the JS path.
 *
 * Run: node test/internal-invariants.test.js
 * Or:  npm test   (from packages/pqc-kem/)
 */

'use strict';

const K = require('../src/ml-kem-768.js');
const {
  ntt, intt, polyMulNTT, polyAddNTT,
  compress, decompress, byteEncode, byteDecode,
  cbd, sampleNTT,
  modAdd, modSub, modMul, modNeg,
} = K;

const N = 256, Q = 3329, NTT_INV = 3303, R = 128; // R is the NTT scaling in FIPS 203

let checks = 0, failures = 0;

function ok(cond, label, detail) {
  checks++;
  if (cond) return true;
  failures++;
  console.error('  [FAIL] ' + label + (detail ? ' :: ' + detail : ''));
  return false;
}

function eqArr(a, b, label) {
  if (a.length !== b.length) return ok(false, label, `length ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return ok(false, label, `index ${i}: ${a[i]} vs ${b[i]}`);
  }
  return ok(true, label);
}

// Deterministic PRNG: a failing case must be reproducible from the label alone.
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s; };
}

function randPoly(seed, mod) {
  const r = lcg(seed), p = new Int16Array(N);
  for (let i = 0; i < N; i++) p[i] = r() % (mod || Q);
  return p;
}

const clone = a => Int16Array.from(a);

// --- independent oracle: c[k] = sum_{i+j=k} a_i b_j - sum_{i+j=k+N} a_i b_j --
function negacyclicSchoolbook(a, b) {
  const c = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const k = i + j;
      if (k < N) c[k] += a[i] * b[j];
      else c[k - N] -= a[i] * b[j];
    }
  }
  const out = new Int16Array(N);
  for (let i = 0; i < N; i++) out[i] = ((c[i] % Q) + Q) % Q;
  return out;
}

// ===========================================================================
console.log('\n== NTT: scaling, bijection, linearity ==');

// The inverse applies 128^-1, so the round trip is the identity. If someone
// drops that multiplication the round trip returns 128*x and this fires.
ok(modMul(NTT_INV, R) === 1, 'NTT_INV is 128^-1 mod q', `${NTT_INV} * ${R} = ${modMul(NTT_INV, R)}`);

for (const seed of [1, 7, 42, 1234, 99999]) {
  const x = randPoly(seed);
  eqArr(intt(ntt(clone(x))), x, `intt(ntt(x)) == x  (seed ${seed})`);
}

// The same must hold the other way: the pair is a bijection, not a one-way
// normalisation into the subset that happens to be reachable.
for (const seed of [5, 77, 4242]) {
  const y = randPoly(seed);
  eqArr(ntt(intt(clone(y))), y, `ntt(intt(y)) == y  (seed ${seed})`);
}

// Injectivity on the standard basis: 256 distinct inputs, 256 distinct images.
// A collapsed butterfly (e.g. a typo in a zeta index) shows up here immediately.
{
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const e = new Int16Array(N); e[i] = 1;
    seen.add(ntt(e).join(','));
  }
  ok(seen.size === N, 'ntt is injective on the basis', `${seen.size} distinct of ${N}`);
}

// NTT is linear: ntt(a + b) == ntt(a) + ntt(b) in the coefficient-wise sense.
{
  const a = randPoly(11), b = randPoly(12);
  const sum = new Int16Array(N);
  for (let i = 0; i < N; i++) sum[i] = modAdd(a[i], b[i]);
  eqArr(ntt(clone(sum)), polyAddNTT(ntt(clone(a)), ntt(clone(b))), 'ntt(a+b) == ntt(a)+ntt(b)');
}

// Output range: nothing may leak a negative or an unreduced value.
for (const seed of [3, 4]) {
  const t = ntt(randPoly(seed));
  let bad = 0;
  for (let i = 0; i < N; i++) if (!(t[i] >= 0 && t[i] < Q)) bad++;
  ok(bad === 0, `ntt output in [0, q)  (seed ${seed})`, `${bad} out of range`);
}

// ===========================================================================
console.log('\n== NTT-domain multiplication vs schoolbook convolution ==');

for (const [sa, sb] of [[2, 3], [21, 22], [101, 202]]) {
  const a = randPoly(sa), b = randPoly(sb);
  const viaNtt = intt(polyMulNTT(ntt(clone(a)), ntt(clone(b))));
  eqArr(viaNtt, negacyclicSchoolbook(a, b), `polyMulNTT == negacyclic(a,b)  (seeds ${sa}/${sb})`);
}

// Multiplication by the NTT image of the constant polynomial 1 must be the
// identity. This is the ring's unit, so it catches a scaling slip that the
// schoolbook comparison could mask if the same slip existed on both sides.
{
  const one = new Int16Array(N); one[0] = 1;
  const a = randPoly(31);
  eqArr(intt(polyMulNTT(ntt(clone(a)), ntt(clone(one)))), a, 'a * 1 == a in the NTT ring');
}

// ===========================================================================
console.log('\n== Compress / Decompress: exhaustive error bound ==');

// |Decompress_d(Compress_d(x)) - x| <= q/2^(d+1) + 1/2.
// The trailing 1/2 is the rounding inside Decompress and cannot be dropped; with
// d = 10 the bound is 2.125 for q = 3329, so an implementation that rounds to
// nearest is allowed an error of 2. Asserting the tighter q/2^(d+1) would fail
// on correct code.
for (const d of [1, 4, 10, 11]) {
  const bound = Q / Math.pow(2, d + 1) + 0.5;
  let maxErr = 0, worst = -1;
  for (let v = 0; v < Q; v++) {
    const p = new Int16Array(N); p[0] = v;
    const back = decompress(compress(p, d), d)[0];
    let e = Math.abs(back - v);
    if (e > Q / 2) e = Q - e;            // the ring is mod q, wrap-around included
    if (e > maxErr) { maxErr = e; worst = v; }
  }
  ok(maxErr <= bound, `d=${d}: max error ${maxErr} <= ${bound.toFixed(3)}`, `worst x=${worst}`);
  ok(compress(new Int16Array(N), d).every(c => c >= 0 && c < (1 << d)), `d=${d}: compressed values fit in d bits`);
}

// ===========================================================================
console.log('\n== Bit codec: byteEncode / byteDecode ==');

for (const d of [12, 10, 4, 1]) {
  // d = 12 spans the full coefficient range, so it is drawn from [0, q); the
  // narrower widths already fit inside q and are drawn from their own range.
  const x = randPoly(50 + d, d === 12 ? Q : (1 << d));
  eqArr(byteDecode(byteEncode(x, d), d), x, `byteDecode(byteEncode(x)) == x  (d=${d}, canonical range)`);
  ok(byteEncode(x, d).length === N * d / 8, `d=${d}: encoded length is N*d/8`);
}

{
  // Canonical 12-bit coefficients survive the round trip.
  const canon = randPoly(60);
  eqArr(byteDecode(byteEncode(canon, 12), 12), canon, '12-bit round trip over [0, q)');

  // Pack raw 12-bit fields by hand, the way an attacker-controlled public key
  // arrives: byteEncode is bypassed on purpose, because it reduces mod q before
  // writing and would hide what byteDecode does with a non-canonical field.
  const pack12 = (vals) => {
    const out = new Uint8Array(N * 12 / 8);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < 12; j++) {
        const bi = i * 12 + j;
        out[bi >> 3] |= ((vals[i] >>> j) & 1) << (bi & 7);
      }
    }
    return out;
  };
  const bytesEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  // byteDecode maps a field holding q to 0 (one conditional subtraction). The
  // round trip through byteEncode is therefore NOT the identity on non-canonical
  // input -- which is why encapsKeyCheck compares re-encoded bytes: comparing
  // coefficients would accept a key whose field holds 4095.
  ok(byteDecode(pack12([Q]), 12)[0] === 0, 'byteDecode maps a field holding q to 0');
  ok(byteDecode(pack12([4095]), 12)[0] === 4095 - Q, 'byteDecode maps 4095 to 766');

  {
    const raw = pack12([4095]);
    const reencoded = byteEncode(byteDecode(raw, 12), 12);
    ok(!bytesEqual(raw, reencoded), 'non-canonical 4095 does not survive a byte-level round trip');
  }
  {
    const raw = pack12(canon);
    const reencoded = byteEncode(byteDecode(raw, 12), 12);
    ok(bytesEqual(raw, reencoded), 'canonical coefficients do survive a byte-level round trip');
  }

  // byteEncode normalises its input, so a coefficient of q encodes exactly like 0.
  const atQ = new Int16Array(N); atQ[0] = Q;
  ok(bytesEqual(byteEncode(atQ, 12), byteEncode(new Int16Array(N), 12)), 'byteEncode reduces q to 0 before packing');
}

// ===========================================================================
console.log('\n== Samplers: CBD and SampleNTT ==');

for (const eta of [2, 3]) {
  const buf = new Uint8Array(64 * eta);
  lcg(70 + eta);
  const r = lcg(70 + eta);
  for (let i = 0; i < buf.length; i++) buf[i] = r() & 0xFF;
  const p = cbd(buf, eta);
  let out = 0, min = 0, max = 0;
  for (let i = 0; i < N; i++) {
    if (p[i] < -eta || p[i] > eta) out++;
    if (p[i] < min) min = p[i];
    if (p[i] > max) max = p[i];
  }
  ok(out === 0, `cbd(eta=${eta}) stays in [-${eta}, ${eta}]`, `${out} out of range`);
  ok(min < 0 && max > 0, `cbd(eta=${eta}) actually takes both signs`, `range [${min}, ${max}]`);
}

{
  const seedA = new Uint8Array(34); seedA[0] = 7; seedA[33] = 9;
  const seedB = new Uint8Array(34); seedB[0] = 7; seedB[33] = 10;
  const a1 = sampleNTT(seedA), a2 = sampleNTT(seedA), b = sampleNTT(seedB);

  eqArr(a1, a2, 'SampleNTT is deterministic for a fixed seed');
  ok(a1.join(',') !== b.join(','), 'SampleNTT differs when the seed differs');

  let out = 0;
  for (let i = 0; i < N; i++) if (!(a1[i] >= 0 && a1[i] < Q)) out++;
  ok(out === 0, 'SampleNTT stays in [0, q)', `${out} out of range`);

  // Uniform sampling should not collapse to a handful of values.
  ok(new Set(a1).size > 200, 'SampleNTT does not collapse', `${new Set(a1).size} distinct values of ${N}`);
}

// ===========================================================================
console.log('\n== Modular arithmetic edge cases ==');

ok(modAdd(Q - 1, 1) === 0, 'modAdd(q-1, 1) == 0');
ok(modSub(0, 1) === Q - 1, 'modSub(0, 1) == q-1');
ok(modNeg(0) === 0, 'modNeg(0) == 0');
ok(modNeg(1) === Q - 1, 'modNeg(1) == q-1');
{
  const x = randPoly(80);
  let bad = 0;
  for (let i = 0; i < N; i++) {
    if (modMul(x[i], 1) !== x[i]) bad++;
    if (modMul(x[i], 0) !== 0) bad++;
    if (modAdd(x[i], 0) !== x[i]) bad++;
    if (modSub(x[i], x[i]) !== 0) bad++;
  }
  ok(bad === 0, 'mul by 1 and 0, add 0, subtract self', `${bad} violations`);
}

// ===========================================================================
console.log('\n' + (failures === 0
  ? `PASS  ${checks} checks, 0 failures`
  : `FAIL  ${checks} checks, ${failures} failures`));
process.exit(failures === 0 ? 0 : 1);
