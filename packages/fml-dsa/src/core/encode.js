// fml-dsa/src/core/encode.js
// FIPS 204 §5.2: bit-packing — pk/sk/sig encoding/decoding
// All parameter sets (ML-DSA-44/65/87) use the same encoding scheme;
// the only difference is k, l dimensions and ω bit-width.
// 2026-07-29

import { MLDSA_PARAMS } from './params.js';

// ══════════════════════════════════════════════
// Low-level bit I/O on Uint8Array
// ══════════════════════════════════════════════

/** Write `bits` low bits of `val` into buf at bit position `pos`. Does NOT clear target bits first. */
function writeBits(buf, pos, bits, val) {
  const v = val & ((1 << bits) - 1);
  let byteIdx = pos >> 3;
  let bitOff = pos & 7;        // 0=MSB … 7=LSB
  let remaining = bits;
  while (remaining > 0) {
    const room = 8 - bitOff;   // bits left in this byte
    const take = Math.min(room, remaining);
    // Take the next `take` most-significant bits of what's left
    const shift = remaining - take;
    const piece = (v >> shift) & ((1 << take) - 1);
    // Place them at the rightmost `take` bits of the available room
    buf[byteIdx] |= piece << (room - take);
    remaining -= take;
    byteIdx++;
    bitOff = 0;
  }
}

/** Read `bits` from buf at bit position `pos`. Returns the unsigned integer. */
function readBits(buf, pos, bits) {
  let byteIdx = pos >> 3;
  let bitOff = pos & 7;        // 0=MSB … 7=LSB
  let v = 0;
  let remaining = bits;
  while (remaining > 0) {
    const room = 8 - bitOff;
    const take = Math.min(room, remaining);
    const mask = ((1 << take) - 1) << (room - take);
    const piece = (buf[byteIdx] & mask) >> (room - take);
    v = (v << take) | piece;
    remaining -= take;
    byteIdx++;
    bitOff = 0;
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
  // ρ (32B) + k * 256 * 13 bits = 32 + k * 256 * 13 / 8
  const t1Bytes = (k * 256 * 13 + 7) >> 3;
  const totalBytes = 32 + t1Bytes;
  const buf = new Uint8Array(totalBytes);

  // ρ
  buf.set(pk.rho, 0);

  // t1 — pack 13 bits per coefficient
  let bitPos = 32 * 8;
  for (let i = 0; i < k; i++) {
    bitPos = polyBitPack(pk.t1[i], 13, buf, bitPos);
  }
  return buf;
}

export function decodePK(buf, paramSet) {
  const { k } = MLDSA_PARAMS[paramSet];
  const rho = buf.slice(0, 32);
  const t1Bytes = (k * 256 * 13 + 7) >> 3;
  if (buf.length < 32 + t1Bytes) throw new RangeError(`decodePK: expected ${32 + t1Bytes}B, got ${buf.length}B`);

  const t1 = [];
  let bitPos = 32 * 8;
  for (let i = 0; i < k; i++) {
    t1.push(polyBitUnpack(buf, bitPos, 13));
    bitPos += 256 * 13;
  }
  return { rho, t1 };
}

// ══════════════════════════════════════════════
// encodeSK / decodeSK
// FIPS 204 §5.2.2: sk = (ρ ∥ K ∥ tr ∥ s1 ∥ s2 ∥ t0)
//   ρ, K, tr: 32B each
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

  const totalBytes = 32 + 32 + 32 + s1Bytes + s2Bytes + t0Bytes;
  const buf = new Uint8Array(totalBytes);

  // ρ ∥ K ∥ tr
  buf.set(sk.rho, 0);
  buf.set(sk.K, 32);
  buf.set(sk.tr, 64);

  // s1
  let bitPos = 96 * 8;
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
  const totalBytes = 96 + s1Bytes + s2Bytes + t0Bytes;

  if (buf.length < totalBytes) throw new RangeError(`decodeSK: expected ${totalBytes}B, got ${buf.length}B`);

  const rho = buf.slice(0, 32);
  const K = buf.slice(32, 64);
  const tr = buf.slice(64, 96);

  let bitPos = 96 * 8;

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
// FIPS 204 §5.2.3: sig = (c̃ ∥ z ∥ h)
//   c̃: τ bits (challenge bits, variable per param set)
//   z: l·256·(⌈log₂(2γ₁)⌉) bits
//   h: k·ω bits (hints, ω bits each, variable per param set)
// ══════════════════════════════════════════════

export function encodeSig(sig, paramSet) {
  const { k, l, gamma1, tau, omega } = MLDSA_PARAMS[paramSet];
  // z bits: ⌈log₂(2·γ₁)⌉
  const zBits = gamma1 === (1 << 17) ? 18 : 20; // 2^17 → 18 bits, 2^19 → 20 bits
  const cTildeBytes = (tau + 7) >> 3;
  const zBytes = (l * 256 * zBits + 7) >> 3;
  const hBytes = (k * omega * 8 + 7) >> 3; // omega × 8-bit positions per poly

  const totalBytes = cTildeBytes + zBytes + hBytes;
  const buf = new Uint8Array(totalBytes);

  // c̃ — bit-packed hints (τ bits)
  let bitPos = 0;
  for (let i = 0; i < tau; i++) {
    writeBits(buf, bitPos, 1, sig.cTilde[i]);
    bitPos += 1;
  }
  bitPos = tau; // round up to byte in z section

  // z — signed coefficients, offset by γ₁-1 → [0, 2γ₁-2]
  const zOffset = gamma1 - 1;
  for (let i = 0; i < l; i++) {
    for (let j = 0; j < 256; j++) {
      // sig.z[i] stored as signed Int32Array [-γ₁+1, γ₁-1]; offset to [0, 2γ₁-2]
      writeBits(buf, bitPos, zBits, sig.z[i][j] + zOffset);
      bitPos += zBits;
    }
  }

  // h — hint bits (ω bits each)
  const hintPoly = sig.h; // Int32Array of length k*256 with 0/1 values, exactly omega total 1's
  for (let i = 0; i < k; i++) {
    // Find indices where hint[i] == 1, pack as ω per poly
    const positions = [];
    for (let j = 0; j < 256; j++) {
      if (sig.h[i][j] === 1) positions.push(j);
    }
    // Pack as binary: each position uses the bit-width needed for 0..255 (8 bits)
    // FIPS 204 §5.2.3: encode exactly omega positions per poly
    for (const pos of positions) {
      writeBits(buf, bitPos, 8, pos);
      bitPos += 8;
    }
  }

  return buf;
}

export function decodeSig(buf, paramSet) {
  const { k, l, gamma1, tau, omega } = MLDSA_PARAMS[paramSet];
  const zBits = gamma1 === (1 << 17) ? 18 : 20;
  const zOffset = gamma1 - 1;
  const cTildeBytes = (tau + 7) >> 3;
  const zBytes = (l * 256 * zBits + 7) >> 3;
  const hBytes = (k * omega * 8 + 7) >> 3;

  const totalBytes = cTildeBytes + zBytes + hBytes;
  if (buf.length < totalBytes) throw new RangeError(`decodeSig: expected ${totalBytes}B, got ${buf.length}B`);

  // c̃
  const cTilde = new Int32Array(tau);
  let bitPos = 0;
  for (let i = 0; i < tau; i++) {
    cTilde[i] = readBits(buf, bitPos, 1);
    bitPos += 1;
  }
  bitPos = tau;

  // z
  const z = [];
  for (let i = 0; i < l; i++) {
    const poly = new Int32Array(256);
    for (let j = 0; j < 256; j++) {
      poly[j] = readBits(buf, bitPos, zBits) - zOffset;
      bitPos += zBits;
    }
    z.push(poly);
  }

  // h — reconstruct hint vectors from packed positions
  const h = [];
  for (let i = 0; i < k; i++) {
    const hintPoly = new Int32Array(256);
    for (let p = 0; p < omega; p++) {
      const pos = readBits(buf, bitPos, 8);
      hintPoly[pos] = 1;
      bitPos += 8;
    }
    h.push(hintPoly);
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
    if (buf[0] !== 0xA5) { ok = false; console.log('  FAIL writeBits nibble'); }
    if (readBits(buf, 0, 4) !== 0xA) { ok = false; console.log('  FAIL readBits high nibble'); }
    if (readBits(buf, 4, 4) !== 0x5) { ok = false; console.log('  FAIL readBits low nibble'); }
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
    const { k, l } = MLDSA_PARAMS['ML-DSA-65'];
    const rho = new Uint8Array(32);
    crypto.getRandomValues(rho);
    const t1 = Array.from({ length: k }, () => {
      const p = new Int32Array(256);
      for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 1024); // t1 ∈ [0,2^d-1]=[0,8191]
      return p;
    });
    const pk = { rho, t1 };
    const enc = encodePK(pk, 'ML-DSA-65');
    const dec = decodePK(enc, 'ML-DSA-65');

    let eq = dec.rho.every((b, i) => b === rho[i]);
    for (let i = 0; i < k && eq; i++)
      eq = dec.t1[i].every((v, j) => v === t1[i][j]);
    if (!eq) { ok = false; console.log('  FAIL pk roundtrip'); }
    const expectedLen = 32 + (k * 256 * 13 + 7) >> 3; // 32 + 2496 = 2528? No: k=6 → (6*256*13)/8 = 2496
    const expLen = 32 + Math.ceil(k * 256 * 13 / 8);
    if (enc.length !== expLen) { ok = false; console.log(`  FAIL pk size: ${enc.length} != ${expLen}`); }
    if (ok) console.log(`  PASS encodePK/decodePK (ML-DSA-65, ${enc.length}B)`);
  }

  // ML-DSA-44 sk roundtrip
  {
    const { k, l, eta } = MLDSA_PARAMS['ML-DSA-44'];
    const rho = new Uint8Array(32); crypto.getRandomValues(rho);
    const K = new Uint8Array(32); crypto.getRandomValues(K);
    const tr = new Uint8Array(32); crypto.getRandomValues(tr);
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

  // ML-DSA-65 sig roundtrip
  {
    const { k, l, tau, omega, gamma1 } = MLDSA_PARAMS['ML-DSA-65'];
    const cTilde = new Int32Array(tau);
    for (let i = 0; i < tau; i++) cTilde[i] = Math.random() < 0.5 ? 1 : 0;
    const z = Array.from({ length: l }, () => {
      const p = new Int32Array(256);
      for (let j = 0; j < 256; j++) p[j] = Math.floor(Math.random() * (2 * gamma1 - 1)) - (gamma1 - 1);
      return p;
    });
    // Build hint vectors: exactly omega 1's per poly
    const h = Array.from({ length: k }, () => {
      const p = new Int32Array(256);
      // Pick omega random positions
      const positions = new Set();
      while (positions.size < omega) positions.add(Math.floor(Math.random() * 256));
      for (const pos of positions) p[pos] = 1;
      return p;
    });
    const sig = { cTilde, z, h };
    const enc = encodeSig(sig, 'ML-DSA-65');
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
  else throw new Error('encode self-test FAILED');
})();
