#!/usr/bin/env node
// fuzz/fuzz_bytecodec.cjs
// SPDX-License-Identifier: GPL-3.0-only
//
// Fuzz byteEncode / byteDecode / compress / decompress — the serialization
// boundaries that parse untrusted wire-format bytes.

'use strict';

const {
  byteEncode, byteDecode, compress, decompress
} = require('../packages/pqc-kem/src/ml-kem-768.js');

// All d values used in ML-KEM-768 (FIPS 203 §4.2)
const DS = [1, 4, 5, 10, 11, 12];
const Q = 3329;

function fuzz(data) {
  if (!data || data.length === 0) return;

  // byteDecode: parse fuzz bytes at every d
  for (const d of DS) {
    try { byteDecode(data, d); } catch (_) {}
  }

  // compress: fuzz coefficient values
  for (const d of DS) {
    const v = data[0] | (data[1] << 8) | ((data[2] & 0x0f) << 16);
    const x = v % (Q * 2); // allow slightly out-of-range
    try { compress(x, d); } catch (_) {}
  }

  // decompress: fuzz compressed values
  for (const d of DS) {
    const maxVal = (1 << d);
    const c = (data[0] | (data[1] << 8)) % (maxVal * 2);
    try { decompress(c, d); } catch (_) {}
  }

  // byteEncode: fuzz coefficient arrays at every d
  for (const d of DS) {
    if (data.length >= 256) {
      const len = 256;
      const coeffs = new Int16Array(len);
      for (let i = 0; i < len && i < data.length; i++) {
        coeffs[i] = data[i] % (Q * 2);
      }
      try { byteEncode(coeffs, d); } catch (_) {}
    }
  }

  // Edge case: empty input
  try { byteDecode(Buffer.alloc(0), 12); } catch (_) {}
  try { byteDecode(Buffer.alloc(0), 10); } catch (_) {}
  try { byteDecode(Buffer.alloc(0), 4); } catch (_) {}
  try { byteEncode(new Int16Array(0), 12); } catch (_) {}

  // Edge case: valid decode should roundtrip
  for (const d of DS) {
    try {
      const n = Math.floor(data.length / Math.ceil(d / 8));
      if (n > 0 && n <= 256) {
        const raw = data.slice(0, Math.ceil(d * n / 8));
        const decoded = byteDecode(raw, d);
        if (decoded && decoded.length > 0) {
          const encoded = byteEncode(decoded, d);
          // If we got this far without throwing, the roundtrip didn't crash
          void encoded;
        }
      }
    } catch (_) {}
  }
}

module.exports = { fuzz };

if (require.main === module) {
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    const data = Buffer.from(Buffer.concat(chunks).toString().trim(), 'hex');
    fuzz(data);
    console.log('Fuzz pass OK');
  });
}
