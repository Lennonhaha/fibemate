// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SM2 KAT: known-answer comparison against packages/sm2-ref/test/kat/sm2-KAT.json (100 vectors)
//
// Two independent checks per vector:
//   1. KNOWN ANSWER - verify() must accept the vector's own signature, and decrypt() must return the
//                     vector's own plaintext from the vector's own ciphertext. Expected bytes come
//                     from the file, not from this implementation.
//   2. ROUND TRIP   - sign()->verify() and encrypt()->decrypt() with fresh randomness. Both are
//                     randomized, so their outputs cannot be compared to the vectors; the round trip
//                     only proves internal consistency.
// Exit code: 0=ALL PASS, 1=KAT mismatch, 2=dependency error
const sm2 = require('../www/crypto/sm2-browser.cjs.js');
const fs = require('fs');

function abort(msg) { console.error('FATAL:', msg); process.exit(2); }

const katPath = 'packages/sm2-ref/test/kat/sm2-KAT.json';
let kat;
try { kat = JSON.parse(fs.readFileSync(katPath, 'utf8')); }
catch (e) { abort('Cannot load KAT: ' + e.message); }

for (const v of kat) {
  if (!v.signature || !v.ciphertext || !v.plaintext) abort('KAT vector #' + v.count + ' is missing signature/ciphertext/plaintext');
}

let katSigPass = 0, katSigFail = 0, katDecPass = 0, katDecFail = 0;
let signPass = 0, signFail = 0;
let encPass = 0, encFail = 0;

for (const v of kat) {
  const msgStr = Buffer.from(v.message, 'hex').toString();
  const plainStr = Buffer.from(v.plaintext, 'hex').toString();

  // 1a. KNOWN ANSWER: the vector's own signature must verify
  try {
    if (sm2.verify(v.publicKey, v.signature, msgStr)) katSigPass++;
    else { katSigFail++; if (katSigFail <= 2) console.error('vector signature rejected #' + v.count); }
  } catch (e) {
    katSigFail++;
    if (katSigFail <= 2) console.error('vector signature error #' + v.count + ':', e.message);
  }

  // 1b. KNOWN ANSWER: the vector's ciphertext must decrypt to the vector's plaintext
  try {
    if (sm2.decrypt(v.privateKey, v.ciphertext) === plainStr) katDecPass++;
    else { katDecFail++; if (katDecFail <= 2) console.error('vector ciphertext mismatch #' + v.count); }
  } catch (e) {
    katDecFail++;
    if (katDecFail <= 2) console.error('vector decrypt error #' + v.count + ':', e.message);
  }

  // 2a. ROUND TRIP: fresh signature verifies
  try {
    const sig = sm2.sign(v.privateKey, msgStr);
    if (sm2.verify(v.publicKey, sig, msgStr)) signPass++;
    else { signFail++; if (signFail <= 2) console.error('round-trip verify fail #' + v.count); }
  } catch (e) {
    signFail++;
    if (signFail <= 2) console.error('round-trip sign error #' + v.count + ':', e.message);
  }

  // 2b. ROUND TRIP: fresh ciphertext decrypts
  try {
    const enc = sm2.encrypt(v.publicKey, plainStr);
    if (sm2.decrypt(v.privateKey, enc) === plainStr) encPass++;
    else { encFail++; if (encFail <= 2) console.error('round-trip decrypt fail #' + v.count); }
  } catch (e) {
    encFail++;
    if (encFail <= 2) console.error('round-trip enc error #' + v.count + ':', e.message);
  }
}

const n = kat.length;
console.log('SM2 known-answer signature: ' + katSigPass + '/' + n + ' PASS');
console.log('SM2 known-answer decrypt:   ' + katDecPass + '/' + n + ' PASS');
console.log('SM2 round-trip sign/verify: ' + signPass + '/' + n + ' PASS');
console.log('SM2 round-trip encrypt/dec: ' + encPass + '/' + n + ' PASS');

const allPass = katSigPass === n && katDecPass === n && signPass === n && encPass === n;
console.log(allPass ? '✅ SM2 ALL PASS' : '❌ SM2 FAILURES');
process.exit(allPass ? 0 : 1);
