// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * ML-DSA interoperability matrix: packages/fml-dsa vs @noble/post-quantum.
 *
 *   node scripts/interop/dsa-matrix.mjs --out docs/interop-matrix.json
 *
 * Why this exists: the two implementations can each pass their own tests and still
 * disagree with each other. Every cell below is a property that must be true of the
 * *pair*, and each positive cell is paired with a negative control that must fail -
 * a check that cannot fail is not a check.
 *
 * Cells per parameter set (44 / 65 / 87)
 *   keygen-pk-identical         fixed seed -> byte-identical public key
 *   keygen-sk-identical         fixed seed -> byte-identical secret key
 *   sign-det-identical          extraEntropy:false -> byte-identical signature
 *   cross-verify-ours-to-noble  our signature accepted by the oracle
 *   cross-verify-noble-to-ours  oracle signature (randomised) accepted by us
 *   reject-tampered-signature   flip one byte -> both sides reject
 *   reject-wrong-message        verify against a different message -> both reject
 *
 * The JSON is canonical: no timestamps, no host, no durations, sorted keys. Its
 * sha256 therefore identifies the result, not the machine that produced it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const SUITES = [
  { id: 'ML-DSA-44', ours: 'ml_dsa44', noble: 'ml_dsa44' },
  { id: 'ML-DSA-65', ours: 'ml_dsa65', noble: 'ml_dsa65' },
  { id: 'ML-DSA-87', ours: 'ml_dsa87', noble: 'ml_dsa87' },
];

const MESSAGES = [
  { id: 'empty', bytes: Buffer.alloc(0) },
  { id: '32-bytes', bytes: Buffer.alloc(32, 0x5a) },
  { id: '1024-bytes', bytes: Buffer.from(Array.from({ length: 1024 }, (_, i) => i & 0xff)) },
];

const SEEDS = [
  { id: 'seed-00', bytes: Buffer.alloc(32, 0x00) },
  { id: 'seed-a5', bytes: Buffer.alloc(32, 0xa5) },
  { id: 'seed-7f', bytes: Buffer.alloc(32, 0x7f) },
];

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** verify() may return false or throw depending on the implementation; both are a rejection. */
function rejects(verifyFn) {
  try {
    const r = verifyFn();
    return r === false || r === undefined || r === null;
  } catch {
    return true;
  }
}

function loadEnds() {
  const oursPath = path.join(REPO_ROOT, 'packages', 'fml-dsa', 'src', 'index.js');
  // '@noble/post-quantum' does not export ./package.json, so locate the directory
  // through the entry point it does export and read the manifest next to it.
  const nobleEntry = require.resolve('@noble/post-quantum', { paths: [REPO_ROOT] });
  const nobleDir = path.dirname(nobleEntry);
  const noblePkg = path.join(nobleDir, 'package.json');
  const noblePath = path.join(nobleDir, 'ml-dsa.js');
  return {
    ours: require(oursPath),
    noble: require(noblePath),
    provenance: {
      ours: {
        package: 'fml-dsa',
        version: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'fml-dsa', 'package.json'), 'utf8')).version,
        file: 'packages/fml-dsa/src/index.js',
        sha256: sha256(fs.readFileSync(oursPath)),
      },
      noble: {
        package: '@noble/post-quantum',
        version: JSON.parse(fs.readFileSync(noblePkg, 'utf8')).version,
        file: path.relative(REPO_ROOT, noblePath).split(path.sep).join('/'),
        sha256: sha256(fs.readFileSync(noblePath)),
      },
      node: process.version,
    },
  };
}

function runSuite(suite, ends) {
  const A = ends.ours[suite.ours];
  const B = ends.noble[suite.noble];
  if (!A || !B) throw new Error('missing implementation for ' + suite.id);

  const cells = [];
  const add = (name, pass, detail) => cells.push({ name, pass, detail });

  for (const seed of SEEDS) {
    const a = A.keygen(new Uint8Array(seed.bytes));
    const b = B.keygen(new Uint8Array(seed.bytes));
    add('keygen-pk-identical/' + seed.id, Buffer.compare(Buffer.from(a.publicKey), Buffer.from(b.publicKey)) === 0, sha256(a.publicKey).slice(0, 16));
    add('keygen-sk-identical/' + seed.id, Buffer.compare(Buffer.from(a.secretKey), Buffer.from(b.secretKey)) === 0, sha256(a.secretKey).slice(0, 16));
  }

  const seed0 = new Uint8Array(SEEDS[0].bytes);
  const a0 = A.keygen(seed0);
  const b0 = B.keygen(seed0);

  for (const msg of MESSAGES) {
    const m = new Uint8Array(msg.bytes);
    // deterministic signing: both sides must land on the same bytes
    const sigA = A.sign(m, a0.secretKey, { extraEntropy: false });
    const sigB = B.sign(m, b0.secretKey, { extraEntropy: false });
    add('sign-det-identical/' + msg.id, Buffer.compare(Buffer.from(sigA), Buffer.from(sigB)) === 0, sha256(sigA).slice(0, 16));

    // cross verification, both directions
    add('cross-verify-ours-to-noble/' + msg.id, B.verify(sigA, m, b0.publicKey) === true, 'sig=' + sha256(sigA).slice(0, 16));
    const sigRandom = B.sign(m, b0.secretKey);
    // The oracle signs with fresh entropy here, so its bytes differ every run. Recording
    // their hash would make the report non-canonical; the property under test is that we
    // accept it, not that it equals anything.
    add('cross-verify-noble-to-ours/' + msg.id, A.verify(sigRandom, m, a0.publicKey) === true, 'randomised signature');
    if (Buffer.compare(Buffer.from(sigRandom), Buffer.from(sigB)) === 0) {
      add('randomised-differs-from-deterministic/' + msg.id, false, 'randomised signing produced identical bytes');
    }

    // negative controls: these must be rejected, otherwise the positive cells mean nothing
    const tampered = Buffer.from(sigA);
    tampered[Math.floor(tampered.length / 2)] ^= 0x01;
    add('reject-tampered-signature/' + msg.id,
      rejects(() => B.verify(new Uint8Array(tampered), m, b0.publicKey)) && rejects(() => A.verify(new Uint8Array(tampered), m, a0.publicKey)),
      'flipped byte ' + Math.floor(tampered.length / 2));

    const other = new Uint8Array(Buffer.concat([Buffer.from(m), Buffer.from([0x00])]));
    add('reject-wrong-message/' + msg.id,
      rejects(() => B.verify(sigA, other, b0.publicKey)) && rejects(() => A.verify(sigA, other, a0.publicKey)),
      'appended one byte');
  }

  return {
    id: suite.id,
    params: {
      publicKeyBytes: a0.publicKey.length,
      secretKeyBytes: a0.secretKey.length,
      signatureBytes: A.sign(new Uint8Array(MESSAGES[0].bytes), a0.secretKey, { extraEntropy: false }).length,
    },
    judged: cells.filter((c) => c.name.startsWith('keygen') || c.name.startsWith('sign-det') || c.name.startsWith('cross') || c.name.startsWith('reject')).length,
    passed: cells.filter((c) => c.pass).length,
    cells,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function main() {
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx !== -1 ? path.resolve(process.argv[outIdx + 1]) : path.join(REPO_ROOT, 'docs', 'interop-matrix.json');

  const ends = loadEnds();
  const suites = SUITES.map((s) => runSuite(s, ends));

  const body = {
    schema: 'fibemate.interop-matrix/1',
    subject: 'ML-DSA (FIPS 204) signature interoperability',
    provenance: ends.provenance,
    inputs: {
      seeds: SEEDS.map((s) => ({ id: s.id, sha256: sha256(s.bytes) })),
      messages: MESSAGES.map((m) => ({ id: m.id, bytes: m.bytes.length, sha256: sha256(m.bytes) })),
    },
    suites,
    totals: {
      suites: suites.length,
      judgedCells: suites.reduce((n, s) => n + s.judged, 0),
      passedCells: suites.reduce((n, s) => n + s.passed, 0),
      failedCells: suites.reduce((n, s) => n + (s.cells.filter((c) => !c.pass).length), 0),
    },
  };
  body.verdict = body.totals.failedCells === 0 ? 'PASS' : 'FAIL';
  body.reportSha256 = sha256(Buffer.from(canonical(body), 'utf8'));

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(body, null, 2) + '\n', 'utf8');

  console.log('interop matrix: ' + body.verdict + '  suites=' + body.totals.suites +
    ' judged=' + body.totals.judgedCells + ' passed=' + body.totals.passedCells + ' failed=' + body.totals.failedCells);
  for (const s of suites) {
    const failed = s.cells.filter((c) => !c.pass);
    console.log('  ' + s.id + ': ' + (s.cells.length - failed.length) + '/' + s.cells.length + (failed.length ? '  FAILED: ' + failed.map((f) => f.name).join(',') : ''));
  }
  console.log('  noble ' + ends.provenance.noble.version + '  ours ' + ends.provenance.ours.version + '  node ' + ends.provenance.node);
  console.log('  sha256 ' + body.reportSha256);
  console.log('  wrote ' + path.relative(REPO_ROOT, outPath).split(path.sep).join('/'));
  process.exit(body.verdict === 'PASS' ? 0 : 1);
}

main();
