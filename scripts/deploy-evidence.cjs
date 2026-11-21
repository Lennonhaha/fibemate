#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Writes one deploy-evidence record for the commit that production is serving.
//
// Why this exists: a screenshot of a green run proves that a run was green. It does not
// prove which bytes a visitor receives. This script records the three things that can be
// checked from outside the server, and refuses to write a record when they disagree.
//
// What it proves: production served this commit, and the bytes sent for `/` are identical
// to `www/index.html` at that commit in the repository.
// What it does NOT prove: that the code is correct, safe, or tested. A deployment can be
// perfectly aligned and still ship a bug. Do not read this record as more than alignment.
//
// Usage:
//   node scripts/deploy-evidence.cjs                 # resolve sha from /health
//   node scripts/deploy-evidence.cjs --sha <sha>
//   node scripts/deploy-evidence.cjs --run <run_id>  # attach workflow metadata (needs gh)
//   node scripts/deploy-evidence.cjs --out <dir>     # default docs/deploy-evidence
//
// Exit: 0 aligned, 1 mismatch (no record written), 2 usage or network failure.

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { RUNTIME_PATHS } = require('./runtime-paths.cjs');

const REPO = 'Lennonhaha/fibemate';
const BASE = 'https://fibemate.net';
const RAW = 'https://raw.githubusercontent.com/' + REPO;

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: Object.assign({ 'user-agent': 'fibemate-deploy-evidence' }, headers || {}) }, (res) => {
      // utf8 decode is set before any chunk is concatenated: without this, a multi-byte
      // character split across chunks becomes U+FFFD and the byte count silently grows.
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout ' + url)));
  });
}

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch (e) {
    return '';
  }
}

function firstDivergence(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}


(async () => {
  const health = await get(BASE + '/health');
  if (health.status !== 200) { console.error('health status ' + health.status); process.exit(2); }
  let h;
  try { h = JSON.parse(health.body); } catch (e) { console.error('/health is not JSON'); process.exit(2); }

  const build = (h.build && h.build.commit) || null;
  const served = (h.served && h.served.commit) || null;
  const sha = arg('sha', build);
  if (!sha) { console.error('cannot resolve a commit to record'); process.exit(2); }

  const home = await get(BASE + '/');
  if (home.status !== 200) { console.error('home status ' + home.status); process.exit(2); }
  const rawIndex = await get(RAW + '/' + sha + '/www/index.html');
  if (rawIndex.status !== 200) { console.error('raw index at ' + sha + ' -> ' + rawIndex.status); process.exit(2); }

  const liveBytes = Buffer.byteLength(home.body, 'utf8');
  const at = firstDivergence(home.body, rawIndex.body);
  const aligned = build === sha && served === sha && h.served && h.served.matches_process === true;
  const identical = at === -1;

  const checks = [
    ['build.commit equals recorded commit', build === sha, build],
    ['served.commit equals recorded commit', served === sha, served],
    ['served manifest matches the running process', !!(h.served && h.served.matches_process), h.served && h.served.matches_process],
    ['served file count', !!(h.served && h.served.files), h.served && h.served.files],
    ['mlkem backend', true, (h.mlkem && h.mlkem.backend) || 'unknown'],
    ['live / matches www/index.html at ' + sha.slice(0, 8), identical, identical ? liveBytes + ' bytes, byte-identical' : 'first divergence at char ' + at],
    ['x-app-version header', true, home.headers['x-app-version'] || '-'],
  ];

  let runInfo = null;
  const runId = arg('run', null);
  if (runId) {
    const meta = gh(['run', 'view', runId, '-R', REPO, '--json', 'event,status,conclusion,headSha,createdAt,databaseId,displayTitle']);
    if (meta) {
      try {
        const m = JSON.parse(meta);
        const approvals = gh(['api', 'repos/' + REPO + '/actions/runs/' + runId + '/approvals']);
        let approver = null, approvedAt = null;
        if (approvals) {
          try {
            const a = JSON.parse(approvals);
            const first = (a[0] && a[0].user) || (a[0] && a[0].approver) || null;
            approver = first ? (first.login || null) : null;
            approvedAt = (a[0] && (a[0].approved_at || a[0].created_at)) || null;
          } catch (e) { /* approvals are optional metadata */ }
        }
        let actor = null;
        const runJson = gh(['api', 'repos/' + REPO + '/actions/runs/' + runId]);
        if (runJson) { try { const r = JSON.parse(runJson); actor = (r.actor && r.actor.login) || null; } catch (e) { actor = null; } }
        runInfo = { id: runId, workflow: m.displayTitle || null, event: m.event, conclusion: m.conclusion, headSha: m.headSha, createdAt: m.createdAt, actor, approver, approvedAt, url: 'https://github.com/' + REPO + '/actions/runs/' + runId };
      } catch (e) { runInfo = { id: runId, error: 'metadata unreadable' }; }
    }
  }

  if (!aligned || !identical) {
    console.error('NOT ALIGNED — no record written');
    for (const [name, ok, value] of checks) console.error('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + ': ' + value);
    process.exit(1);
  }

  const outDir = arg('out', path.join(__dirname, '..', 'docs', 'deploy-evidence'));
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const file = path.join(outDir, sha.slice(0, 12) + '.md');

  const lines = [];
  lines.push('# Deploy evidence — ' + sha);
  lines.push('');
  lines.push('Generated by `scripts/deploy-evidence.cjs` at ' + stamp + '. Not written by hand:');
  lines.push('if a line below is wrong, the script failed or someone edited this file after the fact');
  lines.push('(the commit that added it is the timestamp).');
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| check | value |');
  lines.push('|---|---|');
  for (const [name, , value] of checks) lines.push('| ' + name + ' | ' + String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|') + ' |');
  lines.push('');
  if (runInfo) {
    lines.push('## Deploy run');
    lines.push('');
    lines.push('| field | value |');
    lines.push('|---|---|');
    for (const k of ['id', 'workflow', 'event', 'conclusion', 'actor', 'approver', 'approvedAt', 'createdAt', 'url']) {
      if (runInfo[k]) lines.push('| ' + k + ' | ' + runInfo[k] + ' |');
    }
    if (runInfo.event === 'workflow_dispatch') lines.push('| triggered by | a human dispatching the workflow (not a push) |');
    lines.push('');
  }
  lines.push('## What this record proves');
  lines.push('');
  lines.push('- production served commit `' + sha + '` — `/health` `build.commit` and `served.commit` both equal it;');
  lines.push('- the HTML a visitor receives for `/` is byte-identical to `www/index.html` at that commit (' + liveBytes + ' bytes);');
  lines.push('- the served manifest on disk matches the running process (`matches_process=' + (h.served && h.served.matches_process) + '`).');
  lines.push('');
  lines.push('## What this record does NOT prove');
  lines.push('');
  lines.push('- that the release is correct, safe, or free of defects — a perfectly aligned deploy can ship a bug;');
  lines.push('- that anything outside `/` and `/health` was checked — no API behaviour, no database, no TLS configuration;');
  lines.push('- that tests passed — test results live in CI, not here. This is an alignment record, not a quality record.');
  lines.push('');
  lines.push('## Runtime paths');
  lines.push('');
  lines.push('`' + RUNTIME_PATHS.join('`, `') + '` — read from `scripts/runtime-paths.cjs`, the same constant the deploy gate uses.');
  lines.push('A commit that touches none of them cannot make production stale:');
  lines.push('');
  lines.push('```bash');
  lines.push('git log ' + sha.slice(0, 8) + '..HEAD --oneline -- ' + RUNTIME_PATHS.join(' '));
  lines.push('```');
  lines.push('');
  lines.push('Reproduce: `node scripts/deploy-evidence.cjs' + (runId ? ' --run ' + runId : '') + '`');
  lines.push('');

  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log('ALIGNED ' + sha.slice(0, 8) + ' -> ' + path.relative(process.cwd(), file) + ' (' + liveBytes + ' bytes, byte-identical)');
  for (const [name, , value] of checks) console.log('  ok  ' + name + ': ' + value);
})();
