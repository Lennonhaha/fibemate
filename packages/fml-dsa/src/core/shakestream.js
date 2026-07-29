// fml-dsa/src/core/shakestream.js
// SHAKE-128/256 ESM wrapper — wraps lib/keccak.js (CJS, BigInt Keccak-p[1600,24])
// FIPS 204 §5.1: all XOF calls use SHAKE-128 or SHAKE-256
// 2026-07-29

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const keccak = require('../../../../lib/keccak.js');

const { shake128: _shake128, shake256: _shake256, sha3_256: _sha3_256 } = keccak;

/**
 * SHAKE-128: extendable-output function (rate=168 bytes)
 * @param {Uint8Array} data — input bytes
 * @param {number} outLen — desired output length in bytes
 * @returns {Uint8Array} outLen bytes
 */
export function shake128(data, outLen) {
  return _shake128(data, outLen);
}

/**
 * SHAKE-256: extendable-output function (rate=136 bytes)
 * @param {Uint8Array} data — input bytes
 * @param {number} outLen — desired output length in bytes
 * @returns {Uint8Array} outLen bytes
 */
export function shake256(data, outLen) {
  return _shake256(data, outLen);
}

/**
 * SHA3-256: 256-bit hash (rate=136, capacity=256)
 * Used internally for H(msg) → 32 bytes in hybrid contexts
 * @param {Uint8Array} data
 * @returns {Uint8Array} 32 bytes
 */
export function sha3_256(data) {
  return _sha3_256(data);
}

// ── Self-test (FIPS 202 vectors, lightweight) ──
function hex(s) {
  if (s === '') return new Uint8Array(0);
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) b[i / 2] = parseInt(s.substring(i, i + 2), 16);
  return b;
}
function raw(s) {
  return new Uint8Array([...s].map(c => c.charCodeAt(0)));
}

(function selfTest() {
  let ok = true;
  const eq = (label, got, exp) => {
    const g = Buffer.from(got).toString('hex');
    if (g !== exp) { ok = false; console.error(`  ✗ ${label}: ${g} ≠ ${exp}`); return false; }
    return true;
  };

  // SHAKE-128 empty → 32B
  eq('SHAKE-128(∅,32)', shake128(hex(''), 32),
    '7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26');

  // SHAKE-256 empty → 64B
  eq('SHAKE-256(∅,64)', shake256(hex(''), 64),
    '46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762fd75dc4ddd8c0f200cb05019d67b592f6fc821c49479ab48640292eacb3b7c4be');

  // SHA3-256("abc") 
  eq('SHA3-256(abc)', sha3_256(raw('abc')),
    '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');

  if (ok) console.log('✅ shakestream: FIPS 202 self-tests passed');
  else throw new Error('shakestream self-test FAILED');
})();
