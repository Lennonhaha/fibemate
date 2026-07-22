// SPDX-License-Identifier: GPL-3.0-only
// Verify: fix argument order for decapsulate(secretKey, ciphertext)
const MLKEM768 = require('../packages/pqc-kem/src/ml-kem-768.js');
const { ml_kem768 } = require('@noble/post-quantum/ml-kem.js');
const { spawnSync } = require('child_process');
const oqsPath = process.argv[2] || './oqs_gen';

function toHex(b) { return Buffer.from(b).toString('hex'); }
function fromHex(h) { return Buffer.from(h, 'hex'); }

// Test 1: noble keygen → noble encaps → JS decaps (SK, CT order!)
const keys = ml_kem768.keygen();
const enc = ml_kem768.encapsulate(keys.publicKey);
const decJS = MLKEM768.decapsulate(keys.secretKey, enc.cipherText);  // sk first!
console.log('Test1 (noble enc + JS dec):', toHex(decJS) === toHex(enc.sharedSecret));

// Test 2: liboqs encaps → JS decaps
for (let i = 0; i < 20; i++) {
    const keysJS = MLKEM768.generateKeypair();
    const r = spawnSync(oqsPath, ['encaps', toHex(keysJS.publicKey)], { timeout: 5000, encoding: 'utf8' });
    const { ct, ss: ssLib } = JSON.parse(r.stdout.trim());
    const dec = MLKEM768.decapsulate(keysJS.secretKey, fromHex(ct));  // sk first!
    if (!Buffer.from(dec).equals(fromHex(ssLib))) {
        console.log(`Test2[${i}] FAIL`);
        process.exit(1);
    }
}
console.log('Test2 (liboqs enc + JS dec): 20/20 PASS');

// Test 3: full 50-round bidirectional
let passA = 0, passB = 0;
for (let i = 0; i < 50; i++) {
    // A: JS keygen → liboqs encaps → JS decaps
    const kA = MLKEM768.generateKeypair();
    const rA = spawnSync(oqsPath, ['encaps', toHex(kA.publicKey)], { timeout: 5000, encoding: 'utf8' });
    const { ct: ctA, ss: ssA } = JSON.parse(rA.stdout.trim());
    const decA = MLKEM768.decapsulate(kA.secretKey, fromHex(ctA));
    if (Buffer.from(decA).equals(fromHex(ssA))) passA++;

    // B: liboqs keygen → JS encaps → liboqs decaps
    const rB = spawnSync(oqsPath, ['keygen'], { timeout: 5000, encoding: 'utf8' });
    const { pk: pkB, sk: skB } = JSON.parse(rB.stdout.trim());
    const encB = MLKEM768.encapsulate(fromHex(pkB));
    const rB2 = spawnSync(oqsPath, ['decaps', toHex(encB.ciphertext), skB], { timeout: 5000, encoding: 'utf8' });
    const { ss: ssB } = JSON.parse(rB2.stdout.trim());
    if (Buffer.from(encB.sharedSecret).equals(fromHex(ssB))) passB++;
}
console.log(`Test3: A=${passA}/50 B=${passB}/50`);
process.exit(passA === 50 && passB === 50 ? 0 : 1);
