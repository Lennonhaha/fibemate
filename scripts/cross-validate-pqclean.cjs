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
 *   ACVP path          implemented and self-tested (tests/cross-validate.test.cjs)
 *   PQClean .rsp path  NOT implemented, refuses with exit 4 instead of guessing
 *
 * The .rsp path is deliberately not approximated. A NIST-KAT .rsp file contains
 * a 48-byte seed per count; recovering d, z and m from it requires the exact
 * DRBG that PQClean's test/nistkat/rng.c uses. Implementing that from memory
 * would produce plausible-looking, silently wrong vectors — which is worse than
 * a red gate. To use .rsp files, port that rng.c first and verify it against the
 * first count of a known-good file.
 *
 * Where the ACVP vectors come from
 * --------------------------------
 * NIST publishes ML-KEM ACVP vectors as JSON (keyGen and encapDecap groups). They
 * carry d, z and m explicitly, so no DRBG is involved and the comparison is pure
 * arithmetic. Fetch them, pin the SHA-256 in this file, and keep the file out of
 * git if it is large.
 *
 * Exit codes
 * ----------
 *   0  every vector matched
 *   1  at least one vector mismatched
 *   2  usage error
 *   3  vector file missing, unreadable or not shaped as expected
 *   4  format accepted by name but not implemented (.rsp)
 *
 * Usage
 * -----
 *   node scripts/cross-validate-pqclean.cjs --vectors path/to/ml-kem-768.json [--format acvp] [--count N] [--json]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const EXIT = { OK: 0, MISMATCH: 1, USAGE: 2, VECTORS: 3, UNSUPPORTED: 4 };

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

function loadVectors(opts) {
  if (opts.format === 'pqclean-rsp') {
    console.error(
      'error: .rsp support is not implemented. The 48-byte seed in a .rsp file cannot be\n' +
        'turned into d/z/m without PQClean test/nistkat/rng.c, and a guessed DRBG would\n' +
        'produce vectors that look right and are not. Port that rng.c first.\n' +
        'Use --format acvp with the NIST ACVP JSON vectors.'
    );
    process.exit(EXIT.UNSUPPORTED);
  }
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
      if (c.kind === 'keygen') {
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

module.exports = { firstDiff, compare, loadAcvp };
