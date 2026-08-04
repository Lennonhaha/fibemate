// SPDX-License-Identifier: GPL-3.0-only
/**
 * @fibemate/sm4-ref — SM4 smoke test
 *
 * Imports SM4-GCM from www/crypto/sm4-browser.js.
 * Verifies encrypt/decrypt roundtrip and GCM auth tag.
 *
 * Run: node test/sm4-smoke.test.js
 * Or:  npm test   (from packages/sm4-ref/)
 */

'use strict';
const { encrypt, decrypt } = require('../../../www/crypto/sm4-browser.js');

let passed = 0, failed = 0;

function check(cond, label) {
    if (cond) {
        console.log('PASS: ' + label);
        passed++;
    } else {
        console.error('FAIL: ' + label);
        failed++;
    }
}

// 32 hex chars = 16 bytes (SM4 key requirement)
const key1 = '00112233445566778899aabbccddeeff';
const key2 = 'ffeeddccbbaa99887766554433221100';
const pt = 'Hello FIBEMATE SM4!';

// Test 1: basic encrypt/decrypt roundtrip
console.log('Test 1: SM4-GCM encrypt/decrypt roundtrip...');
// 24 hex chars = 12 bytes (GCM IV requirement)
const iv1 = 'fedcba9876543210fedcba00'; // 12 bytes
const enc = encrypt(pt, key1, { iv: iv1 });
check(enc && enc.ciphertext && enc.authTag, 'encrypt returns ciphertext + authTag');
check(enc.iv && enc.iv.length === 24, 'IV is 24 hex chars (12 bytes)');
// decrypt takes: decrypt(ciphertext, key, { iv, authTag }) — iv is hex string
const dec = decrypt(enc.ciphertext, key1, enc.iv, enc.authTag);
check(dec === pt, 'decrypt recovers plaintext');

// Test 2: different key produces different ciphertext
console.log('Test 2: different key produces different ciphertext...');
const iv2 = '1234567890abcdef12345678'; // 12 bytes
const enc2 = encrypt(pt, key2, { iv: iv2 });
check(enc2 && enc2.ciphertext, 'encrypt with key2 OK');
check(enc2.ciphertext !== enc.ciphertext, 'different key gives different ciphertext');

// Test 3: tampered ciphertext rejected
console.log('Test 3: tampered ciphertext detected...');
const tampered = enc.ciphertext.substring(0, 10) + 'FF' + enc.ciphertext.substring(12);
const bad = decrypt(tampered, key1, enc.iv, enc.authTag);
check(bad === null, 'tampered ciphertext returns null');

// Test 4: wrong key rejected
console.log('Test 4: wrong key rejected...');
const bad2 = decrypt(enc.ciphertext, key2, enc.iv, enc.authTag);
check(bad2 === null, 'wrong key returns null');

console.log('\n==================================================');
if (failed === 0) {
    console.log('PASS: ' + passed + ' tests passed');
} else {
    console.log('FAIL: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
}
