// SM3 JS↔Python cross-validation
const SM3Hash = require('/opt/fibemate-repo/www/crypto/sm3-browser.js');
const fs = require('fs');

// ── GBT 32905 Standard Test Vectors ──
const tv0_md = '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0';
const tv1_md = 'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732';

// TV0: string 'abc' → TextEncoder ("abc" doesn't look like hex, so no auto-detect)
const tv0_ok = SM3Hash.digestHex('abc') === tv0_md;

// TV1: raw bytes from hex. JS would auto-detect "abcd..." as hex → wrong!
const tv1_hex = '6162636461626364616263646162636461626364616263646162636461626364' +
                '6162636461626364616263646162636461626364616263646162636461626364';
const tv1_bytes = new Uint8Array(tv1_hex.length / 2);
for (let i = 0; i < tv1_bytes.length; i++)
  tv1_bytes[i] = parseInt(tv1_hex.substring(i*2, i*2+2), 16);
const tv1_ok = SM3Hash.digestHex(tv1_bytes) === tv1_md;

console.log('TV0 ("abc"):', SM3Hash.digestHex('abc'), tv0_ok ? '✅' : '❌');
console.log('TV1 (64 bytes):', SM3Hash.digestHex(tv1_bytes), tv1_ok ? '✅' : '❌');
// ⚠️ JS digestHex auto-detects hex strings: "abcd..." is misinterpreted as hex data
//    Correct: pass Uint8Array for binary test vectors

// ── KAT cross-validation ──
const kat = JSON.parse(fs.readFileSync(
  '/opt/fibemate-repo/packages/sm2-ref/test/kat/sm3-KAT.json', 'utf8'));
console.log(`\nLoaded ${kat.length} KAT vectors`);

let pass = 0, fail = 0, firstFail = null;
for (const v of kat) {
  const msgBytes = new Uint8Array(Buffer.from(v.msg, 'hex'));
  const h = SM3Hash.digestHex(msgBytes);
  if (h === v.md) pass++;
  else { fail++; if (!firstFail) firstFail = v.count; }
}

const allPass = tv0_ok && tv1_ok && pass === kat.length;
console.log(`\n═══════════════════════════════════`);
console.log(`  SM3 JS↔Python KAT Cross-Validation`);
console.log(`═══════════════════════════════════`);
console.log(`  Standard Vectors: ${tv0_ok && tv1_ok ? '2/2 PASS' : 'FAIL'}`);
console.log(`  KAT 30 vectors:   ${pass}/${kat.length} PASS`);
if (firstFail !== null) console.log(`  First fail at:    #${firstFail}`);
console.log(`═══════════════════════════════════`);
console.log(allPass ? '✅ ALL PASS' : '❌ FAILURES');
process.exit(allPass ? 0 : 1);
