// SPDX-License-Identifier: GPL-3.0-only
// P0-04: Fix ml-kem-768.js KEM roundtrip — step-by-step data-flow trace
const m = require('../www/crypto/crypto/ml-kem-768.js');

// Use fixed randomness for reproducibility 
// (can't without internal access — so trace one roundtrip manually)

const kp = m.generateKeypair();
const pk = kp.publicKey;
const sk = kp.secretKey;

// Manual trace: writing the steps inline to check intermediate values
const crypto = require('crypto');

// =========================================
// Read the source and add instrumentation
// =========================================
const fs = require('fs');
let code = fs.readFileSync('../www/crypto/crypto/ml-kem-768.js', 'utf8');

// Instrument encapsulate: log m and K_bar
code = code.replace(
  'const m=crypto.getRandomValues(new Uint8Array(32));',
  'const m=crypto.getRandomValues(new Uint8Array(32));\n    console.log("ENC m:",Buffer.from(m).toString("hex"));'
).replace(
  'const K_bar=sha3_256(new Uint8Array([...m,...h]))',
  'const K_bar=sha3_256(new Uint8Array([...m,...h]));\n    console.log("ENC K_bar:",Buffer.from(K_bar).toString("hex"));'
).replace(
  'const ss=sha3_256(new Uint8Array([...K_bar,...sha3_256(ct)]))',
  'const ss=sha3_256(new Uint8Array([...K_bar,...sha3_256(ct)]));\n    console.log("ENC ss:",Buffer.from(ss).toString("hex"));'
);

// Instrument decapsulate: log mPrime and K_bar_prime
code = code.replace(
  'const mPrime=new Uint8Array(32);',
  'const mPrime=new Uint8Array(32);\n    /* DBG slot */'
).replace(
  'for(let i=0;i<256;i++) mPrime[i>>2]|=mpc[i]<<(2*(i&3));',
  'for(let i=0;i<256;i++) mPrime[i>>2]|=mpc[i]<<(2*(i&3));\n    console.log("DEC mPrime:",Buffer.from(mPrime).toString("hex"));'
).replace(
  'const K_bar_prime=sha3_256(new Uint8Array([...mPrime,...h]))',
  'const K_bar_prime=sha3_256(new Uint8Array([...mPrime,...h]));\n    console.log("DEC K_bar_prime:",Buffer.from(K_bar_prime).toString("hex"));'
).replace(
  'return ss2;',
  'console.log("DEC ss2:",Buffer.from(ss2).toString("hex"));\n    return ss2;'
);

// Write instrumented version
fs.writeFileSync('../scripts/_instr_mlkem.js', code);
const mi = require('../scripts/_instr_mlkem');

console.log('\n=== Instrumented roundtrip ===');
const ikp = mi.generateKeypair();
const ienc = mi.encapsulate(ikp.publicKey);
const idec = mi.decapsulate(ikp.secretKey, ienc.ciphertext);
console.log('Match:', Buffer.from(ienc.sharedSecret).equals(Buffer.from(idec)) ? 'PASS' : 'FAIL');
