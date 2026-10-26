// SPDX-License-Identifier: Apache-2.0
/**
 * @fibemate/pqc-kem 鈥?ML-KEM-768 (FIPS 203)
 *
 * Dual-backend: C native addon (preferred) -> pure JS (fallback).
 */

const fs = require('fs');
const path = require('path');
const JS = require('./src/ml-kem-768');

// Native addon detection
//
// The addon is optional, but a silent downgrade is not. A load failure or a
// failed self-test used to be swallowed, so the process ran the pure JS backend
// with no trace of why -- and a transient fault stayed permanent for the life of
// the process. Both backends fail closed on a broken CSPRNG (see #344), so this
// is about diagnosability, not key material (#348).
const NATIVE_ADDON_PATH = './native/build/Release/mlkem.node';
const NATIVE_ADDON_FILE = path.join(__dirname, 'native', 'build', 'Release', 'mlkem.node');

function nativeSelfTest(addon) {
    const k = addon.keygen();
    const e = addon.encaps(k[0]);
    const d = addon.decaps(e[0], k[1]);
    if (!Buffer.from(d).equals(e[1])) throw new Error('native self-test failed');
}

function describe(err) {
    if (!err) return { code: null, message: 'unknown error' };
    return { code: err.code || null, message: err.message || String(err) };
}

/**
 * Load and self-test the addon. Returns the addon, or null plus the reason it
 * was rejected. Exported for tests: the two failure branches cannot be reached
 * on a machine where the addon is simply not built.
 */
function detectNative(opts) {
    const requireAddon = (opts && opts.require) || require;
    const addonExists = (opts && opts.exists) || (() => fs.existsSync(NATIVE_ADDON_FILE));

    let native = null;
    let fallback = null;

    try {
        native = requireAddon(NATIVE_ADDON_PATH);
    } catch (err) {
        // A missing addon is a supported configuration (Windows, JS-only
        // installs). An addon that is present but cannot be loaded is not.
        if (addonExists()) fallback = Object.assign({ stage: 'load' }, describe(err));
    }

    if (native) {
        try {
            nativeSelfTest(native);
        } catch (err) {
            fallback = Object.assign({ stage: 'self-test' }, describe(err));
            native = null;
        }
    }

    return { native, fallback };
}

const detected = detectNative();
const native = detected.native;
const nativeFallback = detected.fallback;

if (nativeFallback) {
    process.emitWarning(
        'native ML-KEM addon disabled (' + nativeFallback.stage + ': ' +
        (nativeFallback.code || nativeFallback.message) + '); using the pure JS backend',
        { code: 'FIBEMATE_PQC_KEM_JS_FALLBACK' }
    );
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
    nativeFallback,
    detectNative,
    generateKeypair,
    encapsulate,
    decapsulate,
    // Deterministic variants for KAT / ACVP vectors. Always the JS backend, even when the
    // native addon is present: the native addon takes (z, d) in the opposite order and has
    // its own harness (scripts/test-native-addon.cjs). Do not pass reused entropy.
    generateKeypairDerand: (d, z) => JS.generateKeypairDerand(d, z),
    encapsulateDerand: (publicKey, m) => JS.encapsulateDerand(publicKey, m),
    // Input validation, FIPS 203 §7.2 / §7.3. True means the key is well-formed for
    // the parameter set currently selected by loadParams().
    encapsKeyCheck: (ek) => JS.encapsKeyCheck(ek),
    decapsKeyCheck: (dk) => JS.decapsKeyCheck(dk),
    HybridKeyExchange: require('./src/hybrid').HybridKeyExchange,
    get PUBLIC_KEY_BYTES()   { return JS.PUBLIC_KEY_BYTES; },
    get SECRET_KEY_BYTES()   { return JS.SECRET_KEY_BYTES; },
    get CIPHERTEXT_BYTES()   { return JS.CIPHERTEXT_BYTES; },
    get SHARED_SECRET_BYTES(){ return JS.SHARED_SECRET_BYTES; },
    // Algorithm agility 鈥?runtime parameter switching (forwarded from JS backend)
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
