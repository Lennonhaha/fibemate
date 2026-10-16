// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * ML-KEM-768 interoperability harness (P2.2).
 *
 * Goal: a stranger runs ONE command and gets the same report hash.
 *
 *   node scripts/interop/run.mjs run --rounds 1000 --out out/
 *
 * Legs
 *   keygen-deterministic        fixed (d,z) => our ek must be byte-identical to the
 *                               reference implementation's ek (catches draft-era
 *                               KeyGen drift, e.g. k not fed into G(d||k))
 *   decaps-ours-encaps-noble    our keygen -> partner encaps -> our decaps
 *   decaps-noble-encaps-ours    partner keygen -> our encaps -> partner decaps
 *   liboqs-encaps-ours-decaps   same as line 2, partner = liboqs via oqs_gen
 *   liboqs-keygen-ours-encaps-liboqs-decaps
 *   kat-fields                  vector file field presence/length/hex
 *   kat-vector-k                k == sha3_512(m || sha3_256(ek))[0:32]  (no KEM code)
 *   kat-dk-canonical            dk follows the FIPS 203 layout
 *   kat-decaps                  our decapsulate(dk, ct) == k
 *
 * Exit codes: 0 PASS | 1 FAIL | 2 PARTIAL (a requested partner was unavailable).
 *
 * report.json is canonical (no timestamps, no host, no durations) so its SHA-256
 * is stable across runs and machines; volatile data goes to meta.json.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  DEFAULT_MASTER_SEED, DK_LAYOUT, EXPECT, KAT_PATH, OQS_GEN_C, OURS_PATH, REPO_ROOT,
  createRngDispatcher, deriveDZ, hex, isHex, loadOurs, parseKat, sha256File, sha3_256,
  sha3_512, unhex,
} from './cases.mjs';

const REPORT_SCHEMA = 'fibemate.interop-report/1';

// ---------------------------------------------------------------- CLI

const USAGE = `Usage: node scripts/interop/run.mjs run [options]

Options:
  --rounds <n>          rounds for the randomised legs (default 1000)
  --liboqs-rounds auto|<n>
                        rounds for the liboqs legs; "auto" = min(--rounds, 100)
                        because each liboqs operation is a process spawn (default auto)
  --partners <list>     noble,liboqs (default: both)
  --seed <hex>          32-byte master seed for deterministic legs
                        (default ${DEFAULT_MASTER_SEED.slice(0, 16)}...)
  --kat all|consistency|none
                        vector-file legs: all (fields + k formula + dk layout + decaps),
                        consistency (fields + k formula, no KEM code), none (default all)
  --kat-max <n>         cap the number of vector blocks (default all)
  --out <dir>           write report.json / meta.json / report.sha256 (default out)
  --print-report        also print report.json to stdout
  --quiet               suppress per-leg progress lines
  -h, --help            show this help
`;

function parseArgs(argv) {
  const opts = {
    cmd: argv[0] && !argv[0].startsWith('-') ? argv[0] : 'run',
    rounds: 1000,
    liboqsRounds: 'auto',
    partners: ['noble', 'liboqs'],
    seed: DEFAULT_MASTER_SEED,
    kat: 'all',
    katMax: 0,
    out: 'out',
    printReport: false,
    quiet: false,
  };
  const rest = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv.slice();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    const need = (name) => {
      if (i + 1 >= rest.length) throw new Error(`missing value for ${name}`);
      i += 1;
      return rest[i];
    };
    if (a === '-h' || a === '--help') { opts.help = true; }
    else if (a === '--rounds') opts.rounds = Number(need(a));
    else if (a === '--liboqs-rounds') opts.liboqsRounds = need(a);
    else if (a === '--partners') opts.partners = need(a).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--seed') opts.seed = need(a);
    else if (a === '--kat') opts.kat = need(a);
    else if (a === '--kat-max') opts.katMax = Number(need(a));
    else if (a === '--out') opts.out = need(a);
    else if (a === '--print-report') opts.printReport = true;
    else if (a === '--quiet') opts.quiet = true;
    else throw new Error(`unknown option: ${a}`);
  }
  if (!['all', 'consistency', 'none'].includes(opts.kat)) throw new Error('--kat must be all|consistency|none');
  if (!Number.isInteger(opts.rounds) || opts.rounds < 1) throw new Error('--rounds must be a positive integer');
  if (!/^[0-9a-fA-F]{64}$/.test(opts.seed)) throw new Error('--seed must be 64 hex chars (32 bytes)');
  if (opts.liboqsRounds !== 'auto' && (!Number.isInteger(Number(opts.liboqsRounds)) || Number(opts.liboqsRounds) < 1)) {
    throw new Error('--liboqs-rounds must be "auto" or a positive integer');
  }
  return opts;
}

// ---------------------------------------------------------------- leg bookkeeping

const LEGS = [];
function startLeg(id, partner, rounds, note) {
  const rec = { id, partner, rounds, pass: 0, fail: 0, status: 'pass', reasons: [] };
  if (note) rec.note = note;
  LEGS.push(rec);
  return {
    ok() { rec.pass += 1; },
    bad(msg) { rec.fail += 1; if (rec.reasons.length < 5) rec.reasons.push(String(msg)); if (rec.status === 'pass') rec.status = 'fail'; },
    disabled(reason) { rec.status = 'disabled'; rec.reason = reason; },
    skipped(reason) { rec.status = 'skipped'; rec.reason = reason; },
    error(reason) { rec.status = 'error'; rec.reason = reason; },
    done() { if (rec.status === 'pass' && rec.fail > 0) rec.status = 'fail'; return rec; },
  };
}

const PINS = {};

function gitCommit() {
  if (process.env.FIBEMATE_REPO_COMMIT) return process.env.FIBEMATE_REPO_COMMIT;
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 });
  if (r.status === 0 && /^[0-9a-f]{40}$/.test((r.stdout || '').trim())) return r.stdout.trim();
  return null;
}
function gitDirty() {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim().length > 0;
}

// ---------------------------------------------------------------- partners

async function loadNoble() {
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(REPO_ROOT, 'package.json'));
  let entry;
  try { entry = req.resolve('@noble/post-quantum/ml-kem.js'); }
  catch (e) { return { available: false, reason: `@noble/post-quantum not resolvable: ${e.message}` }; }
  const { ml_kem768 } = await import(new URL(`file://${entry.replace(/\\/g, '/')}`).href);
  if (!ml_kem768) return { available: false, reason: 'ml_kem768 export missing' };
  // '@noble/post-quantum/package.json' is not exported; walk up to the package root instead.
  let version = null;
  for (let dir = path.dirname(entry); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try { const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')); if (pkg.name === '@noble/post-quantum') { version = pkg.version; break; } } catch { /* keep walking */ }
    }
    if (dir === path.dirname(dir)) break;
  }
  return {
    available: true, name: 'noble', version,
    keygen: (seed64) => (seed64 ? ml_kem768.keygen(seed64) : ml_kem768.keygen()),
    encapsulate: (pk) => ml_kem768.encapsulate(pk),
    decapsulate: (ct, sk) => ml_kem768.decapsulate(ct, sk),
  };
}

function loadLiboqs() {
  const exe = process.env.OQS_GEN || path.join(REPO_ROOT, 'scripts', 'oqs_gen');
  const build = 'gcc -O2 -o scripts/oqs_gen scripts/oqs_gen.c -l oqs -lcrypto';
  if (!fs.existsSync(exe)) return { available: false, reason: `oqs_gen not found at ${exe} (build it first: ${build})` };
  const call = (args) => {
    const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    if (r.error) throw new Error(`spawn failed: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`exit ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}`);
    try { return JSON.parse(r.stdout); } catch (e) { throw new Error(`bad JSON from oqs_gen: ${e.message}`); }
  };
  try {
    const k = call(['keygen']);
    if (!isHex(k.pk, EXPECT.ek) || !isHex(k.sk, EXPECT.dk)) {
      return { available: false, reason: 'oqs_gen keygen returned unexpected lengths' };
    }
  } catch (e) { return { available: false, reason: `oqs_gen probe failed: ${e.message}` }; }
  return {
    available: true, name: 'liboqs', version: process.env.LIBOQS_VERSION || null, exe,
    keygen: () => call(['keygen']),
    encapsulate: (pkHex) => call(['encaps', pkHex]),
    decapsulate: (skHex, ctHex) => call(['decaps', skHex, ctHex]),
  };
}

// ---------------------------------------------------------------- legs

function runKatLegs(opts, kat) {
  const mode = opts.kat;
  if (kat === null) {
    const L = startLeg('kat-fields', 'file', 0, 'vector file');
    L.error(`vector file not found: ${KAT_PATH}`);
    L.done();
    return;
  }
  const blocks = (opts.katMax > 0 ? kat.slice(0, opts.katMax) : kat);

  {
    const L = startLeg('kat-fields', 'file', blocks.length, 'presence/length/hex of every field');
    if (mode === 'none') L.disabled('--kat=none');
    else if (blocks.length === 0) L.error('vector file has no blocks');
    else {
      const len = { seed: EXPECT.seed, m: EXPECT.m, ek: EXPECT.ek, dk: EXPECT.dk, c: EXPECT.ct, k: EXPECT.ss };
      for (const b of blocks) {
        for (const f of ['seed', 'm', 'ek', 'dk', 'c', 'k']) {
          if (!isHex(b[f], len[f])) L.bad(`count ${b.count}: field ${f} invalid (len=${(b[f] || '').length}, want ${len[f] * 2} chars)`);
          else L.ok();
        }
      }
    }
    L.done();
  }

  {
    const L = startLeg('kat-vector-k', 'file', blocks.length, 'k == sha3_512(m || sha3_256(ek))[0:32]');
    if (mode === 'none') L.disabled('--kat=none');
    else for (const b of blocks) {
      if (!isHex(b.ek, EXPECT.ek) || !isHex(b.m, EXPECT.m) || !isHex(b.k, EXPECT.ss)) { L.bad(`count ${b.count}: fields unusable`); continue; }
      const expectK = Buffer.from(sha3_512(Buffer.concat([unhex(b.m), sha3_256(unhex(b.ek))])).subarray(0, 32)).toString('hex');
      if (expectK === b.k) L.ok(); else L.bad(`count ${b.count}: k=${b.k.slice(0, 16)}.. expected ${expectK.slice(0, 16)}..`);
    }
    L.done();
  }

  {
    const L = startLeg('kat-dk-canonical', 'file', blocks.length, 'dk == dkPKE || ek || H(ek) || z');
    if (mode !== 'all') L.disabled(`--kat=${mode}`);
    else for (const b of blocks) {
      if (!isHex(b.dk, EXPECT.dk) || !isHex(b.ek, EXPECT.ek)) { L.bad(`count ${b.count}: dk/ek unusable`); continue; }
      const dk = b.dk;
      const o = { dkPKE: DK_LAYOUT.dkPKE * 2, ek: DK_LAYOUT.ek * 2, hash: DK_LAYOUT.hash * 2 };
      const atEk = dk.slice(o.dkPKE, o.dkPKE + o.ek);
      const atHash = dk.slice(o.dkPKE + o.ek, o.dkPKE + o.ek + o.hash);
      const hEk = Buffer.from(sha3_256(unhex(b.ek))).toString('hex');
      if (atEk === b.ek && atHash === hEk) L.ok();
      else L.bad(`count ${b.count}: ek/H(ek) not at FIPS offsets (ek@${o.dkPKE} chars, H(ek)@${o.dkPKE + o.ek})`);
    }
    L.done();
  }

  {
    const L = startLeg('kat-decaps', 'file', blocks.length, 'our decapsulate(dk, c) == k');
    if (mode !== 'all') L.disabled(`--kat=${mode}`);
    else {
      const ours = loadOurs();
      for (const b of blocks) {
        if (!isHex(b.dk, EXPECT.dk) || !isHex(b.c, EXPECT.ct) || !isHex(b.k, EXPECT.ss)) { L.bad(`count ${b.count}: fields unusable`); continue; }
        let got;
        try { got = Buffer.from(ours.decapsulate(unhex(b.dk), unhex(b.c))).toString('hex'); }
        catch (e) { L.bad(`count ${b.count}: threw ${e.message}`); continue; }
        if (got === b.k) L.ok(); else L.bad(`count ${b.count}: got ${got.slice(0, 16)}.. expected ${b.k.slice(0, 16)}..`);
      }
    }
    L.done();
  }
}

function runRandomisedLegs(opts, ours, noble, liboqs) {
  const wants = (n) => opts.partners.includes(n);

  // leg D: deterministic keygen equivalence (reference only)
  {
    const L = startLeg('keygen-deterministic', 'noble', opts.rounds, 'fixed (d,z): our ek == noble ek');
    if (!wants('noble')) L.disabled('partner noble not requested');
    else if (!noble.available) L.skipped(noble.reason);
    else if (typeof noble.keygen !== 'function') L.error('noble adapter has no keygen');
    else {
      const rng = opts.__rng;
      for (let i = 0; i < opts.rounds; i += 1) {
        const { d, z } = deriveDZ(opts.seed, i);
        const token = rng.use([d, z]);
        let oursKp;
        try { oursKp = ours.generateKeypair(); }
        catch (e) { L.bad(`round ${i}: ours keygen threw ${e.message}`); rng.end(); continue; }
        rng.end();
        if (token.left !== 0 || token.calls !== 2) {
          L.bad(`round ${i}: rng shim not consumed (calls=${token.calls} left=${token.left}) - implementation is not reading globalThis.crypto.getRandomValues`);
          continue;
        }
        let nobleKp;
        try { nobleKp = noble.keygen(concat(d, z)); }
        catch (e) { L.bad(`round ${i}: noble keygen threw ${e.message}`); continue; }
        if (hex(oursKp.publicKey) === hex(nobleKp.publicKey)) L.ok();
        else L.bad(`round ${i}: ek mismatch (ours ${hex(oursKp.publicKey).slice(0, 16)}.. vs noble ${hex(nobleKp.publicKey).slice(0, 16)}..)`);
      }
    }
    L.done();
  }

  // leg A / B with the noble partner
  {
    const L = startLeg('decaps-ours-encaps-noble', 'noble', opts.rounds, 'ours keygen -> noble encaps -> ours decaps');
    if (!wants('noble')) L.disabled('partner noble not requested');
    else if (!noble.available) L.skipped(noble.reason);
    else for (let i = 0; i < opts.rounds; i += 1) {
      const kp = ours.generateKeypair();
      const enc = noble.encapsulate(kp.publicKey);
      const got = ours.decapsulate(kp.secretKey, enc.cipherText);
      if (hex(got) === hex(enc.sharedSecret)) L.ok();
      else L.bad(`round ${i}: shared secret mismatch`);
    }
    L.done();
  }
  {
    const L = startLeg('decaps-noble-encaps-ours', 'noble', opts.rounds, 'noble keygen -> ours encaps -> noble decaps');
    if (!wants('noble')) L.disabled('partner noble not requested');
    else if (!noble.available) L.skipped(noble.reason);
    else for (let i = 0; i < opts.rounds; i += 1) {
      const kp = noble.keygen();
      const enc = ours.encapsulate(kp.publicKey);
      const got = noble.decapsulate(enc.ciphertext, kp.secretKey);
      if (hex(got) === hex(enc.sharedSecret)) L.ok();
      else L.bad(`round ${i}: shared secret mismatch`);
    }
    L.done();
  }

  // liboqs partner (same two directions; explicit byte order from oqs_gen.c)
  const libRounds = opts.liboqsRounds === 'auto'
    ? Math.min(opts.rounds, 100)
    : Number(opts.liboqsRounds);

  {
    const L = startLeg('liboqs-encaps-ours-decaps', 'liboqs', libRounds, 'ours keygen -> oqs_gen encaps -> ours decaps');
    if (!wants('liboqs')) L.disabled('partner liboqs not requested');
    else if (!liboqs.available) L.skipped(liboqs.reason);
    else for (let i = 0; i < libRounds; i += 1) {
      try {
        const kp = ours.generateKeypair();
        const r = liboqs.encapsulate(hex(kp.publicKey));
        const got = Buffer.from(ours.decapsulate(kp.secretKey, unhex(r.ct))).toString('hex');
        if (got === r.ss) L.ok(); else L.bad(`round ${i}: shared secret mismatch`);
      } catch (e) { L.bad(`round ${i}: ${e.message}`); }
    }
    L.done();
  }
  {
    const L = startLeg('liboqs-keygen-ours-encaps-liboqs-decaps', 'liboqs', libRounds, 'oqs_gen keygen -> ours encaps -> oqs_gen decaps');
    if (!wants('liboqs')) L.disabled('partner liboqs not requested');
    else if (!liboqs.available) L.skipped(liboqs.reason);
    else for (let i = 0; i < libRounds; i += 1) {
      try {
        const kp = liboqs.keygen();
        const enc = ours.encapsulate(unhex(kp.pk));
        const r = liboqs.decapsulate(kp.sk, hex(enc.ciphertext));
        if (Buffer.from(enc.sharedSecret).toString('hex') === r.ss) L.ok();
        else L.bad(`round ${i}: shared secret mismatch`);
      } catch (e) { L.bad(`round ${i}: ${e.message}`); }
    }
    L.done();
  }
}

function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const t0 = Date.now();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(USAGE); return 0; }

  const log = (...a) => { if (!opts.quiet) console.log(...a); };

  // RNG dispatcher must exist before the implementation loads its randomness source.
  opts.__rng = createRngDispatcher();
  const ours = loadOurs();

  const noble = await loadNoble();
  const liboqs = loadLiboqs();

  PINS.node = process.version;
  PINS.platform = `${process.platform}/${process.arch}`;
  PINS.ours_sha256 = sha256File(OURS_PATH);
  PINS.noble = noble.available ? noble.version : null;
  PINS.liboqs = liboqs.available ? (liboqs.version || null) : null;
  PINS.oqs_gen_c_sha256 = fs.existsSync(OQS_GEN_C) ? sha256File(OQS_GEN_C) : null;
  PINS.liboqs_commit = fs.existsSync('/liboqs.commit') ? fs.readFileSync('/liboqs.commit', 'utf8').trim() : null;
  PINS.repo_commit = gitCommit();
  PINS.repo_dirty = gitDirty();
  PINS.master_seed = opts.seed;

  const katBlocks = fs.existsSync(KAT_PATH) ? parseKat(fs.readFileSync(KAT_PATH, 'utf8')) : null;

  log(`partners: noble=${noble.available ? 'ok ' + noble.version : 'unavailable (' + noble.reason + ')'}` +
      ` | liboqs=${liboqs.available ? 'ok' : 'unavailable (' + liboqs.reason + ')'}`);

  runKatLegs(opts, katBlocks);
  runRandomisedLegs(opts, ours, noble, liboqs);

  const legs = LEGS;
  const failed = legs.filter((l) => l.status === 'fail' || l.status === 'error');
  const skipped = legs.filter((l) => l.status === 'skipped');
  const verdict = failed.length > 0 ? 'FAIL' : (skipped.length > 0 ? 'PARTIAL' : 'PASS');

  const report = {
    schema: REPORT_SCHEMA,
    verdict,
    command: { rounds: opts.rounds, liboqs_rounds: opts.liboqsRounds, partners: opts.partners.slice().sort(), kat: opts.kat, kat_max: opts.katMax },
    pins: PINS,
    legs,
  };

  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  const reportText = JSON.stringify(report, null, 2) + '\n';
  const reportPath = path.join(outDir, 'report.json');
  fs.writeFileSync(reportPath, reportText);
  const reportSha = sha256File(reportPath);

  fs.writeFileSync(path.join(outDir, 'report.sha256'), `${reportSha}  report.json\n`);
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - t0,
    host: os.hostname(),
    cwd: process.cwd(),
    node: process.version,
    image_digest: process.env.FIBEMATE_IMAGE_DIGEST || null,
    report_sha256: reportSha,
  }, null, 2) + '\n');

  for (const l of legs) {
    const tag = l.status === 'pass' ? 'PASS' : l.status.toUpperCase();
    log(`  [${tag}] ${l.id} (${l.partner}) pass=${l.pass} fail=${l.fail}${l.reason ? ' - ' + l.reason : ''}` +
        `${l.reasons.length ? '\n        ' + l.reasons.join('\n        ') : ''}`);
  }
  log(`verdict=${verdict} | report.json sha256=${reportSha} | -> ${path.join(outDir, 'report.json')}`);
  if (opts.printReport) process.stdout.write(reportText);

  return verdict === 'PASS' ? 0 : (verdict === 'FAIL' ? 1 : 2);
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error('ERROR: ' + (e && e.message ? e.message : e));
  process.exit(2);
});
