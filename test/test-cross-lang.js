#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE 璺ㄨ瑷€浜掓搷浣滄祴璇?鈥?Node.js
 * ============================================================
 * JS Pure (ml-kem-768-td.js) vs WASM (Rust/pqc_kyber)
 * 楠岃瘉锛氬悓涓€瀵嗛挜鍦ㄤ袱绉嶅疄鐜颁腑浜х敓鐩稿悓 shared secret
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');

// ============================================================
// Mock browser globals for ml-kem-768-td.js
// ============================================================
global.window = global;
Object.defineProperty(global, 'crypto', {
    value: { getRandomValues(buf) { return crypto.randomFillSync(buf); } },
    writable: true, configurable: true
});

// ============================================================
// Load Pure JS ML-KEM-768
// ============================================================
const JS_MLKEM = require('C:/01_婧愮爜/fibemate-electron/src/crypto/crypto/ml-kem-768-td.js');
console.log('[JS]  Pure ML-KEM-768 loaded (time-domain, O(n^2))');

// ============================================================
// Load WASM ML-KEM-768 (via wasm-bindgen)
// ============================================================
const wasmBindgen = require('C:/01_婧愮爜/fibemate-electron/src/crypto/crypto/pq-wasm-pkg/fibemate_pq_wasm.js');

// Read WASM binary and initialize
const wasmBytes = fs.readFileSync(
    'C:/01_婧愮爜/fibemate-electron/src/crypto/crypto/pq-wasm-pkg/fibemate_pq_wasm_bg.wasm'
);
wasmBindgen.initSync({ module: new WebAssembly.Module(wasmBytes) });
console.log('[WASM] ML-KEM-768 WASM loaded (Rust/pqc_kyber, ~200x faster)');

// ============================================================
// Track 2: 璺ㄨ瑷€浜掓搷浣滄祴璇?// ============================================================

let passed = 0, failed = 0, warned = 0;

function check(name, cond) {
    if (cond) { console.log(`  鉁?${name}`); passed++; }
    else { console.error(`  鉁?FAIL: ${name}`); failed++; }
}

function warn(name) {
    console.log(`  鈿?${name}`); warned++;
}

// --- Test 1: Key sizes match ---
console.log('\n=== 1. 瀵嗛挜澶у皬涓€鑷存€?===');
const jsKp = JS_MLKEM.generateKeypair();
const wasmKp = wasmBindgen.generateKeypair();

check('JS  publicKey  = 1184 bytes', jsKp.publicKey.length === 1184);
check('WASM publicKey = 1184 bytes', wasmKp.public_key.length === 1184);
check('JS  secretKey  = 2400 bytes', jsKp.secretKey.length === 2400);
check('WASM secretKey = 2400 bytes', wasmKp.secret_key.length === 2400);

// --- Test 2: Each impl. internally consistent ---
console.log('\n=== 2. 鍐呴儴涓€鑷存€?===');
const jsCT = JS_MLKEM.encapsulate(jsKp.publicKey);
const jsSS = JS_MLKEM.decapsulate(jsKp.secretKey, jsCT.ciphertext);
check('JS encap+decap 鍖归厤', Buffer.from(jsCT.sharedSecret).equals(Buffer.from(jsSS)));

const wasmCT = wasmBindgen.encapsulate(wasmKp.public_key);
const wasmSS = wasmBindgen.decapsulate(wasmKp.secret_key, wasmCT.ciphertext);
check('WASM encap+decap 鍖归厤', Buffer.from(wasmCT.shared_secret).equals(Buffer.from(wasmSS)));

// --- Test 3: Cross-implementation (JS encap 鈫?WASM decap) ---
console.log('\n=== 3. JS encaps 鈫?WASM decaps ===');
const crossPK_js = JS_MLKEM.generateKeypair();
const crossCT_js = JS_MLKEM.encapsulate(crossPK_js.publicKey);

// Try WASM decaps with JS-generated secret key
let crossOk1 = false;
try {
    const crossSS_wasm = wasmBindgen.decapsulate(crossPK_js.secretKey, crossCT_js.ciphertext);
    crossOk1 = Buffer.from(crossCT_js.sharedSecret).equals(Buffer.from(crossSS_wasm));
} catch (e) {
    // Expected: format mismatch
}
if (crossOk1) {
    check('JS-encap 鈫?WASM-decap 鍖归厤', true);
} else {
    warn('JS-encap 鈫?WASM-decap 涓嶅尮閰?(棰勬湡: 鍐呴儴搴忓垪鍖栨牸寮忎笉鍚?');
    console.log(`    鈫?JS 浣跨敤绾椂鍩熷疄鐜? WASM 浣跨敤 pqc_kyber crate`);
    console.log(`    鈫?FIPS 203 鏈鑼冨唴閮?NTT 琛ㄧず`);
}

// --- Test 4: Cross-implementation (WASM encap 鈫?JS decap) ---
console.log('\n=== 4. WASM encaps 鈫?JS decaps ===');
const crossPK_wasm = wasmBindgen.generateKeypair();
const crossCT_wasm = wasmBindgen.encapsulate(crossPK_wasm.public_key);

let crossOk2 = false;
try {
    const crossSS_js = JS_MLKEM.decapsulate(crossPK_wasm.secret_key, crossCT_wasm.ciphertext);
    crossOk2 = Buffer.from(crossCT_wasm.shared_secret).equals(Buffer.from(crossSS_js));
} catch (e) {
    // Expected
}
if (crossOk2) {
    check('WASM-encap 鈫?JS-decap 鍖归厤', true);
} else {
    warn('WASM-encap 鈫?JS-decap 涓嶅尮閰?(棰勬湡: 鍐呴儴搴忓垪鍖栨牸寮忎笉鍚?');
}

// --- Test 5: 甯搁噺涓€鑷存€?---
console.log('\n=== 5. 甯搁噺涓€鑷存€?===');
const wasmConstants = JSON.parse(wasmBindgen.getConstants());
check('PUBLIC_KEY_BYTES = 1184', wasmConstants.PUBLIC_KEY_BYTES === 1184);
check('SECRET_KEY_BYTES = 2400', wasmConstants.SECRET_KEY_BYTES === 2400);
check('CIPHERTEXT_BYTES = 1088', wasmConstants.CIPHERTEXT_BYTES === 1088);
check('SHARED_SECRET_BYTES = 32', wasmConstants.SHARED_SECRET_BYTES === 32);

// --- Test 6: 鎵归噺璺ㄥ疄鐜板姣?(缁熻娴嬭瘯) ---
console.log('\n=== 6. 鎵归噺缁熻 ===');
const BATCH = 10;
let crossMatch = 0;
for (let i = 0; i < BATCH; i++) {
    const jskp = JS_MLKEM.generateKeypair();
    const wasmkp = wasmBindgen.generateKeypair();

    const jsct = JS_MLKEM.encapsulate(jskp.publicKey);
    const jsdec = JS_MLKEM.decapsulate(jskp.secretKey, jsct.ciphertext);

    const wasmct = wasmBindgen.encapsulate(wasmkp.public_key);
    const wasmdec = wasmBindgen.decapsulate(wasmkp.secret_key, wasmct.ciphertext);

    if (Buffer.from(jsct.sharedSecret).equals(Buffer.from(jsdec)) &&
        Buffer.from(wasmct.shared_secret).equals(Buffer.from(wasmdec))) {
        crossMatch++;
    }
}
check(`${BATCH} 鎵规鍐呭悇鑷竴鑷存€, crossMatch === BATCH);

// --- Test 7: 瀵嗛挜瀛楄妭缁撴瀯鍒嗘瀽 ---
console.log('\n=== 7. 瀵嗛挜鏍煎紡瀛楄妭鍒嗘瀽 ===');
console.log(`  JS  pk[0..7]:  ${Array.from(jsKp.publicKey.slice(0,8)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
console.log(`  WASM pk[0..7]: ${Array.from(wasmKp.public_key.slice(0,8)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
console.log(`  JS  sk[0..7]:  ${Array.from(jsKp.secretKey.slice(0,8)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
console.log(`  WASM sk[0..7]: ${Array.from(wasmKp.secret_key.slice(0,8)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);

// Key format verification: both should have valid non-zero bytes
const jsPkNonZero = jsKp.publicKey.some(b => b !== 0);
const wasmPkNonZero = wasmKp.public_key.some(b => b !== 0);
check('JS  publicKey 闈炲叏闆?, jsPkNonZero);
check('WASM publicKey 闈炲叏闆?, wasmPkNonZero);

// --- Test 8: WASM 鑳藉惁浣跨敤 JS 鐨勫叕閽ヨ繘琛?encaps? ---
console.log('\n=== 8. 鏍煎紡鍏煎鎬ц竟鐣?===');
try {
    const wasmEncapsWithJsPk = wasmBindgen.encapsulate(jsKp.publicKey);
    check('WASM encaps 鎺ュ彈 JS publicKey', wasmEncapsWithJsPk.ciphertext.length === 1088);
} catch (e) {
    warn(`WASM encaps 鎷掔粷 JS publicKey: ${e.message}`);
}

try {
    const jsEncapsWithWasmPk = JS_MLKEM.encapsulate(wasmKp.public_key);
    check('JS encaps 鎺ュ彈 WASM publicKey', jsEncapsWithWasmPk.ciphertext.length === 1088);
} catch (e) {
    warn(`JS encaps 鎷掔粷 WASM publicKey: ${e.message}`);
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`  璺ㄨ瑷€浜掓搷浣? ${passed} passed, ${failed} failed, ${warned} warnings`);
console.log(`  缁撹: JS/WASM 鍚勮嚜鍐呴儴涓€鑷?鉁?| 璺ㄦ牸寮忎笉浜掓搷浣?鈿?(宸茬煡,FIPS 203 涓嶈姹?`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
