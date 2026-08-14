#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * C Native Addon test —ML-KEM-768
 * CI-safe: resolves addon path relative to this script or cwd.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Resolve addon path: try multiple locations
const candidates = [
  path.join(__dirname, '..', 'packages', 'pqc-kem', 'native', 'build', 'Release', 'mlkem.node'),
  path.join(process.cwd(), 'packages', 'pqc-kem', 'native', 'build', 'Release', 'mlkem.node'),
  path.join(process.cwd(), 'native', 'build', 'Release', 'mlkem.node'),
];
const addonPath = candidates.find(p => fs.existsSync(p));
if (!addonPath) {
  console.error('FATAL: mlkem.node not found. Tried:', candidates);
  process.exit(2);
}

const addon = require(addonPath);
console.log('Addon loaded:', Object.keys(addon).filter(k => typeof addon[k] === 'function').join(', '));

// Constants
assert.strictEqual(addon.PUBLICKEYBYTES, 1184, 'PUBLICKEYBYTES');
assert.strictEqual(addon.SECRETKEYBYTES, 2400, 'SECRETKEYBYTES');
assert.strictEqual(addon.CIPHERTEXTBYTES, 1088, 'CIPHERTEXTBYTES');
assert.strictEqual(addon.SSBYTES, 32, 'SSBYTES');
assert.strictEqual(addon.K, 3, 'K');
console.log('Constants: OK');

// keygen()
const [pk, sk] = addon.keygen();
assert(Buffer.isBuffer(pk) && pk.length === 1184);
assert(Buffer.isBuffer(sk) && sk.length === 2400);
console.log('keygen(): OK');

// encaps()
const [ct, ssEnc] = addon.encaps(pk);
assert(Buffer.isBuffer(ct) && ct.length === 1088);
assert(Buffer.isBuffer(ssEnc) && ssEnc.length === 32);
console.log('encaps(): OK');

// decaps(ct, sk) —N-API real order
const ssDec = addon.decaps(ct, sk);
assert(Buffer.isBuffer(ssDec) && ssDec.length === 32);
assert.ok(Buffer.from(ssEnc).equals(ssDec), 'shared secret match');
console.log('decaps(): OK');

// keygenDerand
const z = Buffer.alloc(64, 0x42);
const d = Buffer.alloc(32, 0x17);
const [pk2, sk2] = addon.keygenDerand(z, d);
assert(Buffer.isBuffer(pk2) && pk2.length === 1184);
assert(Buffer.isBuffer(sk2) && sk2.length === 2400);
console.log('keygenDerand(): OK');

// encapsDerand
const m = Buffer.alloc(32, 0x33);
const [ct2, ssEnc2] = addon.encapsDerand(pk2, m);
assert(Buffer.isBuffer(ct2) && ct2.length === 1088);
assert(Buffer.isBuffer(ssEnc2) && ssEnc2.length === 32);
const ssDec2 = addon.decaps(ct2, sk2);
assert.ok(Buffer.from(ssEnc2).equals(ssDec2), 'derand roundtrip');
console.log('encapsDerand(): OK');

// Batch roundtrip
const { ok, count } = addon.roundtrip_batch(1000);
assert.strictEqual(count, 1000);
assert.strictEqual(ok, 1000);
console.log('roundtrip_batch(1000): ' + ok + '/' + count + ' OK');

console.log('\nALL TESTS PASSED');
