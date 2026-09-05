// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/core/modmul.js — Barrett reduction, v5
// 2026-07-29: split t at 2^24 to keep Barrett intermediates below 2^53
// ctAdd/ctSub restored to original "Q &" pattern (JS & exploits 32-bit wrapping)

const Q = 8380417;
const SHIFT = 24;
const S = 2 ** SHIFT;
const S2 = 2 ** 48;
const M = 33587228;            // floor(2^48 / Q), via BigInt

// ── Input validation helpers ──
function assertInt(v, name) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= Q) {
    throw new RangeError(`${name}=${v} is not an integer in [0,${Q})`);
  }
}

// Self-test: modMul vs BigInt oracle
(function() {
  for (let i = 0; i < 3000; i++) {
    const a = Math.floor(Math.random() * Q);
    const b = Math.floor(Math.random() * Q);
    const got = modMul_inner(a, b);
    const expected = Number((BigInt(a) * BigInt(b)) % BigInt(Q));
    if (got !== expected) throw new Error(`modMul FAIL: ${a}*${b}%Q`);
  }
})();

function modMul_inner(a, b) {
  assertInt(a, 'modMul(a)');
  assertInt(b, 'modMul(b)');
  const t = a * b;
  const tLo = t % S;
  const tHi = (t - tLo) / S;
  const k = Math.floor(tHi * M / S) + Math.floor(tLo * M / S2);
  let r = t - k * Q;
  if (r >= Q) r -= Q;
  if (r >= Q) r -= Q;
  if (r < 0) r += Q;
  return r;
}

export const modMul = modMul_inner;

// ── Modular add/sub (keep original Q & pattern — ^JS & on -1 yields Q) ──
export function ctAdd(a, b) {
  assertInt(a, 'ctAdd(a)');
  assertInt(b, 'ctAdd(b)');
  const s = a + b;
  return s - (Q & ((Q - 1 - s) >> 31));
}

export function ctSub(a, b) {
  assertInt(a, 'ctSub(a)');
  assertInt(b, 'ctSub(b)');
  const d = a - b;
  return d + (Q & (d >> 31));
}
