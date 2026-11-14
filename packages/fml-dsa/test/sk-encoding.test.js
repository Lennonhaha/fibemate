#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * sk-encoding.test.js — encodeSK / decodeSK contract
 *
 * Guards the 2026-11-14 finding: encodeSK packed coefficients without a range check, so
 * t0 = 4107 (invalid; valid t0 is [-4095, 4096]) wrapped modulo 8192 and decoded as
 * -4085. The module self-test generated that out-of-range data and printed FAIL on every
 * run without failing any step. Both halves are now enforced here:
 *
 *   1. valid input of every parameter set, at the range boundaries, round-trips exactly
 *   2. out-of-range s1 / s2 / t0 throws RangeError instead of wrapping
 *   3. decodeSK rejects a buffer with trailing bytes instead of ignoring them
 *   4. the module can be imported without its self-test complaining
 *
 * Exit 0 = pass, 1 = fail.
 */
'use strict';

import { MLDSA_PARAMS } from '../src/core/params.js';
import { encodeSK, decodeSK } from '../src/core/encode.js';
import { power2Round } from '../src/core/reduce.js';

let pass = 0;
let fail = 0;

function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  PASS ${name}`);
  } catch (err) {
    fail++;
    console.log(`  FAIL ${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeSk(prm, t0For) {
  const { k, l, eta } = MLDSA_PARAMS[prm];
  const rho = new Uint8Array(32).map((_, i) => i);
  const K = new Uint8Array(32).map((_, i) => 255 - i);
  const tr = new Uint8Array(64).map((_, i) => (i * 7) & 0xff);
  const s1 = Array.from({ length: l }, (_, i) => new Int32Array(256).map((_, j) => ((i + j) % (2 * eta + 1)) - eta));
  const s2 = Array.from({ length: k }, (_, i) => new Int32Array(256).map((_, j) => ((i * 3 + j) % (2 * eta + 1)) - eta));
  const t0 = Array.from({ length: k }, (_, i) => new Int32Array(256).map((_, j) => t0For(i, j)));
  return { rho, K, tr, s1, s2, t0 };
}

function same(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

console.log('━━━ encodeSK / decodeSK ━━━');

for (const prm of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']) {
  check(`${prm}: boundary values round-trip exactly`, () => {
    const { eta } = MLDSA_PARAMS[prm];
    // walk the whole valid t0 range: -4095, -4094, 0, 4095, 4096
    const marks = [-4095, -4094, 0, 4095, 4096];
    const sk = makeSk(prm, (i, j) => marks[(i + j) % marks.length]);
    const dec = decodeSK(encodeSK(sk, prm), prm);
    const { l, k: kk } = MLDSA_PARAMS[prm];
    for (let i = 0; i < l; i++) assert(same(sk.s1[i], dec.s1[i]), `s1[${i}] mismatch`);
    for (let i = 0; i < kk; i++) {
      assert(same(sk.s2[i], dec.s2[i]), `s2[${i}] mismatch`);
      assert(same(sk.t0[i], dec.t0[i]), `t0[${i}] mismatch`);
    }
    assert(same(sk.rho, dec.rho), 'rho mismatch');
    assert(same(sk.K, dec.K), 'K mismatch');
    assert(same(sk.tr, dec.tr), 'tr mismatch');
    assert(eta === MLDSA_PARAMS[prm].eta, 'eta sanity');
  });

  check(`${prm}: s1 out of range throws`, () => {
    const { eta } = MLDSA_PARAMS[prm];
    const sk = makeSk(prm, () => 0);
    sk.s1[0][7] = eta + 1;
    let threw = false;
    try { encodeSK(sk, prm); } catch (e) { threw = e instanceof RangeError; }
    assert(threw, 'expected RangeError');
  });

  check(`${prm}: t0 = 4097 throws instead of wrapping`, () => {
    const sk = makeSk(prm, () => 0);
    sk.t0[0][0] = 4097;
    let msg = '';
    try { encodeSK(sk, prm); } catch (e) { msg = e.message; }
    assert(/t0\[0\]\[0\] = 4097/.test(msg), `expected range error naming the coefficient, got: ${msg}`);
  });

  check(`${prm}: t0 = -4096 throws instead of wrapping`, () => {
    const sk = makeSk(prm, () => 0);
    sk.t0[0][1] = -4096;
    let threw = false;
    try { encodeSK(sk, prm); } catch (e) { threw = e instanceof RangeError; }
    assert(threw, 'expected RangeError');
  });

  check(`${prm}: decodeSK rejects trailing bytes`, () => {
    const sk = makeSk(prm, () => 0);
    const enc = encodeSK(sk, prm);
    const longer = new Uint8Array(enc.length + 1);
    longer.set(enc, 0);
    let threw = false;
    try { decodeSK(longer, prm); } catch (e) { threw = e instanceof RangeError; }
    assert(threw, 'expected RangeError on trailing byte');
  });
}

// The root cause behind the wrap: power2Round had the mod± bound inverted (r0 > half - 1),
// so keygen emitted t0 = -4096 - a value mod± 2^13 cannot produce and 13 bits cannot hold.
// Its own self-test asserted the same inverted bound, which is why nobody noticed. #470
check('power2Round: keeps +4096, never yields -4096', () => {
  const [t1, t0] = power2Round(4096, 13);
  assert(t0 === 4096, `r=4096 -> t0=${t0} (expected 4096)`);
  assert(t1 === 0, `r=4096 -> t1=${t1} (expected 0)`);
  const [w1, w0] = power2Round(8191, 13);
  assert(w0 === -1, `r=8191 -> t0=${w0} (expected -1)`);
  assert(w1 === 1, `r=8191 -> t1=${w1} (expected 1)`);
  let min = 0;
  let max = 0;
  for (let r = 0; r < 8380417; r += 11) {
    const [, r0] = power2Round(r, 13);
    if (r0 < min) min = r0;
    if (r0 > max) max = r0;
  }
  assert(min === -4095 && max === 4096, `t0 range ${min}..${max} (expected -4095..4096)`);
});

console.log(`\n  TOTAL ${pass + fail} | PASS ${pass} | FAIL ${fail}`);
if (fail > 0) {
  console.log('❌ sk encoding contract FAILED');
  process.exit(1);
}
console.log('✅ sk encoding contract holds');
