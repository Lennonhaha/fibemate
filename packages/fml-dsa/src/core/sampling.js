// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/core/sampling.js
// FIPS 204 §5.1: XOF-based sampling functions
// ExpandA (§4, Algorithm 4) — generate matrix A of k×l polynomials from ρ
// ExpandS (§4, Algorithm 5) — generate secret vectors s1, s2 from σ
// ExpandMask (§4, Algorithm 6) — generate masking vector y from μ
// SampleInBall (§4, Algorithm 7) — sample τ ±1 coefficients for challenge c
// 2026-07-29

import { shake128, shake256, XofShake } from './shakestream.js';
import { shake256 as rawShake256 } from '@noble/hashes/sha3.js';
import { Q, N, MLDSA_PARAMS } from './params.js';
import { XOF128, genCrystals } from '@noble/post-quantum/_crystals.js';

const N_Q = { N, Q, F: 8347681, ROOT_OF_UNITY: 1753, brvBits: 8, isKyber: false };
const crystals = genCrystals({ newPoly: (n) => new Int32Array(n), ...N_Q });
const fibNtt = (a) => { const r = new Int32Array(a); crystals.NTT.encode(r); return r; };

// ══════════════════════════════════════════════
// Rejection-sampling polynomial from Noble XOF reader
// Exact mirror of Noble ml-dsa.js RejNTTPoly — returns time-domain poly
// ══════════════════════════════════════════════
function rejectionSamplePoly(xofRead) {
  const poly = new Int32Array(N);
  for (let idx = 0; idx < N;) {
    const b = xofRead();
    for (let i = 0; idx < N && i <= b.length - 3; i += 3) {
      const t = (b[i + 0] | (b[i + 1] << 8) | (b[i + 2] << 16)) & 0x7FFFFF;
      if (t < Q) poly[idx++] = t;
    }
  }
  // FIPS 204 §4 Algorithm 4: RejNTTPoly returns rejection-sampled polynomial.
  // The reference C Dilithium (ref/poly.c poly_uniform) does NOT NTT-encode here.
  // Match reference convention: return rejection-sampled poly in time domain.
  // Downstream code (sign.js/verify.js) explicitly NTT-encodes each aij before
  // using MultiplyNTTs, which makes our pipeline internally consistent.
  return poly;
}

// ══════════════════════════════════════════════
// (legacy) rejSample — kept for self-test reference only
// ══════════════════════════════════════════════
function rejSample(xof, dest) {
  let idx = 0;
  const batch = 840; // read 840 bytes = 280 attempts per batch
  while (idx < N) {
    const buf = xof(batch);
    for (let i = 0; i < batch - 2 && idx < N; i += 3) {
      const v = (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16)) & 0x7FFFFF;
      if (v < Q) dest[idx++] = v;
    }
  }
}

// ══════════════════════════════════════════════
// ExpandA: A = SHAKE-128(j‖i‖ρ) → k×l polys
// FIPS 204 Algorithm 4 — Noble-compatible: uses Noble's XOF128 engine
// so A matrix is byte-identical to @noble/post-quantum
// TODO: when keccak.js SHAKE-128 is validated against @noble/hashes, switch back to self-hosted
// ══════════════════════════════════════════════
export function expandA(rho, paramSet) {
  const { k, l } = MLDSA_PARAMS[paramSet];
  const A = Array.from({ length: k }, () => Array.from({ length: l }));

  const xof = XOF128(rho);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < l; j++) {
      const reader = xof.get(j, i); // Noble: column-first (j,i)
      A[i][j] = rejectionSamplePoly(reader);
    }
  }
  return A;
}

// ══════════════════════════════════════════════
// ExpandS: (s1, s2) = SHAKE-256(σ) → l+k polys, each coeff in [-η, η]
// FIPS 204 Algorithm 5
// For η=2 (ML-DSA-44): read 3 bits → 0..7 → reject ≥ 5, map {0,1,2,3,4} → {-2,-1,0,1,2}
// For η=4 (ML-DSA-65): read 4 bits → 0..15 → reject ≥ 9, map {0..8} → {-4..4}
// ══════════════════════════════════════════════
export function expandS(sigma, paramSet) {
  const { k, l, eta } = MLDSA_PARAMS[paramSet];
  const totalVecs = l + k;
  const result = [];

  for (let veci = 0; veci < totalVecs; veci++) {
    const seed = new Uint8Array(sigma.length + 2);
    seed.set(sigma, 0);
    seed[sigma.length] = veci & 0xFF;
    seed[sigma.length + 1] = (veci >> 8) & 0xFF;

    const poly = new Int32Array(N);
    if (eta === 2) {
      // 4-bit reads, reject ≥ 5
      sampleEta2(seed, poly);
    } else {
      // 4-bit reads, reject ≥ 9
      sampleEta4(seed, poly);
    }
    result.push(poly);
  }
  return result;
}

function sampleEta2(seed, dest) {
  let idx = 0;
  while (idx < N) {
    const buf = shake256(seed, 136); // 136B = 272 nibbles
    for (let i = 0; i < 136 && idx < N; i++) {
      const b0 = buf[i] & 0xF;
      const b1 = (buf[i] >> 4) & 0xF;
      // b0: low nibble → b0 % 5 → b0-2
      // b1: high nibble → b1 % 5 → b1-2
      if (b0 < 5) dest[idx++] = b0 - 2; // {0,1,2,3,4} → {-2,-1,0,1,2}
      if (b1 < 5 && idx < N) dest[idx++] = b1 - 2;
    }
  }
}

function sampleEta4(seed, dest) {
  let idx = 0;
  while (idx < N) {
    const buf = shake256(seed, 136);
    for (let i = 0; i < 136 && idx < N; i++) {
      const b0 = buf[i] & 0xF;
      const b1 = (buf[i] >> 4) & 0xF;
      if (b0 < 9) dest[idx++] = b0 - 4; // {0..8} → {-4..3,4}
      if (b1 < 9 && idx < N) dest[idx++] = b1 - 4;
    }
  }
}

// ══════════════════════════════════════════════
// ExpandMask: y = SHAKE-256(μ || κ) → l polys, coeff ∈ [-γ₁+1, γ₁-1]
// FIPS 204 Algorithm 6
// γ₁ = 2^17 (ML-DSA-44/65) or 2^19 (ML-DSA-65/87)
// Read 18 or 20 bits per coeff, reject if ≥ 2γ₁-1
// ══════════════════════════════════════════════
export function expandMask(mu, kappa, paramSet) {
  const { l, gamma1 } = MLDSA_PARAMS[paramSet];
  const seed = new Uint8Array(mu.length + kappa.length);
  seed.set(mu, 0);
  seed.set(kappa, mu.length);

  const result = [];
  for (let veci = 0; veci < l; veci++) {
    const s = new Uint8Array(seed.length + 2);
    s.set(seed, 0);
    s[seed.length] = veci & 0xFF;
    s[seed.length + 1] = (veci >> 8) & 0xFF;

    const poly = new Int32Array(N);
    // Determine bit-width: γ₁ = 2^17 → need 18-bit reads
    // γ₁ = 2^19 → need 20-bit reads
    const bits = gamma1 === (1 << 17) ? 18 : 20;
    const limit = 2 * gamma1 - 1;
    sampleMask(s, poly, bits, limit);
    result.push(poly);
  }
  return result;
}

function sampleMask(seed, dest, bits, limit) {
  let idx = 0;
  const bytesPerBatch = 256; // enough for many samples
  while (idx < N) {
    const buf = shake256(seed, bytesPerBatch);
    let bitPos = 0;
    for (let i = 0; i < buf.length - 3 && idx < N;) {
      // Read `bits` consecutive bits from buf
      const byteOff = bitPos >> 3;
      if (byteOff + 3 >= buf.length) { bitPos = 0; break; }
      // Quick: read 4 bytes, mask
      let val = buf[byteOff] | (buf[byteOff + 1] << 8) | (buf[byteOff + 2] << 16) | (buf[byteOff + 3] << 24);
      val = (val >> (bitPos & 7)) & ((1 << bits) - 1);
      bitPos += bits;
      if (val < limit) {
        dest[idx++] = val - (gamma1ForBits(bits) - 1);
      }
      i++;
    }
  }
}

function gamma1ForBits(bits) {
  return bits === 18 ? (1 << 17) : (1 << 19);
}

// ══════════════════════════════════════════════
// SampleInBall: c = SHAKE-256(μ) → N coeffs, exactly τ of them are ±1
// FIPS 204 Algorithm 7 — Noble-aligned: stream-fill N-τ zeros,
// use first 8 bytes as 64-bit mask to set τ positions to ±1,
// then Fisher-Yates shuffle
// ══════════════════════════════════════════════
export function sampleInBall(mu, paramSet) {
  const { tau } = MLDSA_PARAMS[paramSet];
  const BLOCK_LEN = 136; // SHAKE-256 block length
  const s = rawShake256.create({});
  s.update(mu);
  const buf = new Uint8Array(BLOCK_LEN);
  s.xofInto(buf);

  // Step 1: read masks (first 8 bytes = 64 sign bits)
  const masks = buf.slice(0, 8);

  // Step 2: rejection-sample τ coefficient positions, fill with ±1 (Noble ml-dsa.js L275-289)
  // For i = N-τ..N-1: sample b ∈ [0, i] by rejection; pre[i] = pre[b]; pre[b] = ±1
  const pre = new Int32Array(N);
  for (let i = N - tau, pos = 8, maskPos = 0, maskBit = 0; i < N; i++) {
    let b = i + 1;
    for (; b > i; ) {
      b = buf[pos++];
      if (pos < BLOCK_LEN) continue;
      s.xofInto(buf);
      pos = 0;
    }
    pre[i] = pre[b];
    pre[b] = 1 - (((masks[maskPos] >> maskBit++) & 1) << 1);
    if (maskBit >= 8) {
      maskPos++;
      maskBit = 0;
    }
  }

  // Step 3: return signed {-1, 0, 1} directly (Noble-compatible)
  // NTT is linear, so signed input is equivalent in Z_Q (after implicit mod Q)
  // and Noble's NTT implementation accepts signed input.
  return pre;
}

// ══════════════════════════════════════════════
// ChallengeHash: c̃ = H(tr || M) → τ bits in {0,1}^{256}
// FIPS 204 §5.1
// ══════════════════════════════════════════════
export function challengeHash(tr, msg) {
  const input = new Uint8Array(tr.length + msg.length);
  input.set(tr, 0);
  input.set(msg, tr.length);
  return shake256(input, 64); // 512 bits → SampleInBall
}

// ══════════════════════════════════════════════
// Self-tests
// ══════════════════════════════════════════════
(function selfTest() {
  let ok = true;

  // 1. ExpandA produces correct dimensions
  const rho = new Uint8Array(32);
  for (let i = 0; i < 32; i++) rho[i] = i;
  const A65 = expandA(rho, 'ML-DSA-65');
  ok = ok && A65.length === 6 && A65[0].length === 5;
  console.log(`  ${ok ? '✓' : '✗'} ExpandA(65): ${A65.length}×${A65[0].length}`);

  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 5; j++)
      ok = ok && A65[i][j] instanceof Int32Array && A65[i][j].length === 256;

  // All coefficients in [0, Q)
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 5; j++)
      for (let k = 0; k < 256; k++)
        ok = ok && A65[i][j][k] >= 0 && A65[i][j][k] < Q;

  // 2. ExpandS: η=2 → [-2,2]; η=4 → [-4,4]
  const sigma = new Uint8Array(64);
  for (let i = 0; i < 64; i++) sigma[i] = i + 0x40;

  let s44 = expandS(sigma, 'ML-DSA-44');
  ok = ok && s44.length === 8; // l=4 + k=4
  for (const p of s44) for (const v of p) ok = ok && v >= -2 && v <= 2;
  console.log(`  ${ok ? '✓' : '✗'} ExpandS(44): ${s44.length} polys, all ∈ [-2,2]`);

  let s65 = expandS(sigma, 'ML-DSA-65');
  ok = ok && s65.length === 11; // l=5 + k=6
  for (const p of s65) for (const v of p) ok = ok && v >= -4 && v <= 4;
  console.log(`  ${ok ? '✓' : '✗'} ExpandS(65): ${s65.length} polys, all ∈ [-4,4]`);

  // 3. ExpandA is deterministic
  const A44a = expandA(rho, 'ML-DSA-44');
  const A44b = expandA(rho, 'ML-DSA-44');
  let eqA = true;
  for (let i = 0; i < 4 && eqA; i++)
    for (let j = 0; j < 4 && eqA; j++)
      for (let k = 0; k < 256 && eqA; k++)
        eqA = A44a[i][j][k] === A44b[i][j][k];
  ok = ok && eqA;
  console.log(`  ${eqA ? '✓' : '✗'} ExpandA deterministic`);

  // 4. ChallengeHash produces 64 bytes
  const tr = new Uint8Array(32).fill(0xAA);
  const msg = new Uint8Array([0x01, 0x02]);
  const ch = challengeHash(tr, msg);
  ok = ok && ch.length === 64;
  console.log(`  ${ok ? '✓' : '✗'} ChallengeHash: ${ch.length}B`);

  if (ok) console.log('✅ sampling: self-tests passed');
  else throw new Error('sampling self-test FAILED');
})();
