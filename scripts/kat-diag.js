#!/usr/bin/env node
/**
 * FIBEMATE × Jasmin KAT — 诊断：定位首个差异来源
 * 
 * 策略：逐层对比 — SHA3-512(d) → rho/sigma → samplePoly → A[0][0] → As+e → pk
 */
const crypto = { getRandomValues: null };
globalThis.crypto = crypto;

const { generateKeypair, encapsulate, decapsulate,
        PUBLIC_KEY_BYTES, SECRET_KEY_BYTES, CIPHERTEXT_BYTES, SHARED_SECRET_BYTES,
        sha3_512, sha3_256, shake128, shake256, samplePoly, polyMul, matVecMul, vecAdd, modAdd,
        byteEncode, cbd2 }
    = require('../packages/pqc-kem');

function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2)
        bytes[i >> 1] = parseInt(hex.substr(i, 2), 16);
    return bytes;
}

function printHex(label, bytes, n) {
    n = Math.min(n || 32, bytes.length);
    var s = '';
    for (var i = 0; i < n; i++) s += bytes[i].toString(16).padStart(2, '0');
    console.log('  ' + label + ': ' + s);
}

// Jasmin KAT — d(32) = first 32 bytes of JASMIN_COINS
var d = hexToBytes('7c9935a0b07694aa0c6d10e4db6b1add2fd81a25ccb148032dcd739936737f2d');

// Step 1: SHA3-512(d) → seed
var seed = sha3_512(d);
printHex('sha3_512(d)', seed);

var rho = seed.slice(0, 32);
var sigma = seed.slice(32, 64);
printHex('rho', rho);
printHex('sigma', sigma);

// Step 2: samplePoly(rho, (0<<8)|0) — first poly of A matrix
var a00 = samplePoly(rho, 0);
console.log('  A[0][0] first 8 coeffs: [' + 
    Array.from(a00.slice(0, 8)).map(function(x) { return x; }).join(', ') + ']');

// Step 3: Check cbd2(sigma, 0)
var s0 = cbd2(shake256(new Uint8Array([].slice.call(sigma).concat([0])), 128));
console.log('  s[0] first 8 coeffs: [' + 
    Array.from(s0.slice(0, 8)).map(function(x) { return x; }).join(', ') + ']');

// Step 4: Run full keygen with this seed
var callCount = 0;
crypto.getRandomValues = function(buf) {
    if (callCount === 0) {
        buf.set(hexToBytes('7c9935a0b07694aa0c6d10e4db6b1add2fd81a25ccb148032dcd739936737f2d'));
    } else {
        buf.set(hexToBytes('8626ed79d451140800e03b59b956f8210e556067407d13dc90fa9e8b872bfb8f'));
    }
    callCount++;
    return buf;
};

var kp = generateKeypair();
printHex('pk[0..32]', kp.publicKey);

// Jasmin expected pk first 32:
var jasmin_pk = hexToBytes(
    'a72c2d9c843ee9f8313ecc7f86d6294d59159d9a879a542e260922adf999051c' +
    'c45200c9ffdb60449c49465979272367c083a7d6267a3ed7a7fd47957c219327');

// Compare byteEncode output
console.log('\n=== byteEncode 诊断 ===');
var t0 = kp.publicKey.slice(0, 12).reduce(function(s, b) { return s + b.toString(16).padStart(2,'0'); }, '');
var t0_jasmin = jasmin_pk.slice(0, 12).reduce(function(s, b) { return s + b.toString(16).padStart(2,'0'); }, '');
console.log('  t[0] bytes 0-11: ' + t0 + ' (Jasmin: ' + t0_jasmin + ')');
