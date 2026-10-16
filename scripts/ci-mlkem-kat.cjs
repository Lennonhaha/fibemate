// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// ML-KEM-768 KAT verification + roundtrip self-validation.
//
// What this gate does (all must pass):
//   K1 file/header      .rsp exists and declares ML-KEM-768 / FIPS 203
//   K2 field sizes      seed/z/m=32, ek=1184, dk=2400, c=1088, k=32
//   K3 canonical dk     dk = dkPKE || ek || H(ek) || z  (FIPS 203 §7.1)
//   K4 shared secret    decapsulate(dk, c) === k        (no keygen involved)
//   K5 independent      k === SHA3-512(m || SHA3-256(ek))[0:32]
//   R1 roundtrip        100 keygen→encaps→decaps cycles
//   R2 uniqueness       20 fresh keypairs produce 20 distinct ek
//
// The previous revision only string-matched the header and then ran its own
// roundtrip, so a corrupt dk column passed CI for months. Do not shrink this
// back to a header check.
//
// Exit: 0 = ALL PASS, 1 = any validation failure, 2 = dependency/tooling error

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sha3_256 = (b) => crypto.createHash('sha3-256').update(b).digest();
const sha3_512 = (b) => crypto.createHash('sha3-512').update(b).digest();

// Node < 19 has no webcrypto global; the implementation reads
// globalThis.crypto.getRandomValues at call time.
if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
  try { globalThis.crypto = { getRandomValues: (buf) => crypto.randomFillSync(buf) }; } catch (_) { /* read-only, fine */ }
}

const mlkemPath = path.resolve(__dirname, '../packages/pqc-kem/src/ml-kem-768.js');
let mlkem;
try { mlkem = require(mlkemPath); }
catch (e) { console.error('FATAL: Cannot load ml-kem-768: ' + e.message); process.exit(2); }

const EXPECT = { seed: 32, z: 32, m: 32, ek: 1184, dk: 2400, c: 1088, k: 32 };
const KAT_RSP = process.env.FIBEMATE_KAT_RSP || path.resolve(__dirname, '../packages/pqc-kem/test/kat/mlkem-768-KAT.rsp');

// ── K1 file + header ────────────────────────────────────────────────────────
let text;
try { text = fs.readFileSync(KAT_RSP, 'utf8'); }
catch (e) { console.error('K1 FAIL: KAT .rsp not found: ' + e.message); process.exit(1); }
const header = text.split(/\r?\n/).slice(0, 24).join('\n');
const headerOk = header.includes('ML-KEM-768') && header.includes('FIPS 203');
console.log('K1 header ' + (headerOk ? 'OK' : 'FAIL') + ': ML-KEM-768 / FIPS 203 declared');

// ── K2..K5 per-vector ──────────────────────────────────────────────────────
const vectors = [];
let cur = null;
for (const line of text.split(/\r?\n/)) {
  const m = /^([a-z]+) = ([0-9a-f]*)$/.exec(line.trim());
  if (!m) continue;
  const [, key, val] = m;
  if (key === 'count') {
    if (cur) vectors.push(cur);
    cur = { count: Number(val), seed: '', z: '', m: '', ek: '', dk: '', c: '', k: '' };
  } else if (cur && key in cur) cur[key] = val;
}
if (cur) vectors.push(cur);

let kFail = 0;
const problems = [];
const badVectors = new Set();
for (const v of vectors) {
  const bad = (why) => { kFail++; badVectors.add(v.count); if (problems.length < 8) problems.push('#' + v.count + ' ' + why); };
  const b = {};
  for (const key of Object.keys(EXPECT)) {
    b[key] = Buffer.from(v[key] || '', 'hex');
    if (b[key].length !== EXPECT[key]) { bad(key + ' size ' + b[key].length + ' != ' + EXPECT[key]); }
  }
  // K3 canonical layout
  if (b.dk.subarray(1152, 2336).equals(b.ek) === false) bad('dk[1152..2336] != ek');
  if (b.dk.subarray(2336, 2368).equals(sha3_256(b.ek)) === false) bad('dk[2336..2368] != H(ek)');
  if (b.dk.subarray(2368, 2400).equals(b.z) === false) bad('dk[2368..2400] != z');
  // K4 decapsulation against the stored dk (independent of keygen)
  let got = null;
  try { got = Buffer.from(mlkem.decapsulate(new Uint8Array(b.dk), new Uint8Array(b.c))); }
  catch (e) { bad('decapsulate threw: ' + e.message); }
  if (got && got.equals(b.k) === false) bad('decapsulate(dk,c) != k');
  // K5 independent formula
  if (sha3_512(Buffer.concat([b.m, sha3_256(b.ek)])).subarray(0, 32).equals(b.k) === false) bad('k != SHA3-512(m||H(ek))[0:32]');
}
console.log('K2..K5 vectors: ' + (vectors.length - badVectors.size) + '/' + vectors.length + ' clean' +
  ' (' + kFail + ' failing assertion(s) in ' + badVectors.size + ' vector(s))');
problems.forEach((p) => console.error('  FAIL ' + p));

// ── R1 roundtrip ───────────────────────────────────────────────────────────
const ROUNDS = 100;
let pass = 0, rFail = 0;
for (let i = 0; i < ROUNDS; i++) {
  try {
    const { publicKey, secretKey } = mlkem.generateKeypair();
    const { ciphertext, sharedSecret } = mlkem.encapsulate(publicKey);
    const decapSS = mlkem.decapsulate(secretKey, ciphertext);
    if (Buffer.from(sharedSecret).equals(Buffer.from(decapSS))) pass++;
    else { rFail++; if (rFail <= 2) console.error('  R1 mismatch round ' + i); }
  } catch (e) { rFail++; if (rFail <= 2) console.error('  R1 error round ' + i + ': ' + e.message); }
}
console.log('R1 roundtrip: ' + pass + '/' + ROUNDS + ' PASS' + (rFail ? ' (' + rFail + ' FAIL)' : ''));

// ── R2 uniqueness ──────────────────────────────────────────────────────────
const keys = new Set();
for (let i = 0; i < 20; i++) keys.add(Buffer.from(mlkem.generateKeypair().publicKey).toString('hex'));
const uniqOk = keys.size === 20;
console.log('R2 uniqueness: ' + keys.size + '/20 unique');

const ok = headerOk && kFail === 0 && rFail === 0 && uniqOk;
console.log((ok ? '✅ ML-KEM ALL PASS' : '❌ ML-KEM FAILURES') +
  ' (KAT ' + vectors.length + ' vectors, ' + (vectors.length * 5) + ' assertions)');
process.exit(ok ? 0 : 1);
