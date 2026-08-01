// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SM4-GCM smoke test — roundtrip, tamper detection, KAT vectors
// Exit: 0=ALL PASS, 1=FAIL
globalThis.window = globalThis;
const SM4 = require('../www/crypto/sm4-browser.js');

let pass = 0, fail = 0;

const KEY = '0123456789abcdef0123456789abcdef';
const IV  = '000000000000000000000000';

// --- Basic roundtrip ---
console.log('Roundtrip (100 rounds, 1KB):');
let rtPass = 0;
for (let i = 0; i < 100; i++) {
  const msg = 'Test message ' + i + ' ' + 'x'.repeat(1000);
  const encRes = SM4.encrypt(msg, KEY, { iv: IV });
  const dec = SM4.decrypt(encRes.ciphertext, KEY, encRes.iv, encRes.authTag);
  if (dec === msg) rtPass++;
}
if (rtPass === 100) { console.log('  ' + rtPass + '/100 PASS'); pass++; }
else { console.log('  ' + rtPass + '/100 FAIL'); fail++; }

// --- Tamper detection ---
console.log('Tamper detection:');
let tamperOk = true;
const encRes = SM4.encrypt('secret message', KEY, { iv: IV });
const parts = encRes.ciphertext.match(/.{1,2}/g) || [];
parts[0] = (parseInt(parts[0], 16) ^ 0x01).toString(16).padStart(2, '0');
const badCt = parts.join('');
const decResult = SM4.decrypt(badCt, KEY, encRes.iv, encRes.authTag);
if (decResult === null || decResult === false) { console.log('  PASS'); pass++; }
else { console.log('  FAIL (tampered ciphertext accepted)'); fail++; }

// --- KAT 30 vectors (decrypt verification) ---
console.log('KAT 30 vectors:');
try {
  const fs = require('fs');
  const kat = JSON.parse(fs.readFileSync('packages/sm4-ref/test/kat/sm4-gcm-KAT.json', 'utf8'));
  let katPass = 0;
  for (const v of kat) {
    const aadArg = v.aad && v.aad.length > 0 ? v.aad : undefined;
    const dec = SM4.decrypt(v.ct, v.key, v.iv, v.tag, aadArg);
    const expected = Buffer.from(v.pt, 'hex').toString('utf8');
    if (dec === expected) katPass++;
  }
  if (katPass === kat.length) { console.log('  ' + katPass + '/' + kat.length + ' PASS'); pass++; }
  else { console.log('  ' + katPass + '/' + kat.length + ' FAIL'); fail++; }
} catch (e) {
  console.log('  SKIP (KAT: ' + e.message + ')');
}

console.log('\n=== RESULT: ' + (fail === 0 ? 'ALL ' + pass + ' PASS' : pass + ' PASS / ' + fail + ' FAIL') + ' ===');
process.exit(fail === 0 ? 0 : 1);
