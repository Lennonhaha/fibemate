#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * cross-validate-pqclean.cjs — byte-exact ML-KEM-768 cross-validation harness.
 *
 * What this does
 * --------------
 * Feeds externally produced ML-KEM-768 vectors into this repository's
 * implementation and asserts that public key, secret key, ciphertext and shared
 * secret match byte for byte. A mismatch reports the first differing offset and
 * both values, not just "failed".
 *
 * Why it exists
 * -------------
 * A KAT that this repository generates from its own code proves the code is
 * self-consistent, not that it agrees with anyone else. The point of this script
 * is the outside opinion.
 *
 * Status (2026-11-11)
 * -------------------
 *   ACVP path          implemented and self-tested (test/cross-validate.test.cjs)
 *   PQClean .rsp path  implemented; DRBG ported from PQClean test/common/nistkatrng.c
 *                      and anchored to the published NIST KAT values listed below
 *
 * The DRBG
 * --------
 * A .rsp file gives one 48-byte seed per count; d, z and m have to be regenerated
 * deterministically. The generator is AES-256 CTR-DRBG exactly as in PQClean's
 * test/common/nistkatrng.c (Bassham 2017, modified by Douglas Stebila): V is a
 * 128-bit counter incremented big-endian with byte-wise carry, blocks come from
 * AES-256-ECB under a fixed Key, and after producing output the state is updated
 * with three more blocks and no provided data.
 *
 * The port is anchored rather than assumed. Initialising with entropy_input[i] = i
 * must yield the count-0 seed
 *
 *   061550234D158C5EC95595FE04EF7A25767F2E24CC2BC479D09D86DC9ABCFDE7056A8C266F9EF97ED08541DBD2E1FFA1
 *
 * and re-seeding from that seed must yield the first 32 bytes
 *
 *   7C9935A0B07694AA0C6D10E4DB6B1ADD2FD81A25CCB148032DCD739936737F2D
 *
 * Both appear verbatim in published NIST KAT response files for other schemes
 * (SIKE, Dilithium, SLH-DSA, ML-KEM), which makes them an outside anchor rather
 * than a memory of what the output should be. test/cross-validate.test.cjs asserts
 * both, so a wrong AES call or a broken counter carry fails loudly.
 *
 * Where the ACVP vectors come from
 * --------------------------------
 * NIST publishes ML-KEM ACVP vectors as JSON (keyGen and encapDecap groups). They
 * carry d, z and m explicitly, so no DRBG is involved and the comparison is pure
 * arithmetic.
 *
 * Exit codes
 * ----------
 *   0  every vector matched
 *   1  at least one vector mismatched
 *   2  usage error
 *   3  vector file missing, unreadable or not shaped as expected
 *
 * Usage
 * -----
 *   node scripts/cross-validate-pqclean.cjs --vectors <file> [--format acvp|rsp] [--count N] [--json]
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXIT = { OK: 0, MISMATCH: 1, USAGE: 2, VECTORS: 3 };

/** Published NIST KAT anchors; see the header for provenance. */
const DRBG_ANCHOR_SEED =
  '061550234D158C5EC95595FE04EF7A25767F2E24CC2BC479D09D86DC9ABCFDE7056A8C266F9EF97ED08541DBD2E1FFA1';
const DRBG_ANCHOR_FIRST_BLOCK =
  '7C9935A0B07694AA0C6D10E4DB6B1ADD2FD81A25CCB148032DCD739936737F2D';

/**
 * AES-256 CTR-DRBG, ported line by line from PQClean test/common/nistkatrng.c.
 * No reseeding and no prediction resistance: the NIST KAT path never asks for them.
 */
class Aes256CtrDrbg {
  constructor() {
    this.key = Buffer.alloc(32, 0);
    this.v = Buffer.alloc(16, 0);
    this.reseedCounter = 0;
  }

  static ecbBlock(key, block) {
    const c = crypto.createCipheriv('aes-256-ecb', key, null);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(block), c.final()]);
  }

  static increment(v) {
    for (let j = 15; j >= 0; j--) {
      if (v[j] === 0xff) {
        v[j] = 0x00;
      } else {
        v[j] += 1;
        return;
      }
    }
  }

  update(providedData) {
    const temp = Buffer.alloc(48);
    for (let i = 0; i < 3; i++) {
      Aes256CtrDrbg.increment(this.v);
      Aes256CtrDrbg.ecbBlock(this.key, this.v).copy(temp, 16 * i);
    }
    if (providedData) {
      for (let i = 0; i < 48; i++) temp[i] ^= providedData[i];
    }
    temp.copy(this.key, 0, 0, 32);
    temp.copy(this.v, 0, 32, 48);
  }

  init(entropyInput) {
    const seedMaterial = Buffer.from(entropyInput);
    if (seedMaterial.length !== 48) {
      throw new Error('entropy input must be 48 bytes, got ' + seedMaterial.length);
    }
    this.key.fill(0);
    this.v.fill(0);
    this.update(seedMaterial);
    this.reseedCounter = 1;
  }

  randomBytes(n) {
    const out = Buffer.alloc(n);
    let off = 0;
    let remaining = n;
    while (remaining > 0) {
      Aes256CtrDrbg.increment(this.v);
      const block = Aes256CtrDrbg.ecbBlock(this.key, this.v);
      const take = Math.min(16, remaining);
      block.copy(out, off, 0, take);
      off += take;
      remaining -= take;
    }
    this.update(null);
    this.reseedCounter++;
    return out;
  }
}

function usage(msg) {
  if (msg) console.error('error: ' + msg);
  console.error(
    'usage: node scripts/cross-validate-pqclean.cjs --vectors <file> [--format acvp|pqclean-rsp] [--count N] [--json]'
  );
  process.exit(EXIT.USAGE);
}

function parseArgs(argv) {
  const out = { format: 'acvp', count: Infinity, json: false, vectors: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vectors') out.vectors = argv[++i];
    else if (a === '--format') out.format = argv[++i];
    else if (a === '--count') out.count = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else if (a === '-h' || a === '--help') usage();
    else usage('unknown argument: ' + a);
  }
  if (!out.vectors) usage('--vectors is required; an empty run is not a pass');
  if (!Number.isFinite(out.count) && out.count !== Infinity) usage('--count must be a number');
  return out;
}

/** Hex helpers. Buffers are compared as bytes; strings are only for display. */
const hexToBuf = (h) => Buffer.from(String(h).replace(/[^0-9a-fA-F]/g, ''), 'hex');
const bufToHex = (b) => Buffer.from(b).toString('hex');

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function compare(actual, expected, label) {
  const d = firstDiff(actual, expected);
  if (d === -1) return null;
  return {
    field: label,
    offset: d,
    actual: bufToHex(actual.slice(Math.max(0, d - 8), d + 8)),
    expected: bufToHex(expected.slice(Math.max(0, d - 8), d + 8)),
    lengthActual: actual.length,
    lengthExpected: expected.length,
  };
}

/**
 * Load ACVP keyGen/encapDecap groups and flatten them into test cases.
 * Shapes differ slightly between ACVP revisions, so this accepts both the
 * "tests[]" layout and a flat array of objects with the same fields.
 */
function loadAcvp(file) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('error: cannot read vectors as JSON: ' + e.message);
    process.exit(EXIT.VECTORS);
  }

  const groups = Array.isArray(doc) ? doc : doc.testGroups;
  if (!Array.isArray(groups)) {
    console.error('error: no testGroups[] in ' + path.basename(file));
    process.exit(EXIT.VECTORS);
  }

  const cases = [];
  for (const g of groups) {
    const tests = Array.isArray(g.tests) ? g.tests : [g];
    for (const t of tests) {
      const kind = t.d && t.z ? 'keygen' : t.m && t.c ? 'encap' : null;
      if (!kind) continue;
      cases.push({ group: g.tgId ?? g.groupId ?? null, tcId: t.tcId ?? t.id ?? null, kind, raw: t });
    }
  }

  if (cases.length === 0) {
    console.error('error: 0 usable test cases (expected d+z for keyGen, m+c for encapDecap)');
    process.exit(EXIT.VECTORS);
  }
  return cases;
}

/**
 * Parse a NIST-KAT .rsp file. Records are `key = value` lines separated by blank
 * lines; values are uppercase or lowercase hex. The KAT flow for a KEM is:
 *
 *   randombytes_init(seed, NULL, 256)
 *   crypto_kem_keypair()   consumes d (32) then z (32)
 *   crypto_kem_enc()       consumes m (32)
 *   crypto_kem_dec()
 *
 * so one DRBG instance per record reproduces every field.
 */
function loadRsp(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('error: cannot read vectors: ' + e.message);
    process.exit(EXIT.VECTORS);
  }

  const records = [];
  let cur = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') {
      if (cur) {
        records.push(cur);
        cur = null;
      }
      continue;
    }
    if (line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === 'count') {
      if (cur) records.push(cur);
      cur = { count: Number(value) };
    } else if (cur) {
      cur[key] = value;
    }
  }
  if (cur) records.push(cur);

  const cases = [];
  for (const r of records) {
    if (!r.seed) continue;
    const seed = hexToBuf(r.seed);
    if (seed.length !== 48) {
      console.error('error: count=' + r.count + ' seed is ' + seed.length + ' bytes, expected 48');
      process.exit(EXIT.VECTORS);
    }
    if (!r.pk || !r.sk) continue;
    cases.push({ kind: 'kat', tcId: r.count, raw: r });
  }

  if (cases.length === 0) {
    console.error('error: 0 usable records in ' + path.basename(file) + ' (expected seed/pk/sk)');
    process.exit(EXIT.VECTORS);
  }
  return cases;
}

function loadVectors(opts) {
  if (opts.format === 'rsp' || opts.format === 'pqclean-rsp') return loadRsp(opts.vectors);
  if (opts.format !== 'acvp') usage('unknown --format: ' + opts.format);
  return loadAcvp(opts.vectors);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cases = loadVectors(opts).slice(0, opts.count);

  // Loaded after argument validation so that a usage error does not depend on the
  // implementation module being resolvable.
  const kem = require('../packages/pqc-kem/src/ml-kem-768.js');
  const keygenDerand = kem.generateKeypairDerand || kem.keygenDerand;
  const encapsDerand = kem.encapsulateDerand || kem.encapsDerand;
  if (typeof keygenDerand !== 'function' || typeof encapsDerand !== 'function' || typeof kem.decapsulate !== 'function') {
    console.error('error: packages/pqc-kem/src/ml-kem-768.js does not export a deterministic keygen/encaps API');
    process.exit(EXIT.VECTORS);
  }

  const results = [];
  let failures = 0;

  for (const c of cases) {
    const t = c.raw;
    const row = { kind: c.kind, tcId: c.tcId, ok: false, mismatches: [] };

    try {
      if (c.kind === 'kat') {
        // One DRBG per record, exactly as PQClean's nistkat.c drives it.
        const drbg = new Aes256CtrDrbg();
        drbg.init(hexToBuf(t.seed));
        const d = drbg.randomBytes(32);
        const z = drbg.randomBytes(32);
        const m = drbg.randomBytes(32);

        const { publicKey, secretKey } = keygenDerand(d, z);
        const pkBuf = Buffer.from(publicKey);
        const skBuf = Buffer.from(secretKey);

        const mPk = compare(pkBuf, hexToBuf(t.pk), 'pk');
        const mSk = compare(skBuf, hexToBuf(t.sk), 'sk');
        if (mPk) row.mismatches.push(mPk);
        if (mSk) row.mismatches.push(mSk);

        if (t.ct && t.ss) {
          const re = encapsDerand(pkBuf, m);
          const ctBuf = Buffer.from(re.ciphertext ?? re.ct ?? re[0]);
          const ssBuf = Buffer.from(re.sharedSecret ?? re.ss ?? re[1]);
          const mCt = compare(ctBuf, hexToBuf(t.ct), 'ct');
          const mSs = compare(ssBuf, hexToBuf(t.ss), 'ss');
          if (mCt) row.mismatches.push(mCt);
          if (mSs) row.mismatches.push(mSs);

          // Independent of encapsulation: decapsulating the file's ciphertext
          // with the file's secret key must land on the same shared secret.
          const ssDecap = Buffer.from(kem.decapsulate(skBuf, hexToBuf(t.ct)));
          const mDec = compare(ssDecap, hexToBuf(t.ss), 'ss(decap)');
          if (mDec) row.mismatches.push(mDec);
        }
      } else if (c.kind === 'keygen') {
        const { publicKey, secretKey } = keygenDerand(hexToBuf(t.d), hexToBuf(t.z));
        const m = compare(Buffer.from(publicKey), hexToBuf(t.ek ?? t.pk), 'ek');
        const m2 = compare(Buffer.from(secretKey), hexToBuf(t.dk ?? t.sk), 'dk');
        if (m) row.mismatches.push(m);
        if (m2) row.mismatches.push(m2);
      } else {
        // encapDecap: derive the shared secret from the vector's ciphertext and
        // the decapsulation key, then re-encapsulate with the vector's m.
        const sk = hexToBuf(t.dk ?? t.sk);
        const ct = hexToBuf(t.c);
        const ssDecap = Buffer.from(kem.decapsulate(sk, ct));
        const mSs = compare(ssDecap, hexToBuf(t.k ?? t.ss), 'ss(decap)');

        const ek = hexToBuf(t.ek ?? t.pk);
        const re = encapsDerand(ek, hexToBuf(t.m));
        const ctBuf = Buffer.from(re.ciphertext ?? re.ct ?? re[0]);
        const ssBuf = Buffer.from(re.sharedSecret ?? re.ss ?? re[1]);
        const mCt = compare(ctBuf, ct, 'c(re-encap)');
        const mSs2 = compare(ssBuf, hexToBuf(t.k ?? t.ss), 'ss(re-encap)');

        for (const x of [mSs, mCt, mSs2]) if (x) row.mismatches.push(x);
      }
    } catch (e) {
      row.error = e.message;
    }

    row.ok = !row.error && row.mismatches.length === 0;
    if (!row.ok) failures++;
    results.push(row);
  }

  const summary = {
    vectors: opts.vectors,
    format: opts.format,
    total: results.length,
    passed: results.length - failures,
    failed: failures,
  };

  if (opts.json) {
    console.log(JSON.stringify({ summary, results }, null, 2));
  } else {
    for (const r of results) {
      if (r.ok) {
        console.log('ok   ' + r.kind + ' tcId=' + r.tcId);
      } else {
        console.log('FAIL ' + r.kind + ' tcId=' + r.tcId + (r.error ? ' error=' + r.error : ''));
        for (const m of r.mismatches) {
          console.log('     ' + m.field + ' differs at byte ' + m.offset +
            ' (len ' + m.lengthActual + ' vs ' + m.lengthExpected + ')');
          console.log('       actual   ' + m.actual);
          console.log('       expected ' + m.expected);
        }
      }
    }
    console.log('');
    console.log(summary.passed + '/' + summary.total + ' vectors match (' + summary.failed + ' failed)');
  }

  process.exit(failures === 0 ? EXIT.OK : EXIT.MISMATCH);
}

if (require.main === module) main();

module.exports = { firstDiff, compare, loadAcvp, loadRsp, Aes256CtrDrbg, DRBG_ANCHOR_SEED, DRBG_ANCHOR_FIRST_BLOCK };
