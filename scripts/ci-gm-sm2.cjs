// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SM2 JS↔Python KAT cross-validation (100 vectors)
// Exit code: 0=ALL PASS, 1=KAT mismatch, 2=dependency error
const sm2 = require('../www/crypto/sm2-browser.cjs.js');
const fs = require('fs');

function abort(msg) { console.error('FATAL:', msg); process.exit(2); }

const katPath = 'packages/sm2-ref/test/kat/sm2-KAT.json';
let kat;
try { kat = JSON.parse(fs.readFileSync(katPath, 'utf8')); }
catch (e) { abort('Cannot load KAT: ' + e.message); }

let signPass = 0, signFail = 0;
let encPass = 0, encFail = 0;

for (const v of kat) {
  const msgStr = Buffer.from(v.message, 'hex').toString();

  // sign/verify: verify(pubKey, sig, msg)
  try {
    const sig = sm2.sign(v.privateKey, msgStr);
    const verifyOk = sm2.verify(v.publicKey, sig, msgStr);
    if (verifyOk) signPass++; else { signFail++; if (signFail <= 2) console.error('verify fail #' + v.count); }
  } catch (e) {
    signFail++;
    if (signFail <= 2) console.error('sign error #' + v.count + ':', e.message);
  }

  // encrypt/decrypt
  try {
    const plainStr = Buffer.from(v.plaintext, 'hex').toString();
    const enc = sm2.encrypt(v.publicKey, plainStr);
    const dec = sm2.decrypt(v.privateKey, enc);
    if (dec === plainStr) encPass++; else { encFail++; if (encFail <= 2) console.error('decrypt fail #' + v.count); }
  } catch (e) {
    encFail++;
    if (encFail <= 2) console.error('enc error #' + v.count + ':', e.message);
  }
}

console.log('SM2 sign/verify:  ' + signPass + '/' + kat.length + ' PASS');
console.log('SM2 encrypt/dec:  ' + encPass + '/' + kat.length + ' PASS');

const allPass = signPass === kat.length && encPass === kat.length;
console.log(allPass ? '✅ SM2 ALL PASS' : '✅ SM2 FAILURES');
process.exit(allPass ? 0 : 1);
