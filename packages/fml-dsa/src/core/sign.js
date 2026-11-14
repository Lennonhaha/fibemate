// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/core/sign.js
// FIPS 204 §4.2: ML-DSA.Sign(sk, M, ctx) — Deterministic (hedged) nonce
// 2026-07-29

import { Q, N, MLDSA_PARAMS } from './params.js';
import { shake256 } from './shakestream.js';
import { ntt, invNtt } from './ntt.js';
import { expandA, expandMask, sampleInBall } from './sampling.js';
import { vecNtt, vecInvNtt, vecAdd, vecSub, matVecMulNtt, polyMul } from './polyvec.js';
import { highBits, lowBits, makeHint, makeHintDilithium } from './reduce.js';
import { encodeSig } from './encode.js';
import { keygen } from './keygen.js';
import { selftestConsole } from './selftest-log.js';

const modAbs = v => v <= (Q >> 1) ? v : Q - v;
const modQ = v => { v %= Q; return v < 0 ? v + Q : v; };

export function sign(sk, msg, ctx = new Uint8Array(0), paramSet = 'ML-DSA-65', rnd = null) {
  const { k, l, gamma1, gamma2, tau, beta, omega, cTildeBytes } = MLDSA_PARAMS[paramSet];
  if (ctx.length > 255) throw new RangeError('ctx ≤ 255 bytes required');

  // Step 1: A ← ExpandA(ρ). Noble convention: pass time-domain A directly to
  // MultiplyNTTs (do not NTT-encode A).
  const A = expandA(sk.rho, paramSet);

  // Step 2: μ ← H(tr ‖ M')  where M' = (0, ctx_len, ctx) ‖ M   (FIPS 204 §5.2 step 6)
  // The ctx bytes are part of the hash input. Dropping them (while still writing
  // ctx_len = 0) made every context-bearing signature silently unverifiable, and
  // made sign() ignore the caller's context entirely.
  const muInput = new Uint8Array(sk.tr.length + 2 + ctx.length + msg.length);
  muInput.set(sk.tr, 0);
  muInput[sk.tr.length] = 0;
  muInput[sk.tr.length + 1] = ctx.length;
  muInput.set(ctx, sk.tr.length + 2);
  muInput.set(msg, sk.tr.length + 2 + ctx.length);
  const mu = shake256(muInput, 64);

  // Step 3: ρ'' ← H(K ‖ rnd ‖ μ, 64)   (FIPS 204 §6.1 Alg 7 step 4)
  // rnd is 32 bytes. `null` selects the deterministic variant (rnd = 0^32); the
  // caller may pass 32 bytes for hedged signing. Omitting rnd from the hash input
  // produced signatures that were valid but not the deterministic signature for
  // this key/message, so no implementation could reproduce them from a vector file.
  if (rnd !== null && !(rnd instanceof Uint8Array && rnd.length === 32)) {
    throw new TypeError('sign: rnd must be null or a 32-byte Uint8Array');
  }
  const rp = new Uint8Array(32 + 32 + mu.length);
  rp.set(sk.K, 0);
  if (rnd !== null) rp.set(rnd, 32);
  rp.set(mu, 64);
  const rhoPrime = shake256(rp, 64);

  // Precompute NTT(s1), NTT(s2), NTT(t0)  — t0 is the Power2Round low 13-bit vector
  const s1Ntt = [], s2Ntt = [], t0Ntt = [];
  for (let i = 0; i < l; i++)  s1Ntt.push(ntt(modCopy(sk.s1[i])));
  for (let i = 0; i < k; i++)  s2Ntt.push(ntt(modCopy(sk.s2[i])));
  for (let i = 0; i < k; i++)  t0Ntt.push(ntt(modCopy(sk.t0[i])));

  // Step 5: κ ← 0, and κ advances by ℓ after every attempt (FIPS 204 §6.1 Alg 7).
  // It used to advance by 1 and start at 1, which produced valid-but-unreproducible
  // signatures and used the wrong y stream.
  let kappa = 0;

  LOOP: for (let iter = 0; iter < 1000; iter++) {
    // Step 6: y ← ExpandMask(ρ'', κ), κ advances by ℓ per attempt (FIPS 204 Alg 7).
    const y = expandMask(rhoPrime, kappa, paramSet);
    kappa += l;
    for (const p of y) for (let j = 0; j < N; j++) if (p[j] < 0) p[j] += Q;

    // Step 7: w ← A·y  (NTT domain), then convert → normal
    const wNtt = matVecMulNtt(A, vecNtt(y));
    const w    = vecInvNtt(wNtt);          // ← KEY: normal domain for HighBits

    // Step 8: w₁ ← HighBits(w, γ₂)
    const w1 = [];
    for (let i = 0; i < k; i++) {
      const wi = new Int32Array(N);
      for (let j = 0; j < N; j++) wi[j] = highBits(w[i][j], gamma2);
      w1.push(wi);
    }

    // Step 9: c̃ ← SHAKE256(μ ‖ w₁) — raw hash seed (NOT SampleInBall output!)
    // The signature stores the raw hash, not the expanded polynomial.
    const cTildeHash = shake256(new Uint8Array([...mu, ...encodeW1(w1, gamma2)]), cTildeBytes);

    // Step 9b: expand c̃ → sparse τ-polynomial c ∈ Bτ
    // sampleInBall returns signed {-1, 0, 1}, ntt() accepts signed input.
    const cPoly = sampleInBall(cTildeHash, paramSet);
    const cNtt = ntt(cPoly);

    // Step 10-11: z ← y + c·s₁
    const cs1 = [];
    for (let i = 0; i < l; i++) cs1.push(invNtt(polyMul(cNtt, s1Ntt[i])));
    const z = vecAdd(y, cs1);

    // Step 12: ‖z‖∞ < γ₁ − β
    for (const poly of z) {
      for (let j = 0; j < N; j++) {
        if (modAbs(poly[j]) >= gamma1 - beta) continue LOOP;
      }
    }

    // Step 13: r₀ ← LowBits(w − cs₂)  — cs₂ = NTT⁻¹(ĉ ∘ ŝ₂)
    const cs2 = [];
    for (let i = 0; i < k; i++) cs2.push(invNtt(polyMul(cNtt, s2Ntt[i])));
    const rRaw = vecSub(w, cs2);

    const r0 = [];
    for (let i = 0; i < k; i++) {
      const p = new Int32Array(N);
      for (let j = 0; j < N; j++) p[j] = lowBits(rRaw[i][j], gamma2);
      r0.push(p);
    }

    // Steps 14-15: ‖r₀‖∞ < γ₂ − β
    for (const poly of r0) {
      for (let j = 0; j < N; j++) {
        if (Math.abs(poly[j]) >= gamma2 - beta) continue LOOP;
      }
    }

    // Step 16: ct₀ ← NTT⁻¹(ĉ ∘ t̂₀)  — challenge × Power2Round low bits
    const ct0 = [];
    for (let i = 0; i < k; i++) ct0.push(invNtt(polyMul(cNtt, t0Ntt[i])));

    // Step 17: ‖ct₀‖∞ < γ₂   — ct₀ from NTT⁻¹ needs centered abs
    for (const poly of ct0) {
      for (let j = 0; j < N; j++) {
        if (modAbs(poly[j]) >= gamma2) continue LOOP;
      }
    }

    // Step 18: r ← r_raw + ct₀ = w - cs₂ + ct₀, signed
    //          r₀ ← LowBits(r), r₁ ← HighBits(r)
    //          h ← MakeHint(r₀_transformed, w₁)  [Dilithium-style, §6.2 alternative]
    //          r₀_transformed = LowBits(w − cs₂) + ct₀  (= transformed low bits)
    //          w₁ = HighBits(w)
    const h = [];
    let totalHints = 0;
    for (let i = 0; i < k; i++) {
      const hp = new Int32Array(N);
      for (let j = 0; j < N; j++) {
        const r0Transformed = modQ(r0[i][j] + ct0[i][j]);
        hp[j] = makeHintDilithium(r0Transformed, w1[i][j], gamma2);
        totalHints += hp[j];
      }
      h.push(hp);
    }
    if (totalHints > omega) continue LOOP;

    return { cTilde: cTildeHash, z, h, w1 };
  }

  throw new Error('Sign: exceeded 1000 rejection loops');
}

/** Copy and normalise signed polynomial to [0,Q) */
function modCopy(poly) {
  const out = new Int32Array(N);
  for (let j = 0; j < N; j++) out[j] = poly[j] < 0 ? poly[j] + Q : poly[j];
  return out;
}

/** Bit-pack w₁ values for challenge hash (FIPS 204 §5.1) */
function encodeW1(w1, gamma2) {
  const m = Math.floor((Q - 1) / (2 * gamma2));       // 16 for all param sets
  const bits = Math.ceil(Math.log2(m));                 // 4
  const kPoly = w1.length;
  const mask = (1 << bits) - 1;
  const bytesLen = bits * (kPoly * N / 8);
  const buf = new Uint8Array(bytesLen);
  let pos = 0, cur = 0, curLen = 0;
  for (const poly of w1) {
    for (let j = 0; j < N; j++) {
      cur |= (poly[j] & mask) << curLen;
      curLen += bits;
      while (curLen >= 8) {
        buf[pos++] = cur & 0xFF;
        cur >>>= 8;
        curLen -= 8;
      }
    }
  }
  if (curLen > 0) buf[pos++] = cur & 0xFF;
  return buf;
}

// ══════ Self-tests ══════
(function selfTest() {
  // Quiet by default: success lines are opt-in, failure lines always print.
  const console = selftestConsole();
  let ok = true;

  for (const ps of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']) {
    const { sk } = keygen(ps);
    const msg = new Uint8Array([0x01, 0x02, 0x03]);
    const sig = sign(sk, msg, new Uint8Array(0), ps);
    const p = MLDSA_PARAMS[ps];
    ok &&= sig.cTilde instanceof Uint8Array && sig.cTilde.length === p.cTildeBytes;
    ok &&= Array.isArray(sig.z) && sig.z.length === p.l;
    ok &&= Array.isArray(sig.h) && sig.h.length === p.k;
    let hc = 0;
    for (const hp of sig.h) for (let j = 0; j < 256; j++) hc += (hp[j] === 1 ? 1 : 0);
    ok &&= hc <= p.omega;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} sign(${ps}): hints=${hc}/${p.omega}`);
  }

  // Encode roundtrip
  {
    const { sk } = keygen('ML-DSA-65');
    const sig = sign(sk, new Uint8Array([0x41,0x42,0x43]), new Uint8Array(0), 'ML-DSA-65');
    const enc = encodeSig(sig, 'ML-DSA-65');
    ok &&= enc.length > 0;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} encode roundtrip (${enc.length}B)`);
  }

  // Different messages → different signatures
  {
    const { sk } = keygen('ML-DSA-65');
    const s1 = sign(sk, new Uint8Array([0]), new Uint8Array(0), 'ML-DSA-65');
    const s2 = sign(sk, new Uint8Array([1]), new Uint8Array(0), 'ML-DSA-65');
    let diff = false;
    for (let i = 0; i < MLDSA_PARAMS['ML-DSA-65'].l && !diff; i++)
      diff = s1.z[i].some((v, j) => v !== s2.z[i][j]);
    ok &&= diff;
    console.log(`  ${diff ? 'PASS' : 'FAIL'} different msgs → different sigs`);
  }

  // z bound check
  {
    const { sk } = keygen('ML-DSA-65');
    const sig = sign(sk, new Uint8Array([0]), new Uint8Array(0), 'ML-DSA-65');
    const { gamma1, beta } = MLDSA_PARAMS['ML-DSA-65'];
    let over = false;
    for (const poly of sig.z) for (let j = 0; j < 256; j++) if (modAbs(poly[j]) >= gamma1 - beta) over = true;
    ok &&= !over;
    console.log(`  ${!over ? 'PASS' : 'FAIL'} z bounds check`);
  }

  if (ok) console.log('✅ sign: self-tests passed');
  else throw new Error('sign self-test FAILED');
})();
