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
  const opts = { offline: false, host: null, local: DEFAULT_LOCAL, remote: DEFAULT_REMOTE, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--offline') opts.offline = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--host') opts.host = argv[++i];
    else if (a === '--local') opts.local = argv[++i];
    else if (a === '--remote') opts.remote = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('usage: check-nginx-drift.cjs [--offline] [--host <ssh-alias>] [--local <file>] [--remote <path>]');
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

function unified(a, b, labelA, labelB, limit) {
  const out = [];
  const n = Math.max(a.length, b.length);
  let shown = 0;
  for (let i = 0; i < n && shown < limit; i += 1) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) out.push('- ' + labelA + ':' + (i + 1) + ': ' + a[i]);
      if (b[i] !== undefined) out.push('+ ' + labelB + ':' + (i + 1) + ': ' + b[i]);
      shown += 1;
    }
  }
  return out;
}

function main() {
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

  const res = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', opts.host, 'sudo cat ' + opts.remote], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  if (res.status !== 0) {
    console.error('remote fetch failed (ssh ' + opts.host + ', exit ' + res.status + ')');
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
  if (mine.length === live.length && mine.every((l, i) => l === live[i])) {
    if (!opts.quiet) console.log('drift: none (' + mine.length + ' code lines match the live file)');
    return;
  }

  const diff = unified(mine, live, 'tracked', 'live', 20);
  console.error('drift: tracked copy differs from ' + opts.host + ':' + opts.remote);
  for (const line of diff) console.error(line);
  const extra = mine.length !== live.length ? ' (code lines: tracked ' + mine.length + ', live ' + live.length + ')' : '';
  console.error('update deploy/nginx/fibemate.net.conf from the live file, or fix the server.' + extra);
  process.exit(2);
}

main();
