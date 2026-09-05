// SPDX-License-Identifier: GPL-3.0-only
// Test reg-server/hybrid-kem-client.js with the new sm2-bigint-ec dependency
const SM2 = require('./sm2-bigint-ec');

// Helper: hexToBytes (matches the one in reg-server)
function hexToBytes(hex) {
    const result = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return result;
}

// sm2GenerateKeypair from reg-server/hybrid-kem-client.js (updated)
function sm2GenerateKeypair() {
    const kp = SM2.generateKeyPair();
    // sm2-bigint-ec returns { privateKey: BigInt, publicKey: {x, y} }
    return {
        publicKey: hexToBytes(SM2.publicKeyToHex(kp.publicKey)),  // 65B: 0x04||x||y
        privateKey: hexToBytes(SM2.privateKeyToHex(kp.privateKey)) // 32B hex
    };
}

// sm2ECDH from reg-server/hybrid-kem-client.js (updated)
function sm2ECDH(privateKey, peerPublicKey) {
    const localPrivHex = Buffer.from(privateKey).toString('hex');
    const peerPubHex = Buffer.from(peerPublicKey).toString('hex');
    const sharedHex = SM2.doExchange(localPrivHex, peerPubHex);
    return hexToBytes(sharedHex);
}

// Run tests
const alice = sm2GenerateKeypair();
const bob = sm2GenerateKeypair();

console.log('Alice publicKey length:', alice.publicKey.length, '(expect 65)');
console.log('Alice privateKey length:', alice.privateKey.length, '(expect 32)');
console.log('First byte (should be 0x04):', '0x' + Buffer.from(alice.publicKey).toString('hex').slice(0,2));

const ss_alice = sm2ECDH(alice.privateKey, bob.publicKey);
const ss_bob = sm2ECDH(bob.privateKey, alice.publicKey);

console.log('ss_alice length:', ss_alice.length, '(expect 32)');
const match = Buffer.from(ss_alice).toString('hex') === Buffer.from(ss_bob).toString('hex');
console.log('ECDH symmetry:', match ? 'YES' : 'NO');
console.log('All tests:', (alice.publicKey.length === 65 && alice.privateKey.length === 32 && ss_alice.length === 32 && match) ? 'PASS' : 'FAIL');
