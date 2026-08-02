// SPDX-License-Identifier: GPL-3.0-only
/**
 * @fibemate/pqc-kem — ML-KEM-768 (FIPS 203)
 *
 * Dual-backend: C native addon (preferred) -> pure JS (fallback).
 */

const JS = require('./src/ml-kem-768');

// Native addon detection
let native = null;
try {
    native = require('./native/build/Release/mlkem.node');
    // Self-test
    const k = native.keygen();
    const e = native.encaps(k[0]);
    const d = native.decaps(e[0], k[1]);
    if (!Buffer.from(d).equals(e[1])) throw new Error('native self-test failed');
} catch (_) {
    /* fall through to JS */
}

const usingNative = !!native;

// Bridged API
function generateKeypair() {
    if (!native) return JS.generateKeypair();
    const [pk, sk] = native.keygen();
    return {
        publicKey:  new Uint8Array(pk.buffer, pk.byteOffset, pk.length),
        secretKey:  new Uint8Array(sk.buffer, sk.byteOffset, sk.length),
    };
}

function encapsulate(publicKey) {
    if (!native) return JS.encapsulate(publicKey);
    const [ct, ss] = native.encaps(publicKey);
    return {
        ciphertext:   new Uint8Array(ct.buffer, ct.byteOffset, ct.length),
        sharedSecret: Buffer.from(ss),
    };
}

function decapsulate(secretKey, ciphertext) {
    if (!native) return JS.decapsulate(secretKey, ciphertext);
    const buf = native.decaps(ciphertext, secretKey);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

module.exports = {
    usingNative,
    generateKeypair,
    encapsulate,
    decapsulate,
    HybridKeyExchange: require('./src/hybrid').HybridKeyExchange,
    get PUBLIC_KEY_BYTES()   { return JS.PUBLIC_KEY_BYTES; },
    get SECRET_KEY_BYTES()   { return JS.SECRET_KEY_BYTES; },
    get CIPHERTEXT_BYTES()   { return JS.CIPHERTEXT_BYTES; },
    get SHARED_SECRET_BYTES(){ return JS.SHARED_SECRET_BYTES; },
    // Algorithm agility — runtime parameter switching (forwarded from JS backend)
    get currentParamSet()    { return JS.currentParamSet; },
    loadParams:              JS.loadParams,
    listParamSets:           JS.listParamSets,
    getParams:               JS.getParams,
    MLKEM_PARAMS:            JS.MLKEM_PARAMS,
    compress:    JS.compress,
    decompress:  JS.decompress,
    byteEncode:  JS.byteEncode,
    byteDecode:  JS.byteDecode,
    polyMul:     JS.polyMul,
    vecAdd:      JS.vecAdd,
    vecDot:      JS.vecDot,
    matVecMul:   JS.matVecMul,
    modAdd:      JS.modAdd,
    modSub:      JS.modSub,
    modMul:      JS.modMul,
    samplePoly:  JS.samplePoly,
    sha3_256:    JS.sha3_256,
    sha3_512:    JS.sha3_512,
    shake128:    JS.shake128,
    shake256:    JS.shake256,
};
