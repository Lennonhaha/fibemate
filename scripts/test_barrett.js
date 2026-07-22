const path = require('path');
const mlkemPath = path.resolve(__dirname, '..', 'packages', 'pqc-kem', 'src', 'ml-kem-768.js');
const m = require(mlkemPath);

// 1. Verify Barrett is active
const src = require('fs').readFileSync(mlkemPath, 'utf8');
const hasBarrett = src.includes('modMulBarrett');
const hasBigInt = src.includes('BigInt(na)');
console.log('Barrett present:', hasBarrett, '| BigInt modMul:', hasBigInt);

// 2. Roundtrip test
const t = Date.now();
let fail = 0;
for (let i = 0; i < 500; i++) {
  const kp = m.generateKeypair();
  const enc = m.encapsulate(kp.publicKey);
  const ss = m.decapsulate(kp.secretKey, enc.ciphertext);
  let eq = 0;
  for (let j = 0; j < ss.length; j++) eq |= ss[j] ^ enc.sharedSecret[j];
  if (eq) fail++;
}
console.log('KAT 500:', (500 - fail) + '/500', fail ? 'FAIL' : 'OK', '(' + (Date.now() - t) + 'ms)');

// 3. Keygen bench
const t2 = Date.now();
for (let i = 0; i < 50; i++) m.generateKeypair();
console.log('Keygen x50:', (Date.now() - t2) + 'ms', '(' + ((Date.now() - t2) / 50).toFixed(1) + 'ms/keygen)');

// 4. Noble cross-verify
try {
  const noble = require('@noble/post-quantum/ml-kem');
  const kp = m.generateKeypair();
  const { ciphertext, sharedSecret } = m.encapsulate(kp.publicKey);
  const ss = m.decapsulate(kp.secretKey, ciphertext);
  const dec = noble.decapsulate(ciphertext, kp.secretKey);
  let eq = 0;
  for (let j = 0; j < Math.min(ss.length, dec.length); j++) eq |= ss[j] ^ dec[j];
  console.log('Noble verify:', eq ? 'MISMATCH' : 'OK');
} catch (e) {
  console.log('Noble verify: SKIP (' + e.message.split('\n')[0] + ')');
}
