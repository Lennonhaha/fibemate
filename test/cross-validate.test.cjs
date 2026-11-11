// SPDX-License-Identifier: Apache-2.0
'use strict';

/**
 * Tests for scripts/cross-validate-pqclean.cjs.
 *
 * The point of these tests is the plumbing, not agreement with NIST: the
 * .rsp cases below synthesise a response file from this repository's own
 * implementation, which proves the parser, the DRBG wiring and the KAT flow are
 * self-consistent. Agreement with NIST needs a real response file obtained from
 * outside; that is a separate run and is documented where it happens.
 *
 * The DRBG anchors are different in kind: they are fixed values from published
 * KAT files, so they catch a wrong AES call or a broken counter carry even
 * though nothing external is being executed here.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'cross-validate-pqclean.cjs');
const { Aes256CtrDrbg, DRBG_ANCHOR_SEED, DRBG_ANCHOR_FIRST_BLOCK } = require(SCRIPT);
const kem = require('../packages/pqc-kem/src/ml-kem-768.js');

const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'xv-'));
const write = (name, content) => {
  const p = path.join(tmpdir, name);
  fs.writeFileSync(p, content);
  return p;
};
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

/** One KAT-shaped record, derived the same way PQClean's nistkat.c derives it. */
function katRecord(count) {
  const entropy = Buffer.from(Array.from({ length: 48 }, (_, i) => i));
  const outer = new Aes256CtrDrbg();
  outer.init(entropy);
  // count 0 uses the first KAT seed; later counts continue the same stream.
  let seed;
  for (let i = 0; i <= count; i++) seed = outer.randomBytes(48);

  const drbg = new Aes256CtrDrbg();
  drbg.init(seed);
  const d = drbg.randomBytes(32);
  const z = drbg.randomBytes(32);
  const m = drbg.randomBytes(32);

  const { publicKey, secretKey } = kem.generateKeypairDerand(d, z);
  const { ciphertext, sharedSecret } = kem.encapsulateDerand(Buffer.from(publicKey), m);
  return {
    count,
    seed: seed.toString('hex').toUpperCase(),
    pk: Buffer.from(publicKey).toString('hex').toUpperCase(),
    sk: Buffer.from(secretKey).toString('hex').toUpperCase(),
    ct: Buffer.from(ciphertext).toString('hex').toUpperCase(),
    ss: Buffer.from(sharedSecret).toString('hex').toUpperCase(),
  };
}

function rspText(records) {
  return records
    .map(
      (r) =>
        `count = ${r.count}\nseed = ${r.seed}\npk = ${r.pk}\nsk = ${r.sk}\nct = ${r.ct}\nss = ${r.ss}\n`
    )
    .join('\n');
}

test('DRBG reproduces the published count-0 seed', () => {
  const d = new Aes256CtrDrbg();
  d.init(Buffer.from(Array.from({ length: 48 }, (_, i) => i)));
  assert.strictEqual(d.randomBytes(48).toString('hex').toUpperCase(), DRBG_ANCHOR_SEED);
});

test('DRBG reproduces the published first block after re-seeding', () => {
  const d = new Aes256CtrDrbg();
  d.init(Buffer.from(DRBG_ANCHOR_SEED, 'hex'));
  assert.strictEqual(d.randomBytes(32).toString('hex').toUpperCase(), DRBG_ANCHOR_FIRST_BLOCK);
});

test('a well-formed .rsp passes and reports every record', () => {
  const file = write('good.rsp', rspText([katRecord(0), katRecord(1)]));
  const r = run(['--vectors', file, '--format', 'rsp']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2\/2 vectors match \(0 failed\)/);
});

test('a flipped ciphertext byte fails and names the field', () => {
  const rec = katRecord(0);
  const flipped = Buffer.from(rec.ct, 'hex');
  flipped[7] ^= 0x01;
  rec.ct = flipped.toString('hex').toUpperCase();
  const file = write('flip.rsp', rspText([rec]));
  const r = run(['--vectors', file, '--format', 'rsp']);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /FAIL kat tcId=0/);
  assert.match(r.stdout, /ct differs at byte/);
});

test('--count limits how many records run', () => {
  const file = write('two.rsp', rspText([katRecord(0), katRecord(1)]));
  const r = run(['--vectors', file, '--format', 'rsp', '--count', '1']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /1\/1 vectors match/);
});

test('ACVP keyGen and encapDecap groups both pass', () => {
  const d = Buffer.alloc(32, 0x11);
  const z = Buffer.alloc(32, 0x22);
  const m = Buffer.alloc(32, 0x33);
  const { publicKey, secretKey } = kem.generateKeypairDerand(d, z);
  const { ciphertext, sharedSecret } = kem.encapsulateDerand(Buffer.from(publicKey), m);
  const doc = {
    testGroups: [
      {
        tgId: 1,
        tests: [
          {
            tcId: 1,
            d: d.toString('hex'),
            z: z.toString('hex'),
            ek: Buffer.from(publicKey).toString('hex'),
            dk: Buffer.from(secretKey).toString('hex'),
          },
        ],
      },
      {
        tgId: 2,
        tests: [
          {
            tcId: 2,
            m: m.toString('hex'),
            ek: Buffer.from(publicKey).toString('hex'),
            dk: Buffer.from(secretKey).toString('hex'),
            c: Buffer.from(ciphertext).toString('hex'),
            k: Buffer.from(sharedSecret).toString('hex'),
          },
        ],
      },
    ],
  };
  const file = write('acvp.json', JSON.stringify(doc));
  const r = run(['--vectors', file]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2\/2 vectors match/);
});

test('a tampered ACVP public key fails naming ek', () => {
  const d = Buffer.alloc(32, 0x44);
  const z = Buffer.alloc(32, 0x55);
  const { publicKey, secretKey } = kem.generateKeypairDerand(d, z);
  const ek = Buffer.from(publicKey);
  ek[0] ^= 0xff;
  const doc = {
    testGroups: [
      {
        tgId: 1,
        tests: [{ tcId: 1, d: d.toString('hex'), z: z.toString('hex'), ek: ek.toString('hex'), dk: Buffer.from(secretKey).toString('hex') }],
      },
    ],
  };
  const file = write('acvp-bad.json', JSON.stringify(doc));
  const r = run(['--vectors', file]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /ek differs at byte 0/);
});

test('usage errors and unreadable files have distinct exit codes', () => {
  assert.strictEqual(run([]).status, 2, 'no --vectors must exit 2');
  assert.strictEqual(run(['--vectors', path.join(tmpdir, 'nope.rsp'), '--format', 'rsp']).status, 3);
  const junk = write('junk.rsp', 'not a response file\n');
  assert.strictEqual(run(['--vectors', junk, '--format', 'rsp']).status, 3);
});

test('ACVP two-file layout joins prompt and expectedResults on tgId+tcId', () => {
  const d = Buffer.alloc(32, 0x66);
  const z = Buffer.alloc(32, 0x77);
  const { publicKey, secretKey } = kem.generateKeypairDerand(d, z);
  const prompt = {
    testGroups: [
      {
        tgId: 7,
        parameterSet: 'ML-KEM-768',
        testType: 'AFT',
        tests: [{ tcId: 3, d: d.toString('hex'), z: z.toString('hex') }],
      },
      {
        tgId: 8,
        parameterSet: 'ML-KEM-512',
        testType: 'AFT',
        tests: [{ tcId: 4, d: d.toString('hex'), z: z.toString('hex') }],
      },
    ],
  };
  const expected = {
    testGroups: [
      {
        tgId: 7,
        tests: [{ tcId: 3, ek: Buffer.from(publicKey).toString('hex'), dk: Buffer.from(secretKey).toString('hex') }],
      },
      {
        tgId: 8,
        tests: [{ tcId: 4, ek: Buffer.from(publicKey).toString('hex'), dk: Buffer.from(secretKey).toString('hex') }],
      },
    ],
  };
  const p = write('split-prompt.json', JSON.stringify(prompt));
  const e = write('split-expected.json', JSON.stringify(expected));

  const filtered = run(['--vectors', p, '--expected', e, '--parameter-set', 'ML-KEM-768']);
  assert.strictEqual(filtered.status, 0, filtered.stdout + filtered.stderr);
  assert.match(filtered.stdout, /1\/1 vectors match/);
  assert.match(filtered.stdout, /skipped 1 group\(s\) outside the requested parameter set/);

  const both = run(['--vectors', p, '--expected', e]);
  assert.strictEqual(both.status, 0, both.stdout + both.stderr);
  assert.match(both.stdout, /2\/2 vectors match/);
});

test('a prompt case with no expected entry is a hard error, not a skip', () => {
  const prompt = {
    testGroups: [{ tgId: 1, parameterSet: 'ML-KEM-768', tests: [{ tcId: 1, d: '00'.repeat(32), z: '11'.repeat(32) }] }],
  };
  const expected = { testGroups: [{ tgId: 99, tests: [{ tcId: 99, ek: '00', dk: '00' }] }] };
  const p = write('orphan-prompt.json', JSON.stringify(prompt));
  const e = write('orphan-expected.json', JSON.stringify(expected));
  const r = run(['--vectors', p, '--expected', e]);
  assert.strictEqual(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /no entry in --expected/);
});

test('a decapsulation vector is never re-encapsulated', () => {
  // The decapsulation groups in NIST's file carry no m. A harness that tries to
  // re-encapsulate fails with "m must be 32 bytes" instead of comparing k.
  const d = Buffer.alloc(32, 0x21);
  const z = Buffer.alloc(32, 0x22);
  const m = Buffer.alloc(32, 0x23);
  const { publicKey, secretKey } = kem.generateKeypairDerand(d, z);
  const { ciphertext, sharedSecret } = kem.encapsulateDerand(Buffer.from(publicKey), m);
  const prompt = {
    testGroups: [
      {
        tgId: 4,
        parameterSet: 'ML-KEM-768',
        function: 'decapsulation',
        tests: [{ tcId: 86, dk: Buffer.from(secretKey).toString('hex'), c: Buffer.from(ciphertext).toString('hex') }],
      },
    ],
  };
  const expected = { testGroups: [{ tgId: 4, tests: [{ tcId: 86, k: Buffer.from(sharedSecret).toString('hex') }] }] };
  const p = write('decap-prompt.json', JSON.stringify(prompt));
  const e = write('decap-expected.json', JSON.stringify(expected));
  const r = run(['--vectors', p, '--expected', e]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /1\/1 vectors match/);
});

test.after(() => {
  fs.rmSync(tmpdir, { recursive: true, force: true });
});
