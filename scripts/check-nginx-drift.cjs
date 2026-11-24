#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// check-nginx-drift.cjs -- keep deploy/nginx/*.conf honest against the live host.
//
// The production site config is edited on the server, so the tracked copy can
// silently rot. This script compares the tracked copy with the live file.
//
//   node scripts/check-nginx-drift.cjs --offline
//       Local invariants only: the tracked copy exists, is UTF-8, contains no
//       key material, no external addresses, no long hex blobs.
//
//   node scripts/check-nginx-drift.cjs --host fibemate
//       Fetch /etc/nginx/sites-enabled/fibemate.net over ssh and compare the
//       code lines (comments and blank lines ignored). Exit 2 on drift.
//
// Exit codes: 0 same, 1 usage/io, 2 drift, 3 remote fetch failed.

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LOCAL = path.join(__dirname, '..', 'deploy', 'nginx', 'fibemate.net.conf');
const DEFAULT_REMOTE = '/etc/nginx/sites-enabled/fibemate.net';

function parseArgs(argv) {
  const opts = {
    offline: false,
    host: null,
    user: null,
    port: null,
    identity: null,
    local: DEFAULT_LOCAL,
    remote: DEFAULT_REMOTE,
    quiet: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--offline') opts.offline = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--host') opts.host = argv[++i];
    else if (a === '--user') opts.user = argv[++i];
    else if (a === '--port') opts.port = argv[++i];
    else if (a === '--identity') opts.identity = argv[++i];
    else if (a === '--local') opts.local = argv[++i];
    else if (a === '--remote') opts.remote = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('usage: check-nginx-drift.cjs [--offline] [--host <host>] [--user <user>] [--port <n>] [--identity <key>] [--local <file>] [--remote <path>]');
      process.exit(0);
    } else {
      console.error('unknown argument: ' + a);
      process.exit(1);
    }
  }
  return opts;
}

const isLoopback = (ip) => ip === '127.0.0.1' || ip === '0.0.0.0' || ip.startsWith('127.');

// Offline invariants. These are the things that must never reach a public repo.
function checkLocalInvariants(text) {
  const problems = [];
  if (text.includes('\uFFFD')) problems.push('contains U+FFFD (not valid UTF-8)');
  if (text.includes('\u0000')) problems.push('contains NUL bytes');
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) problems.push('contains a private key block');

  for (const m of text.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g)) {
    if (!isLoopback(m[1])) problems.push('contains external address ' + m[1] + ' (use <IP> or a hostname)');
  }
  for (const m of text.matchAll(/\b[0-9a-fA-F]{40,}\b/g)) {
    problems.push('contains a long hex blob (' + m[0].slice(0, 12) + '...); redact or explain it');
  }
  return problems;
}

// Code lines only: comments and blank lines are allowed to differ, because the
// tracked copy carries a header that the live file does not have.
function codeLines(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
}

// Longest-common-subsequence diff. The previous version compared line i with
// line i, so a single inserted line reported every following line as drift:
// a real four-line change (2026-11-24) printed a wall of phantom differences and
// taught readers to skim the output. Insertions and deletions must be located by
// content, not by index.
function lcsOps(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: 'same', ai: i, bi: j, text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ t: 'del', ai: i, bi: j, text: a[i] });
      i += 1;
    } else {
      ops.push({ t: 'ins', ai: i, bi: j, text: b[j] });
      j += 1;
    }
  }
  while (i < n) { ops.push({ t: 'del', ai: i, bi: j, text: a[i] }); i += 1; }
  while (j < m) { ops.push({ t: 'ins', ai: i, bi: j, text: b[j] }); j += 1; }
  return ops;
}

function countChanges(ops) {
  return ops.filter((o) => o.t !== 'same').length;
}

function renderDiff(ops, labelA, labelB, limit) {
  const out = [];
  let changes = 0;
  let cut = false;
  for (const o of ops) {
    if (o.t === 'same') continue;
    changes += 1;
    if (changes > limit) { cut = true; continue; }
    if (o.t === 'del') out.push('- ' + labelA + ':' + (o.ai + 1) + ': ' + o.text);
    else out.push('+ ' + labelB + ':' + (o.bi + 1) + ': ' + o.text);
  }
  if (cut) out.push('  ... and ' + (changes - limit) + ' more changed line(s)');
  return out;
}

// Proves the diff locates insertions instead of cascading through the tail.
function selfTest() {
  const cases = [];
  const same = (a, b) => countChanges(lcsOps(a, b)) === 0;
  const kinds = (a, b) => {
    const o = lcsOps(a, b).filter((x) => x.t !== 'same');
    return o.map((x) => x.t).sort().join(',');
  };

  cases.push(['identical input has no changes', same(['a', 'b', 'c'], ['a', 'b', 'c'])]);
  cases.push(['one insertion is one change, not a cascade', kinds(['a', 'b', 'c'], ['a', 'x', 'b', 'c']) === 'ins']);
  cases.push(['one deletion is one change', kinds(['a', 'b', 'c'], ['a', 'c']) === 'del']);
  cases.push(['one edit is one delete plus one insert', kinds(['a', 'b'], ['a', 'B']) === 'del,ins']);
  cases.push(['insertion near the top does not mark the tail', countChanges(lcsOps(
    ['l1', 'l2', 'l3', 'l4', 'l5'],
    ['l0', 'l1', 'l2', 'l3', 'l4', 'l5'],
  )) === 1]);
  cases.push(['renderer numbers the live side for insertions', renderDiff(
    lcsOps(['a'], ['a', 'b']), 'tracked', 'live', 20,
  )[0] === '+ live:2: b']);

  let failed = 0;
  for (const [name, ok] of cases) {
    if (!ok) failed += 1;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  }
  if (failed > 0) {
    console.error('\nSELFTEST FAILED: ' + failed + '/' + cases.length);
    process.exit(1);
  }
  console.log('\nSELFTEST OK: ' + cases.length + '/' + cases.length);
  process.exit(0);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const opts = parseArgs(process.argv.slice(2));
  let localText;
  try {
    localText = fs.readFileSync(opts.local, 'utf8');
  } catch (err) {
    console.error('cannot read ' + opts.local + ': ' + err.message);
    process.exit(1);
  }

  const problems = checkLocalInvariants(localText);
  if (problems.length > 0) {
    console.error('tracked copy fails offline invariants:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  if (!opts.quiet) console.log('offline: ' + path.relative(process.cwd(), opts.local) + ' ok (no secrets, no external addresses)');

  if (opts.offline) return;

  if (!opts.host) {
    console.error('no --host given and --offline not set');
    process.exit(1);
  }

  const target = (opts.user ? opts.user + '@' : '') + opts.host;
  const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];
  if (opts.port) sshArgs.push('-p', String(opts.port));
  if (opts.identity) sshArgs.push('-i', opts.identity);
  sshArgs.push(target, 'sudo cat ' + opts.remote);

  const res = spawnSync('ssh', sshArgs, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  if (res.status !== 0) {
    console.error('remote fetch failed (ssh ' + target + ', exit ' + res.status + ')');
    if (res.stderr) console.error(res.stderr.trim().split('\n').slice(0, 5).join('\n'));
    process.exit(3);
  }

  const liveProblems = checkLocalInvariants(res.stdout);
  if (liveProblems.length > 0 && !opts.quiet) {
    console.log('note: the live file trips offline invariants (expected for addresses/hex):');
    for (const p of liveProblems) console.log('  - ' + p);
  }

  const mine = codeLines(localText);
  const live = codeLines(res.stdout);
  const ops = lcsOps(mine, live);
  if (countChanges(ops) === 0) {
    if (!opts.quiet) console.log('drift: none (' + mine.length + ' code lines match the live file)');
    return;
  }

  const diff = renderDiff(ops, 'tracked', 'live', 20);
  console.error('drift: tracked copy differs from ' + target + ':' + opts.remote);
  for (const line of diff) console.error(line);
  const extra = mine.length !== live.length ? ' (code lines: tracked ' + mine.length + ', live ' + live.length + ')' : '';
  console.error('update deploy/nginx/fibemate.net.conf from the live file, or fix the server.' + extra);
  process.exit(2);
}

if (require.main === module) main();
else module.exports = { lcsOps, codeLines, countChanges, renderDiff };
