// SPDX-License-Identifier: GPL-3.0-only
/**
 * @fibemate/sm2-ref — SM2 smoke test
 *
 * Imports the bundled CJS SM2 implementation from www/crypto/.
 * Verifies generateKeypair / encrypt / decrypt / sign / verify roundtrip.
 *
 * Run: node test/sm2-smoke.test.js
 * Or:  npm test   (from packages/sm2-ref/)
 */

'use strict';
const SM2 = require('../../../www/crypto/sm2-browser.cjs.js');

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

// Self-test (built-in selftest from the bundle)
console.log('Test 1: selftest...');
const st = SM2.selftest();
check(st.ok === true, 'selftest: ' + (st.err || 'OK'));

// Roundtrip: generate -> encrypt -> decrypt
console.log('Test 2: generateKeypair...');
const kp = SM2.generateKeypair();
check(kp && kp.privateKey && kp.publicKey, 'keypair has privateKey + publicKey');
check(kp.publicKey.length === 130, 'public key uncompressed 130 bytes: got ' + kp.publicKey.length);
check(kp.privateKey.length === 64, 'private key 64 hex chars: got ' + kp.privateKey.length);

console.log('Test 3: encrypt/decrypt...');
const msg = 'FIBEMATE-SM2-TEST';
const ct = SM2.encrypt(kp.publicKey, msg);
check(ct && ct.length > msg.length, 'ciphertext longer than plaintext');
const pt = SM2.decrypt(kp.privateKey, ct);
check(pt === msg, 'decrypt recovers original message');

console.log('Test 4: sign/verify...');
const sig = SM2.sign(kp.privateKey, msg);
check(sig && sig.length === 128, 'signature 128 hex chars: got ' + (sig ? sig.length : 'null'));
const v = SM2.verify(kp.publicKey, sig, msg);
check(v === true, 'signature verifies OK');

// GBT 32905-2016 standard test vectors for SM3 (included as secondary check)
console.log('Test 5: SM3 known-answer (GBT 32905)...');
const SM3 = require('../../../www/crypto/sm3-browser.js');
const tv0 = SM3.digestHex('abc');
check(tv0 === '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0', 'SM3 TV0 abc');

console.log('\n==================================================');
if (failed === 0) {
    console.log('PASS: ' + passed + ' tests passed');
} else {
    console.log('FAIL: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(1);
}
