#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// D26 draft. Reads the deployed commit from /health and compares it with the newest
// commit on the deploy branch that touched the same paths deploy-release.sh verifies.
// Three outcomes only: ALIGNED, DRIFT, UNKNOWN. Transport failures are UNKNOWN and
// must not block anything.
//
// exit 0 aligned (debt within budget) | 1 drift | 2 unknown

'use strict';

const { execFileSync } = require('child_process');
const { RUNTIME_PATHS } = require('./runtime-paths.cjs');
const https = require('https');
const http = require('http');

const DEFAULTS = {
  url: 'https://fibemate.net/health',
  repo: process.cwd(),
  ref: 'origin/main',
  paths: [...RUNTIME_PATHS],
  maxDebt: 1,
  timeoutMs: 8000,
};

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--self-test') out.selfTest = true;
    else if (a === '--json') out.json = true;
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--repo') out.repo = argv[++i];
    else if (a === '--ref') out.ref = argv[++i];
    else if (a === '--paths') out.paths = argv[++i].split(/[,\s]+/).filter(Boolean);
    else if (a === '--max-debt') out.maxDebt = Number(argv[++i]);
    else if (a === '--served-override') out.servedOverride = argv[++i];
    else if (a === '--help') out.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tryGit(repo, args) {
  try {
    return { ok: true, out: git(repo, args) };
  } catch (e) {
    return { ok: false, out: '' };
  }
}

// The commit a deploy should have produced: the newest one on the ref that touched a
// path the deploy verifies. Same set as deploy-release.sh's --tree arguments.
function deployTarget(repo, ref, paths) {
  const rev = git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]);
  const r = tryGit(repo, ['log', '-1', '--format=%H', rev, '--', ...paths]);
  if (!r.ok || !r.out) return { rev, r: null };
  return { rev, r: r.out };
}

function isAncestor(repo, a, b) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: repo });
    return true;
  } catch (e) {
    return false;
  }
}

function debt(repo, from, to, paths) {
  const out = tryGit(repo, ['rev-list', '--count', `${from}..${to}`, '--', ...paths]);
  return out.ok ? Number(out.out) : null;
}

function fetchHealth(url, timeoutMs) {
  return new Promise((resolve) => {
    const bust = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
    const mod = bust.startsWith('https:') ? https : http;
    const req = mod.get(bust, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          cache: String(res.headers['x-cache'] || ''),
          age: res.headers.age,
          body,
        });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => resolve({ error: e.message }));
  });
}

function classify({ repo, ref, paths, maxDebt, served }) {
  const { rev, r } = deployTarget(repo, ref, paths);
  if (!r) return { state: 'UNKNOWN', reason: 'no commit touches the deploy paths', ref: rev };
  const hasServed = tryGit(repo, ['cat-file', '-e', `${served}^{commit}`]).ok;
  if (!hasServed) return { state: 'UNKNOWN', reason: `served ${served} is not a commit in this repository`, r, ref: rev };

  if (isAncestor(repo, r, served)) return { state: 'ALIGNED', r, served, debt: 0, ref: rev };
  if (isAncestor(repo, served, r)) {
    const d = debt(repo, served, r, paths);
    if (d === null) return { state: 'UNKNOWN', reason: 'could not count the debt', r, served, ref: rev };
    // debt 0 means the deployed commit already contains R; anything above the budget
    // is a drift, and anything inside it is a debt that the log still shows.
    const state = d === 0 ? 'ALIGNED' : d <= maxDebt ? 'BEHIND' : 'DRIFT';
    return { state, r, served, debt: d, maxDebt, ref: rev };
  }
  // Deployed from a branch that has diverged from the deploy branch: the ancestry
  // question has no answer, and guessing would be the defect D24 describes.
  return { state: 'UNKNOWN', reason: 'served and the deploy branch have diverged', r, served, ref: rev };
}

async function run(opts) {
  let served = opts.servedOverride;
  let servedNote = 'override';
  if (!served) {
    const h = await fetchHealth(opts.url, opts.timeoutMs);
    if (h.error) return { state: 'UNKNOWN', reason: `health unreachable: ${h.error}` };
    if (h.cache.toUpperCase().includes('HIT')) return { state: 'UNKNOWN', reason: 'response came from cache (X-Cache: HIT)' };
    if (h.age !== undefined) return { state: 'UNKNOWN', reason: `response has Age: ${h.age}, treat as cached` };
    let parsed;
    try {
      parsed = JSON.parse(h.body);
    } catch (e) {
      return { state: 'UNKNOWN', reason: 'health is not JSON' };
    }
    served = (parsed.build && parsed.build.commit) || null;
    servedNote = 'health';
    if (!served) return { state: 'UNKNOWN', reason: 'health has no build.commit' };
  }
  const result = classify({ repo: opts.repo, ref: opts.ref, paths: opts.paths, maxDebt: opts.maxDebt, served });
  return { ...result, servedNote };
}

function line(r) {
  if (r.state === 'ALIGNED') return `ALIGNED served=${r.served} R=${r.r} debt=0`;
  if (r.state === 'BEHIND') return `BEHIND served=${r.served} R=${r.r} debt=${r.debt} budget=${r.maxDebt}`;
  if (r.state === 'DRIFT') return `DRIFT served=${r.served} R=${r.r} debt=${r.debt} budget=${r.maxDebt}`;
  return `UNKNOWN ${r.reason}`;
}

// Negative control: the classifier must produce DRIFT on a tree that is behind, and
// UNKNOWN where ancestry cannot be decided. A gate nobody has seen fail is decoration.
function selfTest() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd26-'));
  const sh = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  sh(['init', '-q']);
  sh(['config', 'user.email', 'test@example.com']);
  sh(['config', 'user.name', 'test']);
  const commit = (file, body, msg) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
    sh(['add', file]);
    sh(['commit', '-q', '-m', msg]);
    return sh(['rev-parse', 'HEAD']);
  };
  const c1 = commit('src/a.js', '1\n', 'src one');
  const c2 = commit('docs/b.md', '2\n', 'docs only');
  const c3 = commit('src/c.js', '3\n', 'src two');
  const c4 = commit('src/d.js', '4\n', 'src three');
  const cases = [
    ['served equals R', { served: c4 }, 'ALIGNED', 0],
    ['served one runtime commit behind, inside budget', { served: c3 }, 'BEHIND', 1],
    // c2 is a docs commit: the range c2..c4 contains three commits but only two touch
    // the deploy paths, so the debt must be 2 and not 3.
    ['a docs commit is not counted as runtime debt', { served: c2 }, 'DRIFT', 2],
    ['served two runtime commits behind, over budget', { served: c1 }, 'DRIFT', 2],
    ['served unknown to this repo', { served: 'deadbeef'.repeat(5) }, 'UNKNOWN', null],
  ];
  let fail = 0;
  for (const [name, o, want, wantDebt] of cases) {
    const got = classify({ repo: dir, ref: 'HEAD', paths: ['src', 'packages', 'www'], maxDebt: 1, served: o.served });
    const debtOk = wantDebt === null ? true : got.debt === wantDebt;
    const ok = got.state === want && debtOk;
    if (!ok) fail += 1;
    console.log(`PASS ${name} -> ${got.state} debt=${got.debt}${ok ? '' : ` expected ${want} debt=${wantDebt}`}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail === 0 ? 'self-test: all cases behaved' : `self-test: ${fail} unexpected`);
  return fail === 0 ? 0 : 1;
}

(async () => {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write('usage: check-deploy-alignment.cjs [--url U] [--repo P] [--ref R] [--paths a,b] [--max-debt N] [--json] [--self-test]\n');
    process.exit(0);
  }
  if (opts.selfTest) process.exit(selfTest());
  const r = await run(opts);
  if (opts.json) process.stdout.write(`${JSON.stringify(r)}\n`);
  else process.stdout.write(`${line(r)}\n`);
  process.exit(r.state === 'ALIGNED' || r.state === 'BEHIND' ? 0 : r.state === 'DRIFT' ? 1 : 2);
})();
