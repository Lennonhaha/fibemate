// fml-dsa/src/core/reduce.js
// FIPS 204 §5.1: modular reduction and decomposition helpers
// Power2Round, Decompose, HighBits, LowBits, MakeHint, UseHint
// 2026-07-29

import { Q } from './params.js';

// ══════════════════════════════════════════════
// Power2Round: r = r1·2^d + r0
// FIPS 204 Algorithm 2
// ══════════════════════════════════════════════
export function power2Round(r, d) {
  const mod2d = (1 << d) - 1;
  const r0 = r & mod2d;
  const r1 = (r - r0) >> d;
  return [r1, r0];
}

const D = 13;
const _2D = 1 << D;

export function power2RoundML(r) {
  return power2Round(r, D);
}

// ══════════════════════════════════════════════
// Decompose: r = r1·2γ₂ + r0 (mod Q)
// Internal: returns raw (r1, r0); r1 ∈ ℤ (may be negative)
// ══════════════════════════════════════════════
// FIPS 204 Algorithm 3 (correct — with q-1 special case)
function _decompose(r, gamma2) {
  r = ((r % Q) + Q) % Q;                 // Step 1: r ← r mod⁺ q
  const twoG2 = 2 * gamma2;
  const alpha = twoG2;
  const halfAlpha = gamma2;               // α/2 = γ₂

  // Step 2: r₀ ← r mod± α  (centered modulo, output ∈ (-α/2, α/2])
  let r0 = r % alpha;
  if (r0 > halfAlpha)       r0 -= alpha;  // bring into (-α/2, α/2]
  else if (r0 <= -halfAlpha) r0 += alpha; // (boundary: ≤ -γ₂ is out of range)

  // Step 3-5: handle Q-1 boundary
  if (r - r0 === Q - 1) {
    return [0, r0 - 1];
  }
  // Step 7: r₁ ← (r - r₀) / α
  return [(r - r0) / alpha, r0];
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
  const [r1, r0] = _decompose(r, gamma2);
  // r1 here is the raw integer quotient (may equal m or be negative)
  // Normalize to [0, m-1] for the wrapping logic
  const r1m = ((r1 % m) + m) % m;

  if (h === 1) {
    // FIPS 204 Algorithm 11:
    //   if r0 > 0 → (r1 + 1) mod⁺ m
    //   else  r0 ≤ 0 → (r1 - 1) mod⁺ m
    if (r0 > 0) return (r1m + 1) % m;
    return (r1m - 1 + m) % m;
  }
  return r1m;
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

  // 1. power2Round
  for (let r = 0; r < 10000; r++) {
    const [r1, r0] = power2Round(r, D);
    if (r0 < 0 || r0 >= _2D || r1 * _2D + r0 !== r) { ok = false; break; }
  }
  if (ok) console.log(`  PASS power2Round 10000x`);

  // 2. Decompose: r ≡ r1·2γ₂ + r0 (mod Q)
  for (let i = 0; i < 1000; i++) {
    const r = Math.floor(Math.random() * Q);
    const [r1, r0] = decompose(r, gamma2);
    if (((r1 * twoG2 + r0 - r) % Q + Q) % Q !== 0) { ok = false; break; }
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
  if (h1 < 0 || l1 < 0 || l1 >= _2D) { ok = false; }
  if (ok) console.log(`  PASS power2Round(Q-1)`);

  if (ok) console.log(`✅ reduce: self-tests passed`);
  else throw new Error('reduce self-test FAILED');
})();
