// SPDX-License-Identifier: Apache-2.0
// ACVP ML-KEM keyGen (FIPS 203) — known-answer vectors from NIST.
//
// Vectors live in test/vectors/mlkem-keygen.json (see test/acvp-vectors.mjs for
// provenance and the pinned upstream blob SHAs), so this runs offline on a clean
// checkout. Everything goes through the package's public entry point.
//
// The deterministic entry points are JS-backend by design (see index.js): the KAT
// must not silently switch to a native build that orders the seeds differently.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { test } = require('node:test');

const kem = require('../index.js');
const VECTORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors', 'mlkem-keygen.json'), 'utf8'));

const hexToBytes = h => Buffer.from(h, 'hex');
const bytesEqual = (a, b) => Buffer.from(a).equals(Buffer.from(b));

test('vector file provenance', () => {
  assert.strictEqual(VECTORS.total, 75, 'expected 75 keyGen cases');
  assert.strictEqual(VECTORS.provenance.files.length, 2, 'prompt + expectedResults');
  for (const f of VECTORS.provenance.files) {
    assert.match(f.blob_sha, /^[0-9a-f]{40}$/, 'pinned upstream blob sha');
    assert.match(f.sha256, /^[0-9a-f]{64}$/, 'local checksum');
  }
});

for (const group of VECTORS.groups) {
  test(`ACVP ML-KEM-keyGen ${group.parameterSet} tgId=${group.tgId} (${group.tests.length} cases)`, () => {
    kem.loadParams(group.parameterSet);
    const failures = [];

    for (const v of group.tests) {
      const kp = kem.generateKeypairDerand(hexToBytes(v.d), hexToBytes(v.z));
      const pkOk = bytesEqual(kp.publicKey, hexToBytes(v.ek));
      const skOk = bytesEqual(kp.secretKey, hexToBytes(v.dk));
      if (!pkOk || !skOk) {
        failures.push({
          tcId: v.tcId,
          pkOk,
          skOk,
          gotPk: Buffer.from(kp.publicKey).toString('hex').slice(0, 32),
          expPk: v.ek.slice(0, 32),
        });
      }
    }

    if (failures.length) console.error('first failure:', JSON.stringify(failures[0], null, 2));
    console.log(`[${group.parameterSet}] keyGen passed=${group.tests.length - failures.length}/${group.tests.length}`);
    assert.strictEqual(failures.length, 0, `${failures.length} failures in ${group.parameterSet}`);
  });
}

test('derand keygen rejects malformed seeds', () => {
  assert.throws(() => kem.generateKeypairDerand(new Uint8Array(31), new Uint8Array(32)), /d must be 32 bytes/);
  assert.throws(() => kem.generateKeypairDerand(new Uint8Array(32), new Uint8Array(16)), /z must be 32 bytes/);
});
