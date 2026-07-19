// P0-03a Functional Verification: sm2-ec-browser.js after k-masking + modInv fix
'use strict';

const fs = require('fs');
const node_crypto = require('crypto');

// --- Load browser SM2 module in Node.js test harness ---
const code = fs.readFileSync('www/crypto/sm2-ec-browser.js', 'utf8');
const mockCrypto = { getRandomValues(buf) { node_crypto.randomFillSync(buf); } };
const patchedCode = code.replace('crypto.getRandomValues', 'mockCrypto.getRandomValues');
const window = {};
const sm2 = new Function('mockCrypto', 'window', patchedCode + '\nreturn window.SM2EC;')(mockCrypto, window);

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  PASS: ' + name); }
  catch (e) { failed++; console.log('  FAIL: ' + name + ' - ' + e.message); }
}

console.log('\n=== P0-03a SM2 Browser k-masking + modInv Fix Tests ===\n');

// --- 1. Basic keygen ---
console.log('1. Key Generation:');
t('generateKeyPair produces valid key', () => {
  const kp = sm2.generateKeyPair();
  const pkHex = sm2.publicKeyToHex(kp.publicKey);
  if (pkHex.length !== 130) throw new Error('pk length ' + pkHex.length + ', expected 130');
  if (!pkHex.startsWith('04')) throw new Error('missing 04 prefix');
});

// --- 2. Sign + Verify roundtrip ---
console.log('\n2. Sign / Verify roundtrip:');
const kp = sm2.generateKeyPair();
const pkHex = sm2.publicKeyToHex(kp.publicKey);
const msg = 'FIBEMATE P0-03a SM2 side-channel hardened';
const hash = BigInt('0x' + node_crypto.createHash('sha256').update(msg).digest('hex'));

t('sign produces (r,s)', () => {
  const sig = sm2.sign(kp.privateKey, hash);
  if (!sig.r || !sig.s) throw new Error('missing r or s');
});

const sig = sm2.sign(kp.privateKey, hash);
t('verify returns true', () => {
  if (!sm2.verify(pkHex, hash, sig.r, sig.s)) throw new Error('verify failed');
});

t('verify rejects wrong signature', () => {
  const fakeR = '0000000000000000000000000000000000000000000000000000000000000001';
  if (sm2.verify(pkHex, hash, fakeR, sig.s)) throw new Error('accepted fake sig');
});

t('verify rejects wrong message', () => {
  const wrongHash = BigInt('0x' + node_crypto.createHash('sha256').update('wrong').digest('hex'));
  if (sm2.verify(pkHex, wrongHash, sig.r, sig.s)) throw new Error('accepted wrong message');
});

// --- 3. k-masking: non-deterministic signatures ---
console.log('\n3. k-masking (ephemeral key blinding):');
const sigs = [];
for (let i = 0; i < 10; i++) {
  sigs.push(sm2.sign(kp.privateKey, hash));
}
const uniqueCount = new Set(sigs.map(s => s.r + s.s)).size;
t('10 signs produce ' + uniqueCount + ' unique (r,s) pairs', () => {
  if (uniqueCount < 5) throw new Error('only ' + uniqueCount + ' unique');
  for (const s of sigs) {
    if (!sm2.verify(pkHex, hash, s.r, s.s)) throw new Error('masked sig failed verification');
  }
});

// --- 4. Encrypt k-masking + Decrypt roundtrip ---
console.log('\n4. Encrypt (k-masked) / Decrypt roundtrip:');
const ct = sm2.encrypt(pkHex, msg);
t('encrypt produces c1+c2', () => {
  if (!ct.c1 || !ct.c2) throw new Error('missing c1 or c2');
  if (ct.c1.length !== 130) throw new Error('c1 length ' + ct.c1.length);
});

const pt = sm2.decrypt(kp.privateKey, ct.c1, ct.c2);
t('decrypt recovers plaintext', () => {
  if (pt !== msg) throw new Error('decrypt mismatch');
});

// Verify encrypt() k-masking: 10 calls should produce distinct C1
const cts10 = [];
for (let i = 0; i < 10; i++) cts10.push(sm2.encrypt(pkHex, msg));
const uniqueC1 = new Set(cts10.map(c => c.c1)).size;
t('encrypt: ' + uniqueC1 + '/10 unique C1 (k-masking active)', () => {
  if (uniqueC1 < 8) throw new Error('only ' + uniqueC1 + ' unique C1');
  for (const c of cts10) {
    if (sm2.decrypt(kp.privateKey, c.c1, c.c2) !== msg) throw new Error('k-masked encrypt decrypt failed');
  }
});

// --- 5. Stress: 200 sign/verify rounds ---
console.log('\n5. Stress test (200 rounds):');
let stressPass = true;
for (let i = 0; i < 200; i++) {
  const m2 = 'stress-' + i;
  const h = BigInt('0x' + node_crypto.createHash('sha256').update(m2).digest('hex'));
  const s = sm2.sign(kp.privateKey, h);
  if (!sm2.verify(pkHex, h, s.r, s.s)) { stressPass = false; break; }
}
t('200 rounds sign+verify all pass', () => { if (!stressPass) throw new Error('stress failure'); });

// --- 6. ECDH shared secret ---
console.log('\n6. ECDH key exchange:');
const kp2 = sm2.generateKeyPair();
const ss1 = sm2.computeSharedSecret(kp.privateKey, sm2.publicKeyToHex(kp2.publicKey));
const ss2 = sm2.computeSharedSecret(kp2.privateKey, sm2.publicKeyToHex(kp.publicKey));
t('ECDH shared secrets match', () => {
  if (Buffer.from(ss1).toString('hex') !== Buffer.from(ss2).toString('hex')) {
    throw new Error('shared secret mismatch');
  }
});

// --- 7. modInv correctness via sign/verify chain ---
console.log('\n7. modInv correctness (embedded in sign/verify):');
t('sign+verify roundtrip proves modInv correct', () => {
  const s = sm2.sign(kp.privateKey, hash);
  if (!sm2.verify(pkHex, hash, s.r, s.s)) throw new Error('sign/verify failed');
});

// ============ Final ============
console.log('\n=== Results: ' + passed + ' PASS, ' + failed + ' FAIL ===\n');
process.exit(failed > 0 ? 1 : 0);
