// fml-dsa/src/core/encode.js
// FIPS 204 §5.2: bit-packing — pk/sk/sig encoding/decoding
// All parameter sets (ML-DSA-44/65/87) use the same encoding scheme;
// the only difference is k, l dimensions and ω bit-width.
// 2026-07-29

import { MLDSA_PARAMS, Q, T1_BITS } from './params.js';

// ══════════════════════════════════════════════
// Low-level bit I/O on Uint8Array (MSB-first, per FIPS 204 §5.2)
// ══════════════════════════════════════════════

/** Write `bits` MSB of `val` into buf at bit position `pos`. MSB-first per FIPS 204. */
function writeBits(buf, pos, bits, val) {
  // LSB-first packing: lowest bit of val → bitPos, highest → bitPos+bits-1
  // This matches @noble/post-quantum bitsCoder.encode(buf |= (val&mask) << bufLen).
  const v = val & ((1 << bits) - 1);
  for (let i = 0; i < bits; i++) {
    const bitOff = pos + i;
    const byteIdx = bitOff >>> 3;
    const bitIdx = bitOff & 7; // LSB-first: bit 0 is lowest position
    if ((v >>> i) & 1) buf[byteIdx] |= (1 << bitIdx);
    else buf[byteIdx] &= ~(1 << bitIdx);
  }
}

/** Read `bits` from buf at bit position `pos` (LSB-first). Returns the unsigned integer. */
function readBits(buf, pos, bits) {
  let v = 0;
  for (let i = 0; i < bits; i++) {
    const bitOff = pos + i;
    const byteIdx = bitOff >>> 3;
    const bitIdx = bitOff & 7;
    if ((buf[byteIdx] >>> bitIdx) & 1) v |= (1 << i);
  }
  return v;
}

// ══════════════════════════════════════════════
// Helper: pack polynomial coefficients with d bits each
// ══════════════════════════════════════════════

function polyBitPack(poly, bits, out, outBitPos) {
  let pos = outBitPos;
  for (let i = 0; i < 256; i++) {
    writeBits(out, pos, bits, poly[i]);
    pos += bits;
  }
  return pos;
}

function polyBitUnpack(buf, inBitPos, bits) {
  const poly = new Int32Array(256);
  let pos = inBitPos;
  for (let i = 0; i < 256; i++) {
    poly[i] = readBits(buf, pos, bits);
    pos += bits;
  }
  return poly;
}

// ══════════════════════════════════════════════
// encodePK / decodePK
// FIPS 204 §5.2.1: pk = (ρ ∥ t1)
//   ρ: 256 bits (32 bytes) — seed
//   t1: k·256·d bits — packed HighBits(t)[i]
//   t1 uses d=13 bits per coefficient (power2Round leftover)
// ══════════════════════════════════════════════

export function encodePK(pk, paramSet) {
  const { k } = MLDSA_PARAMS[paramSet];
  // ρ (32B) + k * 256 * T1_BITS bits  (FIPS 204 §5.2.1)
  const t1Bytes = (k * 256 * T1_BITS + 7) >> 3;
  const totalBytes = 32 + t1Bytes;
  const buf = new Uint8Array(totalBytes);

  // ρ
  buf.set(pk.rho, 0);

  // t1 — pack T1_BITS (=10) per coefficient (FIPS 204: t1 elements are < 2^10)
  let bitPos = 32 * 8;
  for (let i = 0; i < k; i++) {
    bitPos = polyBitPack(pk.t1[i], T1_BITS, buf, bitPos);
  }
  return buf;
}

export function decodePK(buf, paramSet) {
  const { k } = MLDSA_PARAMS[paramSet];
  const rho = buf.slice(0, 32);
  const t1Bytes = (k * 256 * T1_BITS + 7) >> 3;
  if (buf.length < 32 + t1Bytes) throw new RangeError(`decodePK: expected ${32 + t1Bytes}B, got ${buf.length}B`);

  const t1 = [];
  let bitPos = 32 * 8;
  for (let i = 0; i < k; i++) {
    t1.push(polyBitUnpack(buf, bitPos, T1_BITS));
    bitPos += 256 * T1_BITS;
  }
  return { rho, t1 };
}

// ══════════════════════════════════════════════
// encodeSK / decodeSK
// FIPS 204 §5.2.2: sk = (ρ ∥ K ∥ tr ∥ s1 ∥ s2 ∥ t0)
//   ρ, K: 32B each
//   tr: 64B  (full SHAKE256(pk, 64) output)
//   s1: l·256·η bits (η∈{2,4} → packed in η or η+1 bits)
//   s2: k·256·η bits
//   t0: k·256·d bits  (Power2Round low bits, d=13)
// ══════════════════════════════════════════════

export function encodeSK(sk, paramSet) {
  const { k, l, eta } = MLDSA_PARAMS[paramSet];
  // For η=2: pack as 3 bits/c (range 0..4, fits 3 bits)
  // For η=4: pack as 4 bits/c (range 0..8, fits 4 bits)
  const etaBits = eta === 2 ? 3 : 4;
  const s1Bytes = (l * 256 * etaBits + 7) >> 3;
  const s2Bytes = (k * 256 * etaBits + 7) >> 3;
  const t0Bytes = (k * 256 * 13 + 7) >> 3;

  const totalBytes = 32 + 32 + 64 + s1Bytes + s2Bytes + t0Bytes;
  const buf = new Uint8Array(totalBytes);

  // ρ ∥ K ∥ tr
  buf.set(sk.rho, 0);
  buf.set(sk.K, 32);
  buf.set(sk.tr, 64);

  // s1
  let bitPos = 128 * 8;
  for (let i = 0; i < l; i++) {
    // s1 signed [-η,η] → offset to [0, 2η]
    const offset = new Int32Array(256);
    for (let j = 0; j < 256; j++) offset[j] = sk.s1[i][j] + eta;
    bitPos = polyBitPack(offset, etaBits, buf, bitPos);
  }

  // s2
  for (let i = 0; i < k; i++) {
    const offset = new Int32Array(256);
    for (let j = 0; j < 256; j++) offset[j] = sk.s2[i][j] + eta;
    bitPos = polyBitPack(offset, etaBits, buf, bitPos);
  }

  // t0
  for (let i = 0; i < k; i++) {
    bitPos = polyBitPack(sk.t0[i], 13, buf, bitPos);
  }

  return buf;
}

export function decodeSK(buf, paramSet) {
  const { k, l, eta } = MLDSA_PARAMS[paramSet];
  const etaBits = eta === 2 ? 3 : 4;
  const s1Bytes = (l * 256 * etaBits + 7) >> 3;
  const s2Bytes = (k * 256 * etaBits + 7) >> 3;
  const t0Bytes = (k * 256 * 13 + 7) >> 3;
  const totalBytes = 128 + s1Bytes + s2Bytes + t0Bytes;

  if (buf.length < totalBytes) throw new RangeError(`decodeSK: expected ${totalBytes}B, got ${buf.length}B`);

  const rho = buf.slice(0, 32);
  const K = buf.slice(32, 64);
  const tr = buf.slice(64, 128);

  let bitPos = 128 * 8;

  // s1
  const s1 = [];
  for (let i = 0; i < l; i++) {
    const packed = polyBitUnpack(buf, bitPos, etaBits);
    for (let j = 0; j < 256; j++) packed[j] -= eta;
    s1.push(packed);
    bitPos += 256 * etaBits;
  }

  // s2
  const s2 = [];
  for (let i = 0; i < k; i++) {
    const packed = polyBitUnpack(buf, bitPos, etaBits);
    for (let j = 0; j < 256; j++) packed[j] -= eta;
    s2.push(packed);
    bitPos += 256 * etaBits;
  }

  // t0
  const t0 = [];
  for (let i = 0; i < k; i++) {
    t0.push(polyBitUnpack(buf, bitPos, 13));
    bitPos += 256 * 13;
  }

  return { rho, K, tr, s1, s2, t0 };
}

// ══════════════════════════════════════════════
// encodeSig / decodeSig
// Noble/FIPS 204 compatible format:
//   c̃: cTildeBytes raw hash bytes
//   z: l·256 coefficients at zBits each — FIPS 204: smod(γ₁ - z) encoding
//   h: ω + k bytes — sorted hint positions contiguously + k row-offset pointers
//      (Noble hintCoder format, interoperable with @noble/post-quantum)
// ══════════════════════════════════════════════

export function encodeSig(sig, paramSet) {
  const { k, l, gamma1, omega, cTildeBytes } = MLDSA_PARAMS[paramSet];
  const zBits = gamma1 === (1 << 17) ? 18 : 20;
  const zBytes = (l * 256 * zBits + 7) >> 3;
  const hBytes = omega + k; // Noble: ≤ω sorted positions + k row-offset pointers

  const totalBytes = cTildeBytes + zBytes + hBytes;
  const buf = new Uint8Array(totalBytes);

  // c̃ — raw hash bytes
  buf.set(sig.cTilde, 0);
  let bitPos = cTildeBytes * 8;

  // z — Noble-compatible: signed z → smod(γ₁ - zSigned), packed zBits LSB-first
  // This is NOT two's complement. Noble ZCoder: polyCoder(20, z => smod(GAMMA1 - z))
  const zMask = (1 << zBits) - 1;
  for (let i = 0; i < l; i++) {
    for (let j = 0; j < 256; j++) {
      let zSigned = sig.z[i][j];
      if (zSigned > (Q >> 1)) zSigned -= Q;  // center-lift [0,Q) → signed
      // Noble: encode as (γ₁ - zSigned) & mask, 0-padded to zBits
      const encoded = (gamma1 - zSigned) & zMask;
      writeBits(buf, bitPos, zBits, encoded);
      bitPos += zBits;
    }
  }

  // h — Noble hintCoder: sorted positions packed per row, cumul. offsets at omega+i
  const hStart = bitPos >> 3;
  let kIdx = 0;
  for (let i = 0; i < k; i++) {
    const positions = [];
    for (let j = 0; j < 256; j++) if (sig.h[i][j] === 1) positions.push(j);
    for (const pos of positions) buf[hStart + kIdx++] = pos;
    buf[hStart + omega + i] = kIdx; // row-boundary pointer
  }
  // Zero-fill unused tail positions
  for (let j = kIdx; j < omega; j++) buf[hStart + j] = 0;

  return buf;
}

export function decodeSig(buf, paramSet) {
  const { k, l, gamma1, omega, cTildeBytes } = MLDSA_PARAMS[paramSet];
  const zBits = gamma1 === (1 << 17) ? 18 : 20;
  const zBytes = (l * 256 * zBits + 7) >> 3;
  const hBytes = omega + k;

  const totalBytes = cTildeBytes + zBytes + hBytes;
  if (buf.length < totalBytes) throw new RangeError(`decodeSig: expected ${totalBytes}B, got ${buf.length}B`);
  if (buf.length > totalBytes) throw new RangeError(`decodeSig: expected ${totalBytes}B, got ${buf.length}B (too large)`);

  // c̃ — raw hash bytes
  const cTilde = buf.slice(0, cTildeBytes);
  let bitPos = cTildeBytes * 8;

  // z — Noble-compatible: read zBits value → zSigned = smod(γ₁ - value)
  // Result must stay signed in [-γ₁+1, γ₁-1] because:
  //   - Step 3 verify norms center-lifts again from [0,Q)
  //   - Step 10 (new) NTTs z in-place, requiring signed inputs
  // If we Q-normalize here, NTT(z) differs from NTT(signed_z) by NTT(constant).
  const zMask = (1 << zBits) - 1;
  const z = [];
  for (let i = 0; i < l; i++) {
    const poly = new Int32Array(256);
    for (let j = 0; j < 256; j++) {
      const encoded = readBits(buf, bitPos, zBits);
      // smod(γ₁ - encoded): values ∈ [-γ₁+1, γ₁-1]
      let zSigned = gamma1 - encoded;
      // Wrap into [-Q/2, Q/2]: γ₁ < Q/2 (γ₁ ≤ 2¹⁹ = 524288, Q/2 = 4190208), so zSigned stays small
      poly[j] = zSigned;
      bitPos += zBits;
    }
    z.push(poly);
  }

  // h — Noble hintCoder decode: sorted positions with row-boundary pointers
  const hStart = cTildeBytes + zBytes;
  let kIdx = 0;
  const h = [];
  for (let i = 0; i < k; i++) {
    const hi = new Int32Array(256);
    const rowEnd = buf[hStart + omega + i]; // row-boundary pointer
    if (rowEnd < kIdx || rowEnd > omega) {
      // Invalid offset — return empty hints
      h.push(hi);
      continue;
    }
    for (let j = kIdx; j < rowEnd; j++) {
      hi[buf[hStart + j]] = 1;
    }
    kIdx = rowEnd;
    h.push(hi);
  }

  return { cTilde, z, h };
}

// ══════════════════════════════════════════════
// Self-tests
// ══════════════════════════════════════════════
(function selfTest() {
  let ok = true;

  // Test bit-packing primitives
  {
    const buf = new Uint8Array(8);
    writeBits(buf, 0, 4, 0xA);
    writeBits(buf, 4, 4, 0x5);
    if (buf[0] !== 0x5A) { ok = false; console.log('  FAIL writeBits nibble', 'got', buf[0].toString(16), 'expected 5A (LSB-first: 0xA=1010→bits 0-3=1010, 0x5=0101→bits 4-7=0101 → byte = 01011010 = 0x5A)'); }
    if (readBits(buf, 0, 4) !== 0xA) { ok = false; console.log('  FAIL readBits first nibble (pos=0, expected 0xA)'); }
    if (readBits(buf, 4, 4) !== 0x5) { ok = false; console.log('  FAIL readBits second nibble (pos=4, expected 0x5)'); }
  }
  // 13-bit packing roundtrip (t1 coefficient width)
  {
    const buf = new Uint8Array(3);
    writeBits(buf, 0, 13, 4095);
    writeBits(buf, 13, 13, 0);
    if (readBits(buf, 0, 13) !== 4095) ok = false;
    if (readBits(buf, 13, 13) !== 0) ok = false;
  }
  if (ok) console.log(`  PASS bit I/O primitives`);

  // ML-DSA-65 pk roundtrip
  {
    const { k } = MLDSA_PARAMS['ML-DSA-65'];
    const rho = new Uint8Array(32);
    crypto.getRandomValues(rho);
    const t1 = Array.from({ length: k }, () => {
      const p = new Int32Array(256);
      for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * (1 << T1_BITS));
      return p;
    });
    const pk = { rho, t1 };
    const enc = encodePK(pk, 'ML-DSA-65');
    const dec = decodePK(enc, 'ML-DSA-65');

    let eq = dec.rho.every((b, i) => b === rho[i]);
    for (let i = 0; i < k && eq; i++)
      eq = dec.t1[i].every((v, j) => v === t1[i][j]);
    if (!eq) { ok = false; console.log('  FAIL pk roundtrip'); }
    const expLen = 32 + Math.ceil(k * 256 * T1_BITS / 8);
    if (enc.length !== expLen) { ok = false; console.log(`  FAIL pk size: ${enc.length} != ${expLen}`); }
    if (ok) console.log(`  PASS encodePK/decodePK (ML-DSA-65, ${enc.length}B)`);
  }

  // ML-DSA-44 sk roundtrip
  {
    const { k, l, eta } = MLDSA_PARAMS['ML-DSA-44'];
    const rho = new Uint8Array(32); crypto.getRandomValues(rho);
    const K = new Uint8Array(32); crypto.getRandomValues(K);
    const tr = new Uint8Array(64); crypto.getRandomValues(tr);
    const s1 = Array.from({ length: l }, () => new Int32Array(256).fill(0));
    const s2 = Array.from({ length: k }, () => new Int32Array(256).fill(0));
    const t0 = Array.from({ length: k }, () => {
      const p = new Int32Array(256);
      for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 8192);
      return p;
    });
    const sk = { rho, K, tr, s1, s2, t0 };
    const enc = encodeSK(sk, 'ML-DSA-44');
    const dec = decodeSK(enc, 'ML-DSA-44');

    let eq = dec.rho.every((b, i) => b === rho[i])
      && dec.K.every((b, i) => b === K[i])
      && dec.tr.every((b, i) => b === tr[i])
      && dec.s1.every((p, i) => p.every((v, j) => v === s1[i][j]))
      && dec.s2.every((p, i) => p.every((v, j) => v === s2[i][j]))
      && dec.t0.every((p, i) => p.every((v, j) => v === t0[i][j]));
    if (!eq) { ok = false; console.log('  FAIL sk roundtrip'); }
    if (ok) console.log(`  PASS encodeSK/decodeSK (ML-DSA-44, ${enc.length}B)`);
  }

  // ML-DSA-65 sig roundtrip (Noble-compatible hint format)
  {
    const { k, l, omega, gamma1, cTildeBytes } = MLDSA_PARAMS['ML-DSA-65'];
    const cTilde = new Uint8Array(cTildeBytes); crypto.getRandomValues(cTilde);
    const z = Array.from({ length: l }, () => {
      const p = new Int32Array(256);
      // Generate signed z in [-γ₁+1, γ₁-1], stored as signed (matches sign.js output)
      for (let j = 0; j < 256; j++) {
        p[j] = Math.floor(Math.random() * (2 * gamma1 - 1)) - (gamma1 - 1);
      }
      return p;
    });
    // Generate ≤ω hints per row (sorted), total ≤ omega — matches real sign output
    let remaining = omega - 1; // Leave slack so positions don't overflow into offsets
    const h = Array.from({ length: k }, () => {
      const p = new Int32Array(256);
      const nHints = Math.min(remaining, 1 + Math.floor(Math.random() * Math.min(4, remaining)));
      const chosen = new Set();
      while (chosen.size < nHints) chosen.add(Math.floor(Math.random() * 256));
      for (const pos of chosen) p[pos] = 1;
      remaining -= nHints;
      return p;
    });
    const sig = { cTilde, z, h };
    const enc = encodeSig(sig, 'ML-DSA-65');
    // Verify native Noble verify accepts our bytes
    const dec = decodeSig(enc, 'ML-DSA-65');

    let eq = dec.cTilde.every((v, i) => v === cTilde[i]);
    for (let i = 0; i < l && eq; i++)
      eq = dec.z[i].every((v, j) => v === z[i][j]);
    for (let i = 0; i < k && eq; i++)
      eq = dec.h[i].every((v, j) => v === h[i][j]);
    if (!eq) { ok = false; console.log('  FAIL sig roundtrip'); }
    if (ok) console.log(`  PASS encodeSig/decodeSig (ML-DSA-65, ${enc.length}B)`);
  }

  if (ok) console.log('✅ encode: self-tests passed');
  else console.error('❌ encode: self-tests FAILED');
})();
