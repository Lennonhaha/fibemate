// SPDX-License-Identifier: GPL-3.0-only
// Noble vs JS: decapsulate same ct+sk
const MLKEM768 = require('../packages/pqc-kem/src/ml-kem-768.js');
const { ml_kem768 } = require('@noble/post-quantum/ml-kem.js');

function toHex(b) { return Buffer.from(b).toString('hex'); }

const keys = ml_kem768.keygen();
const enc = ml_kem768.encapsulate(keys.publicKey);

// Use EXACTLY noble's keys (converted to Uint8Array)
const pkN = keys.publicKey;
const skN = keys.secretKey;
const ctN = enc.cipherText;

// Noble decaps
const decN = ml_kem768.decapsulate(ctN, skN);
console.log('noble decaps:', toHex(decN));
console.log('noble enc ss:', toHex(enc.sharedSecret));
console.log('noble self:', toHex(decN) === toHex(enc.sharedSecret));

// JS decaps (same inputs, Uint8Array format)
const decJS = MLKEM768.decapsulate(new Uint8Array(ctN), new Uint8Array(skN));
console.log('JS decaps:', toHex(decJS));

// Now test: JS keygen, then noble encaps, then JS decaps
const keysJS = MLKEM768.generateKeypair();
const encN2 = ml_kem768.encapsulate(keysJS.publicKey);
const decJS2 = MLKEM768.decapsulate(encN2.cipherText, keysJS.secretKey);
console.log('JS keygen + noble encaps + JS decaps:', toHex(decJS2));
console.log('noble enc ss:', toHex(encN2.sharedSecret));
console.log('match?', toHex(decJS2) === toHex(encN2.sharedSecret));

// And the other direction: noble keygen + JS encaps + noble decaps
const keysN2 = ml_kem768.keygen();
const encJS = MLKEM768.encapsulate(keysN2.publicKey);
const decN2 = ml_kem768.decapsulate(encJS.ciphertext, keysN2.secretKey);
console.log('noble keygen + JS encaps + noble decaps:', toHex(decN2));
console.log('JS enc K_bar:', toHex(encJS.sharedSecret));
console.log('match?', toHex(decN2) === toHex(encJS.sharedSecret));
