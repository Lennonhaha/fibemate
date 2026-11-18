#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * TVLA live gate - run the timing test against the code in this checkout.
 *
 * Why this exists: until 2026-11-15 the only TVLA signal in CI came from
 * scripts/tvla-summary.js, which regex-scans checked-in text files. It reported
 * PASS while the live test failed (|t| = 58-86 for NTT). See issue #510.
 *
 * This gate runs packages/fml-dsa/test/tvla-timing.test.js and applies an
 * expectation allowlist:
 *
 *   - leaks that are documented (default: NTT and invNTT, both pure JS) pass,
 *     and say so
 *   - leaks not on the allowlist fail
 *   - a harness that produces no report fails
 *
 * Two thresholds, deliberately:
 *   --warn-t  4.5  the published TVLA threshold; a crossing is reported loudly
 *   --fail-t  10   a crossing this far above is treated as a real regression
 * A single 5,000-sample run moves by a few units between machines (the same NTT
 * measured 58.12, 78.07 and 85.65 on three runs/two hosts, and 51.68-63.77 on
 * 2026-11-18), so failing at the exact 4.5 line would produce false reds on
 * unrelated primitives.
 *
 * Usage:
 *   node scripts/tvla-live-gate.cjs                        # run and judge
 *   node scripts/tvla-live-gate.cjs --json-out=<path>      # also emit a report
 *   node scripts/tvla-live-gate.cjs --allow-leak=NTT,...   # replace the allowlist
 *   node scripts/tvla-live-gate.cjs --warn-only            # never exit 1 on leaks
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST = path.join(ROOT, 'packages', 'fml-dsa', 'test', 'tvla-timing.test.js');

const DEFAULTS = {
  threshold: 4.5,
  failT: 10,
  allow: ['NTT', 'invNTT'],
};

function parseArgs(argv) {
  const opts = { warnOnly: false, jsonOut: null, allow: DEFAULTS.allow.slice(), warnT: DEFAULTS.threshold, failT: DEFAULTS.failT };
  for (const arg of argv) {
    if (arg === '--warn-only') opts.warnOnly = true;
    else if (arg.startsWith('--json-out=')) opts.jsonOut = arg.slice('--json-out='.length);
    else if (arg.startsWith('--allow-leak=')) {
      opts.allow = arg.slice('--allow-leak='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--warn-t=')) opts.warnT = Number(arg.slice('--warn-t='.length));
    else if (arg.startsWith('--fail-t=')) opts.failT = Number(arg.slice('--fail-t='.length));
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.warnT) || !Number.isFinite(opts.failT)) {
    console.error('--warn-t and --fail-t must be numbers');
    process.exit(2);
  }
  return opts;
}

/**
 * Decide the verdict from a parsed report. Pure function so the gate's own
 * failure path can be exercised without running a 20 s timing experiment.
 *
 * @param {{tests: Array<{name: string, t: number}>}} report
 * @param {{warnT: number, failT: number, allow: string[]}} opts
 * @returns {{exitCode: number, rows: Array, unexpected: Array, missing: string[]}}
 */
function classify(report, opts) {
  const allow = new Set(opts.allow);
  const rows = [];
  const unexpected = [];

  for (const test of report.tests) {
    const t = Number(test.t);
    const allowed = allow.has(test.name);
    let status;
    if (allowed) {
      status = t > opts.warnT ? 'expected-leak' : 'ok-improved';
    } else if (t >= opts.failT) {
      status = 'new-leak';
      unexpected.push(test.name);
    } else if (t > opts.warnT) {
      status = 'warn';
    } else {
      status = 'ok';
    }
    rows.push({ name: test.name, t, status });
  }

  // Allowlisted primitives that are no longer leaking are good news, not a
  // failure - but they should be reported so the allowlist can be retired.
  const missing = opts.allow.filter((name) => {
    const row = rows.find((r) => r.name === name);
    return !row || row.status === 'ok-improved';
  });

  const exitCode = unexpected.length > 0 ? 1 : 0;
  return { exitCode, rows, unexpected, missing };
}

function runHarness() {
  const tmpReport = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tvla-live-')), 'report.json');
  const res = spawnSync(process.execPath, [TEST, `--json=${tmpReport}`], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (!fs.existsSync(tmpReport)) {
    return {
      ok: false,
      reason: `harness produced no report (exit ${res.status})`,
      stdout: (res.stdout || '').slice(-2000),
      stderr: (res.stderr || '').slice(-2000),
    };
  }

  const report = JSON.parse(fs.readFileSync(tmpReport, 'utf8'));
  // The harness exits 1 when it sees any leak. That is expected here: this
  // gate, not the harness, decides whether a leak is tolerated.
  if (res.status !== 0 && res.status !== 1) {
    return { ok: false, reason: `harness exited ${res.status}`, stdout: (res.stdout || '').slice(-2000) };
  }
  return { ok: true, report };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('node scripts/tvla-live-gate.cjs [--json-out=<path>] [--allow-leak=NTT,...] [--warn-only] [--warn-t=4.5] [--fail-t=10]');
    return 0;
  }

  console.log('TVLA live gate\n');
  console.log(`  harness:   ${path.relative(ROOT, TEST)}`);
  console.log(`  threshold: |t| > ${opts.warnT} is reported, > ${opts.failT} fails`);
  console.log(`  allowlist: ${opts.allow.length ? opts.allow.join(', ') || '(none)' : '(none)'}\n`);

  const run = runHarness();
  if (!run.ok) {
    console.error(`  HARNESS FAILURE: ${run.reason}`);
    if (run.stdout) console.error(run.stdout);
    if (run.stderr) console.error(run.stderr);
    console.error('\nTVLA LIVE GATE: HARNESS FAILURE');
    return 1;
  }

  const report = run.report;
  const verdict = classify(report, opts);

  for (const row of verdict.rows) {
    const label = row.status === 'new-leak' ? 'FAIL' : row.status === 'warn' ? 'WARN' : row.status === 'expected-leak' ? 'EXPECTED' : 'OK';
    console.log(`  ${label.padEnd(9)} ${row.name.padEnd(20)} |t|= ${row.t.toFixed(2).padStart(7)}`);
  }

  console.log(`\n  samples:   ${report.tests.map((t) => `${t.name}=${t.samples}`).join(', ')}`);
  console.log(`  measured on ${report.node || process.version} / ${report.platform || process.platform}`);

  if (verdict.missing.length > 0) {
    console.log(`\n  NOTE: allowlisted primitives no longer leak: ${verdict.missing.join(', ')} - retire them from the allowlist.`);
  }

  if (opts.jsonOut) {
    fs.writeFileSync(
      opts.jsonOut,
      JSON.stringify(
        {
          schema: 'tvla-live-gate/v1',
          generated_at: new Date().toISOString(),
          node: report.node,
          platform: report.platform,
          warn_t: opts.warnT,
          fail_t: opts.failT,
          allowlist: opts.allow,
          tests: verdict.rows.map((r) => ({ name: r.name, t: r.t, samples: (report.tests.find((t) => t.name === r.name) || {}).samples, status: r.status })),
          unexpected: verdict.unexpected,
          exit_code: verdict.exitCode,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    console.log(`  report:    ${opts.jsonOut}`);
  }

  if (verdict.unexpected.length > 0) {
    console.error(`\nTVLA LIVE GATE: FAIL - undocumented timing leak in ${verdict.unexpected.join(', ')}`);
    console.error('  If this is expected, declare it in docs/security-limitations.md and add it to the allowlist.');
    return opts.warnOnly ? 0 : 1;
  }

  console.log('\nTVLA LIVE GATE PASSED');
  return 0;
}

module.exports = { classify, parseArgs, DEFAULTS };

if (require.main === module) process.exit(main());
