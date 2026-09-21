// SPDX-License-Identifier: GPL-3.0-only
/**
 * @fibemate/pqc-kem — HybridKeyExchange unit test
 *
 * Exercises the ML-KEM-768 + ECDH-P-256 hybrid handshake in hybrid.js:
 *   - initialize() produces a 1184B KEM public key + 65B ECDH public key
 *   - encapsulateToPeer() / decapsulateFromPeer() recover an identical 32B secret
 *   - a tampered ciphertext yields a different shared secret
 *   - the exported ECDH public key is a valid uncompressed P-256 point
 *
 * Self-contained (no test runner / no external deps). Mirrors test/basic.test.js.
 *
 * Run: node test/hybrid.test.js
 * Or:  npm test   (from packages/pqc-kem/)
 */

'use strict';

const { HybridKeyExchange } = require('../src/hybrid');

// Known-correct FIPS 203 ML-KEM-768 byte lengths
const KEM_PK_BYTES   = 1184; // 384*3 + 32
const CT_BYTES       = 1088; // FIPS 203 ML-KEM-768
const SS_BYTES       = 32;
const ECDH_PK_BYTES  = 65;   // 0x04 || x(32) || y(32), uncompressed P-256

let passed = 0, failed = 0;

function byteLen(x) {
    // WebCrypto exportKey('raw') returns an ArrayBuffer; Node Buffer has .length
    return (x instanceof ArrayBuffer) ? x.byteLength : x.length;
}

function eq(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function is(val, len, name) {
    const actual = byteLen(val);
    if (actual !== len) {
        console.error('FAIL: ' + name + ' expected ' + len + ' bytes, got ' + actual);
        failed++;
    } else {
        passed++;
    }
}

(async () => {
    // Test 1: initialize() shapes
    console.log('Test 1: initialize()...');
    const alice = new HybridKeyExchange();
    const bob = new HybridKeyExchange();
    const ap = await alice.initialize();
    const bp = await bob.initialize();
    is(ap.kemPublicKey, KEM_PK_BYTES, 'alice KEM public key length');
    is(ap.ecdhPublicKey, ECDH_PK_BYTES, 'alice ECDH public key length');
    is(bp.kemPublicKey, KEM_PK_BYTES, 'bob KEM public key length');
    is(bp.ecdhPublicKey, ECDH_PK_BYTES, 'bob ECDH public key length');

    // Test 2: full handshake recovers an identical shared secret
    console.log('Test 2: handshake shared-secret agreement...');
    const enc = await alice.encapsulateToPeer(bp.kemPublicKey, bp.ecdhPublicKey);
    is(enc.ciphertext, CT_BYTES, 'ciphertext length');
    is(enc.sharedSecret, SS_BYTES, 'alice shared secret length');
    const ssBob = await bob.decapsulateFromPeer(enc.ciphertext, ap.ecdhPublicKey);
    is(ssBob, SS_BYTES, 'bob shared secret length');
    if (!eq(enc.sharedSecret, ssBob)) {
        console.error('FAIL: handshake shared secrets do not match');
        failed++;
    } else {
        passed++;
        console.log('  Alice and Bob agree on the 32-byte hybrid shared secret');
    }

    // Test 3: tampered ciphertext yields a different shared secret
    console.log('Test 3: tamper rejection...');
    const ct2 = enc.ciphertext.slice();
    ct2[0] ^= 0xFF; // flip first byte of the KEM ciphertext
    const ssBob2 = await bob.decapsulateFromPeer(ct2, ap.ecdhPublicKey);
    let tamperDetected = false;
    for (let i = 0; i < SS_BYTES; i++) {
        if (ssBob2[i] !== ssBob[i]) { tamperDetected = true; break; }
    }
    if (!tamperDetected) {
        console.error('FAIL: tampered ciphertext produced identical secret');
        failed++;
    } else {
        passed++;
        console.log('  Tamper correctly detected — decapsulate produced a different secret');
    }

    // Test 4: exported ECDH public key is a valid uncompressed P-256 point
    console.log('Test 4: ECDH public key importable as P-256...');
    try {
        await crypto.subtle.importKey(
            'raw', ap.ecdhPublicKey,
            { name: 'ECDH', namedCurve: 'P-256' },
            false, []
        );
        passed++;
        console.log('  alice ECDH public key imports cleanly as uncompressed P-256');
    } catch (e) {
        console.error('FAIL: ECDH public key not importable as P-256: ' + e.message);
        failed++;
    }

    // Test 5: independent handshakes are isolated (fresh keypairs each time)
    console.log('Test 5: cross-handshake isolation...');
    const carol = new HybridKeyExchange();
    const dave = new HybridKeyExchange();
    const cp = await carol.initialize();
    const dp = await dave.initialize();
    const enc2 = await carol.encapsulateToPeer(dp.kemPublicKey, dp.ecdhPublicKey);
    const ssDave = await dave.decapsulateFromPeer(enc2.ciphertext, cp.ecdhPublicKey);
    if (!eq(enc2.sharedSecret, ssDave)) {
        console.error('FAIL: second handshake shared secrets do not match');
        failed++;
    } else if (eq(enc2.sharedSecret, enc.sharedSecret)) {
        console.error('WARN: two independent handshakes produced identical secrets (statistically unlikely)');
        failed++;
    } else {
        passed++;
        console.log('  Second handshake agrees and differs from the first');
    }

    // Summary
    console.log('\n==================================================');
    if (failed === 0) {
        console.log('PASS: ' + passed + ' HybridKeyExchange tests passed');
    } else {
        console.log('FAIL: ' + passed + ' passed, ' + failed + ' failed');
        process.exit(1);
    }
})().catch((e) => {
    console.error('FATAL: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
});
