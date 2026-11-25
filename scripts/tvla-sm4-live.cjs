#!/usr/bin/env node
'use strict';
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
//
// A7-SM4 TVLA harness (skeleton, reproducible by design).
//
// It measures the exported SM4-GCM encryption path from the served
// www/crypto/sm4-browser.js. This is a timing screen, not a proof of
// constant-time behaviour and not a substitute for a side-channel lab.
//
// Usage:
//   node scripts/tvla-sm4-live.cjs --n 500 --runs 1
//   node scripts/tvla-sm4-live.cjs --n 5000 --runs 3 --out tmp/tvla-sm4-live.json
//   node scripts/tvla-sm4-live.cjs --n 500 --negative-control
//
// Exit codes:
//   0  all runs <= 4.5 and the frozen object hash is unchanged
//   1  at least one run is above 4.5 (warn/fail), or the object changed
//   2  usage/configuration error
//   3  negative control did not fail (harness cannot be trusted)

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const MODULE_PATH = path.join(REPO_ROOT, 'www', 'crypto', 'sm4-browser.js');
const DEFAULT_N = 500;
const DEFAULT_RUNS = 1;
const DEFAULT_NEGATIVE_CONTROL_RUNS = 3;
// 4.5 is the conventional TVLA |t| screening threshold (roughly 99.999%
// confidence under the usual independence assumptions). It is a screening
// threshold, not proof of constant-time behaviour.
const T_PASS = 4.5;
// 10 is a project-local severity label, not a published TVLA standard. It only
// separates a clearly detectable leak from a borderline signal; any |t| > 4.5
// is already a non-pass result and fails the gate.
const T_HARD_FAIL = 10;

function die(msg) {
  console.error('FATAL:', msg);
  process.exit(2);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return 'unknown';
  }
}

function parseArgs(argv) {
  const out = {
    n: DEFAULT_N,
    runs: DEFAULT_RUNS,
    out: path.join(REPO_ROOT, 'tmp', 'tvla-sm4-live.json'),
    negativeControl: false,
    negativeControlRuns: DEFAULT_NEGATIVE_CONTROL_RUNS,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/tvla-sm4-live.cjs [--n N] [--runs R] [--out FILE] [--negative-control] [--negative-control-runs K]');
      process.exit(0);
    }
    if (a === '--negative-control') {
      out.negativeControl = true;
      continue;
    }
    if (a === '--n' || a === '--runs' || a === '--out' || a === '--negative-control-runs') {
      const v = argv[++i];
      if (v === undefined) die(a + ' requires a value');
      if (a === '--n') out.n = Number(v);
      if (a === '--runs') out.runs = Number(v);
      if (a === '--out') out.out = path.resolve(v);
      if (a === '--negative-control-runs') out.negativeControlRuns = Number(v);
      continue;
    }
    die('unknown argument: ' + a);
  }
  if (!Number.isInteger(out.n) || out.n < 2) die('--n must be an integer >= 2');
  if (!Number.isInteger(out.runs) || out.runs < 1) die('--runs must be an integer >= 1');
  if (!Number.isInteger(out.negativeControlRuns) || out.negativeControlRuns < 1) {
    die('--negative-control-runs must be an integer >= 1');
  }
  return out;
}

function mean(xs) {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function variance(xs, m) {
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1);
}

function welchT(a, b) {
  const nA = a.length;
  const nB = b.length;
  const mA = mean(a);
  const mB = mean(b);
  const vA = variance(a, mA);
  const vB = variance(b, mB);
  const se = Math.sqrt(vA / nA + vB / nB);
  if (se === 0) return { t: 0, meanA: mA, meanB: mB, se: 0 };
  return { t: Math.abs(mA - mB) / se, meanA: mA, meanB: mB, se };
}

function classify(t) {
  if (!Number.isFinite(t)) return 'fail';
  if (t <= T_PASS) return 'pass';
  if (t < T_HARD_FAIL) return 'warn';
  return 'fail';
}

function timeNs(fn, i) {
  const t0 = process.hrtime.bigint();
  const result = fn(i);
  const dt = Number(process.hrtime.bigint() - t0);
  // Keep the result observable so the engine cannot discard the call.
  if (result === undefined || result === null) throw new Error('measured function returned no result');
  return dt;
}

function collectPair(fnA, fnB, n) {
  const warmup = Math.max(20, Math.floor(n * 0.1));
  for (let i = 0; i < warmup; i++) {
    fnA(i);
    fnB(i);
  }
  const a = new Array(n);
  const b = new Array(n);
  for (let i = 0; i < n; i++) {
    // Alternate order to reduce monotonic clock/GC drift between groups.
    if ((i & 1) === 0) {
      a[i] = timeNs(fnA, i);
      b[i] = timeNs(fnB, i);
    } else {
      b[i] = timeNs(fnB, i);
      a[i] = timeNs(fnA, i);
    }
  }
  return { a, b };
}

function makeEncryptFn(SM4GCM, plaintext, key, ivs) {
  return (i) => {
    const out = SM4GCM.encrypt(plaintext, key, { iv: ivs[i] });
    if (!out || typeof out.ciphertext !== 'string') throw new Error('unexpected encrypt result');
    return out.ciphertext;
  };
}

function makeCase(SM4GCM, plaintexts, key, ivs) {
  return (i) => {
    const out = SM4GCM.encrypt(plaintexts[i], key, { iv: ivs[i] });
    if (!out || typeof out.ciphertext !== 'string') throw new Error('unexpected encrypt result');
    return out.ciphertext;
  };
}

function makeSlowControl(SM4GCM, plaintexts, key, ivs) {
  return (i) => {
    // Deliberate input-dependent delay. The harness must detect this.
    const spin = (plaintexts[i].charCodeAt(0) & 1) ? 250000 : 0;
    const start = process.hrtime.bigint();
    while (Number(process.hrtime.bigint() - start) < spin) {
      // busy wait
    }
    return makeCase(SM4GCM, plaintexts, key, ivs)(i);
  };
}

function runPair(fnA, fnB, n, label) {
  const { a, b } = collectPair(fnA, fnB, n);
  const r = welchT(a, b);
  return {
    label,
    n,
    samples: { a: a.length, b: b.length },
    meanA: r.meanA,
    meanB: r.meanB,
    se: r.se,
    t: r.t,
    verdict: classify(r.t),
    threshold: { pass: T_PASS, hardFail: T_HARD_FAIL },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(MODULE_PATH)) die('missing module: ' + MODULE_PATH);

  const hashBefore = sha256File(MODULE_PATH);
  const commit = gitHead();

  // Make the UMD file behave as in a browser-like global environment.
  globalThis.window = globalThis;
  const SM4GCM = require(MODULE_PATH);
  if (!SM4GCM || typeof SM4GCM.encrypt !== 'function') die('SM4GCM.encrypt not exported');
  if (!SM4GCM || typeof SM4GCM.decrypt !== 'function') die('SM4GCM.decrypt not exported');

  const key = '0123456789abcdef'.repeat(2);
  const fixedPt = 'a'.repeat(64);
  const fixedPts = new Array(args.n).fill(fixedPt);
  const randomPts = Array.from({ length: args.n }, () => crypto.randomBytes(32).toString('hex'));
  const ivs = Array.from({ length: args.n }, () => crypto.randomBytes(12).toString('hex'));

  const fixedFn = makeEncryptFn(SM4GCM, fixedPt, key, ivs);
  const randomFn = makeCase(SM4GCM, randomPts, key, ivs);

  const runs = [];
  for (let r = 0; r < args.runs; r++) {
    runs.push(runPair(fixedFn, randomFn, args.n, 'run-' + (r + 1)));
  }

  let negativeControl = null;
  if (args.negativeControl) {
    negativeControl = [];
    const slowFn = makeSlowControl(SM4GCM, randomPts, key, ivs);
    for (let r = 0; r < args.negativeControlRuns; r++) {
      const control = runPair(fixedFn, slowFn, args.n, 'negative-control-' + (r + 1));
      control.expected = 'warn-or-fail';
      negativeControl.push(control);
    }
  }

  const hashAfter = sha256File(MODULE_PATH);
  const objectUnchanged = hashBefore === hashAfter;
  const allPass = runs.every((r) => r.verdict === 'pass');
  // Stable self-test: every control run must be non-pass, not just one lucky run.
  const controlOk = negativeControl ? negativeControl.every((c) => c.t > T_PASS) : true;
  const sm4Pass = objectUnchanged && allPass;
  const overall = sm4Pass ? 'pass' : 'fail';

  const report = {
    schema: 'fibemate.sm4-tvla.v1',
    generatedAt: new Date().toISOString(),
    command: process.argv.join(' '),
    object: {
      file: 'www/crypto/sm4-browser.js',
      sha256_before: hashBefore,
      sha256_after: hashAfter,
      unchanged: objectUnchanged,
      git_commit: commit,
      bytes: fs.statSync(MODULE_PATH).size,
    },
    methodology: {
      groups: 'fixed plaintext vs random plaintext, same key',
      plaintext_bytes: 32,
      plaintext_encoding: 'utf8 hex string (64 chars)',
      key: 'fixed 16-byte hex key',
      iv: 'fresh random 12-byte IV per sample, generated outside timer',
      warmup: '10% of N, both groups',
      order: 'alternating A/B per sample',
      timer: 'process.hrtime.bigint()',
      test: 'Welch t-test, two-sided; pass <= 4.5, warn 4.5-10, fail >= 10',
      caveat: 'Node/V8 timing screen; noisy by nature; not a formal constant-time proof',
    },
    runs,
    negativeControl,
    negativeControlRuns: negativeControl ? negativeControl.length : 0,
    overall,
    selfTest: negativeControl ? (controlOk ? 'pass' : 'fail') : 'not-run',
    exitCode: sm4Pass ? 0 : 1,
  };

  if (!objectUnchanged) {
    report.error = 'object_changed_during_run';
    report.exitCode = 2;
  }
  if (negativeControl && !controlOk) {
    report.error = 'negative_control_did_not_fail_in_all_runs';
    report.exitCode = 3;
  }

  const outDir = path.dirname(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log('SM4 TVLA harness');
  console.log('  object: ' + report.object.file);
  console.log('  sha256: ' + hashBefore + (objectUnchanged ? ' (unchanged)' : ' (CHANGED)'));
  for (const r of runs) {
    console.log(`  ${r.label}: n=${r.n} meanA=${r.meanA.toFixed(0)}ns meanB=${r.meanB.toFixed(0)}ns |t|=${r.t.toFixed(2)} -> ${r.verdict}`);
  }
  if (negativeControl) {
    for (const c of negativeControl) {
      console.log(`  ${c.label}: |t|=${c.t.toFixed(2)} -> ${c.verdict}`);
    }
    console.log('  self-test: ' + (controlOk ? 'pass (all control runs were non-pass)' : 'FAIL (at least one control run was pass)'));
  }
  console.log('  overall: ' + overall);
  console.log('  report: ' + args.out);
  process.exit(report.exitCode);
}

main();
