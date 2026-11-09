#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Boundary tests for the ratchet state machine and the SM2 field/point layer.
 *
 * These target the branches the happy-path suites never reach: out-of-order
 * delivery, the skip cap, downgrade rejection, missing chains, state
 * serialisation, and the arithmetic guards in the SM2 primitive.
 *
 * Run: node test/crypto-boundaries.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const DR = require('../double-ratchet');
// eslint-disable-next-line custom/no-js-bigint-in-hotpath -- tests exercise the BigInt implementation directly; this file is not a runtime path.
const SM2 = require('../sm2-bigint-ec');

function rootKey(fill = 7) {
  return new Uint8Array(32).fill(fill);
}

async function pair() {
  const bobDH = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const bobRoot = rootKey(9);
  const aliceRoot = rootKey(9);
  const bobPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', bobDH.publicKey));

  const alice = await DR.initAsInitiator(aliceRoot, bobPubRaw);
  const bob = await DR.initAsReceiver(bobRoot, bobDH);
  return { alice, bob };
}

test('ratchet: a message survives one round trip in each direction', async () => {
  const { alice, bob } = await pair();

  const first = await DR.encrypt(alice, 'hello bob');
  assert.equal(await DR.decrypt(bob, first.header, first.ciphertext, first.iv), 'hello bob');

  const reply = await DR.encrypt(bob, 'hello alice');
  assert.equal(await DR.decrypt(alice, reply.header, reply.ciphertext, reply.iv), 'hello alice');
});

test('ratchet: out-of-order delivery is recovered from skipped keys', async () => {
  const { alice, bob } = await pair();

  const m0 = await DR.encrypt(alice, 'zero');
  const m1 = await DR.encrypt(alice, 'one');
  const m2 = await DR.encrypt(alice, 'two');

  assert.equal(await DR.decrypt(bob, m2.header, m2.ciphertext, m2.iv), 'two');
  assert.equal(await DR.decrypt(bob, m0.header, m0.ciphertext, m0.iv), 'zero');
  assert.equal(await DR.decrypt(bob, m1.header, m1.ciphertext, m1.iv), 'one');
});

test('ratchet: a skipped key is consumed once and a replay fails', async () => {
  const { alice, bob } = await pair();

  const m0 = await DR.encrypt(alice, 'zero');
  const m1 = await DR.encrypt(alice, 'one');

  assert.equal(await DR.decrypt(bob, m1.header, m1.ciphertext, m1.iv), 'one');
  assert.equal(await DR.decrypt(bob, m0.header, m0.ciphertext, m0.iv), 'zero');

  // The skipped key was deleted after use; replaying the message must fail.
  await assert.rejects(
    () => DR.decrypt(bob, m0.header, m0.ciphertext, m0.iv),
    /./,
    'replaying a consumed message key must not decrypt'
  );
});

test('ratchet: exceeding the skip cap is rejected, not silently dropped', async () => {
  const { alice, bob } = await pair();

  const m0 = await DR.encrypt(alice, 'zero');
  const forged = { dh: m0.header.dh, pn: m0.header.pn, n: 5000 };

  await assert.rejects(
    () => DR.decrypt(bob, forged, m0.ciphertext, m0.iv),
    /Too many skipped messages/
  );
});

test('ratchet: a short root key is rejected as a downgrade', async () => {
  const bobDH = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const bobPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', bobDH.publicKey));

  await assert.rejects(
    () => DR.initAsInitiator(new Uint8Array(16), bobPubRaw),
    /Downgrade attack detected/
  );
  await assert.rejects(() => DR.initAsReceiver(null, bobDH), /Downgrade attack detected/);
  await assert.rejects(
    () => DR.initAsReceiver(new Uint8Array(31), bobDH),
    /Downgrade attack detected/
  );
});

test('ratchet: encrypt before the sending chain exists throws', async () => {
  const bobDH = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const bob = await DR.initAsReceiver(rootKey(), bobDH);
  await assert.rejects(() => DR.encrypt(bob, 'x'), /No sending chain/);
});

test('ratchet: state can be exported, imported and still decrypt', async () => {
  const { alice, bob } = await pair();

  const m0 = await DR.encrypt(alice, 'persist me');
  const snapshot = await DR.exportState(bob);
  assert.ok(Array.isArray(snapshot.rootKey));
  assert.ok(Array.isArray(snapshot.selfDHPrivatePkcs8));

  const restored = await DR.importState(snapshot);
  assert.equal(await DR.decrypt(restored, m0.header, m0.ciphertext, m0.iv), 'persist me');
});

test('ratchet: import tolerates a snapshot without a private key', async () => {
  const { bob } = await pair();
  const snapshot = await DR.exportState(bob);
  delete snapshot.selfDHPrivatePkcs8;

  const restored = await DR.importState(snapshot);
  assert.equal(restored.selfDH, null);
  assert.deepEqual(Array.from(restored.rootKey), snapshot.rootKey);
});

test('sm2: sign and verify accept a valid signature', () => {
  const { privateKey, publicKey } = SM2.generateKeyPair();
  const pubHex = SM2.publicKeyToHex(publicKey);
  const digest = crypto.createHash('sha256').update('message').digest('hex');

  const { r, s } = SM2.sign(privateKey, digest);
  assert.equal(SM2.verify(pubHex, digest, r, s), true);
});

test('sm2: verify rejects tampered, zero and malformed signatures', () => {
  const { privateKey, publicKey } = SM2.generateKeyPair();
  const pubHex = SM2.publicKeyToHex(publicKey);
  const digest = crypto.createHash('sha256').update('message').digest('hex');
  const { r, s } = SM2.sign(privateKey, digest);

  const otherDigest = crypto.createHash('sha256').update('other').digest('hex');
  assert.equal(SM2.verify(pubHex, otherDigest, r, s), false);

  const zero = '0'.repeat(64);
  assert.equal(SM2.verify(pubHex, digest, zero, s), false);
  assert.equal(SM2.verify(pubHex, digest, r, zero), false);

  // Uncompressed point prefix and length are both checked before arithmetic.
  assert.equal(SM2.verify('03' + pubHex.slice(2), digest, r, s), false);
  assert.equal(SM2.verify(pubHex.slice(0, 100), digest, r, s), false);
});

test('sm2: encrypt and decrypt round-trip, including multi-block payloads', () => {
  const { privateKey, publicKey } = SM2.generateKeyPair();
  const pubHex = SM2.publicKeyToHex(publicKey);

  for (const message of ['', 'a', 'a longer message that spans several key blocks']) {
    const { c1, c2 } = SM2.encrypt(pubHex, message);
    assert.equal(SM2.decrypt(privateKey, c1, c2), message);
  }
});

test('sm2: modInv rejects zero and inverts a field element', () => {
  assert.throws(() => SM2.modInv(BigInt(0), SM2.SM2_N), /zero has no inverse/);

  const a = BigInt(12345);
  const inverse = SM2.modInv(a, SM2.SM2_N);
  assert.equal((a * inverse) % SM2.SM2_N, BigInt(1));
});

test('sm2: serialisation helpers keep the width stable', () => {
  assert.equal(SM2.hexPad('abc'), '0abc');
  assert.equal(SM2.hexPad('abcd'), 'abcd');
  assert.equal(SM2.bigIntToHex(SM2.hexToBigInt('00ff')), 'ff');
  assert.equal(SM2.bigIntToHex(BigInt(255)), 'ff');
});

test('sm2: the point layer agrees on scalar multiplication', () => {
  const d = BigInt('0x1234567890abcdef');
  const P = SM2.publicKeyFromPrivate(d);
  const viaMultiply = SM2.pointMultiply(d, SM2.G);
  assert.equal(SM2.publicKeyToHex(P), SM2.publicKeyToHex(viaMultiply));

  const doubled = SM2.pointDouble(SM2.G);
  const timesTwo = SM2.pointMultiply(BigInt(2), SM2.G);
  assert.equal(SM2.publicKeyToHex(doubled), SM2.publicKeyToHex(timesTwo));

  assert.equal(SM2.isInf(SM2.INFINITY), true);
  const sum = SM2.pointAdd(SM2.INFINITY, SM2.G);
  assert.equal(SM2.publicKeyToHex(sum), SM2.publicKeyToHex(SM2.G));
});

test('sm2: both sides derive the same shared secret', () => {
  const alice = SM2.generateKeyPair();
  const bob = SM2.generateKeyPair();
  const alicePub = SM2.publicKeyToHex(alice.publicKey);
  const bobPub = SM2.publicKeyToHex(bob.publicKey);

  const fromAlice = SM2.doExchange(alice.privateKey, bobPub);
  const fromBob = SM2.doExchange(bob.privateKey, alicePub);
  assert.equal(fromAlice, fromBob);
});

test('sm2: wNAF helpers are deterministic and the G table can be reset', () => {
  const digits = SM2.wnafDigits(BigInt(12345));
  assert.ok(Array.isArray(digits));
  assert.deepEqual(digits, SM2.wnafDigits(BigInt(12345)));

  const table = SM2.buildWnafTable(SM2.G);
  assert.ok(table.length > 0);

  SM2.resetGTable();
  const rebuilt = SM2.getGTable();
  assert.ok(rebuilt.length > 0);
});

// ============================================================
//  Hybrid PQ ratchet session
// ============================================================

const PQ = require('../double-ratchet-pq');

async function pqPair() {
  const bobPQ = PQ.generatePQKeypair();
  const bobP256 = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const bobP256Pub = Buffer.from(await crypto.subtle.exportKey('raw', bobP256.publicKey));

  const alice = new PQ.PQRatchetSession();
  const hello = await alice.initAsAlice(bobPQ.publicKey, bobP256Pub);

  const bob = new PQ.PQRatchetSession();
  await bob.initAsBob(bobPQ.secretKey, bobP256, hello.kemCt, hello.ekPub);

  return { alice, bob, hello };
}

test('pq session: hybrid handshake carries messages both ways', async () => {
  const { alice, bob, hello } = await pqPair();

  assert.equal(hello.kemCt.length, 1088);
  assert.equal(hello.ourPQPubKey.length, 1184);

  const m0 = await alice.encrypt('hello bob');
  assert.equal(await bob.decrypt(m0.header_clean, m0.ciphertext, m0.iv), 'hello bob');

  const m1 = await bob.encrypt('hello alice');
  assert.equal(await alice.decrypt(m1.header_clean, m1.ciphertext, m1.iv), 'hello alice');
});

test('pq session: using an uninitialised session throws', async () => {
  const s = new PQ.PQRatchetSession();
  await assert.rejects(() => s.encrypt('x'), /Session not initialized/);
  await assert.rejects(() => s.decrypt({ dh: [], pn: 0, n: 0 }, [], []), /Session not initialized/);
});

test('pq session: state survives serialisation and keeps decrypting', async () => {
  const { alice, bob } = await pqPair();

  const m0 = await alice.encrypt('persist');
  const restored = await PQ.PQRatchetSession.deserialize(await bob.serializeAsync());
  assert.equal(await restored.decrypt(m0.header_clean, m0.ciphertext, m0.iv), 'persist');
});

test('pq session: a rekey exchange converges on the same root key', async () => {
  const { alice, bob } = await pqPair();

  const newPair = PQ.rekey_initiate();
  const ct = await bob.handleRekeyRequest(newPair.publicKey);
  const { newRootKey } = await alice.handleRekeyResponse(newPair.publicKey, ct, newPair.secretKey);

  assert.equal(
    Buffer.from(newRootKey).toString('hex'),
    Buffer.from(bob.rootKey).toString('hex')
  );
  assert.equal(alice.sentCountSinceRekey, 0);
  assert.equal(bob.sentCountSinceRekey, 0);
});

test('pq session: the rekey hint appears at the configured interval', async () => {
  const { alice } = await pqPair();
  alice.sentCountSinceRekey = 99;

  const m = await alice.encrypt('trigger');
  assert.equal(m._pq_rekey.needed, true);
  assert.equal(m._pq_rekey.newPQPubKey.length, 1184);

  // The counter is only reset when the rekey is handled, so the hint repeats
  // until then — it must not silently disappear.
  const stillHinting = await alice.encrypt('still hinting');
  assert.equal(stillHinting._pq_rekey.needed, true);
});

test('pq session: the peer P-256 key can be updated', async () => {
  const { alice } = await pqPair();
  const replacement = Buffer.alloc(65, 4);
  alice.updatePeerP256Pub(replacement);
  assert.equal(alice.peerP256PublicKey, replacement);
});
