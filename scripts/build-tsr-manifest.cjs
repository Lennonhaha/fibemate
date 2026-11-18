#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE contributors
//
// Keep docs/tsa/timestamp-manifest.json equal to the tracked .tsr files.
//
// Why this exists: the manifest was written once, by hand, in 4064ba85 and never
// touched again. The page points at it as "the itemised list", but it held 216
// rows while the repository tracked 374 files -- and 20 of those rows named paths
// that no longer exist. A list that is trusted to prove the evidence chain has to
// have the same denominator as the claim printed next to it.
//
// The manifest is evidence, not a build product: rows written by a person carry
// extra fields (claim, serial, freetsa_time) that cannot be regenerated. So this
// tool merges instead of regenerating -- it never rewrites a row it did not write.
//
// Usage:
//   node scripts/build-tsr-manifest.cjs --check   (default; exit 1 on drift)
//   node scripts/build-tsr-manifest.cjs --write   (add missing rows, drop dead ones)
//
// Exit: 0 consistent, 1 drift (--check), 2 cannot measure.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = (() => {
  const i = process.argv.indexOf('--root');
  return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : path.resolve(__dirname, '..');
})();
const MANIFEST = path.join(root, 'docs', 'tsa', 'timestamp-manifest.json');
// The site serves its own copies of this file, and both were older than the
// canonical one -- the "download the evidence list" button handed out a 215-row
// list under a 374-file claim. A copy that can drift is a second answer to the same
// question, so the served copies are byte-identical by construction and checked.
const SERVED = ['www/docs/tsa/timestamp-manifest.json', 'www/docs/timestamp-manifest.json'].map((p) =>
  path.join(root, p),
);

const argv = process.argv.slice(2);
const write = argv.includes('--write');
const flagsWithValue = new Set(['--root']);
const unknown = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--write' || a === '--check') continue;
  if (flagsWithValue.has(a)) { i += 1; continue; }
  unknown.push(a);
}
if (unknown.length > 0) {
  console.error(`usage: node scripts/build-tsr-manifest.cjs [--check|--write] [--root <dir>]`);
  process.exit(1);
}

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let tracked;
try {
  tracked = git('ls-files', '*.tsr').split('\n').filter(Boolean);
} catch (err) {
  console.error(`FAIL: cannot list tracked .tsr files: ${err.message}`);
  process.exit(2);
}
if (tracked.length === 0) {
  console.error('FAIL: no tracked .tsr files -- refusing to write a manifest over zero evidence');
  process.exit(2);
}

const notInHead = [];
for (const rel of tracked) {
  if (!fs.existsSync(path.join(root, rel))) notInHead.push(rel);
}
if (notInHead.length > 0) {
  console.error(`FAIL: ${notInHead.length} tracked .tsr file(s) missing from the working tree, cannot hash them`);
  console.error(`  e.g. ${notInHead.slice(0, 3).join(', ')}`);
  process.exit(2);
}

const sizes = new Map();
for (const line of git('ls-tree', '-r', '-l', 'HEAD').split('\n')) {
  const m = line.match(/^\d+ blob [0-9a-f]+\s+(\d+)\t(.+)$/);
  if (m) sizes.set(m[2], Number(m[1]));
}

const sha256 = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
const splitPath = (rel) => {
  const i = rel.lastIndexOf('/');
  return i < 0 ? { dir: '', tsr: rel } : { dir: rel.slice(0, i), tsr: rel.slice(i + 1) };
};

const before = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : [];
const rowsBefore = Array.isArray(before) ? before : [];
const pathOf = (row) => {
  const dir = row.dir === '.' ? '' : (row.dir || '');
  return (dir ? `${dir}/${row.tsr}` : row.tsr).replace(/^\.\//, '');
};

const beforeByPath = new Map();
for (const row of rowsBefore) beforeByPath.set(pathOf(row), row);

const trackedSet = new Set(tracked);
const missing = tracked.filter((rel) => !beforeByPath.has(rel));
const dead = [...beforeByPath.keys()].filter((rel) => !trackedSet.has(rel));
const matched = tracked.filter((rel) => beforeByPath.has(rel)).length;
const coverage = tracked.length === 0 ? 0 : (matched / tracked.length) * 100;

// Two different failures hide behind "zero evidence", and only one of them is an
// empty directory:
//   tracked == 0                  -> there is no evidence to list
//   tracked > 0 && matched == 0   -> there is evidence, and the list describes a
//                                    different tree (the 2/241 shape: a scan that
//                                    only ever sees the top of the directory)
// The second one must not be reported as a partial gap, because "0 of 374" and
// "370 of 374" are not the same defect. Both stop the run with exit 2 (cannot
// measure); a partial gap stays exit 1 (measurable drift).
// The guard applies to --check only: --write is the repair path, and a manifest that
// matches nothing is exactly what it is asked to repair.
if (matched === 0 && !write) {
  console.error('FAIL: the manifest matches none of the tracked .tsr files');
  console.error(`  tracked .tsr      : ${tracked.length}`);
  console.error(`  manifest rows     : ${rowsBefore.length} (0 of them point at a tracked file)`);
  console.error(`  first tracked     : ${tracked.slice(0, 3).join(', ')}`);
  console.error(`  first manifest row: ${[...beforeByPath.keys()].slice(0, 3).join(', ') || '(none)'}`);
  console.error('Refusing to report coverage on a scan that covers nothing.');
  process.exit(2);
}

// Rows we keep may still be wrong: a sha256 can be stale, a size can be absent.
const wrongSha = [];
const missingSize = [];
const malformed = [];
for (const rel of tracked) {
  const row = beforeByPath.get(rel);
  if (!row) continue;
  if (!row.tsr || typeof row.dir !== 'string') malformed.push(rel);
  if (!row.sha256) malformed.push(rel);
  else if (row.sha256 !== sha256(rel)) wrongSha.push(rel);
  if (typeof row.size !== 'number') missingSize.push(rel);
}

const out = [];
const added = [];
let rewrote = 0;
let filledSize = 0;
// Existing rows keep their original position and their extra fields. Rewriting the
// whole file in a new order turns a 178-row addition into a 2,600-line diff, which
// is the same file but no longer reviewable. New rows go after the last one, sorted.
//
// Computed facts are the exception: "never rewrite a row it did not write" protects
// the fields a person chose (claim, serial, freetsa_time), not the digest. A stale
// sha256 left in place would make --write a repair that repairs nothing.
for (const row of rowsBefore) {
  const rel = pathOf(row);
  if (!trackedSet.has(rel)) continue;
  const fixed = { ...row };
  const want = sha256(rel);
  if (fixed.sha256 !== want) {
    fixed.sha256 = want;
    rewrote += 1;
  }
  if (typeof fixed.size !== 'number') {
    fixed.size = sizes.get(rel) ?? fs.statSync(path.join(root, rel)).size;
    filledSize += 1;
  }
  out.push(fixed);
}
for (const rel of tracked.slice().sort()) {
  if (beforeByPath.has(rel)) continue;
  const { dir, tsr } = splitPath(rel);
  out.push({ tsr, sha256: sha256(rel), dir, size: sizes.get(rel) ?? fs.statSync(path.join(root, rel)).size });
  added.push(rel);
}

const report = {
  tracked: tracked.length,
  manifest: rowsBefore.length,
  added: added.length,
  dead: dead.length,
  wrongSha: wrongSha.length,
  missingSize: missingSize.length,
  malformed: malformed.length,
};

if (write) {
  const text = JSON.stringify(out, null, 2) + '\n';
  fs.writeFileSync(MANIFEST, text, 'utf8');
  for (const served of SERVED) {
    fs.mkdirSync(path.dirname(served), { recursive: true });
    fs.writeFileSync(served, text, 'utf8');
  }
  console.log(
    `WROTE docs/tsa/timestamp-manifest.json: ${out.length} rows ` +
      `(tracked ${tracked.length}, added ${added.length}, dropped ${dead.length} dead paths, ` +
      `rewrote ${rewrote} sha256, filled ${filledSize} missing size) + ${SERVED.length} served copies`,
  );
  if (dead.length > 0) console.log(`dropped (no longer tracked): ${dead.slice(0, 10).join(', ')}${dead.length > 10 ? ' ...' : ''}`);
  if (added.length > 0) console.log(`added: ${added.slice(0, 10).join(', ')}${added.length > 10 ? ' ...' : ''}`);
  process.exit(0);
}

const canonical = fs.readFileSync(MANIFEST);
const servedDrift = SERVED.filter((p) => {
  if (!fs.existsSync(p)) return true;
  return !canonical.equals(fs.readFileSync(p));
}).map((p) => path.relative(root, p));

const drift = missing.length + dead.length + wrongSha.length + malformed.length + servedDrift.length;
if (drift === 0) {
  console.log(
    `OK: manifest covers ${report.manifest} rows == ${tracked.length} tracked .tsr files ` +
      `(coverage ${coverage.toFixed(1)}%, 0 dead rows, 0 stale sha256, 0 malformed, ` +
      `${SERVED.length} served copies byte-identical)`,
  );
  process.exit(0);
}

console.error('DRIFT: docs/tsa/timestamp-manifest.json does not describe the tracked tree');
console.error(`  tracked .tsr    : ${report.tracked}`);
console.error(`  manifest rows   : ${report.manifest}`);
console.error(`  coverage        : ${matched}/${tracked.length} (${coverage.toFixed(1)}%)`);
console.error(`  missing rows    : ${missing.length}`);
console.error(`  dead rows       : ${dead.length}`);
console.error(`  stale sha256    : ${wrongSha.length}`);
console.error(`  malformed rows  : ${malformed.length}`);
console.error(`  served copies   : ${servedDrift.length} differ (${servedDrift.join(', ') || 'none'})`);
for (const rel of missing.slice(0, 5)) console.error(`  missing: ${rel}`);
for (const rel of dead.slice(0, 5)) console.error(`  dead   : ${rel}`);
for (const rel of wrongSha.slice(0, 5)) console.error(`  sha256 : ${rel}`);
console.error('Fix: run node scripts/build-tsr-manifest.cjs --write and review the diff.');
process.exit(1);
