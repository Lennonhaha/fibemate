// SM3 JS↔Python KAT cross-validation (30 vectors + GBT 32905 standard vectors)
// Exit code: 0=ALL PASS, 1=KAT mismatch, 2=dependency error
const SM3 = require('../www/crypto/sm3-browser.js');
const fs = require('fs');

function abort(msg) { console.error('FATAL:', msg); process.exit(2); }

// ── GBT 32905 standard test vectors ──
const TV0_EXPECTED = '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0';
const TV1_EXPECTED = 'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732';

const tv0_ok = SM3.digestHex('abc') === TV0_EXPECTED;
const tv1_hex = '6162636461626364616263646162636461626364616263646162636461626364' +
               '6162636461626364616263646162636461626364616263646162636461626364';
const tv1_ok = SM3.digestHex(Buffer.from(tv1_hex, 'hex')) === TV1_EXPECTED;

console.log('TV0 ("abc"):', tv0_ok ? 'PASS' : 'FAIL');
console.log('TV1 (64B):  ', tv1_ok ? 'PASS' : 'FAIL');

// ── KAT 30 vectors ──
const katPath = 'packages/sm3-ref/test/kat/sm3-KAT.json';
let kat;
try { kat = JSON.parse(fs.readFileSync(katPath, 'utf8')); }
catch (e) { abort('Cannot load KAT: ' + e.message); }

let pass = 0;
for (const v of kat) {
  const h = SM3.digestHex(Buffer.from(v.msg, 'hex'));
  if (h === v.md) pass++;
}

console.log('SM3 KAT:', pass + '/' + kat.length + ' PASS');

const allPass = tv0_ok && tv1_ok && pass === kat.length;
console.log(allPass ? '✅ SM3 ALL PASS' : '❌ SM3 FAILURES');
process.exit(allPass ? 0 : 1);
