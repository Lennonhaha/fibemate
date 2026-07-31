// fml-dsa/src/core/reduce.js
// FIPS 204 §5.1: modular reduction and decomposition helpers
// Power2Round, Decompose, HighBits, LowBits, MakeHint, UseHint
// 2026-07-29

import { Q } from './params.js';

// ══════════════════════════════════════════════
// Power2Round: r = r1·2^d + r0
// FIPS 204 Algorithm 2 — r0 ∈ [-2^(d-1), 2^(d-1)-1] (centered mod±)
// ══════════════════════════════════════════════
export function power2Round(r, d) {
  const two_d = 1 << d;
  const half = two_d >> 1;
  const mask = two_d - 1;
  
  // mod± 2^d: unsigned bits → centered
  let r0 = r & mask;
  if (r0 > half - 1) r0 -= two_d;
  
  // r1 = (r - r0) / 2^d   (r0 is signed, r is unsigned mod-Q)
  const r1 = (r - r0) >> d;
  return [r1, r0];
}

const D = 13;
const _2D = 1 << D;

export function power2RoundML(r) {
  return power2Round(r, D);
}

// ══════════════════════════════════════════════
// Decompose: r = r1·2γ₂ + r0  (mod Q, r in [0,Q))
// FIPS 204 Algorithm 3 — r0 ∈ (-γ₂, γ₂], r1 ∈ [0, m-1]
// ══════════════════════════════════════════════
function _decompose(r, gamma2) {
  // Step 1: ensure r ∈ [0, Q)
  r = ((r % Q) + Q) % Q;
  const twoG2 = 2 * gamma2;
  const m = Math.floor((Q - 1) / twoG2);

  // Step 2: r0 = r mod± (2γ₂)  — centered around 0, ∈ (-γ₂, γ₂]
  let r0 = r % twoG2;
  if (r0 > gamma2)        r0 -= twoG2;
  else if (r0 <= -gamma2) r0 += twoG2;

  // Steps 3-6: Q-1 boundary case (r - r0 may equal Q-1, which means r1=m)
  if (r - r0 === Q - 1) return [0, r0 - 1];

  // Step 7: r1 = (r - r0) / (2γ₂).  Normalize into [0, m)
  let r1 = (r - r0) / twoG2;
  r1 = ((r1 % m) + m) % m;
  return [r1, r0];
}

// Public: returns [r1, r0] where r1 ∈ [0, m-1], r0 ∈ (-γ₂, γ₂]
export function decompose(r, gamma2) {
  return _decompose(r, gamma2);
}

// ══════════════════════════════════════════════
// HighBits / LowBits ← thin wrappers around decompose
// ══════════════════════════════════════════════
export function highBits(r, gamma2) {
  return decompose(r, gamma2)[0];
}

export function lowBits(r, gamma2) {
  return decompose(r, gamma2)[1];
}

// ══════════════════════════════════════════════
// MakeHint: h = 1 iff HighBits(r+z) ≠ HighBits(r)
// FIPS 204 Algorithm 10
// ══════════════════════════════════════════════
export function makeHint(z, r, gamma2) {
  return highBits(r + z, gamma2) !== highBits(r, gamma2) ? 1 : 0;
}

// Dilithium-style MakeHint (Noble-compatible, FIPS 204 §6.2 alternative):
//   Caller passes (r0_transformed, w1) where r0_transformed = LowBits(w - cs2) + ct0
//   and w1 = HighBits(w). This is the "transformed state" referenced in FIPS 204 §6.2
//   and is what the Dilithium reference implementation (and Noble) uses internally.
//   Equivalent to Algorithm 39 for valid inputs but produces identical hints to Noble.
export function makeHintDilithium(z, r, gamma2) {
  if (z <= gamma2) return 0;
  if (z > Q - gamma2) return 0;
  if (z === Q - gamma2 && r === 0) return 0;
  return 1;
}

export function makeHintVec(ct0, w_cs2, gamma2) {
  const hints = new Int32Array(ct0.length);
  for (let i = 0; i < ct0.length; i++) {
    hints[i] = makeHint(-ct0[i], w_cs2[i], gamma2);
  }
  return hints;
}

// ══════════════════════════════════════════════
// UseHint: recover HighBits(r+z) from HighBits(r) + hint
// FIPS 204 Algorithm 11 — operates on raw _decompose (pre-mod r1)
// ══════════════════════════════════════════════
export function useHint(h, r, gamma2) {
  const twoG2 = 2 * gamma2;
  const m = Math.floor((Q - 1) / twoG2);
  let [r1, r0] = _decompose(r, gamma2);
  // r1 is already in [0, m) from fixed _decompose

  if (h === 1) {
    // FIPS 204 Algorithm 11:
    //   if r0 > 0 → (r1 + 1) mod⁺ m
    //   else  r0 ≤ 0 → (r1 - 1) mod⁺ m
    if (r0 > 0) return (r1 + 1) % m;
    return (r1 - 1 + m) % m;
  }
  return r1;
}

// ══════════════════════════════════════════════
// Infinity norm checks (for Sign rejection sampling)
// ══════════════════════════════════════════════
export function infNormLt(z, bound) {
  for (let i = 0; i < z.length; i++) {
    const v = z[i] < 0 ? -z[i] : z[i];
    if (v >= bound) return false;
  }
  return true;
}

export function vecInfNormLt(zVec, gamma1, beta) {
  const bound = gamma1 - beta;
  for (const poly of zVec) {
    if (!infNormLt(poly, bound)) return false;
  }
  return true;
}

// ══════════════════════════════════════════════
// Self-tests
// ══════════════════════════════════════════════
(function selfTest() {
  let ok = true;
  const gamma2 = (Q - 1) / 32; // 261888
  const twoG2 = 2 * gamma2;

  // 1. power2Round — centred r0 ∈ [-2^(d-1), 2^(d-1)-1]
  const halfD = _2D >> 1;
  for (let r = 0; r < 10000; r++) {
    const [r1, r0] = power2Round(r, D);
    if (r0 < -halfD || r0 >= halfD || r1 * _2D + r0 !== r) { ok = false; console.log(`FAIL power2Round: r=${r} r1=${r1} r0=${r0}`); break; }
  }
  if (ok) console.log(`  PASS power2Round 10000x`);

  // 2. Decompose: r ≡ r1·2γ₂ + r0 (mod Q)
  for (let i = 0; i < 1000; i++) {
    const r = Math.floor(Math.random() * Q);
    const [r1, r0] = decompose(r, gamma2);
    if (((r1 * twoG2 + r0 - r) % Q + Q) % Q !== 0) {
      ok = false;
      console.log(`  FAIL Decompose roundtrip: r=${r} r1=${r1} r0=${r0} r1*α+r0=${r1*twoG2+r0}`);
      break;
    }
  }
  if (ok) console.log(`  PASS Decompose 1000x roundtrip`);

  // 3. HighBits/LowBits == Decompose
  for (let i = 0; i < 100; i++) {
    const r = Math.floor(Math.random() * Q);
    const [r1, r0] = decompose(r, gamma2);
    if (highBits(r, gamma2) !== r1 || lowBits(r, gamma2) !== r0) { ok = false; break; }
  }
  if (ok) console.log(`  PASS HighBits/LowBits == decompose`);

  // 4. MakeHint + UseHint: ML-DSA Sign context
  // r_raw = w - cs2,  ct0 = LowBits(r_raw),  r = r_raw + ct0
  // hint = MakeHint(-ct0, r),  UseHint(hint, r) must recover HighBits(r_raw)
  for (let i = 0; i < 2000; i++) {
    const r_raw = Math.floor(Math.random() * Q);
    const [, ct0] = _decompose(r_raw, gamma2);
    const r = r_raw + ct0;
    const expected = highBits(r_raw, gamma2);
    const hint = makeHint(-ct0, r, gamma2);
    const recovered = useHint(hint, r, gamma2);
    if (recovered !== expected) {
      ok = false;
      console.log(`  FAIL #${i}: r_raw=${r_raw} ct0=${ct0} r=${r} hint=${hint} expected=${expected} recovered=${recovered}`);
      break;
    }
  }
  if (ok) console.log(`  PASS MakeHint/UseHint 2000x`);

  // 5. infNormLt
  const a = new Int32Array([1, -2, 0, 5, -3, 450]);
  if (!infNormLt(a, 451) || infNormLt(a, 450)) { ok = false; }
  if (ok) console.log(`  PASS infNormLt`);

  // 6. Edge: Power2Round(Q-1)
  const [h1, l1] = power2Round(Q - 1, D);
  if (l1 < -halfD || l1 >= halfD) { ok = false; console.log(`FAIL power2Round(Q-1): r1=${h1} r0=${l1}`); }
  if (ok) console.log(`  PASS power2Round(Q-1)`);

  if (ok) console.log(`✅ reduce: self-tests passed`);
  else throw new Error('reduce self-test FAILED');
})();
