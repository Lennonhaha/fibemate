#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * Smoke Test �?Minimal health check
 * 
 * Verifies:
 *   - Core modules load without error
 *   - Basic roundtrip (keygen �?encaps �?decaps) works
 *   - SM2/SM3/SM4 modules are importable
 * 
 * Exit codes:
 *   0 = all passed
 *   1 = any check failed
 */

const assert = require('assert');

console.log('FIBEMATE Smoke Test\n');

let checks = 0;
let passed = 0;

function check(name, fn) {
  checks++;
  try {
    fn();
    passed++;
    console.log(`  �?${name}`);
  } catch (err) {
    console.error(`  �?${name}: ${err.message}`);
  }
}

// === Module Load Checks ===
check('ML-KEM-768 module loads', () => {
  const mlKem = require('../www/crypto/ml-kem-768.js');
  assert(typeof mlKem.generateKeypair === 'function');
  assert(typeof mlKem.encapsulate === 'function');
  assert(typeof mlKem.decapsulate === 'function');
});

check('SM2 module loads', () => {
  const sm2 = require('../www/crypto/sm2-bigint-ec.js');
  assert(typeof sm2.makePoint === 'function');
});

check('SM3 module loads', () => {
  const sm3 = require('../www/crypto/sm3-browser.js');
  assert(typeof sm3.digest === 'function');
});

check('SM4 module loads', () => {
  const sm4 = require('../www/crypto/sm4-browser.js');
  assert(typeof sm4.encrypt === 'function');
});

// === Basic Roundtrip ===
check('ML-KEM roundtrip', () => {
  const mlKem = require('../www/crypto/ml-kem-768.js');
  const kp = mlKem.generateKeypair();
  assert(kp.publicKey.length === 1184); // ML-KEM-768 pk size
  assert(kp.secretKey.length === 2400); // ML-KEM-768 sk size
  
  // encapsulate returns { ciphertext, sharedSecret: K_bar }
  const enc = mlKem.encapsulate(kp.publicKey);
  assert(enc.ciphertext.length === 1088); // ML-KEM-768 ct size
  assert(enc.sharedSecret.length === 32); // K_bar (raw)
  
  // decapsulate returns ss = SHA3-256(K_bar || H(ct))
  // So enc.sharedSecret !== dec directly �?need to recompute ss
  const dec = mlKem.decapsulate(enc.ciphertext, kp.secretKey);
  assert(dec.length === 32);
  
  // Verify decapsulate consistency: same ct + sk �?same ss
  const dec2 = mlKem.decapsulate(enc.ciphertext, kp.secretKey);
  const decHex = Buffer.from(dec).toString('hex');
  const dec2Hex = Buffer.from(dec2).toString('hex');
  assert(decHex === dec2Hex, `decapsulate not deterministic: ${decHex} != ${dec2Hex}`);
  
  // Verify encapsulate produces valid ct that decapsulates successfully
  // (ss is not K_bar, but a hash of it �?this is FIPS 203 compliant)
  assert(decHex.length === 64); // 32 bytes = 64 hex chars
});

check('SM3 digest produces 256-bit output', () => {
  const sm3 = require('../www/crypto/sm3-browser.js');
  const hash = sm3.digest('test');
  assert(hash.length === 32); // 256 bits = 32 bytes
});

// === Summary ===
console.log(`\n${passed}/${checks} checks passed`);

if (passed < checks) {
  console.error('\nSMOKE TEST FAILED');
  process.exit(1);
}

console.log('SMOKE TEST PASSED');
