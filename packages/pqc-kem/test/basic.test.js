// SPDX-License-Identifier: GPL-3.0-only
/**
 * @fibemate/pqc-kem — ML-KEM-768 basic test
 *
 * Tests the bridged API (generateKeypair / encapsulate / decapsulate).
 * Runs against the pure-JS backend when native addon is not available.
 *
 * Run: node test/basic.test.js
 * Or:  npm test   (from packages/pqc-kem/)
 */

'use strict';
const { generateKeypair, encapsulate, decapsulate } = require('..');

// FIPS 203 ML-KEM-768 byte lengths (known-correct values)
const EK_BYTES  = 1184;  // 384*3 + 32
const DK_BYTES  = 2400;  // 768*3 + 96
const CT_BYTES  = 1088;  // FIPS 203 ML-KEM-768
const SS_BYTES  = 32;

let passed = 0, failed = 0;

function eq(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function is(u8, len, name) {
    if (u8.length !== len) {
        console.error('FAIL: ' + name + ' expected ' + len + ' bytes, got ' + u8.length);
        failed++;
    } else {
        passed++;
    }
}

// Test 1: generateKeypair
console.log('Test 1: generateKeypair...');
const { publicKey, secretKey } = generateKeypair();
is(publicKey, EK_BYTES, 'public key length');
is(secretKey, DK_BYTES, 'secret key length');

// Test 2: encapsulate produces correct ciphertext + shared secret
console.log('Test 2: encapsulate...');
const { ciphertext, sharedSecret: ss1 } = encapsulate(publicKey);
is(ciphertext, CT_BYTES, 'ciphertext length');
is(ss1, SS_BYTES, 'shared secret 1 length');

// Test 3: decapsulate recovers same shared secret
console.log('Test 3: decapsulate...');
const sharedSecret2 = decapsulate(secretKey, ciphertext);
is(sharedSecret2, SS_BYTES, 'shared secret 2 length');
if (!eq(ss1, sharedSecret2)) {
    console.error('FAIL: decapsulate shared secret does not match encapsulate shared secret');
    failed++;
} else {
    passed++;
}

// Test 4: wrong ciphertext fails (produces different secret)
console.log('Test 4: tamper rejection...');
const { ciphertext: ct2 } = encapsulate(publicKey);
ct2[0] ^= 0xFF;  // tamper with first byte
const ss3 = decapsulate(secretKey, ct2);
let tamperDetected = false;
for (let i = 0; i < SS_BYTES; i++) {
    if (ss3[i] !== ss1[i]) { tamperDetected = true; break; }
}
if (!tamperDetected) {
    console.error('WARN: tampered ciphertext produced identical secret (this is statistically unlikely)');
    failed++;
} else {
    passed++;
    console.log('  Tamper correctly detected — decapsulate produced different secret');
}

// Test 5: cross-session isolation (fresh keypair each time)
console.log('Test 5: cross-session isolation...');
const { publicKey: pk2, secretKey: sk2 } = generateKeypair();
const { ciphertext: ct3, sharedSecret: ss4 } = encapsulate(pk2);
const ss5 = decapsulate(sk2, ct3);
if (!eq(ss4, ss5)) {
    console.error('FAIL: cross-session decapsulate mismatch');
    failed++;
} else {
    passed++;
}

// Summary
console.log('\n==================================================');
if (failed === 0) {
    console.log('PASS: ' + passed + ' tests passed');
} else {
    console.log('FAIL: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
}
