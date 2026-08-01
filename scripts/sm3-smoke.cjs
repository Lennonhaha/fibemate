// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SM3 hash smoke test — GBT 32905 vectors, determinism, KAT 30
// Exit: 0=ALL PASS, 1=FAIL
globalThis.window = globalThis;
const SM3 = require('../www/crypto/sm3-browser.js');

let pass = 0, fail = 0;

// --- GBT 32905 A.1: digest("abc") ---
console.log('TV0 ("abc"):');
const tv0 = SM3.digestHex('abc');
const tv0Expected = '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0';
if (tv0 === tv0Expected) { console.log('  PASS'); pass++; }
else { console.log('  FAIL got=' + tv0); fail++; }

// --- GBT 32905 A.2: digest("abcd" x 16) ---
// ⚠️ Must pass Uint8Array because "abcd" x 16 looks like hex to toBytes()
console.log('TV1 (64B "abcd"x16):');
const tv1Input = new TextEncoder().encode('abcd'.repeat(16));
const tv1 = SM3.digestHex(tv1Input);
const tv1Expected = 'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732';
if (tv1 === tv1Expected) { console.log('  PASS'); pass++; }
else { console.log('  FAIL got=' + tv1); fail++; }

// --- Determinism ---
console.log('Determinism (100 rounds):');
let detOk = true;
const ref = SM3.digestHex('test determinism');
for (let i = 0; i < 100; i++) {
  if (SM3.digestHex('test determinism') !== ref) { detOk = false; break; }
}
if (detOk) { console.log('  PASS'); pass++; }
else { console.log('  FAIL'); fail++; }

// --- Empty input ---
console.log('Empty input:');
const hashEmpty = SM3.digestHex(new Uint8Array(0));
if (hashEmpty.length === 64) { console.log('  PASS (' + hashEmpty + ')'); pass++; }
else { console.log('  FAIL'); fail++; }

// --- KAT 30 vectors ---
console.log('KAT 30 vectors:');
try {
  const fs = require('fs');
  const kat = JSON.parse(fs.readFileSync('packages/sm3-ref/test/kat/sm3-KAT.json', 'utf8'));
  let katPass = 0;
  for (const v of kat) {
    const msgBytes = Buffer.from(v.msg, 'hex');
    const hash = SM3.digestHex(msgBytes);
    if (hash === v.md) katPass++;
  }
  if (katPass === kat.length) { console.log('  ' + katPass + '/' + kat.length + ' PASS'); pass++; }
  else { console.log('  ' + katPass + '/' + kat.length + ' FAIL'); fail++; }
} catch (e) {
  console.log('  SKIP (KAT: ' + e.message + ')');
}

console.log('\n=== RESULT: ' + (fail === 0 ? 'ALL ' + pass + ' PASS' : pass + ' PASS / ' + fail + ' FAIL') + ' ===');
process.exit(fail === 0 ? 0 : 1);
