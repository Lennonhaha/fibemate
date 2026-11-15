#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * Self-test for the TVLA gates.
 *
 * A gate whose failure path is never executed is how #510 happened: the summary
 * printed PASS every night because nothing ever fed it a failing input. These
 * cases drive both scripts through their real CLIs with fixtures and assert the
 * exit codes.
 *
 *   node scripts/test-tvla-gates.cjs      # exit 0 = all cases behave
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tvla-gates-'));
let failures = 0;
let cases = 0;

function report(name, ok, detail) {
  cases++;
  if (ok) {
    console.log(`  PASS ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

function writeJson(name, tests) {
  const file = path.join(TMP, name);
  fs.writeFileSync(
    file,
    JSON.stringify({
      schema: 'tvla-timing/v1',
      node: process.version,
      platform: process.platform,
      threshold: 4.5,
      tests: tests.map((t) => ({ name: t.name, samples: t.samples, t: t.t, leak: t.t > 4.5 })),
      leaks: tests.filter((t) => t.t > 4.5).map((t) => t.name),
    }),
    'utf8',
  );
  return file;
}

function writeText(name, body) {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

function runSummary(args) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'tvla-summary.js'), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: res.status, out: (res.stdout || '') + (res.stderr || '') };
}

console.log('TVLA gate self-test\n');

// --- summary: thin evidence must not pass -----------------------------------
{
  const f = writeText('thin.txt', 'threshold |t|=4.50 at N>=1749\n');
  const r = runSummary([`--include=${f}`, '--min-samples=10']);
  report('summary rejects a 1-sample file (was the 2026-11-15 false green)', r.code === 1 && /INSUFFICIENT/.test(r.out), `exit=${r.code}`);
}

// --- summary: healthy report passes ----------------------------------------
{
  const f = writeJson('healthy.json', [
    { name: 'NTT', samples: 5000, t: 60 },
    { name: 'modMul (Barrett)', samples: 5000, t: 2 },
  ]);
  const r = runSummary([`--include=${f}`, '--min-samples=100', '--allow-leak=NTT']);
  report('summary passes a documented leak with enough samples', r.code === 0 && /EXPECTED/.test(r.out), `exit=${r.code}`);
}

// --- summary: undocumented leak fails --------------------------------------
{
  const f = writeJson('leak.json', [{ name: 'ctAdd+ctSub', samples: 5000, t: 50 }]);
  const r = runSummary([`--include=${f}`, '--min-samples=100', '--allow-leak=NTT']);
  report('summary fails an undocumented leak', r.code === 1 && /THRESHOLD BREACHED/.test(r.out), `exit=${r.code}`);
}

// --- summary: no evidence fails --------------------------------------------
{
  const r = runSummary(['--min-samples=10']);
  report('summary fails when nothing measured', r.code === 1 && /NO EVIDENCE/.test(r.out), `exit=${r.code}`);
}

// --- live gate: classifier -------------------------------------------------
const { classify } = require('./tvla-live-gate.cjs');
const opts = { warnT: 4.5, failT: 10, allow: ['NTT'] };

{
  const v = classify({ tests: [{ name: 'NTT', t: 85 }, { name: 'modMul (Barrett)', t: 2 }] }, opts);
  report('gate tolerates the documented NTT leak', v.exitCode === 0 && v.unexpected.length === 0 && v.rows[0].status === 'expected-leak', `exit=${v.exitCode}`);
}
{
  const v = classify({ tests: [{ name: 'NTT', t: 85 }, { name: 'ctAdd+ctSub', t: 42 }] }, opts);
  report('gate fails a new leak', v.exitCode === 1 && v.unexpected.join() === 'ctAdd+ctSub', `exit=${v.exitCode}`);
}
{
  const v = classify({ tests: [{ name: 'NTT', t: 0.4 }] }, opts);
  report('gate reports a retired allowlist entry', v.exitCode === 0 && v.missing.includes('NTT'), `missing=${v.missing}`);
}
{
  const v = classify({ tests: [{ name: 'ctAdd+ctSub', t: 6 }] }, opts);
  report('gate warns (not fails) just above the threshold', v.exitCode === 0 && v.rows[0].status === 'warn', `status=${v.rows[0].status}`);
}

try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {
  /* best effort */
}

console.log(`\n${cases - failures}/${cases} cases passed`);
if (failures > 0) {
  console.error('TVLA GATE SELF-TEST: FAIL');
  process.exit(1);
}
console.log('TVLA GATE SELF-TEST: PASS');
