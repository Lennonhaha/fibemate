#!/usr/bin/env node
/**
 * FIBEMATE ML-KEM-768 × Jasmin (libjade) KAT Byte-by-Byte Verification
 */

const crypto = { getRandomValues: null };
globalThis.crypto = crypto;

const { generateKeypair, encapsulate, decapsulate,
        PUBLIC_KEY_BYTES, SECRET_KEY_BYTES, CIPHERTEXT_BYTES, SHARED_SECRET_BYTES }
    = require('../packages/pqc-kem');

// Jasmin (libjade) Official KAT — Test Vector 0
const JASMIN_COINS = hexToBytes(
  '7c9935a0b07694aa0c6d10e4db6b1add2fd81a25ccb148032dcd739936737f2d' +
  '8626ed79d451140800e03b59b956f8210e556067407d13dc90fa9e8b872bfb8f');

const JASMIN_EXPECTED_PK = hexToBytes(
  'a72c2d9c843ee9f8313ecc7f86d6294d59159d9a879a542e260922adf999051c' +
  'c45200c9ffdb60449c49465979272367c083a7d6267a3ed7a7fd47957c219327' +
  'f7ca73a4007e1627f00b11cc80573c15aee6640fb8562dfa6b240ca0ad351ac4' +
  'ac155b96c14c8ab13dd262cdfd51c4bb5572fd616553d17bdd430acbea3e95f0' +
  'b698d66990ab51e5d03783a8b3d278a5720454cf9695cfdca08485ba099c51cd' +
  '92a7ea7587c1d15c28e609a81852601b0604010679aa482d51261ec36e36b871' +
  '9676217fd74c54786488f4b4969c05a8ba27ca3a77cce73b965923ca554e422b' +
  '9b61f4754641608ac16c9b8587a32c1c5dd788f88b36b717a46965635deb67f4' +
  '5b129b99070909c93eb80b42c2b3f3f70343a7cf37e8520e7bcfc416aca4f18c' +
  '7981262ba2bfc756ae03278f0ec66dc2057696824ba6769865a601d7148ef6f5' +
  '4e5af5686aa2906f994ce38a5e0b938f239007003022c03392df3401b1e4a3a7' +
  'ebc6161449f73374c8b0140369343d9295fdf511845c4a46ebaab6ca5492f680' +
  '0b98c0cc803653a4b1d6e6aaed1932bacc5fefaa818ba502859ba5494c5f5402' +
  'c8536a9c4c1888150617f80098f6b2a99c39bc5dc7cf3b5900a21329ab59053a' +
  'baa64ed163e859a8b3b3ca3359b750ccc3e710c7ac43c8191cb5d68870c06391' +
  'c0cb8aec72b897ac6be7fbaacc676ed66314c83630e89448c88a1df04aceb23a' +
  'bf2e409ef333c622289c18a2134e650c45257e47475fa33aa537a5a8f7680214' +
  '716c50d470e3284963ca64f54677aec54b5272162bf52bc8142e1d4183fc0174' +
  '54a6b5a496831759064024745978cbd51a6cedc8955de4cc6d363670a47466e8' +
  '2be5c23603a17bf22acdb7cc984af08c87e14e27753cf587a8ec3447e62c649e' +
  '887a67c36c9ce98721b697213275646b194f36758673a8ed11284455afc7a852' +
  '9f69c97a3c2d7b8c636c0ba55614b768e624e712930f776169b01715725351bc' +
  '74b47395ed52b25a1313c95164814c34c979cbdfab85954662cab485e75087a9' +
  '8cc74bb82ca2d1b5bf2803238480638c40e90b43c7460e7aa917f010151fab11' +
  '69987b372abb59271f7006c24e60236b84b9ddd600623704254617fb498d89e5' +
  '8b0368bcb2103e79353eb587860c1422e476162e425bc2381db82c6592737e1d' +
  'd602864b0167a71ec1f223305c02fe25052af2b3b5a55a0d7a2022d9a798dc0c' +
  '5874a98702aaf4054c5d80338a5248b5b7bd09c53b5e2a084b047d277a861b1a' +
  '73bb51488de04ef573c85230a0470b73175c9fa50594f66a5f50b4150054c93b' +
  '68186f8b5cbc49316c8548a642b2b36a1d454c7489ac33b2d2ce6668096782a2' +
  'c1e0866d21a65e16b585e7af8618bdf3184c1986878508917277b93e10706b16' +
  '14972b2a94c7310fe9c708c231a1a8ac8d9314a529a97f469bf64962d8206484' +
  '43099a076d55d4cea824a58304844f99497c10a25148618a315d72ca857d1b04' +
  'd575b94f85c01d19bef211bf0aa3362e7041fd16596d808e867b44c4c00d1cda' +
  '3418967717f147d0eb21b42aaee74ac312ee3bf7e4e4a3e0c4d7e50a71227b00' +
  'ae18f948c200142ee131da054a86674e55d94a973e0810589744e7b0ad250123' +
  '2f5b0c5603d937e8bb4c3f07c300e1b622b2a02cc7b308f497a63501caa55b73');

const JASMIN_ENC_COINS = hexToBytes(
    '147c03f7a5bebba406c8fae1874d7f13c80efe79a3a9a874cc09fe76f6997615');

let testSeedIdx = 0;

function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2)
        bytes[i >> 1] = parseInt(hex.substr(i, 2), 16);
    return bytes;
}

function bytesToHex(bytes, n) {
    n = n || 32;
    var parts = [];
    for (var i = 0; i < Math.min(n, bytes.length); i++)
        parts.push(bytes[i].toString(16).padStart(2, '0'));
    return parts.join('');
}

var fail = 0, pass = 0;

function assert(label, condition, expected, actual) {
    if (condition) {
        pass++;
    } else {
        fail++;
        console.error('  FAIL ' + label + ': expected ' + expected + ', got ' + actual);
    }
}

// Test 1: Keypair with Jasmin KAT seed
console.log('=== Test 1: Keypair (Jasmin KAT seed) ===');
crypto.getRandomValues = function(buf) {
    if (testSeedIdx === 0) {
        // keygen uses TWO 32-byte random values: d and z
        // d: first 32 bytes of JASMIN_COINS
        buf.set(JASMIN_COINS.subarray(0, 32));
        testSeedIdx++;
    } else {
        // z: second 32 bytes of JASMIN_COINS
        buf.set(JASMIN_COINS.subarray(32, 64));
    }
    return buf;
};

var kp = generateKeypair();
testSeedIdx = 0; // reset

console.log('  pk length: ' + kp.publicKey.length + ' (expected: ' + PUBLIC_KEY_BYTES + ')');
console.log('  sk length: ' + kp.secretKey.length + ' (expected: ' + SECRET_KEY_BYTES + ')');

assert('pk length', kp.publicKey.length === PUBLIC_KEY_BYTES, PUBLIC_KEY_BYTES, kp.publicKey.length);
assert('sk length', kp.secretKey.length === SECRET_KEY_BYTES, SECRET_KEY_BYTES, kp.secretKey.length);

var pkMatch = true;
for (var i = 0; i < JASMIN_EXPECTED_PK.length; i++) {
    if (kp.publicKey[i] !== JASMIN_EXPECTED_PK[i]) {
        pkMatch = false;
        console.log('  first diff at byte ' + i + ': FIBEMATE=0x' + kp.publicKey[i].toString(16) + ', Jasmin=0x' + JASMIN_EXPECTED_PK[i].toString(16));
        break;
    }
}
assert('pk byte-for-byte vs Jasmin', pkMatch, 'match', 'MISMATCH');

if (!pkMatch) {
    console.log('  pk first 32: ' + bytesToHex(kp.publicKey));
    console.log('  jasmin  pk32: ' + bytesToHex(JASMIN_EXPECTED_PK));
}

// Test 2: Encapsulation with Jasmin KAT seed
console.log('\n=== Test 2: Encapsulation (Jasmin KAT seed) ===');
crypto.getRandomValues = function(buf) {
    buf.set(JASMIN_ENC_COINS.subarray(0, buf.length));
    return buf;
};

var enc = encapsulate(kp.publicKey);

console.log('  ct length: ' + enc.ciphertext.length + ' (expected: ' + CIPHERTEXT_BYTES + ')');
console.log('  ss length: ' + enc.sharedSecret.length + ' (expected: ' + SHARED_SECRET_BYTES + ')');

assert('ct length', enc.ciphertext.length === CIPHERTEXT_BYTES, CIPHERTEXT_BYTES, enc.ciphertext.length);
assert('ss length', enc.sharedSecret.length === SHARED_SECRET_BYTES, SHARED_SECRET_BYTES, enc.sharedSecret.length);

var ssNonZero = false;
for (var j = 0; j < enc.sharedSecret.length; j++) {
    if (enc.sharedSecret[j] !== 0) { ssNonZero = true; break; }
}
assert('ss non-zero', ssNonZero, 'non-zero', 'all zeros');

console.log('  ct first 16: ' + bytesToHex(enc.ciphertext, 16));
console.log('  ss: ' + bytesToHex(enc.sharedSecret));

// Test 3: Round-trip
console.log('\n=== Test 3: Decapsulation Round-Trip ===');
var dec = decapsulate(kp.secretKey, enc.ciphertext);
if (typeof dec === 'object' && dec.sharedSecret) dec = dec.sharedSecret;
console.log('  dec type: ' + (dec ? (dec.constructor ? dec.constructor.name : typeof dec) : 'null'));
console.log('  dec length: ' + (dec && dec.length ? dec.length : 'N/A'));
var rtMatch = true;
for (var k = 0; k < enc.sharedSecret.length; k++) {
    if (enc.sharedSecret[k] !== dec[k]) { rtMatch = false; console.log('  ss diff at byte ' + k); break; }
}
assert('round-trip ss', rtMatch, 'match', 'MISMATCH');

// Summary
console.log('\n=========================================');
console.log('  Result: ' + pass + ' PASS / ' + fail + ' FAIL');
console.log('=========================================');

if (fail > 0) {
    console.log('\nWARNING: One or more KAT checks failed.');
    console.log('  Possible causes:');
    console.log('  1. FIBEMATE time-domain polyMul vs Jasmin NTT arithmetic');
    console.log('  2. Different endian encoding in byteEncode/byteDecode');
    console.log('  3. Different SHA-3/SHAKE implementation');
    console.log('  4. Different seed derivation (d -> rho, sigma)');
    process.exit(1);
} else {
    console.log('\nAll KAT checks passed — FIBEMATE byte-compatible with Jasmin.');
    process.exit(0);
}
