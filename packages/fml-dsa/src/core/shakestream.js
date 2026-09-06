// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/core/shakestream.js
// SHAKE-128/256/256 + SHA3-256 — @noble/hashes backend
// Byte-identical to @noble/post-quantum's internal SHAKE engine
// FIPS 202 §6 / FIPS 204 §5.1
// 2026-07-30 (rebuilt for Noble interop)

import { shake128 as _nobleShake128, shake256 as _nobleShake256, sha3_256 as _nobleSha3_256 } from '@noble/hashes/sha3.js';

/**
 * SHAKE-128: extendable-output function (rate=168 bytes)
 * @param {Uint8Array} data — input bytes
 * @param {number} outLen — desired output length in bytes
 * @returns {Uint8Array} outLen bytes
 */
export function shake128(data, outLen) {
  return _nobleShake128(data, { dkLen: outLen });
}

/**
 * SHAKE-256: extendable-output function (rate=136 bytes)
 * @param {Uint8Array} data — input bytes
 * @param {number} outLen — desired output length in bytes
 * @returns {Uint8Array} outLen bytes
 */
export function shake256(data, outLen) {
  return _nobleShake256(data, { dkLen: outLen });
}

/**
 * SHA3-256: 256-bit hash
 * @param {Uint8Array} data
 * @returns {Uint8Array} 32 bytes
 */
export function sha3_256(data) {
  return _nobleSha3_256(data);
}

// ── XofShake: stream-correct SHAKE XOF (used by sampling.js for SampleInBall) ──
// Noble's shake256.create() supports one-shot digest() only, so we pre-squeeze
// a large buffer on absorb() and serve from it for all subsequent squeeze() calls.
export class XofShake {
  constructor(rate, padByte) {
    this._buf = null;
    this._pos = 0;
    this._blockSz = rate; // 136
  }

  absorb(data) {
    // One-shot digest into a large buffer (max needed: ~10 blocks for tau=96 worst case)
    const bigLen = this._blockSz * 10;
    this._buf = _nobleShake256.create({ dkLen: bigLen }).update(data).digest();
    this._pos = 0;
    return this;
  }

  squeeze(len) {
    if (!this._buf || this._pos + len > this._buf.length) {
      throw new Error(`XofShake.squeeze: buffer exhausted (need ${len}, have ${this._buf ? this._buf.length - this._pos : 0})`);
    }
    const slice = this._buf.slice(this._pos, this._pos + len);
    this._pos += len;
    return slice;
  }
}

// ── Self-test (FIPS 202 vectors) ──
function hex(s) {
  if (s === '') return new Uint8Array(0);
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) b[i / 2] = parseInt(s.substring(i, i + 2), 16);
  return b;
}

(function selfTest() {
  let ok = true;
  const eq = (label, got, exp) => {
    const g = Buffer.from(got).toString('hex');
    if (g !== exp) { ok = false; console.error(`  ✗ ${label}: ${g} ≠ ${exp}`); return false; }
    return true;
  };

  eq('SHAKE-128(∅,32)', shake128(new Uint8Array(0), 32),
    '7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26');

  // SHAKE-256(∅,64) → 64B
  eq('SHAKE-256(∅,64)', shake256(new Uint8Array(0), 64),
    '46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762fd75dc4ddd8c0f200cb05019d67b592f6fc821c49479ab48640292eacb3b7c4be');

  // SHA3-256("") — single block, lane empty
  eq('SHA3-256(∅)', sha3_256(new Uint8Array(0)),
    'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');

  if (ok) console.log('✅ shakestream: FIPS 202 self-tests passed');
  else throw new Error('shakestream self-test FAILED');
})();
