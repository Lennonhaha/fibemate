#!/usr/bin/env node
// fuzz/fuzz_decapsulate.cjs
// SPDX-License-Identifier: GPL-3.0-only
//
// OSS-Fuzz / jsfuzz entry point for ML-KEM-768 decapsulate().
// Fuzzes the secret-key parsing + decapsulation path.

'use strict';

const { generateKeypair, encapsulate, decapsulate } = require('../packages/pqc-kem/src/ml-kem-768.js');

const kp = generateKeypair();
const SK = kp.secretKey; // 2400 bytes
const { ciphertext: CT } = encapsulate(kp.publicKey); // 1088 bytes

function fuzz(data) {
  if (!data || data.length === 0) return;

  try {
    // Mutation 1: corrupt ciphertext
    if (data.length >= 2) {
      const offset = data[0] % CT.length;
      const len = Math.min(data.length - 1, CT.length - offset);
      if (len > 0) {
        const mutCt = Buffer.alloc(CT.length);
        CT.copy(mutCt);
        data.copy(mutCt, offset, 1, 1 + len);
        decapsulate(SK, mutCt);
      }
    }
  } catch (_) {}

  try {
    // Mutation 2: corrupt secret key
    const off2 = (data[0] || 0) % SK.length;
    const len2 = Math.min(data.length, SK.length - off2);
    if (len2 > 0) {
      const mutSk = Buffer.alloc(SK.length);
      SK.copy(mutSk);
      data.copy(mutSk, off2, 0, len2);
      decapsulate(mutSk, CT);
    }
  } catch (_) {}

  try {
    // Mutation 3: random-length fuzz input as ciphertext
    decapsulate(SK, Buffer.from(data.slice(0, Math.min(data.length, 2048))));
  } catch (_) {}

  try {
    // Mutation 4: both sk and ct corrupted
    decapsulate(data, data);
  } catch (_) {}
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
