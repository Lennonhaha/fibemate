/**
 * Pre-commit / PR 轻量密码冒烟测试 — ML-KEM-768 + SM2 基础往返
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * ⚠️ 只验证合法输入：keygen→encaps→decaps 闭环 + SM2 签名验签。
 * 不跑 KAT、不跑 fuzz、不跑 TVLA（这些在 Nightly CI 里）。
 * 目标: < 2 秒，阻断明显的代码崩溃。
 */

'use strict';

let errors = 0;

function log(msg) { console.log(msg); }
function pass(msg) { console.log('  ✅ ' + msg); }
function fail(msg) { console.log('  ❌ ' + msg); errors++; }

// ─── ML-KEM-768 ──────────────────────────────────────────────
log('【ML-KEM-768】');

let MLKEM;
try {
    MLKEM = require('./packages/pqc-kem/src/ml-kem-768.js');
    pass('module loaded');
} catch (_e) {
    // try workspace-relative
    try {
        MLKEM = require('../packages/pqc-kem/src/ml-kem-768.js');
        pass('module loaded (workspace path)');
    } catch (e2) {
        fail('cannot load ml-kem-768.js: ' + e2.message);
        process.exit(1);
    }
}

// 1. Keygen
let kp;
try {
    kp = MLKEM.generateKeypair();
    if (kp.publicKey.length !== MLKEM.PUBLIC_KEY_BYTES) fail('pk size: ' + kp.publicKey.length + ' ≠ ' + MLKEM.PUBLIC_KEY_BYTES);
    else pass('keygen — pk=' + kp.publicKey.length + 'B sk=' + kp.secretKey.length + 'B');
} catch (_e) { fail('keygen threw: ' + _e.message); return process.exit(1); }

// 2. Encaps
let enc;
try {
    enc = MLKEM.encapsulate(kp.publicKey);
    if (enc.ciphertext.length !== MLKEM.CIPHERTEXT_BYTES) fail('ct size: ' + enc.ciphertext.length + ' ≠ ' + MLKEM.CIPHERTEXT_BYTES);
    else if (enc.sharedSecret.length !== MLKEM.SHARED_SECRET_BYTES) fail('ss size: ' + enc.sharedSecret.length + ' ≠ ' + MLKEM.SHARED_SECRET_BYTES);
    else pass('encaps — ct=' + enc.ciphertext.length + 'B ss=' + enc.sharedSecret.length + 'B');
} catch (_e) { fail('encaps threw: ' + _e.message); return process.exit(1); }

// 3. Decaps + roundtrip
try {
    const ss = MLKEM.decapsulate(kp.secretKey, enc.ciphertext);
    const ok = Buffer.compare(enc.sharedSecret, ss) === 0;
    ok ? pass('KEM roundtrip PASS') : fail('KEM roundtrip FAIL — ss mismatch');
} catch (_e) { fail('decaps threw: ' + _e.message); return process.exit(1); }

// 4. Multiple encap: distinct ciphertexts
try {
    const enc2 = MLKEM.encapsulate(kp.publicKey);
    const distinct = Buffer.compare(enc.ciphertext, enc2.ciphertext) !== 0;
    distinct ? pass('multiple encap → distinct ct') : fail('multiple encap → identical ct (bad)');
} catch (_e) { fail('second encap threw: ' + _e.message); }

// ─── SM2 签名/验签 ───────────────────────────────────────────
log('【SM2】');

let SM2;
try {
    // SM2 is optional — may not be in packages/ on this branch
    SM2 = require('../packages/pqc-kem/src/sm2-bigint-ec.js');
    pass('module loaded');
} catch (_e) {
    try { SM2 = require('./packages/pqc-kem/src/sm2-bigint-ec.js'); pass('module loaded'); }
    catch (_e2) {
        log('  ⬜ SM2 not found in packages/ — skipping (not available on this branch)');
    }
}

if (SM2) {
    try {
        const skpk = SM2.generateKeyPair();
        pass('SM2 keygen');

        const msg = Buffer.from('FIBEMATE smoke test');
        const sig = SM2.sign(msg, skpk.privateKey);
        const verified = SM2.verify(msg, sig, skpk.publicKey);
        verified ? pass('SM2 sign→verify PASS') : fail('SM2 sign→verify FAIL');

        const tampered = Buffer.from('tampered message');
        const tamperOk = SM2.verify(tampered, sig, skpk.publicKey);
        !tamperOk ? pass('SM2 tamper rejection PASS') : fail('SM2 tampered message verified (bad)');

    } catch (_e) { fail('SM2 threw: ' + _e.message); }
}

// ─── Summary ──────────────────────────────────────────────────
console.log('');
if (errors === 0) {
    console.log('✅ All smoke tests PASS');
    process.exit(0);
} else {
    console.log('❌ ' + errors + ' smoke test(s) FAILED');
    process.exit(1);
}
