// SPDX-License-Identifier: GPL-3.0-only
// packages/fml-dsa/test/interop-oracle.test.js
//
// Byte-level interop between packages/fml-dsa/src/core (pure JS, FIPS 204) and
// @noble/post-quantum as an independent oracle.
//
// Three fixed seeds, eight assertions each (24 total). Every row is PASS or FAIL; there is
// no warn(), and a missing oracle is a hard failure, because "the oracle was not present"
// and "the implementation is correct" must never print the same output.
//
// The seed is injected by replacing crypto.getRandomValues for the duration of keygen, so
// the two implementations are asked to expand the same zeta.

import { createHash } from 'node:crypto';
import { keygen } from '../src/core/keygen.js';
import { sign } from '../src/core/sign.js';
import { verify } from '../src/core/verify.js';
import { encodePK, encodeSK, encodeSig } from '../src/core/encode.js';
import { ml_dsa65 as noble } from '@noble/post-quantum/ml-dsa.js';

const PARAM = 'ML-DSA-65';
const seeds = [1, 2, 3];

const shake = (label, n) => createHash('shake256', { outputLength: n }).update(label).digest();
const hex = (u8) => Buffer.from(u8).toString('hex').slice(0, 16);
const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));

let passed = 0;
let failed = 0;
const rows = [];

function check(seed, name, pass, detail = '') {
  if (pass) passed += 1;
  else failed += 1;
  rows.push(`${pass ? 'PASS' : 'FAIL'}  ${seed}  ${name.padEnd(38)}  ${detail}`);
}

/** Run fn with crypto.getRandomValues pinned to zeta on the first call. */
function withSeed(zeta, fn) {
  const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  const base = Buffer.from(zeta);
  let first = true;
  let counter = 0;
  globalThis.crypto.getRandomValues = (arr) => {
    if (first) {
      first = false;
      arr.set(base.subarray(0, arr.length));
      return arr;
    }
    counter += 1;
    const stream = shake(Buffer.concat([base, Buffer.from(`counter-${counter}`)]), arr.length);
    arr.set(stream.subarray(0, arr.length));
    return arr;
  };
  try {
    return fn();
  } finally {
    globalThis.crypto.getRandomValues = real;
  }
}

console.log('=== fml-dsa core vs @noble/post-quantum : byte-level interop ===');
console.log(`param=${PARAM} seeds=${seeds.length} oracle=@noble/post-quantum\n`);

for (const i of seeds) {
  const label = `S${i}`;
  const zeta = shake(`fibemate-interop-matrix/2026-10/seed-${i}`, 64).subarray(0, 32);
  const msg = shake(`fibemate-interop-matrix/2026-10/msg-${i}`, 32);

  const kp = withSeed(zeta, () => keygen(PARAM));
  const fmlPk = encodePK(kp.pk, PARAM);
  const fmlSk = encodeSK(kp.sk, PARAM);
  const oracleKp = noble.keygen(zeta);

  check(label, 'keygen pk byte-identical', eq(fmlPk, oracleKp.publicKey), `fml=${hex(fmlPk)} noble=${hex(oracleKp.publicKey)}`);
  check(label, 'keygen sk byte-identical', eq(fmlSk, oracleKp.secretKey), `sizes ${fmlSk.length}/${oracleKp.secretKey.length}`);

  const fmlSig = withSeed(shake(`sig-${i}`, 32), () => encodeSig(sign(kp.sk, msg, new Uint8Array(0), PARAM), PARAM));

  check(label, 'fml sign -> fml verify', verify(fmlPk, msg, fmlSig, new Uint8Array(0), PARAM) === true, `sig=${fmlSig.length}B`);
  check(label, 'fml sign -> noble verify', noble.verify(fmlSig, msg, fmlPk) === true, 'pk and sig both from fml');

  const nobleSig = noble.sign(msg, oracleKp.secretKey);
  check(label, 'noble sign -> noble verify', noble.verify(nobleSig, msg, oracleKp.publicKey) === true, `sig=${nobleSig.length}B`);
  check(label, 'noble sign -> fml verify', verify(oracleKp.publicKey, msg, nobleSig, new Uint8Array(0), PARAM) === true, 'pk and sig both from noble');

  const badSig = Uint8Array.from(fmlSig);
  badSig[7] ^= 0x01;
  const sigRejected =
    verify(fmlPk, msg, badSig, new Uint8Array(0), PARAM) === false &&
    noble.verify(badSig, msg, fmlPk) === false;
  check(label, 'flipped signature rejected (both)', sigRejected, '1 bit flipped at byte 7');

  const badPk = Uint8Array.from(fmlPk);
  badPk[3] ^= 0x01;
  check(label, 'flipped public key rejected (fml)', verify(badPk, msg, fmlSig, new Uint8Array(0), PARAM) === false, '1 bit flipped at byte 3');
}

for (const row of rows) console.log(row);
console.log(`\nRESULT: ${passed} passed, ${failed} failed | param=${PARAM} oracle=@noble/post-quantum seeds=3`);
if (failed === 0) console.log('verdict: fml-dsa core and the oracle agree byte-for-byte on pk and sk, and accept each other\'s signatures.');
process.exit(failed > 0 ? 1 : 0);
