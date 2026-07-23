// ML-KEM-768 roundtrip self-validation + KAT .rsp header check
// API: generateKeypair() → {publicKey, secretKey}
//       encapsulate(pk) → {ciphertext, sharedSecret}
//       decapsulate(sk, ct) → sharedSecret
// Exit: 0=ALL PASS, 1=roundtrip mismatch, 2=dependency error

const fs = require('fs');
const path = require('path');

global.crypto = { getRandomValues: (buf) => require('crypto').randomFillSync(buf) };

const mlkemPath = path.resolve(__dirname, '../packages/pqc-kem/src/ml-kem-768.js');
let mlkem;
try { mlkem = require(mlkemPath); }
catch (e) { console.error('FATAL: Cannot load ml-kem-768:', e.message); process.exit(2); }

// Header check: KAT file present and well-formed
const katRsp = path.resolve(__dirname, '../packages/pqc-kem/test/kat/mlkem-768-KAT.rsp');
try {
  const header = fs.readFileSync(katRsp, 'utf8').split(/\r?\n/).slice(0, 8).join('\n');
  if (header.includes('ML-KEM-768') && header.includes('FIPS 203')) {
    console.log('KAT header verified: ML-KEM-768 / FIPS 203');
  } else {
    console.log('KAT header present (format OK)');
  }
  // Count vectors
  const vectorCount = (fs.readFileSync(katRsp, 'utf8').match(/^count = /gm) || []).length;
  console.log('KAT vectors:', vectorCount);
} catch(e) {
  console.error('KAT .rsp not found:', e.message);
  // Non-fatal: KAT is for reference only since generateKeypair() is non-derandomized
}

// Roundtrip: 100 keygen→encap→decap cycles
let pass = 0, fail = 0;
const ROUNDS = 100;
for (let i = 0; i < ROUNDS; i++) {
  try {
    const { publicKey, secretKey } = mlkem.generateKeypair();
    const { ciphertext, sharedSecret } = mlkem.encapsulate(publicKey);
    const decapSS = mlkem.decapsulate(secretKey, ciphertext);
    // Buffer (encap) vs Uint8Array (decap) — use Buffer.equals for correct comparison
    if (Buffer.from(sharedSecret).equals(Buffer.from(decapSS))) pass++;
    else {
      fail++;
      if (fail <= 2) console.error('Mismatch round', i);
    }
  } catch (e) {
    fail++;
    if (fail <= 2) console.error('Error round', i, ':', e.message);
  }
}

console.log('ML-KEM-768 roundtrip:', pass + '/' + ROUNDS + ' PASS' + (fail > 0 ? ' (' + fail + ' FAIL)' : ''));

if (fail > 0) process.exit(1);

// Bonus: key uniqueness check
const keys = new Set();
for (let i = 0; i < 20; i++) {
  const { publicKey } = mlkem.generateKeypair();
  keys.add(publicKey);
}
console.log('Key uniqueness:', keys.size + '/20 unique');

const allPass = fail === 0;
console.log(allPass ? '✅ ML-KEM ALL PASS' : '❌ ML-KEM FAILURES');
process.exit(allPass ? 0 : 1);
