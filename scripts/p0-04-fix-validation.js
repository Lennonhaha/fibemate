// SPDX-License-Identifier: GPL-3.0-only
// P0-04: ML-KEM-768 roundtrip fix — comprehensive cross-copy validation
//
// Fix applied to: www/crypto/crypto/ml-kem-768.js
// - Changed 2-bit message encoding → FIPS 203 1-bit encoding
// - 100/100 PASS
//
// Other copies (packages/pqc-kem/src/, www/crypto/, public/crypto/crypto/):
// - packages/pqc-kem/src/ already uses correct 1-bit encoding + ceil(Q/2) = 1665
// - www/crypto/ uses correct 1-bit encoding + ceil(Q/2)
// - public/crypto/crypto/ has NO mPoly (different variant)
// - Only www/crypto/crypto/ml-kem-768.js was buggy (it's the main production file)
//
// Net: only the main production KEM file was affected. Fix is surgical.

const crypto = require('crypto');
const m = require('../www/crypto/crypto/ml-kem-768.js');

console.log('=== P0-04 Fix Validation ===\n');

// Core: 100x KEM roundtrip
let kemOk = 0, kemFail = 0;
for (let i = 0; i < 100; i++) {
    const kp = m.generateKeypair();
    const enc = m.encapsulate(kp.publicKey);
    const dec = m.decapsulate(kp.secretKey, enc.ciphertext);
    if (Buffer.from(enc.sharedSecret).equals(Buffer.from(dec))) kemOk++;
    else kemFail++;
}
console.log('KEM roundtrip (100x):', kemOk, 'PASS,', kemFail, 'FAIL');

// Consistency: same pk gives deterministic shared secret for fixed m (not directly testable without injecting m)
// Instead: verify distinct enc give distinct ss
const kp2 = m.generateKeypair();
const ssSet = new Set();
let allUnique = true;
for (let i = 0; i < 20; i++) {
    const enc = m.encapsulate(kp2.publicKey);
    const hex = Buffer.from(enc.sharedSecret).toString('hex');
    if (ssSet.has(hex)) { allUnique = false; }
    ssSet.add(hex);
}
console.log('Distinct SS per encaps (20x):', allUnique ? 'PASS (all unique)' : 'FAIL (collision)');

// Encryption non-determinism: ct+ss differ per call (same pk)
const enc1 = m.encapsulate(kp2.publicKey);
const enc2 = m.encapsulate(kp2.publicKey);
const ctDiff = !Buffer.from(enc1.ciphertext).equals(Buffer.from(enc2.ciphertext));
const ssDiff = !Buffer.from(enc1.sharedSecret).equals(Buffer.from(enc2.sharedSecret));
console.log('CT non-deterministic:', ctDiff ? 'PASS' : 'FAIL');
console.log('SS non-deterministic:', ssDiff ? 'PASS' : 'FAIL');

// Decrypt failure: tampered ct should fail with different ss (not null)
const enc3 = m.encapsulate(kp2.publicKey);
const badCt = new Uint8Array(enc3.ciphertext);
badCt[0] ^= 1; // flip 1 bit
const decBad = m.decapsulate(kp2.secretKey, badCt);
const badMatch = Buffer.from(enc3.sharedSecret).equals(Buffer.from(decBad));
console.log('Tampered ct → different ss:', !badMatch ? 'PASS' : 'FAIL (security issue!)');

// Key lengths
console.log('\n=== Key sizes ===');
console.log('pk:', m.PUBLIC_KEY_BYTES, 'bytes (spec: 1184)');
console.log('sk:', m.SECRET_KEY_BYTES, 'bytes (spec: 2400)');
console.log('ct:', m.CIPHERTEXT_BYTES, 'bytes (spec: 1088)');
console.log('ss:', m.SHARED_SECRET_BYTES, 'bytes (spec: 32)');

console.log('\n=== All tests complete ===');
