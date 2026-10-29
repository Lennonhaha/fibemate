// SPDX-License-Identifier: Apache-2.0
/**
 * fibemate-pqc-kem -- SHA-3 / SHAKE backends (issue #384)
 *
 * Why this file exists
 * --------------------
 * The package used to carry a hand-written Keccak as its last-resort hash
 * backend. That implementation produced digests that were not SHA-3, and it
 * was reachable: the @noble/hashes subpath in front of it did not resolve on
 * v2 (the export map requires the `.js` suffix), so any runtime without SHA-3
 * in node:crypto went straight to the wrong code. Every published KAT still
 * passed, because node:crypto answered first.
 *
 * The backend is gone. These checks pin the replacement:
 *
 *   1. Published NIST vectors. Not "whatever the code prints today" -- the
 *      values below are the standard's own answers for the empty string and
 *      for "abc", so a wrong Keccak cannot pass by agreeing with itself.
 *   2. Both hash functions agree with node:crypto across inputs that span
 *      block boundaries (rate = 136 / 72 bytes), including the padding edge
 *      where the suffix byte and the final 0x80 land in the same block.
 *   3. The @noble/hashes backend is actually resolvable, so the second
 *      fallback is not dead code the way the old one was.
 *   4. The removed implementation cannot come back silently: the source must
 *      not contain the Keccak permutation, and the fail-loud path must exist.
 */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const kem = require('../src/ml-kem-768.js');

const SRC = path.join(__dirname, '..', 'src', 'ml-kem-768.js');
const hex = (b) => Buffer.from(b).toString('hex');

let checks = 0;
function ok(name, fn) {
  fn();
  checks += 1;
  console.log('  ok  ' + name);
}

// --- 1. Published NIST FIPS 202 vectors -------------------------------------
// SHA3-256(""), SHA3-512(""), SHAKE128("",32), SHAKE256("",32),
// SHA3-256("abc"). These are the standard's values, not a recording.
ok('SHA3-256("") matches FIPS 202', () => {
  assert.strictEqual(
    hex(kem.sha3_256(new Uint8Array(0))),
    'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a'
  );
});

ok('SHA3-512("") matches FIPS 202', () => {
  assert.strictEqual(
    hex(kem.sha3_512(new Uint8Array(0))),
    'a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26'
  );
});

ok('SHAKE128("",32) matches FIPS 202', () => {
  assert.strictEqual(
    hex(kem.shake128(new Uint8Array(0), 32)),
    '7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26'
  );
});

ok('SHAKE256("",32) matches FIPS 202', () => {
  assert.strictEqual(
    hex(kem.shake256(new Uint8Array(0), 32)),
    '46b9dd2b0ba88d13233b3feb743eeb243fcd52ea62b81b82b50c27646ed5762f'
  );
});

ok('SHA3-256("abc") matches FIPS 202', () => {
  assert.strictEqual(
    hex(kem.sha3_256(new Uint8Array(Buffer.from('abc')))),
    '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'
  );
});

// --- 2. Agreement with node:crypto across padding edges ---------------------
// 135/136/137 straddle the SHA3-256 rate; 71/72/73 straddle SHA3-512's; the
// same lengths exercise SHAKE. A Keccak that hashes the final partial block
// differently shows up here even when the empty-string vector passes.
ok('sha3_256 agrees with node:crypto over block edges', () => {
  for (const n of [0, 1, 63, 64, 71, 72, 73, 135, 136, 137, 271, 272, 273, 1000]) {
    const d = crypto.randomBytes(n);
    assert.strictEqual(
      hex(kem.sha3_256(new Uint8Array(d))),
      crypto.createHash('sha3-256').update(d).digest('hex'),
      'length ' + n
    );
  }
});

ok('sha3_512 agrees with node:crypto over block edges', () => {
  for (const n of [0, 1, 71, 72, 73, 143, 144, 145, 1000]) {
    const d = crypto.randomBytes(n);
    assert.strictEqual(
      hex(kem.sha3_512(new Uint8Array(d))),
      crypto.createHash('sha3-512').update(d).digest('hex'),
      'length ' + n
    );
  }
});

ok('shake128 / shake256 agree with node:crypto for several output lengths', () => {
  for (const n of [0, 71, 72, 73, 136, 200]) {
    const d = crypto.randomBytes(n);
    for (const len of [16, 32, 33, 64, 200]) {
      assert.strictEqual(
        hex(kem.shake128(new Uint8Array(d), len)),
        crypto.createHash('shake128', { outputLength: len }).update(d).digest('hex'),
        'shake128 n=' + n + ' len=' + len
      );
      assert.strictEqual(
        hex(kem.shake256(new Uint8Array(d), len)),
        crypto.createHash('shake256', { outputLength: len }).update(d).digest('hex'),
        'shake256 n=' + n + ' len=' + len
      );
    }
  }
});

// --- 3. The noble fallback is alive ----------------------------------------
// The old code tried `@noble/hashes/sha3`, which throws ERR_PACKAGE_PATH_NOT_
// EXPORTED on v2. That threw inside a bare `catch` and the buggy Keccak ran.
// Both spellings are checked so a future v3 cannot quietly kill this path.
ok('@noble/hashes sha3 backend resolves', () => {
  let mod = null;
  for (const id of ['@noble/hashes/sha3.js', '@noble/hashes/sha3']) {
    try { mod = require(id); break; } catch (_e) { /* next */ }
  }
  assert.ok(mod, 'neither @noble/hashes/sha3.js nor @noble/hashes/sha3 resolved');
  for (const fn of ['sha3_256', 'sha3_512', 'shake128', 'shake256']) {
    assert.strictEqual(typeof mod[fn], 'function', 'noble is missing ' + fn);
  }
  assert.strictEqual(
    Buffer.from(mod.sha3_256(new Uint8Array(0))).toString('hex'),
    'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
    'the noble backend does not agree with FIPS 202'
  );
});

// --- 4. The removed implementation stays removed ---------------------------
const src = fs.readFileSync(SRC, 'utf8');

ok('the hand-written Keccak permutation is gone from the source', () => {
  for (const token of ['KeccakF1600', 'KeccakRC', 'KeccakRhoOffsets', 'KeccakPiOffsets', 'function keccak(']) {
    assert.ok(!src.includes(token), 'source still contains ' + token);
  }
});

ok('a missing backend fails loudly instead of degrading', () => {
  assert.ok(src.includes('FIBEMATE_PQC_KEM_NO_SHA3'), 'no fail-loud error code in source');
  assert.ok(src.includes('noSha3Backend'), 'no noSha3Backend helper in source');
});

console.log('\nhash-backends: ' + checks + ' checks passed');
