// SPDX-License-Identifier: GPL-3.0-only
// packages/pqc-kem/test/input-length.test.js
//
// Regression for the 2026-11-15 audit finding: decapsulate() accepted any
// secret-key length. sk-1, sk+1, an empty array and 2400 bytes of 0xAA all
// returned a 32-byte "shared secret" without error; sk+1 returned the same value
// as sk-1, so the trailing byte was silently ignored. Ciphertext mismatches did
// fail closed, but through an internal `ctEqMask length mismatch` assertion
// instead of an error naming the parameter.
//
// Contract now: both lengths are checked at the public boundary (index.js, so it
// covers both the JS and the native backend) with RangeError naming the expected
// size, and a non-Uint8Array is a TypeError.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const kem = require(join(here, '..', 'index.js'));

const SK = kem.SECRET_KEY_BYTES;
const CT = kem.CIPHERTEXT_BYTES;
const PK = kem.PUBLIC_KEY_BYTES;

function expectRangeError(fn, param) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof RangeError, `expected RangeError, got ${e.constructor.name}: ${e.message}`);
    assert.match(e.message, /must be \d+ bytes, got \d+/);
    assert.ok(e.message.includes(param), `message should name ${param}: ${e.message}`);
    return;
  }
  assert.fail('expected a throw, got a return value');
}

describe('ml-kem-768 decapsulate input length validation', () => {
  const { publicKey, secretKey } = kem.generateKeypair();
  const { ciphertext, sharedSecret } = kem.encapsulate(publicKey);

  it('declares the FIPS 203 sizes', () => {
    assert.equal(PK, 1184);
    assert.equal(SK, 2400);
    assert.equal(CT, 1088);
  });

  it('honest baseline still round-trips', () => {
    // encapsulate returns a Buffer, decapsulate a Uint8Array; compare content, not prototypes.
    const ss = kem.decapsulate(secretKey, ciphertext);
    assert.equal(ss.length, 32);
    assert.equal(Buffer.compare(Buffer.from(ss), Buffer.from(sharedSecret)), 0);
  });

  for (const delta of [-1, 1, -100, 100]) {
    const label = `${delta > 0 ? '+' : ''}${delta}`;

    it(`rejects secretKey with ${label} bytes`, () => {
      const bad = delta > 0
        ? new Uint8Array(SK + delta).fill(0xAA)
        : secretKey.slice(0, SK + delta);
      expectRangeError(() => kem.decapsulate(bad, ciphertext), 'secretKey');
    });

    it(`rejects ciphertext with ${label} bytes`, () => {
      const bad = delta > 0
        ? new Uint8Array(CT + delta)
        : ciphertext.slice(0, CT + delta);
      expectRangeError(() => kem.decapsulate(secretKey, bad), 'ciphertext');
    });
  }

  it('rejects empty secretKey', () => {
    expectRangeError(() => kem.decapsulate(new Uint8Array(0), ciphertext), 'secretKey');
  });

  it('rejects empty ciphertext', () => {
    expectRangeError(() => kem.decapsulate(secretKey, new Uint8Array(0)), 'ciphertext');
  });

  it('rejects non-Uint8Array arguments', () => {
    assert.throws(() => kem.decapsulate(null, ciphertext), TypeError);
    assert.throws(() => kem.decapsulate(secretKey, 'not-bytes'), TypeError);
  });

  it('still applies implicit rejection for a well-formed but wrong ciphertext', () => {
    // Correct length, garbage content: FIPS 203 requires a pseudo-random secret,
    // not a throw. The length checks must not have broken that path.
    const garbage = new Uint8Array(CT).fill(0xAA);
    const ss = kem.decapsulate(secretKey, garbage);
    assert.equal(ss.length, 32);
    assert.notDeepEqual(ss, sharedSecret);
  });
});
