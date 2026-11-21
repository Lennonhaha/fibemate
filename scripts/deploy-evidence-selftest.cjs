#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// Runs the negative controls for scripts/deploy-evidence.cjs and writes what it saw.
//
// Why a script: a negative control that lives in a PR description is remembered, not
// reproduced. Everything else in the deploy-evidence mechanism is machine-generated; this
// was the one part still written by hand. Now the file is produced by running the checks,
// and re-running it is the test.
//
// Cases:
//   1. the gate's path set and deploy-release.sh's --tree arguments must agree
//   2. an unknown sha -> exit 2, no record
//   3. a real ancestor of the served commit -> exit 1, no record
//   4. (--live) the served commit -> exit 0, a record is written
//
// Exit 0 only when every case behaves as stated. A checker that cannot fail is decoration,
// and so is a negative-control file that cannot go red.
//
// Usage: node scripts/deploy-evidence-selftest.cjs [--live] [--write]

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync, spawnSync } = require('child_process');
const { RUNTIME_PATHS } = require('./runtime-paths.cjs');
const { escapeMdTable } = require('./md-escape.cjs');

const HERE = __dirname;
const write = process.argv.includes('--write');
const live = process.argv.includes('--live');

function sh(cmd, args, opts) {
  return execFileSync(cmd, args, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts || {})).trim();
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'fibemate-deploy-evidence-selftest' } }, (res) => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

function runEvidence(args, outDir) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'deploy-evidence.cjs')].concat(args, ['--out', outDir]), { encoding: 'utf8' });
  const wrote = fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0;
  const said = ((r.stderr || '') + (r.stdout || '')).split('\n').filter((l) => l.trim())[0] || '';
  return { code: r.status, wrote, said: said.trim() };
}

function firstFail(stderr) {
  const line = (stderr || '').split('\n').find((l) => l.trim().startsWith('FAIL'));
  return line ? line.trim() : '';
}

(async () => {
  const results = [];

  // 1. one definition of "runtime": the deploy script's --tree arguments
  const releaseScript = fs.readFileSync(path.join(HERE, 'deploy-release.sh'), 'utf8');
  const trees = [...releaseScript.matchAll(/--tree\s+(\S+)/g)].map((m) => m[1]);
  const uniqueTrees = [...new Set(trees)];
  const sameSet = uniqueTrees.length === RUNTIME_PATHS.length && uniqueTrees.every((t) => RUNTIME_PATHS.includes(t));
  results.push({
    name: 'runtime paths match deploy-release.sh --tree',
    input: '--tree ' + uniqueTrees.join(' --tree '),
    expect: RUNTIME_PATHS.join(' '),
    got: sameSet ? 'same set' : 'DIFFERENT: ' + uniqueTrees.join(' '),
    ok: sameSet,
  });

  // 1b. the table escaper, which was written by hand twice and got it wrong once each time
  const escapeProbe = 'a\\b|c';
  const escapeWant = 'a\\\\b\\|c';
  const escapeGot = escapeMdTable(escapeProbe);
  results.push({
    name: 'table escaping doubles backslashes before escaping pipes',
    input: JSON.stringify(escapeProbe),
    expect: JSON.stringify(escapeWant),
    got: JSON.stringify(escapeGot),
    ok: escapeGot === escapeWant,
  });

  // 2. unknown sha: content does not exist anywhere
  const health = await get('https://fibemate.net/health');
  const h = JSON.parse(health.body);
  const served = h.build && h.build.commit;

  const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-a-'));
  const a = runEvidence(['--sha', '0000000000'], tmpA);
  results.push({
    name: 'unknown sha is refused',
    input: '--sha 0000000000',
    expect: 'exit 2, no record',
    got: 'exit ' + a.code + ', ' + (a.wrote ? 'WROTE A RECORD' : 'no record') + ', ' + a.said,
    ok: a.code === 2 && !a.wrote,
  });

  // 3. real ancestor: valid content, wrong commit — the case that has to fail
  const ancestor = sh('git', ['rev-parse', served + '^'], { cwd: path.join(HERE, '..') });
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-b-'));
  const b = spawnSync(process.execPath, [path.join(HERE, 'deploy-evidence.cjs'), '--sha', ancestor, '--out', tmpB], { encoding: 'utf8' });
  const bWrote = fs.existsSync(tmpB) && fs.readdirSync(tmpB).length > 0;
  results.push({
    name: 'a real ancestor is refused (alignment, not existence)',
    input: '--sha ' + ancestor.slice(0, 8) + ' (parent of served ' + served.slice(0, 8) + ')',
    expect: 'exit 1, no record',
    got: 'exit ' + b.status + ', ' + (bWrote ? 'WROTE A RECORD' : 'no record') + ', ' + firstFail(b.stderr),
    ok: b.status === 1 && !bWrote,
  });

  // 4. the served commit must pass, or the mechanism is rejecting everything
  if (live) {
    const tmpDelta = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-d-'));
  const d = runEvidence(['--prev', ancestor], tmpDelta);
  const dFile = fs.existsSync(tmpDelta) ? fs.readdirSync(tmpDelta).map((f) => path.join(tmpDelta, f)) : [];
  const dText = dFile.length ? fs.readFileSync(dFile[0], 'utf8') : '';
  const deltaLine = (dText.split('\n').find((l) => l.startsWith('Against ')) || '').trim();
  const deltaOk = d.code === 0 && /^Against `[0-9a-f]{8}`: \*\*[+-]?\d+\*\* file\(s\)/.test(deltaLine);
  results.push({
    name: 'a moved file count is attributed, not left as a bare number',
    input: '--prev ' + ancestor.slice(0, 8),
    expect: 'exit 0, record names the delta',
    got: 'exit ' + d.code + ', ' + (deltaLine || 'no delta line'),
    ok: deltaOk,
  });

  const tmpC = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-c-'));
    const c = runEvidence([], tmpC);
    results.push({
      name: 'the served commit is accepted',
      input: 'resolved from /health = ' + served.slice(0, 8),
      expect: 'exit 0, record written',
      got: 'exit ' + c.code + ', ' + (c.wrote ? 'record written' : 'no record') + ', ' + c.said,
      ok: c.code === 0 && c.wrote,
    });
  }

  const allOk = results.every((r) => r.ok);
  for (const r of results) {
    console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
    console.log('     input:  ' + r.input);
    console.log('     expect: ' + r.expect);
    console.log('     got:    ' + r.got);
  }

  if (write) {
    const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const lines = [];
    lines.push('# Negative controls for the deploy-evidence check');
    lines.push('');
    lines.push('Generated by `scripts/deploy-evidence-selftest.cjs' + (live ? ' --live' : '') + '` at ' + stamp + '.');
    lines.push('Not written by hand: re-running the command regenerates this file. If a line here is');
    lines.push('wrong, the script failed and someone committed the output anyway.');
    lines.push('');
    lines.push('| case | input | expected | actual | result |');
    lines.push('|---|---|---|---|---|');
    for (const r of results) {
      lines.push('| ' + r.name + ' | `' + r.input + '` | ' + r.expect + ' | ' + escapeMdTable(r.got) + ' | ' + (r.ok ? 'pass' : 'FAIL') + ' |');
    }
    lines.push('');
    lines.push('## Why the third case is the load-bearing one');
    lines.push('');
    lines.push('An unknown sha only proves that a missing object is missing. The third case uses a commit');
    lines.push('that exists in the repository and whose content is valid — only the commit production');
    lines.push('serves differs. A checker that reports success there would be measuring the repository,');
    lines.push('not the deployment.');
    lines.push('');
    lines.push('## When to re-run');
    lines.push('');
    lines.push('After changing `deploy-evidence.cjs`, `check-deploy-alignment.cjs`, `runtime-paths.cjs`,');
    lines.push('or the `--tree` arguments of `deploy-release.sh`. The first case fails if the path set and');
    lines.push('the deploy script disagree, which is the one divergence neither of them can notice alone.');
    lines.push('');
    fs.mkdirSync(path.join(HERE, '..', 'docs', 'deploy-evidence'), { recursive: true });
    fs.writeFileSync(path.join(HERE, '..', 'docs', 'deploy-evidence', 'negative-controls.md'), lines.join('\n'), 'utf8');
    console.log('written: docs/deploy-evidence/negative-controls.md');
  }

  process.exit(allOk ? 0 : 1);
})();
