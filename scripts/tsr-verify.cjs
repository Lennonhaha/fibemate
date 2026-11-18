#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// Can this timestamp token be checked at all, and is the answer still what we
// recorded?
//
// This replaces a loop that matched `lg-*.tsr` at the top of one directory: 2 files
// out of 241, reported as "PASS=2 FAIL=0" while the other 239 were never opened.
// It also refuses to call a token verified on the strength of Status: Granted, which
// only says the TSA answered.
//
// What it measures (data-free, so it can run every day):
//   IMPRINT_OK  openssl accepted the token's imprint. In this tree that is 0: no token
//               records the digest of what it covers. The class stays so a fixture can
//               exercise the pass path, and so the day a stamp records artifact_sha256
//               the count moves on its own
//   NO_DATA     certificate present, signature checkable, but the covered bytes were
//               never recorded (the manifest stores sha256(.tsr), not the artifact)
//   NO_CERT     the token carries no signer certificate: offline verification cannot
//               start, regardless of data
//   BAD_CHAIN   certificate present, chain does not validate against the bundled CA
//   NOT_A_TOKEN response without a timestamp token
//   ERROR       openssl could not classify the file
//
// /dev/null is the point: it separates "is this token checkable" from "do we hold the
// bytes it covers". The historical answer is mostly no to both, and that is what
// scripts/tsr-verify-allowlist.txt records, one measured reason per file.
//
// A `.sha256` file next to a `.tsr` is deliberately NOT treated as the artifact digest:
// in this tree those files hash the .tsr itself (221 of 241 manifest rows do the same).
// Feeding that hash to `ts -verify -digest` would manufacture imprint mismatches. The
// only accepted source of an artifact digest is the stamp script, which now records
// artifact_sha256 when it is given the artifact.
//
// The allowlist holds **known gaps only**. A file that classifies IMPRINT_OK is green on
// its own and must not appear on the list: if it does, the gate reports
// verifiable-but-allowlisted, because an exemption that is no longer needed is how a
// roll-call turns into a green light. That is why the log prints both numbers --
// `allowlist=240 known gaps` and `verified=1` -- so "we verified one" cannot be read as
// "241 tokens passed".
//
// Exit: 0 classified and matches the allowlist, 1 drift (new unverifiable file, a
// class change, a stale entry, or a verifiable file still listed), 2 cannot measure
// (no files, no allowlist).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);

const ROOT = arg('--root', '/opt/fibemate/current');
const TSA = arg('--dir', path.join(ROOT, 'www/docs/tsa'));
const ALLOW = arg('--allowlist', path.join(__dirname, 'tsr-verify-allowlist.txt'));
const CA = arg('--ca', '/tmp/freetsa-ca.pem');
const UPDATE = has('--update');
const JSON_OUT = has('--json');
const RAW_OPENSSL = process.env.TSR_VERIFY_OPENSSL || 'openssl';
const [OPENSSL, ...OPENSSL_PREFIX] = RAW_OPENSSL.split(' ');

const fail = (msg, code) => {
  console.error(msg);
  process.exit(code);
};

if (!fs.existsSync(TSA)) fail(`FAIL: no such TSA directory: ${TSA}`, 2);
if (!UPDATE && !fs.existsSync(ALLOW)) fail(`FAIL: no allowlist at ${ALLOW} (run --update to create one)`, 2);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.tsr')) files.push(p);
  }
})(TSA);
if (files.length === 0) fail(`FAIL: no .tsr under ${TSA} -- refusing to report on zero evidence`, 2);

const classify = (file) => {
  const r = spawnSync(OPENSSL, [...OPENSSL_PREFIX, 'ts', '-verify', '-in', file, '-data', '/dev/null', '-CAfile', CA], {
    encoding: 'utf8',
  });
  const err = `${r.stderr || ''}${r.stdout || ''}`;
  if (err.includes('Verification: OK')) return 'IMPRINT_OK';
  if (err.includes('signer certificate not found')) return 'NO_CERT';
  if (err.includes('message imprint mismatch')) return 'NO_DATA';
  if (err.includes('certificate verify error')) return 'BAD_CHAIN';
  if (err.includes('no timestamp token info') || err.includes('ts_check_status_info')) return 'NOT_A_TOKEN';
  return 'ERROR';
};

const key = (f) => path.relative(ROOT, f).split(path.sep).join('/');

const computed = new Map();
for (const f of files) computed.set(key(f), classify(f));

const readAllow = () => {
  const map = new Map();
  if (!fs.existsSync(ALLOW)) return map;
  for (const line of fs.readFileSync(ALLOW, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [file, reason] = line.split('\t');
    if (file && reason) map.set(file.trim(), reason.trim());
  }
  return map;
};

if (UPDATE) {
  const header = fs.existsSync(ALLOW)
    ? fs.readFileSync(ALLOW, 'utf8').split('\n').filter((l) => l.startsWith('#')).join('\n') + '\n\n'
    : '# Regenerate with: node scripts/tsr-verify.cjs --update\n\n';
  const gaps = [...computed.entries()].filter(([, r]) => r !== 'IMPRINT_OK');
  const body = gaps
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([f, r]) => `${f}\t${r}`)
    .join('\n');
  fs.writeFileSync(ALLOW, header + body + '\n', 'utf8');
  console.log(`WROTE ${ALLOW}: ${gaps.length} known gaps (${computed.size - gaps.length} token(s) verifiable, therefore not listed)`);
  process.exit(0);
}

const allowed = readAllow();
const counts = {};
for (const r of computed.values()) counts[r] = (counts[r] || 0) + 1;

const drift = [];
for (const [file, reason] of computed) {
  const expected = allowed.get(file);
  if (reason === 'IMPRINT_OK') {
    // Green on its own. Still being listed means the list did not shrink when it could.
    if (expected) drift.push({ kind: 'verifiable-but-allowlisted', file, was: expected });
    continue;
  }
  if (!expected) drift.push({ kind: 'unlisted', file, reason });
  else if (expected !== reason) drift.push({ kind: 'class-changed', file, was: expected, now: reason });
}
for (const file of allowed.keys()) {
  if (!computed.has(file)) drift.push({ kind: 'stale-entry', file });
}

const verified = counts.IMPRINT_OK || 0;

const summary = {
  total: computed.size,
  counts,
  verified,
  allowlist: allowed.size,
  drift: drift.length,
  verdict: drift.length === 0 ? 'OK' : 'DRIFT',
};

if (JSON_OUT) console.log(JSON.stringify({ summary, drift }, null, 2));
else {
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  console.log(
    `${summary.verdict}: ${computed.size} tokens (${parts}); allowlist=${allowed.size} known gaps (not a pass count); verified=${verified}; drift=${drift.length}`,
  );
  if (verified === 0) {
    console.log(
      '  note: no token records the digest of what it covers, so no imprint could be checked;' +
        ' the allowlist entries above are known gaps, not passes',
    );
  }
  for (const d of drift.slice(0, 20)) {    if (d.kind === 'unlisted') console.log(`  unlisted     ${d.file} (${d.reason})`);
    else if (d.kind === 'class-changed') console.log(`  class-changed ${d.file} ${d.was} -> ${d.now}`);
    else if (d.kind === 'verifiable-but-allowlisted') console.log(`  verifiable-but-allowlisted ${d.file} (listed as ${d.was}; remove the entry)`);
    else console.log(`  stale-entry  ${d.file} (allowlisted, no longer present)`);
  }
  if (drift.length > 20) console.log(`  ... ${drift.length - 20} more`);
}

process.exit(drift.length === 0 ? 0 : 1);
