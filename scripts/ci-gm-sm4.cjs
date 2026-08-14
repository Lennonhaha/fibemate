// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SM4-GCM JS↔Python KAT cross-validation (30 vectors)
// Exit code: 0=ALL PASS, 1=KAT mismatch, 2=dependency error
globalThis.window = globalThis;
const SM4 = require('../www/crypto/sm4-browser.js');
const fs = require('fs');

function abort(msg) { console.error('FATAL:', msg); process.exit(2); }

const katPath = 'packages/sm4-ref/test/kat/sm4-gcm-KAT.json';
let kat;
try { kat = JSON.parse(fs.readFileSync(katPath, 'utf8')); }
catch (e) { abort('Cannot load KAT: ' + e.message); }

let pass = 0, errs = 0;
const firstErrors = [];

for (const v of kat) {
  const opts = v.aad ? { aad: v.aad } : {};
  const dec = SM4.decrypt(v.ct, v.key, v.iv, v.tag, opts);
  const expected = Buffer.from(v.pt, 'hex').toString('utf8');

  if (dec === expected) {
    pass++;
  } else {
    errs++;
    if (firstErrors.length < 3) {
      firstErrors.push({ count: v.count, got: dec });
    }
  }
}

console.log('SM4-GCM KAT:', pass + '/' + kat.length + ' PASS');
if (firstErrors.length) console.error('First errors:', JSON.stringify(firstErrors));

const allPass = pass === kat.length;
console.log(allPass ? '✅ SM4-GCM ALL PASS' : '✅ SM4-GCM FAILURES');
process.exit(allPass ? 0 : 1);
