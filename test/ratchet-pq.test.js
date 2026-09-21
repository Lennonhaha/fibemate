// SPDX-License-Identifier: GPL-3.0-only
// ============================================================
// FIBEMATE PQ Ratchet (PQRatchetSession) unit tests
// Covers B1-B5 of P2-2 roadmap phase B:
//   B1 agreement, B2 tamper rejection, B3 cross-session isolation,
//   B4 PQ rekey interval (every 100 sent msgs), B5 out-of-order/skip recovery.
// Uses node:test native runner (consistent with test/totp.test.js).
// ============================================================

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  PQRatchetSession,
  generatePQKeypair,
  DoubleRatchet
} = require('../double-ratchet-pq');

// Build a mutually-initialized Alice/Bob pair sharing a root key.
// Bob generates an independent ML-KEM-768 keypair + P-256 DH keypair and
// publishes the public halves; Alice runs initiator, Bob runs receiver.
async function makeSessionPair() {
  const bobPQ = generatePQKeypair();                 // { publicKey, secretKey }
  const bobDH = await DoubleRatchet.generateDH();    // CryptoKeyPair {privateKey,publicKey}
  const bobDHExported = Buffer.from(await DoubleRatchet.exportPublicKey(bobDH));

  const alice = new PQRatchetSession();
  const aliceInit = await alice.initAsAlice(bobPQ.publicKey, bobDHExported);

  const bob = new PQRatchetSession();
  await bob.initAsBob(bobPQ.secretKey, bobDH, aliceInit.kemCt, aliceInit.ekPub);

  return { alice, bob };
}

// --- B1: agreement ---
test('B1: Alice encrypt -> Bob decrypt recovers plaintext', async () => {
  const { alice, bob } = await makeSessionPair();
  const pt = Buffer.from('hello pq ratchet');
  const enc = await alice.encrypt(pt);
  const dec = await bob.decrypt(enc.header, enc.ciphertext, enc.iv);
  assert.deepStrictEqual(Buffer.from(dec), pt);
});

// --- B2: tamper rejection ---
test('B2: tampered ciphertext fails to decrypt', async () => {
  const { alice, bob } = await makeSessionPair();
  const pt = Buffer.from('secret message');
  const enc = await alice.encrypt(pt);
  const tampered = Buffer.from(enc.ciphertext);
  tampered[0] ^= 0x01;
  await assert.rejects(
    bob.decrypt(enc.header, tampered, enc.iv),
    /Decryption failed|Error/i
  );
});

// --- B3: cross-session isolation ---
test('B3: two independent sessions produce distinct ciphertexts for same plaintext', async () => {
  const pairA = await makeSessionPair();
  const pairB = await makeSessionPair();
  const pt = Buffer.from('same plaintext');
  const encA = await pairA.alice.encrypt(pt);
  const encB = await pairB.alice.encrypt(pt);
  assert.notDeepStrictEqual(
    Buffer.from(encA.ciphertext),
    Buffer.from(encB.ciphertext)
  );
  // each still decrypts on its own pairing
  const decA = await pairA.bob.decrypt(encA.header, encA.ciphertext, encA.iv);
  const decB = await pairB.bob.decrypt(encB.header, encB.ciphertext, encB.iv);
  assert.deepStrictEqual(Buffer.from(decA), pt);
  assert.deepStrictEqual(Buffer.from(decB), pt);
});

// --- B4: PQ rekey interval (every 100 sent messages) ---
test('B4: _pq_rekey flag set exactly on the 100th encrypt', async () => {
  const { alice, bob } = await makeSessionPair();
  const pt = Buffer.from('msg');
  let rekeyAt = -1;
  for (let i = 1; i <= 100; i++) {
    const enc = await alice.encrypt(pt);
    // bob must consume to keep ratchet in sync
    await bob.decrypt(enc.header, enc.ciphertext, enc.iv);
    if (enc._pq_rekey && enc._pq_rekey.needed === true) {
      if (rekeyAt === -1) rekeyAt = i;
    }
  }
  assert.strictEqual(rekeyAt, 100, 'rekey flag expected exactly at message 100');
});

// --- B5: out-of-order / skipped-key recovery ---
test('B5: decrypting message 2 before message 1 recovers both', async () => {
  const { alice, bob } = await makeSessionPair();
  const m1 = await alice.encrypt(Buffer.from('message one'));
  const m2 = await alice.encrypt(Buffer.from('message two'));
  // Bob receives m2 first (out of order)
  const dec2 = await bob.decrypt(m2.header, m2.ciphertext, m2.iv);
  assert.deepStrictEqual(Buffer.from(dec2), Buffer.from('message two'));
  // then m1 (recovered via skipped-keys)
  const dec1 = await bob.decrypt(m1.header, m1.ciphertext, m1.iv);
  assert.deepStrictEqual(Buffer.from(dec1), Buffer.from('message one'));
});
