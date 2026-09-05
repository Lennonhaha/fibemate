// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/core/verify.js
// FIPS 204 §4.3: ML-DSA.Verify(pk, M, σ)
// Reconstructs challenge c̃ from signature, checks z bounds, hint validity, and hash match.
// 2026-07-30

import { MLDSA_PARAMS, Q, N } from './params.js';
import { shake256 } from './shakestream.js';
import { ntt, invNtt } from './ntt.js';
import { expandA, sampleInBall } from './sampling.js';
import { vecNtt } from './polyvec.js';
import { useHint } from './reduce.js';
import { decodePK, decodeSig, encodePK } from './encode.js';

const D = 13;
const _2D = BigInt(1 << D);

/**
 * ML-DSA.Verify(pk_raw, M, sig_raw) - FIPS 204 §4.3
 *
 * @param {Uint8Array} pk_raw  - encoded pk bytes from encodePK
 * @param {Uint8Array} msg     - plaintext message
 * @param {Uint8Array} sig_raw - encoded sig bytes from encodeSig
 * @param {Uint8Array} ctx     - context (≤255B)
 * @param {string} paramSet    - 'ML-DSA-44'|'ML-DSA-65'|'ML-DSA-87'
 * @returns {boolean}
 */
export function verify(pk_raw, msg, sig_raw, ctx = new Uint8Array(0), paramSet = 'ML-DSA-65') {
  const { k, l, gamma1, beta, omega, cTildeBytes } = MLDSA_PARAMS[paramSet];
  if (ctx.length > 255) return false;

  // Step 1: (ρ, t1) ← decodePK
  let rho, t1;
  try { ({ rho, t1 } = decodePK(pk_raw, paramSet)); } catch { return false; }

  // Step 2: (c̃, z, h) ← decodeSig
  let cTilde, z, h;
  try { ({ cTilde, z, h } = decodeSig(sig_raw, paramSet)); } catch { return false; }

  // Step 3: ‖z‖∞ < γ1 - β (z is unsigned, center-lift first: ≤Q/2 stays, >Q/2 → v-Q)
  for (const poly of z) {
    for (let j = 0; j < N; j++) {
      const v = poly[j];
      const zc = v <= (Q >> 1) ? v : v - Q;  // center-lift to signed
      if (zc <= -gamma1 + beta || zc >= gamma1 - beta) return false;
    }
  }

  // Step 4: hints per poly ≤ ω
  for (const hp of h) {
    let cnt = 0;
    for (let j = 0; j < N; j++) cnt += hp[j];
    if (cnt > omega) return false;
  }

  // Step 5: A ← ExpandA(ρ). expandA returns time-domain coefficients.
  // Noble's convention: RejNTTPoly returns time-domain polys but treats them as NTT
  // inputs in MultiplyNTTs (which is pointwise multiplication). Matching Noble requires
  // passing time-domain A directly to MultiplyNTTs without NTT-encoding.
  const A = expandA(rho, paramSet);

  // Step 6: tr ← H(encodePK(pk), 64) - FIPS 204: full 64-byte hash of pk
  const tr = shake256(encodePK({ rho, t1 }, paramSet), 64);

  // Step 7: μ ← H(tr ‖ M')  where M' = (0, ctx_len, ctx) ‖ M (FIPS 204 domain sep)
  // Noble's getMessage prepends [0, ctx.length] before msg. With empty ctx (length 0),
  // M' = [0x00, 0x00] || msg. This is required for cross-Noble interoperability.
  const muInput = new Uint8Array(64 + 2 + msg.length);
  muInput.set(tr, 0);
  muInput[64] = 0;        // domain sep byte 0
  muInput[65] = 0;        // ctx length (0 = no context)
  muInput.set(msg, 66);
  const mu = shake256(muInput, 64);

  // Step 8: c ← SampleInBall(c̃); ĉ ← NTT(c)
  // SampleInBall returns {-1, 0, 1} signed — feed directly to NTT (no Q-normalize).
  // The NTT is linear but const shifts leak: NTT({-1,1}) ≠ NTT({Q-1,1}) in mod Q.
  const cPoly = sampleInBall(cTilde, paramSet);
  const cNtt = ntt(cPoly);

  // Step 9: t1' ← t1 · 2^d  (undo Power2Round), then NTT
  // Noble parity: simple signed shift-left, no mod Q (NTT reduces internally).
  const t1ShiftNtt = [];
  for (let i = 0; i < k; i++) {
    const shifted = new Int32Array(N);
    for (let j = 0; j < N; j++) {
      shifted[j] = t1[i][j] << D;
    }
    t1ShiftNtt.push(ntt(shifted));
  }

  // Step 10: z is signed [-γ1+1, γ1-1]; NTT in-place accepts signed values (Noble parity).
  // We must NOT Q-normalize z before NTT — that would leak constant offsets.
  const zNtt = vecNtt(z);
  const Qbig = BigInt(Q);

  // w' ← UseHint on decoded (Az − ct1)
  const w1Recovered = [];
  for (let i = 0; i < k; i++) {
    const wApproxNtt = new Int32Array(N);
    for (let j = 0; j < N; j++) {
      let azSum = 0n;
      for (let col = 0; col < l; col++) {
        azSum = (azSum + BigInt(A[i][col][j]) * BigInt(zNtt[col][j])) % Qbig;
      }
      const ct1 = (BigInt(cNtt[j]) * BigInt(t1ShiftNtt[i][j])) % Qbig;
      wApproxNtt[j] = Number((azSum + Qbig - ct1) % Qbig);
    }
    const wPlain = invNtt(wApproxNtt);
    const w1 = new Int32Array(N);
    for (let j = 0; j < N; j++) {
      w1[j] = useHint(h[i][j], wPlain[j], MLDSA_PARAMS[paramSet].gamma2);
    }
    w1Recovered.push(w1);
  }

  // Step 12: c̃' ← H(μ ‖ w1')
  const w1Encoded = encodeW1(w1Recovered, MLDSA_PARAMS[paramSet].gamma2);
  const cTildePrime = shake256(new Uint8Array([...mu, ...w1Encoded]), cTildeBytes);

  // Step 13: c̃' == c̃
  let firstDiff = -1;
  for (let i = 0; i < cTildeBytes; i++) {
    if (cTildePrime[i] !== cTilde[i]) {
      if (firstDiff < 0) {
        firstDiff = i;
        console.error('cTildePrime mismatch at byte', i, 'expected', cTilde[i], 'got', cTildePrime[i]);
        console.error('cTildePrime[:16]:', Buffer.from(cTildePrime.slice(0, 16)).toString('hex'));
        console.error('cTilde[:16]:', Buffer.from(cTilde.slice(0, 16)).toString('hex'));
      }
      return false;
    }
  }

  return true;
}

/** Bit-pack w1 for challenge hash (same as sign.js encodeW1) */
function encodeW1(w1, gamma2) {
  const kPoly = w1.length;
  const m = Math.floor((Q - 1) / (2 * gamma2));
  const bits = Math.ceil(Math.log2(m));
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
(async function selfTest() {
  let ok = true;

  // Dynamic imports to avoid circular deps from keygen/sign
  const { keygen } = await import('./keygen.js');
  const { sign } = await import('./sign.js');
  const { encodePK, encodeSig } = await import('./encode.js');

  // Test 1: sign → verify roundtrip (all param sets)
  for (const ps of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']) {
    const { sk, pk } = keygen(ps);
    const pkRaw = encodePK(pk, ps);
    const msg = new Uint8Array([0x01, 0x02, 0x03]);
    const sig = sign(sk, msg, new Uint8Array(0), ps);
    const sigRaw = encodeSig(sig, ps);
    const result = verify(pkRaw, msg, sigRaw, new Uint8Array(0), ps);
    if (!result) { ok = false; console.log(`  FAIL verify roundtrip ${ps}`); }
    else console.log(`  PASS verify roundtrip ${ps}`);
  }

  // Test 2: tampered message
  {
    const { sk, pk } = keygen('ML-DSA-65');
    const pkRaw = encodePK(pk, 'ML-DSA-65');
    const sig = sign(sk, new Uint8Array([1,2,3]), new Uint8Array(0), 'ML-DSA-65');
    const sigRaw = encodeSig(sig, 'ML-DSA-65');
    const result = verify(pkRaw, new Uint8Array([1,2,4]), sigRaw, new Uint8Array(0), 'ML-DSA-65');
    if (result) { ok = false; console.log('  FAIL tampered msg accepted'); }
    else console.log('  PASS tampered msg rejected');
  }

  // Test 3: tampered signature
  {
    const { sk, pk } = keygen('ML-DSA-65');
    const pkRaw = encodePK(pk, 'ML-DSA-65');
    const sig = sign(sk, new Uint8Array([1,2,3]), new Uint8Array(0), 'ML-DSA-65');
    const sigRaw = encodeSig(sig, 'ML-DSA-65');
    sigRaw[10] ^= 0x01;
    const result = verify(pkRaw, new Uint8Array([1,2,3]), sigRaw, new Uint8Array(0), 'ML-DSA-65');
    if (result) { ok = false; console.log('  FAIL tampered sig accepted'); }
    else console.log('  PASS tampered sig rejected');
  }

  // Test 4: wrong public key
  {
    const { sk, pk } = keygen('ML-DSA-65');
    const { pk: pk2 } = keygen('ML-DSA-65');
    const pkRaw2 = encodePK(pk2, 'ML-DSA-65');
    const sig = sign(sk, new Uint8Array([1,2,3]), new Uint8Array(0), 'ML-DSA-65');
    const sigRaw = encodeSig(sig, 'ML-DSA-65');
    const result = verify(pkRaw2, new Uint8Array([1,2,3]), sigRaw, new Uint8Array(0), 'ML-DSA-65');
    if (result) { ok = false; console.log('  FAIL wrong pk accepted'); }
    else console.log('  PASS wrong pk rejected');
  }

  if (ok) console.log('✅ verify: self-tests passed');
  else console.error('❌ verify: self-tests FAILED');
})();
