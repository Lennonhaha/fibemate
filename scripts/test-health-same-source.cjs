#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';
/**
 * test-health-same-source.cjs - /health must not be able to say "same" while the commits differ.
 *
 * #603 was not a wrong number. Both numbers were right: the API reported the commit it was
 * started from, the page reported the commit of the static tree. What was missing was the
 * comparison, so a monitor had to know which of the two to trust. `matches_process` closes
 * that hole, and this file asserts the three things that make it trustworthy:
 *
 *   1. equal commits              -> true
 *   2. readable, different commit -> false  (never true)
 *   3. no readable manifest       -> null   (never true, never false)
 *
 * A field that returns null for every input would pass case 3 and fail cases 1 and 2, so the
 * matrix below is the reason this is a gate and not a description.
 *
 * Static guard: index.js must not re-grow its own `matches_process:` literal. One definition,
 * in src/lib/served-tree.js, is what makes the assertions above cover production.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { servedReport, clearCache } = require('../src/lib/served-tree');

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-same-source-'));
const www = path.join(root, 'www');
fs.mkdirSync(www, { recursive: true });
const manifestFile = path.join(root, 'BUILD-MANIFEST.json');

function writeManifest(obj) {
  fs.writeFileSync(manifestFile, JSON.stringify(obj), 'utf8');
  // Some filesystems keep one-second mtime granularity; every write must look newer.
  const t = new Date(Date.now() + Math.floor(Math.random() * 1000) + 1000);
  fs.utimesSync(manifestFile, t, t);
  clearCache();
}

const A = 'aaaaaaa';
const B = 'bbbbbbb';

// 1. Same commit on both sides.
writeManifest({ commitShort: A, fileCount: 2332, files: {} });
let r = servedReport(A, www);
check('same commit reports matches_process=true', r.matches_process === true, JSON.stringify(r));
check('same commit reports the served commit', r.commit === A && r.source === 'served-manifest', JSON.stringify(r));

// 2. The case #603 was made of: two truthful numbers that disagree.
writeManifest({ commitShort: B, fileCount: 2332, files: {} });
r = servedReport(A, www);
check('different commit reports matches_process=false', r.matches_process === false, JSON.stringify(r));
check('different commit is never reported as a match', r.matches_process !== true, JSON.stringify(r));
check('the two commits are still both reported', r.commit === B, JSON.stringify(r));

// 3. No manifest: "cannot tell", which is not "differs".
fs.unlinkSync(manifestFile);
clearCache();
r = servedReport(A, www);
check('absent manifest reports null, not false', r.matches_process === null, JSON.stringify(r));
check('absent manifest names its source', r.source === 'absent', JSON.stringify(r));

// 4. Unconfigured static root is distinguishable from absent.
r = servedReport(A, '');
check('unconfigured root reports null and its own source', r.matches_process === null && r.source === 'not-configured', JSON.stringify(r));

// 5. Malformed and non-hex manifests are rejected, not echoed.
writeManifest('{ this is not json');
check('malformed manifest reports null', servedReport(A, www).matches_process === null);
fs.writeFileSync(manifestFile, JSON.stringify({ commitShort: 'not-a-sha', fileCount: 1 }), 'utf8');
clearCache();
r = servedReport(A, www);
check('non-hex commit is rejected rather than compared', r.matches_process === null && r.commit === null, JSON.stringify(r));

// 6. Full matrix, so an inverted or always-true implementation cannot pass.
const matrix = [
  { build: A, manifest: A, want: true },
  { build: A, manifest: B, want: false },
  { build: B, manifest: A, want: false },
  { build: B, manifest: B, want: true },
];
for (const row of matrix) {
  writeManifest({ commitShort: row.manifest, fileCount: 1, files: {} });
  const got = servedReport(row.build, www).matches_process;
  check(`matrix build=${row.build} manifest=${row.manifest} -> ${row.want}`, got === row.want, String(got));
}

// 7. Static guard: one definition only.
const indexPath = path.join(__dirname, '..', 'src', 'index.js');
const indexSrc = fs.readFileSync(indexPath, 'utf8');
const inlineDefs = (indexSrc.match(/matches_process\s*:/g) || []).length;
check('index.js has no inline matches_process definition', inlineDefs === 0, String(inlineDefs));
check('index.js uses the shared servedReport', /servedReport\(BUILD_IDENTITY\.commit/.test(indexSrc));
check('index.js still exposes the served block', /served:\s*servedReport\(/.test(indexSrc));

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
