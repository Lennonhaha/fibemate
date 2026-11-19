#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * test-check-measured-date.cjs - prove the date gate fails on the thing it exists
 * to catch, and stays quiet on the things it must not touch.
 *
 * The second half matters as much as the first: a gate that flags every date in
 * a document would have forced us to rewrite historical measurements (coverage on
 * 2026-11-10, TLC states on 2026-11-14) to make CI green. That is not a gate, it
 * is a reason to add exemption markers until nothing is checked.
 *
 * Usage: node scripts/test-check-measured-date.cjs
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const GATE = path.join(__dirname, 'check-measured-date.cjs');
const TARGETS = require('./lib/public-targets.cjs');

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log('PASS ' + name);
  } else {
    fail += 1;
    console.log('FAIL ' + name + (detail ? ' :: ' + detail : ''));
  }
};

function fixture(files, updated) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measured-date-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'www', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'metrics.json'), JSON.stringify({ updated }), 'utf8');
  for (const t of TARGETS) {
    const p = path.join(dir, t);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p)) fs.writeFileSync(p, '<empty>\n', 'utf8');
  }
  for (const [rel, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, rel), body, 'utf8');
  }
  return dir;
}

function run(dir) {
  try {
    const out = execFileSync(process.execPath, [GATE, '--root', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out: out.trim() };
  } catch (err) {
    return { code: err.status || 1, out: String(err.stdout || '').trim(), err: String(err.stderr || '').trim() };
  }
}

// 1. The defect from 2026-11-19: numbers moved, date left behind. Must be red.
{
  const d = fixture({ 'www/index.html': '<p>364 \u4efd .tsr \u5b58\u8bc1 (2026-11-17 \u5b9e\u6d4b)</p>\n' }, '2026-11-19');
  const r = run(d);
  check('stale date on a TSR count line is rejected', r.code === 1 && /STALE_DATE/.test(r.err), `code=${r.code} err=${(r.err || '').slice(0, 120)}`);
}

// 2. Menial control: the same line with the current date passes.
{
  const d = fixture({ 'www/index.html': '<p>364 \u4efd .tsr \u5b58\u8bc1 (2026-11-19 \u5b9e\u6d4b)</p>\n' }, '2026-11-19');
  const r = run(d);
  check('current date on a TSR count line passes', r.code === 0 && /OK:/.test(r.out), `code=${r.code} out=${r.out}`);
}

// 3. English shape: "measured 2026-11-17" next to a count.
{
  const d = fixture({ 'README.md': '364 tracked .tsr files (measured 2026-11-17)\n' }, '2026-11-19');
  const r = run(d);
  check('english measured phrase is also checked', r.code === 1 && /2026-11-17/.test(r.err), `code=${r.code}`);
}

// 4. Must not fire: a historical date on a line that is not a TSR count claim.
{
  const d = fixture({
    'www/index.html': '<p>coverage 80.53% (measured 2026-11-10)</p>\n<p>26115 distinct states (2026-11-14 \u5b9e\u6d4b)</p>\n',
  }, '2026-11-19');
  const r = run(d);
  check('historical dates off the count claim are left alone', r.code === 0, `code=${r.code} err=${(r.err || '').slice(0, 160)}`);
}

// 5. Exemption marker is honoured, and the exemption is counted in the output.
{
  const d = fixture({ 'www/index.html': '> 364 \u4efd .tsr \u5b58\u8bc1 (2026-11-14 \u5b9e\u6d4b) <!-- tsr-count-exempt: quoted historical copy -->\n' }, '2026-11-19');
  const r = run(d);
  check('exempt marker is honoured and counted', r.code === 0 && /\b1 exempt\b/.test(r.out), `code=${r.code} out=${r.out}`);
}

// 6. Cannot run is a third state, not a pass: a bad metrics file must not look green.
{
  const dir = fixture({}, 'not-a-date');
  const r = run(dir);
  check('invalid metrics.updated refuses to run', r.code === 2 && /CANNOT RUN/.test(r.err), `code=${r.code}`);
}

// 7. A line can carry history and a measurement at once. Only the date attached
//    to the measurement is policed; the TSA issuance date beside it must survive.
//    This is the false positive that killed the first implementation.
{
  const d = fixture({
    'www/security.html': '38 \u4efd DigiCert TSR\uff08\u5df2\u542b\u4e8e 364 \u4efd\u6587\u4ef6 / 256 \u4e2a basename\uff0c2026-11-19 \u5b9e\u6d4b\uff09\u00b7 2026-06-26 \u00b7 \u5168\u90e8 Granted\n',
  }, '2026-11-19');
  const r = run(d);
  check('historical date beside a live measurement is ignored', r.code === 0, `code=${r.code} err=${(r.err || '').slice(0, 160)}`);
}

// 8. ...but the measurement date in that same line is still checked.
{
  const d = fixture({
    'www/security.html': '38 \u4efd DigiCert TSR\uff08\u5df2\u542b\u4e8e 364 \u4efd\u6587\u4ef6\uff0c2026-11-17 \u5b9e\u6d4b\uff09\u00b7 2026-06-26 \u00b7 \u5168\u90e8 Granted\n',
  }, '2026-11-19');
  const r = run(d);
  check('stale measurement beside a historical date is still caught', r.code === 1 && /2026-11-17/.test(r.err), `code=${r.code}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
