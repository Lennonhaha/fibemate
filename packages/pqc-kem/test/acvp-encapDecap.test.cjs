// SPDX-License-Identifier: Apache-2.0
// ACVP ML-KEM encapDecap (FIPS 203) — known-answer vectors from NIST.
//
// Coverage: encapsulation (75) + decapsulation (30, including implicit-rejection
// cases). The 60 key-check cases are skipped with an explicit reason: the package
// has no EncapsKeyCheck/DecapsKeyCheck entry point yet, and inventing expected
// behaviour for them would test the test rather than the implementation.
//
// Vectors: test/vectors/mlkem-encapdecap.json, rebuilt by test/acvp-vectors.mjs.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { test } = require('node:test');

const kem = require('../index.js');
const VECTORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors', 'mlkem-encapdecap.json'), 'utf8'));

const hexToBytes = h => Buffer.from(h, 'hex');
const bytesEqual = (a, b) => Buffer.from(a).equals(Buffer.from(b));

const byFunction = fn => VECTORS.groups.filter(g => g.function === fn);

test('vector file provenance', () => {
  assert.strictEqual(VECTORS.total, 165, 'expected 165 encapDecap cases');
  const perFunction = {};
  for (const g of VECTORS.groups) perFunction[g.function] = (perFunction[g.function] || 0) + g.tests.length;
  assert.deepStrictEqual(perFunction, {
    encapsulation: 75,
    decapsulation: 30,
    decapsulationKeyCheck: 30,
    encapsulationKeyCheck: 30,
  });
});

// ---------- encapsulation ----------
for (const group of byFunction('encapsulation')) {
  test(`ACVP ${group.parameterSet} encapsulation tgId=${group.tgId} (${group.tests.length})`, () => {
    kem.loadParams(group.parameterSet);
    const failures = [];

    for (const v of group.tests) {
      const r = kem.encapsulateDerand(hexToBytes(v.ek), hexToBytes(v.m));
      const cOk = bytesEqual(r.ciphertext, hexToBytes(v.expectedC));
      const kOk = bytesEqual(r.sharedSecret, hexToBytes(v.expectedK));
      if (!cOk || !kOk) failures.push({ tcId: v.tcId, cOk, kOk });
    }

    if (failures.length) console.error('first failure:', failures[0]);
    console.log(`[${group.parameterSet}] encaps passed=${group.tests.length - failures.length}/${group.tests.length}`);
    assert.strictEqual(failures.length, 0);
  });
}

// ---------- decapsulation ----------
for (const group of byFunction('decapsulation')) {
  test(`ACVP ${group.parameterSet} decapsulation tgId=${group.tgId} (${group.tests.length})`, () => {
    kem.loadParams(group.parameterSet);
    const failures = [];

    for (const v of group.tests) {
      const k = kem.decapsulate(hexToBytes(v.dk), hexToBytes(v.c));
      if (!bytesEqual(k, hexToBytes(v.expectedK))) failures.push({ tcId: v.tcId });
    }

    if (failures.length) console.error('first failure:', failures[0]);
    console.log(`[${group.parameterSet}] decaps passed=${group.tests.length - failures.length}/${group.tests.length}`);
    assert.strictEqual(failures.length, 0);
  });
}

// ---------- key checks ----------
for (const group of byFunction('decapsulationKeyCheck').concat(byFunction('encapsulationKeyCheck'))) {
  test(`ACVP ${group.parameterSet} ${group.function} tgId=${group.tgId} — skipped: no public key-check API`, { skip: true }, () => {});
}

test('derand encapsulation rejects a malformed message seed', () => {
  const ek = hexToBytes(VECTORS.groups.find(g => g.function === 'encapsulation').tests[0].ek);
  assert.throws(() => kem.encapsulateDerand(ek, new Uint8Array(31)), /m must be 32 bytes/);
});
