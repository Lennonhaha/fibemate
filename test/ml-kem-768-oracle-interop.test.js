// SPDX-License-Identifier: GPL-3.0-only
/**
 * ML-KEM-768 cross-implementation oracle test.
 *
 * The repository used to carry two key-generation implementations. They were
 * each self-consistent and could not interoperate, and nothing caught it,
 * because the only comparison was implementation-against-itself. This test
 * pins the surviving implementation (packages/pqc-kem) to an independent
 * oracle (@noble/post-quantum, already a production dependency) on three
 * points that self-tests cannot reach:
 *
 *   1. identical seed  -> byte-identical public and secret key
 *   2. oracle encaps   -> our decapsulate recovers the same shared secret
 *   3. our encaps      -> oracle decapsulate recovers the same shared secret
 *
 * A vector that only checks "we can decrypt our own ciphertext" would pass
 * against a completely non-standard implementation, so it is not sufficient
 * evidence on its own.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const kem = require('../packages/pqc-kem/src/ml-kem-768.js');

// @noble/post-quantum is ESM-only; load it the same way test/test-cross-lang-seeded.js does.
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const requireEsm = createRequire(__filename);

let noble = null;

test.before(async () => {
  const noblePath = requireEsm.resolve('@noble/post-quantum/ml-kem.js');
  const mod = await import(pathToFileURL(noblePath).href);
  noble = mod.ml_kem768;
  assert.ok(noble, '@noble/post-quantum must expose ml_kem768');
});

const hex = (u8) => Buffer.from(u8).toString('hex');

function seeds(count) {
  const out = [];
  for (let n = 0; n < count; n++) {
    const seed = Buffer.alloc(64);
    for (let i = 0; i < 64; i++) seed[i] = (i * 7 + n * 13) & 0xff;
    out.push(new Uint8Array(seed));
  }
  return out;
}

test('keygen matches the oracle bit for bit, for several seeds', () => {
  for (const seed64 of seeds(3)) {
    const d = seed64.slice(0, 32);
    const z = seed64.slice(32, 64);

    const oracle = noble.keygen(seed64);
    const ours = kem.generateKeypairDerand(d, z);

    assert.strictEqual(hex(ours.publicKey), hex(oracle.publicKey), 'public key must be byte-identical to the oracle');
    assert.strictEqual(hex(ours.secretKey), hex(oracle.secretKey), 'secret key must be byte-identical to the oracle');
  }
});

test('oracle ciphertext decapsulates to the oracle shared secret', () => {
  const seed64 = seeds(1)[0];
  const oracle = noble.keygen(seed64);
  const enc = noble.encapsulate(oracle.publicKey);

  const ours = kem.decapsulate(oracle.secretKey, enc.cipherText);
  assert.strictEqual(hex(ours), hex(enc.sharedSecret));
});

test('our ciphertext decapsulates on the oracle', () => {
  const seed64 = seeds(1)[0];
  const d = seed64.slice(0, 32);
  const z = seed64.slice(32, 64);
  const ours = kem.generateKeypairDerand(d, z);

  const enc = kem.encapsulate(ours.publicKey);
  const oracleSecret = noble.decapsulate(enc.ciphertext, ours.secretKey);
  assert.strictEqual(hex(oracleSecret), hex(enc.sharedSecret));
});

test('encapsulation to an oracle key round-trips through our decapsulate', () => {
  const seed64 = seeds(1)[0];
  const oracle = noble.keygen(seed64);
  const enc = kem.encapsulate(oracle.publicKey);
  assert.strictEqual(
    hex(noble.decapsulate(enc.ciphertext, oracle.secretKey)),
    hex(enc.sharedSecret),
  );
});

test('the retired time-domain module stays deleted', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const retired = path.join(__dirname, '..', 'src', 'crypto', 'ml-kem-768-td.js');
  assert.strictEqual(fs.existsSync(retired), false,
    'src/crypto/ml-kem-768-td.js was retired on 2026-10-28: it shared no key material with the oracle. Restore it only with a passing interop test.');
});
