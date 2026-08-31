// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE SM2 Multi-Signature — minimal SM3 (GB/T 32905-2016)
 * =============================================================
 * Self-contained SM3 hash for the sm2-multisig teaching package.
 *
 * Algorithm ported from FIBEMATE's verified sm3-browser.js (GB/T 32905-2016
 * compliant, KAT-validated against the standard test vector
 * SM3("abc") = 66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0).
 * Reference: GB/T 32905-2016 / GM/T 0004-2012.
 */
'use strict';

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
const P0 = (x) => (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0;
const P1 = (x) => (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0;

const IV = [
  0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
  0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e
];

const FF0 = (x, y, z) => (x ^ y ^ z) >>> 0;
const FF1 = (x, y, z) => ((x & y) | (x & z) | (y & z)) >>> 0;
const GG0 = (x, y, z) => (x ^ y ^ z) >>> 0;
const GG1 = (x, y, z) => ((x & y) | (~x & z)) >>> 0;
const T0 = 0x79cc4519;
const T1 = 0x7a879d8a;

function messageExpand(block) {
  const w = new Array(68);
  const w1 = new Array(64);
  for (let i = 0; i < 16; i++) {
    w[i] = ((block[i * 4] << 24) | (block[i * 4 + 1] << 16) |
      (block[i * 4 + 2] << 8) | block[i * 4 + 3]) >>> 0;
  }
  for (let i = 16; i < 68; i++) {
    const t = (w[i - 16] ^ w[i - 9] ^ rotl(w[i - 3], 15)) >>> 0;
    w[i] = (P1(t) ^ rotl(w[i - 13], 7) ^ w[i - 6]) >>> 0;
  }
  for (let i = 0; i < 64; i++) w1[i] = (w[i] ^ w[i + 4]) >>> 0;
  return { w, w1 };
}

function compress(v, block) {
  const { w, w1 } = messageExpand(block);
  let A = v[0], BB = v[1], C = v[2], D = v[3];
  let E = v[4], F = v[5], G = v[6], H = v[7];

  for (let j = 0; j < 64; j++) {
    const T = j < 16 ? T0 : T1;
    const FF = j < 16 ? FF0 : FF1;
    const GG = j < 16 ? GG0 : GG1;
    const SS1 = rotl((rotl(A, 12) + E + rotl(T, j % 32)) & 0xffffffff, 7);
    const SS2 = (SS1 ^ rotl(A, 12)) >>> 0;
    const TT1 = (FF(A, BB, C) + D + SS2 + w1[j]) >>> 0;
    const TT2 = (GG(E, F, G) + H + SS1 + w[j]) >>> 0;
    D = C;
    C = rotl(BB, 9);
    BB = A;
    A = TT1;
    H = G;
    G = rotl(F, 19);
    F = E;
    E = P0(TT2);
  }

  return [
    (v[0] ^ A) >>> 0, (v[1] ^ BB) >>> 0, (v[2] ^ C) >>> 0, (v[3] ^ D) >>> 0,
    (v[4] ^ E) >>> 0, (v[5] ^ F) >>> 0, (v[6] ^ G) >>> 0, (v[7] ^ H) >>> 0
  ];
}

/**
 * SM3 digest.
 * @param {Uint8Array|string} input
 * @returns {Uint8Array} 32-byte digest
 */
function sm3(input) {
  let bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  const len = bytes.length;
  const bitLen = len * 8;
  const padded = new Uint8Array((len + 1 + 8 + 63) & ~63);
  padded.set(bytes);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);

  let state = IV.slice();
  for (let off = 0; off < padded.length; off += 64) {
    state = compress(state, padded.subarray(off, off + 64));
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (state[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (state[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (state[i] >>> 8) & 0xff;
    out[i * 4 + 3] = state[i] & 0xff;
  }
  return out;
}

module.exports = { sm3 };
