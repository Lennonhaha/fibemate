#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * check-version-consistency.cjs — one command answers "what version is this tree?".
 *
 * VERSION.json is the declared single source of truth for release metadata.
 * package.json and the top released heading of CHANGELOG.md must agree with it;
 * a mismatch fails CI instead of drifting quietly for weeks (issue #442).
 *
 * usage: node scripts/check-version-consistency.cjs [--root <dir>]
 * exit:  0 consistent, 1 mismatch, 2 unreadable input
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let root = process.cwd();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) { root = path.resolve(args[++i]); }
  else if (args[i] === '-h' || args[i] === '--help') {
    console.log('usage: node scripts/check-version-consistency.cjs [--root <dir>]');
    process.exit(0);
  } else {
    console.error(`unknown argument: ${args[i]}`);
    process.exit(2);
  }
}

const readJson = (rel) => {
  const file = path.join(root, rel);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`FAIL: cannot read ${rel}: ${e.message}`);
    process.exit(2);
  }
};

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const versionJson = readJson('VERSION.json');
const pkg = readJson('package.json');

if (typeof versionJson.version !== 'string' || !semver.test(versionJson.version)) {
  console.error(`FAIL: VERSION.json version is not semver: ${JSON.stringify(versionJson.version)}`);
  process.exit(1);
}
if (typeof versionJson.releaseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(versionJson.releaseDate)) {
  console.error(`FAIL: VERSION.json releaseDate must be YYYY-MM-DD, got ${JSON.stringify(versionJson.releaseDate)}`);
  process.exit(1);
}

let changelog = '';
try {
  changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
} catch (e) {
  console.error(`FAIL: cannot read CHANGELOG.md: ${e.message}`);
  process.exit(2);
}

// First released heading, skipping "[Unreleased]".
const changelogVersion = (() => {
  for (const line of changelog.split(/\r?\n/)) {
    const m = /^##\s+\[?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]?/.exec(line);
    if (m && !/^##\s+\[?Unreleased/i.test(line)) return m[1];
  }
  return null;
})();

const sources = [
  ['VERSION.json', versionJson.version],
  ['package.json', pkg.version],
  ['CHANGELOG.md (top released heading)', changelogVersion],
];

const expected = versionJson.version;
let failed = 0;

console.log('=== version consistency ===');
for (const [name, value] of sources) {
  const ok = value === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(38)} ${value === null ? '(not found)' : value}`);
}
console.log(`  source of truth: VERSION.json = ${expected} (released ${versionJson.releaseDate})`);

if (failed) {
  console.error('');
  console.error(`FAIL: ${failed} source(s) disagree with VERSION.json.`);
  console.error('      Bump VERSION.json first, then make package.json and CHANGELOG.md match it.');
  process.exit(1);
}

console.log('OK: all sources agree');
