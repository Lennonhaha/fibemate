#!/usr/bin/env node
// fuzz/fuzz_encapsulate.cjs
// SPDX-License-Identifier: GPL-3.0-only
//
// OSS-Fuzz / jsfuzz entry point for ML-KEM-768 encapsulate().
// Fuzzes the public-key parsing + encapsulation path.
//
// Usage: jsfuzz fuzz/fuzz_encapsulate.cjs fuzz/corpus/
//   or: node --fuzz fuzz_encapsulate.cjs (< hex_input)

'use strict';

const { generateKeypair, encapsulate } = require('../packages/pqc-kem/src/ml-kem-768.js');

// Fixed keypair — reuse across all fuzz iterations
const kp = generateKeypair();
const PK = kp.publicKey; // 1184 bytes

/**
 * jsfuzz entry: receives Buffer, must not throw unhandled.
 * Strategy: splice fuzz data into public key at random offset.
 */
function fuzz(data) {
  if (!data || data.length === 0) return;

  try {
    // Mutation 1: replace a slice of the valid public key with fuzz bytes
    const offset = data[0] % PK.length;
    const len = Math.min(data.length - 1, PK.length - offset);
    if (len <= 0) return;

    const mutated = Buffer.alloc(PK.length);
    PK.copy(mutated);
    data.copy(mutated, offset, 1, 1 + len);

    encapsulate(mutated);
  } catch (_) {
    // Expected: invalid public keys should throw, not crash
  }

  try {
    // Mutation 2: totally random key of various lengths
    const rlen = Math.min(data.length, 2048);
    if (rlen > 0) {
      encapsulate(Buffer.from(data.slice(0, rlen)));
    }
  } catch (_) {}

  try {
    // Mutation 3: empty buffer edge case
    encapsulate(Buffer.alloc(0));
  } catch (_) {}
}

// jsfuzz expects module.exports.fuzz
module.exports = { fuzz };

// Standalone: pipe hex from stdin
if (require.main === module) {
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    const data = Buffer.from(Buffer.concat(chunks).toString().trim(), 'hex');
    fuzz(data);
    console.log('Fuzz pass OK');
  });
}
