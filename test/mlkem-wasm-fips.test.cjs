// SPDX-License-Identifier: GPL-3.0-only
/**
 * ML-KEM-768 WebAssembly artifact must be FIPS 203 — not Kyber round 3.
 *
 * The artifact under www/crypto/wasm/mlkem-fips is built from
 * wasm/mlkem-fips203 (libcrux-ml-kem 0.0.10). This test is the gate that keeps
 * it honest: every byte is compared against @noble/post-quantum, an independent
 * implementation, on fixed seeds. "It round-trips with itself" is not evidence.
 *
 * Run: node --test test/mlkem-wasm-fips.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'www', 'crypto', 'wasm', 'mlkem-fips');
const wasmPath = path.join(PKG, 'mlkem_fips_bg.wasm');
const jsPath = path.join(PKG, 'mlkem_fips.js');

const noble = require('@noble/post-quantum/ml-kem.js');

let mod;

test.before(async () => {
  assert.ok(fs.existsSync(wasmPath), `missing artifact: ${wasmPath} (run wasm/mlkem-fips203/build.sh)`);
  assert.ok(fs.existsSync(jsPath), `missing glue: ${jsPath}`);
  mod = await import(pathToFileURL(jsPath).href);
  mod.initSync({ module: new WebAssembly.Module(fs.readFileSync(wasmPath)) });
});

function seeds(i) {
  const d = Buffer.alloc(32);
  const z = Buffer.alloc(32);
  const m = Buffer.alloc(32);
  for (let k = 0; k < 32; k++) {
    d[k] = (i * 17 + k) & 0xff;
    z[k] = (i * 31 + k + 7) & 0xff;
    m[k] = (i * 53 + k + 13) & 0xff;
  }
  return { d, z, m };
}

const eq = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

test('artifact reports the FIPS 203 backend', () => {
  assert.match(mod.version(), /FIPS 203/);
  assert.match(mod.version(), /libcrux-ml-kem 0\.0\.10/);
});

test('keygen / encaps / decaps are byte-identical to @noble on 3 fixed seeds', () => {
  for (let i = 0; i < 3; i++) {
    const { d, z, m } = seeds(i);
    const seed = Buffer.concat([d, z]);

    const kp = Buffer.from(mod.keygen_derand(d, z));
    assert.strictEqual(kp.length, 1184 + 2400, `seed#${i} keypair length`);
    const pk = kp.subarray(0, 1184);
    const sk = kp.subarray(1184);

    const enc = Buffer.from(mod.encaps_derand(pk, m));
    assert.strictEqual(enc.length, 1088 + 32, `seed#${i} encapsulation length`);
    const ct = enc.subarray(0, 1088);
    const ss = enc.subarray(1088);

    const ref = noble.ml_kem768.keygen(seed);
    assert.ok(eq(pk, ref.publicKey), `seed#${i} pk differs from noble`);
    assert.ok(eq(sk, ref.secretKey), `seed#${i} sk differs from noble`);

    const refEnc = noble.ml_kem768.encapsulate(ref.publicKey, m);
    assert.ok(eq(ct, refEnc.cipherText), `seed#${i} ct differs from noble`);
    assert.ok(eq(ss, refEnc.sharedSecret), `seed#${i} ss differs from noble`);

    const dec = Buffer.from(mod.decaps(sk, ct));
    assert.ok(eq(dec, refEnc.sharedSecret), `seed#${i} decaps ss differs`);

    // Cross-direction: noble must be able to decapsulate our ciphertext.
    const nobleDec = noble.ml_kem768.decapsulate(ct, ref.secretKey);
    assert.ok(eq(nobleDec, ss), `seed#${i} noble cannot decapsulate our ct`);
  }
});

test('tampered ciphertext is rejected implicitly (returns a different ss, never throws)', () => {
  const { d, z, m } = seeds(0);
  const kp = Buffer.from(mod.keygen_derand(d, z));
  const pk = kp.subarray(0, 1184);
  const sk = kp.subarray(1184);
  const enc = Buffer.from(mod.encaps_derand(pk, m));
  const ct = Buffer.from(enc.subarray(0, 1088));
  const ss = enc.subarray(1088);

  ct[42] ^= 0x01;
  const dec = Buffer.from(mod.decaps(sk, ct));
  assert.strictEqual(dec.length, 32);
  assert.ok(!eq(dec, ss), 'implicit rejection must not return the real shared secret');
});

test('length validation fails closed', () => {
  assert.throws(() => mod.keygen_derand(Buffer.alloc(31), Buffer.alloc(32)), /32 bytes/);
  assert.throws(() => mod.encaps_derand(Buffer.alloc(1183), Buffer.alloc(32)), /1184 bytes/);
  assert.throws(() => mod.decaps(Buffer.alloc(2399), Buffer.alloc(1088)), /2400 bytes/);
  assert.throws(() => mod.decaps(Buffer.alloc(2400), Buffer.alloc(1087)), /1088 bytes/);
});

test('a non-canonical encapsulation key is rejected by the FIPS 203 §7.2 check', () => {
  const { d, z } = seeds(1);
  const pk = Buffer.from(mod.keygen_derand(d, z)).subarray(0, 1184);
  assert.strictEqual(mod.validate_public_key(pk), true);
  const bad = Buffer.from(pk);
  // 12-bit coefficients are packed little-endian; 0xFFF is the only non-canonical value.
  bad[0] = 0xff;
  bad[1] = 0xff;
  assert.strictEqual(mod.validate_public_key(bad), false);
});
