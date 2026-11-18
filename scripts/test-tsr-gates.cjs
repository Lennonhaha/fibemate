#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE contributors
//
// Negative tests for the two TSR gates.
//
// Both gates exist because a number was believed without being checked. A gate that
// has only ever been seen green is indistinguishable from a gate that cannot go red,
// so every case here is a tree that the gate must reject. The fixtures are throwaway
// git repositories under the OS temp dir; nothing outside temp is written.
//
// Usage: node scripts/test-tsr-gates.cjs
// Exit:  0 all cases behaved as expected, 1 at least one did not.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const BUILD = path.join(repo, 'scripts', 'build-tsr-manifest.cjs');
const COPY = path.join(repo, 'scripts', 'check-tsr-copy.cjs');

let failures = 0;
const tmpDirs = [];

function run(script, args, opts = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', ...opts });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function caseRun(name, want, got) {
  const ok = got.code === want;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: exit ${got.code} (expected ${want})`);
  if (!ok) console.log(got.out.split('\n').slice(0, 8).map((l) => `      ${l}`).join('\n'));
  return ok;
}

function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsr-gate-'));
  tmpDirs.push(dir);
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'gate test');
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
  return dir;
}

const manifestWith = (rows) => JSON.stringify(rows, null, 2) + '\n';

// 1. manifest covers one of two tracked files -> drift
{
  const dir = makeRepo({
    'docs/tsa/2026-01-01/lg-001.tsr': 'one',
    'docs/tsa/2026-01-01/lg-002.tsr': 'two',
    'docs/tsa/timestamp-manifest.json': manifestWith([{ tsr: 'lg-001.tsr', dir: 'docs/tsa/2026-01-01' }]),
  });
  const r = run(BUILD, ['--check', '--root', dir], { cwd: dir });
  caseRun('manifest missing a row is rejected', 1, r);
  console.log(`      ${/missing rows\s*: 1/.test(r.out) ? 'reported missing rows: 1' : 'DID NOT report the missing row'}`);
}

// 2. manifest names a file that is not in the tree -> drift
{
  const dir = makeRepo({
    'docs/tsa/2026-01-01/lg-001.tsr': 'one',
    'docs/tsa/timestamp-manifest.json': manifestWith([
      { tsr: 'lg-001.tsr', dir: 'docs/tsa/2026-01-01' },
      { tsr: 'lg-099.tsr', dir: 'docs/tsa/2026-01-01' },
    ]),
  });
  caseRun('manifest dead row is rejected', 1, run(BUILD, ['--check', '--root', dir], { cwd: dir }));
}

// 3. --write repairs both, and --check then passes
{
  const dir = makeRepo({
    'docs/tsa/2026-01-01/lg-001.tsr': 'one',
    'docs/tsa/2026-01-01/lg-002.tsr': 'two',
    'docs/tsa/timestamp-manifest.json': manifestWith([{ tsr: 'lg-099.tsr', dir: 'docs/tsa/2026-01-01' }]),
  });
  caseRun('--write accepts a drifted manifest', 0, run(BUILD, ['--write', '--root', dir], { cwd: dir }));
  caseRun('--check passes after --write', 0, run(BUILD, ['--check', '--root', dir], { cwd: dir }));
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'docs/tsa/timestamp-manifest.json'), 'utf8'));
  const ok = rows.length === 2 && rows.every((r) => r.sha256);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} --write produced 2 rows with sha256 (got ${rows.length})`);
}

// 4. a .tsr edited after the manifest was written -> stale sha256
{
  const dir = makeRepo({
    'docs/tsa/2026-01-01/lg-001.tsr': 'one',
    'docs/tsa/timestamp-manifest.json': manifestWith([{ tsr: 'lg-001.tsr', dir: 'docs/tsa/2026-01-01' }]),
  });
  run(BUILD, ['--write', '--root', dir], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'docs/tsa/2026-01-01/lg-001.tsr'), 'tampered');
  caseRun('tampered .tsr is rejected', 1, run(BUILD, ['--check', '--root', dir], { cwd: dir }));
}

// 5. zero evidence must never pass
{
  const dir = makeRepo({ 'README.md': 'no evidence here' });
  caseRun('empty evidence tree is rejected', 2, run(BUILD, ['--check', '--root', dir], { cwd: dir }));
}

// 6. the copy gate's own matcher: legacy and corrected phrasings
caseRun('copy gate self-test', 0, run(COPY, ['--self-test']));

// 7. the copy gate against the real repository
caseRun('copy gate on the repository', 0, run(COPY, []));

for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });

console.log(failures === 0 ? '\nall gate cases behaved as expected' : `\n${failures} case(s) did not behave as expected`);
process.exit(failures === 0 ? 0 : 1);
