// SPDX-License-Identifier: GPL-3.0-only
/**
 * fibemate-pqc-kem -- C <-> JS parity for ML-KEM-768
 *
 * Why this file exists
 * --------------------
 * The ACVP answers and the internal invariants are both checked against the
 * JavaScript backend. index.js, however, prefers the C addon whenever it is
 * present, so the code that ships in a native build was the one path with no
 * external reference: scripts/test-native-addon.cjs only checks that C agrees
 * with itself (C keygen -> C encaps -> C decaps).
 *
 * This test drives the same deterministic inputs through both backends and
 * requires the outputs to be identical byte for byte. It covers:
 *
 *   - keygenDerand(d, z): pk and sk, 1184 and 2400 bytes
 *   - encapsDerand(pk, m): ct and ss
 *   - decaps: same secret on byte-identical ciphertext
 *   - implicit rejection: tampered, all-zero and all-0xff ciphertexts must
 *     yield the same substituted secret on both sides, and a secret that
 *     differs from the honest one
 *   - cross-decapsulation: C ciphertext decapsulated by JS and vice versa
 *   - batch entry points, cross-checked against the JS backend
 *   - argument validation: both backends must reject short buffers instead of
 *     reading past them
 *
 * The addon is built by CI (`native-parity` job) and is not committed. Without
 * it this file exits 0 with an explicit SKIP so `npm test` stays portable; set
 * REQUIRE_NATIVE=1 (as CI does) to turn a missing addon into a failure, so a
 * skipped run can never be mistaken for a passing one.
 *
 * Run: node test/native-parity.test.js
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REQUIRE_NATIVE = process.env.REQUIRE_NATIVE === '1';
const ROOT = path.resolve(__dirname, '..');

const candidates = [
  path.join(ROOT, 'native', 'build', 'Release', 'mlkem.node'),
  path.join(ROOT, 'native', 'build', 'Debug', 'mlkem.node'),
];
const addonPath = candidates.find(p => fs.existsSync(p));

if (!addonPath) {
  const msg = 'SKIP native-parity: mlkem.node not built (tried ' + candidates.join(', ') + ')';
  if (REQUIRE_NATIVE) {
    console.error('FAIL ' + msg + ' -- REQUIRE_NATIVE=1 means the addon must be present');
    process.exit(2);
  }
  console.log(msg);
  console.log('     build it with: node-gyp rebuild -C packages/pqc-kem/native --release');
  process.exit(0);
}

const JS = require(path.join(ROOT, 'src', 'ml-kem-768.js'));
const addon = require(addonPath);

const PK = 1184, SK = 2400, CT = 1088, SS = 32;
let checks = 0, failures = 0;

function ok(cond, label, detail) {
  checks++;
  if (cond) return true;
  failures++;
  console.error('  [FAIL] ' + label + (detail ? ' :: ' + detail : ''));
  return false;
}

const buf = x => Buffer.from(x.buffer ? x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) : x);
const same = (a, b) => Buffer.compare(buf(a), buf(b)) === 0;
const h = x => crypto.createHash('sha256').update(buf(x)).digest('hex').slice(0, 16);
const det = (seed, tag) => crypto.createHash('sha256').update(seed + ':' + tag).digest();

function throws(fn) {
  try { fn(); return false; } catch (_e) { return true; }
}

// ===========================================================================
console.log('\n== Constants ==');
ok(addon.PUBLICKEYBYTES === PK && JS.PUBLIC_KEY_BYTES === PK, 'public key size agrees', `${addon.PUBLICKEYBYTES}/${JS.PUBLIC_KEY_BYTES}`);
ok(addon.SECRETKEYBYTES === SK && JS.SECRET_KEY_BYTES === SK, 'secret key size agrees');
ok(addon.CIPHERTEXTBYTES === CT && JS.CIPHERTEXT_BYTES === CT, 'ciphertext size agrees');
ok(addon.SSBBYTES === undefined || addon.SSBBYTES === SS, 'addon does not expose a conflicting SS size');
ok(addon.SSBYTES === SS && JS.SHARED_SECRET_BYTES === SS, 'shared secret size agrees');

// ===========================================================================
console.log('\n== Deterministic keygen / encaps / decaps ==');

const seeds = ['p0', 'p1', 'p2', 'p3', 'p4'];
const vectors = [];

for (const seed of seeds) {
  const d = det(seed, 'd'), z = det(seed, 'z'), m = det(seed, 'm');

  const jsKey = JS.generateKeypairDerand(new Uint8Array(d), new Uint8Array(z));
  // The C entry point takes a single 64-byte coin buffer: d || z.
  const [npk, nsk] = addon.keygenDerand(Buffer.concat([d, z]));

  ok(npk.length === PK && nsk.length === SK, `native key lengths (seed ${seed})`);
  ok(same(jsKey.publicKey, npk), `pk identical (seed ${seed})`, `${h(jsKey.publicKey)} vs ${h(npk)}`);
  ok(same(jsKey.secretKey, nsk), `sk identical (seed ${seed})`, `${h(jsKey.secretKey)} vs ${h(nsk)}`);

  const jsEnc = JS.encapsulateDerand(new Uint8Array(npk), new Uint8Array(m));
  const [nct, nss] = addon.encapsDerand(Buffer.from(npk), m);
  ok(same(jsEnc.ciphertext, nct), `ct identical (seed ${seed})`, `${h(jsEnc.ciphertext)} vs ${h(nct)}`);
  ok(same(jsEnc.sharedSecret, nss), `ss identical (seed ${seed})`);

  const jsDec = JS.decapsulate(new Uint8Array(nsk), new Uint8Array(nct));
  const nDec = addon.decaps(Buffer.from(nct), Buffer.from(nsk));
  ok(same(jsDec, nDec), `decaps identical (seed ${seed})`);
  ok(same(jsDec, nss), `decaps recovers the sender secret (seed ${seed})`);

  // Same input twice: the C side must be deterministic. A stray uninitialised
  // read would show up here or in the hash comparisons above.
  const [npk2] = addon.keygenDerand(Buffer.concat([d, z]));
  ok(same(npk, npk2), `native keygen is repeatable (seed ${seed})`);

  vectors.push({ seed, pk: Buffer.from(npk), sk: Buffer.from(nsk), ct: Buffer.from(nct), ss: Buffer.from(nss) });
}

// ===========================================================================
console.log('\n== Implicit rejection on malformed ciphertexts ==');

const v = vectors[0];
const adversarial = [['all-zero', Buffer.alloc(CT)], ['all-0xff', Buffer.alloc(CT, 0xff)]];
for (const pos of [0, 500, CT - 1]) {
  const c = Buffer.from(v.ct); c[pos] ^= 0x01;
  adversarial.push([`flip byte ${pos}`, c]);
}

for (const [label, ct] of adversarial) {
  const js = JS.decapsulate(new Uint8Array(v.sk), new Uint8Array(ct));
  const nat = addon.decaps(ct, v.sk);
  ok(same(js, nat), `implicit rejection agrees (${label})`, `${h(js)} vs ${h(nat)}`);
  ok(!same(js, v.ss), `implicit rejection differs from the honest secret (${label})`);
}

// ===========================================================================
console.log('\n== Cross-decapsulation ==');

for (const { seed, pk, sk, ct, ss } of vectors) {
  const natEnc = addon.encapsDerand(Buffer.from(pk), det(seed, 'm2'));
  const jsFromNative = JS.decapsulate(new Uint8Array(sk), new Uint8Array(natEnc[0]));
  const natFromJs = addon.decaps(Buffer.from(ct), Buffer.from(sk));
  ok(same(jsFromNative, natEnc[1]), `JS decapsulates a native ciphertext (seed ${seed})`);
  ok(same(natFromJs, ss), `native decapsulates a JS ciphertext (seed ${seed})`);
}

// ===========================================================================
console.log('\n== Batch entry points ==');

{
  const n = 3;
  const pkFlat = Buffer.concat(Array.from({ length: n }, () => v.pk));
  const skFlat = Buffer.concat(Array.from({ length: n }, () => v.sk));

  const { ct: ctFlat, ss: ssFlat } = addon.encaps_batch(pkFlat, n);
  ok(ctFlat.length === n * CT && ssFlat.length === n * SS, 'encaps_batch output sizes');

  const { ss: ssDec } = addon.decaps_batch(ctFlat, skFlat, n);
  ok(ssDec.length === n * SS, 'decaps_batch output size');

  let mismatched = 0;
  for (let i = 0; i < n; i++) {
    const ct = ctFlat.subarray(i * CT, (i + 1) * CT);
    const ss = ssFlat.subarray(i * SS, (i + 1) * SS);
    if (!same(JS.decapsulate(new Uint8Array(v.sk), new Uint8Array(ct)), ss)) mismatched++;
    if (!same(ssDec.subarray(i * SS, (i + 1) * SS), ss)) mismatched++;
  }
  ok(mismatched === 0, 'batch secrets match JS decapsulation', `${mismatched} mismatches`);

  const rt = addon.roundtrip_batch(200);
  ok(rt.count === 200 && rt.ok === 200, 'roundtrip_batch 200/200', `ok=${rt.ok} count=${rt.count}`);

  const kg = addon.keygen_batch(n);
  ok(kg.pk.length === n * PK && kg.sk.length === n * SK && kg.count === n, 'keygen_batch output sizes');
}

// ===========================================================================
console.log('\n== Argument validation ==');

// Both backends must refuse a short or long buffer rather than reading past it.
const shortCt = Buffer.alloc(CT - 1);
const longCt = Buffer.alloc(CT + 1);
ok(throws(() => addon.decaps(shortCt, v.sk)), 'native rejects a short ciphertext');
ok(throws(() => addon.decaps(longCt, v.sk)), 'native rejects an over-long ciphertext');
ok(throws(() => JS.decapsulate(new Uint8Array(v.sk), new Uint8Array(shortCt))), 'JS rejects a short ciphertext');

ok(throws(() => addon.decaps(v.ct, Buffer.alloc(SK - 1))), 'native rejects a short secret key');
ok(throws(() => addon.encaps(Buffer.alloc(PK - 1))), 'native rejects a short public key');
ok(throws(() => addon.keygenDerand(Buffer.alloc(2 * SS - 1))), 'native rejects short keygen coins');
ok(throws(() => addon.encapsDerand(v.pk, Buffer.alloc(SS - 1))), 'native rejects short encaps coins');
ok(throws(() => addon.encaps('not a buffer')), 'native rejects a non-buffer argument');
ok(throws(() => addon.decaps()), 'native rejects missing arguments');

ok(throws(() => addon.encaps_batch(Buffer.concat([v.pk, v.pk]), 3)), 'native rejects a batch with the wrong key count');
ok(throws(() => addon.decaps_batch(v.ct, v.sk, 2)), 'native rejects a batch with the wrong ciphertext count');

// A short buffer must not be silently zero-padded into a working operation.
ok(throws(() => addon.decaps(Buffer.concat([v.ct.subarray(0, CT - 1)]), v.sk)), 'truncated ciphertext is not padded and accepted');

// ===========================================================================
console.log('\n' + (failures === 0
  ? `PASS  ${checks} checks, 0 failures`
  : `FAIL  ${checks} checks, ${failures} failures`));
process.exit(failures === 0 ? 0 : 1);
