// SPDX-License-Identifier: GPL-3.0-only
'use strict';
/**
 * test-served-tree.js - the `served` block has to fail visibly, not politely.
 *
 * A health field that returns null for every input looks calm and tells nobody anything,
 * which is the same failure the field exists to prevent. Every case below therefore asserts
 * a distinguishable answer, and the symlink case asserts that a change on disk shows up
 * without a restart - the whole point of the mtime cache.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readServedTree, clearCache } = require('../src/lib/served-tree');

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'served-tree-'));
const www = path.join(root, 'www');
fs.mkdirSync(www, { recursive: true });

function writeManifest(file, obj) {
  fs.writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
  // mtime granularity on some filesystems is 1s; make every write visibly newer.
  const t = new Date(Date.now() + Math.floor(Math.random() * 1000) + 1000);
  fs.utimesSync(file, t, t);
}

// 1. Release layout: manifest next to www/
const parentManifest = path.join(root, 'BUILD-MANIFEST.json');
writeManifest(parentManifest, { commitShort: 'c8d3dfb', fileCount: 2332, files: {} });
clearCache();
let r = readServedTree(www);
check('reads manifest next to the static root', r.commit === 'c8d3dfb' && r.source === 'served-manifest', JSON.stringify(r));
check('carries the file count from the manifest', r.files === 2332, String(r.files));

// 2. A new value is visible without restarting (mtime cache invalidates)
writeManifest(parentManifest, { commitShort: 'deadbee', fileCount: 2333, files: {} });
r = readServedTree(www);
check('switching the tree is visible on the next read', r.commit === 'deadbee' && r.files === 2333, JSON.stringify(r));

// 3. Manifest inside the static root is also accepted
fs.unlinkSync(parentManifest);
writeManifest(path.join(www, 'BUILD-MANIFEST.json'), { commitShort: 'abc1234', fileCount: 1, files: {} });
clearCache();
r = readServedTree(www);
check('accepts a manifest inside the static root', r.commit === 'abc1234', JSON.stringify(r));

// 4. Missing manifest: absent, and it says so
fs.unlinkSync(path.join(www, 'BUILD-MANIFEST.json'));
clearCache();
r = readServedTree(www);
check('missing manifest is reported as absent', r.commit === null && r.source === 'absent', JSON.stringify(r));

// 5. Malformed JSON: absent, not a throw
writeManifest(parentManifest, '{ this is not json');
clearCache();
r = readServedTree(www);
check('malformed manifest does not throw and is absent', r.commit === null && r.source === 'absent', JSON.stringify(r));

// 6. A commit that is not a hex id is rejected rather than echoed
writeManifest(parentManifest, { commitShort: 'not-a-sha', fileCount: 1, files: {} });
clearCache();
r = readServedTree(www);
check('non-hex commit is rejected', r.commit === null && r.source === 'absent', JSON.stringify(r));

// 7. No static root configured: distinguishable from "absent"
r = readServedTree('');
check('unconfigured root is not-configured', r.commit === null && r.source === 'not-configured', JSON.stringify(r));

// 8. Positive control: the same object shape as a real release manifest
writeManifest(parentManifest, { commitShort: '24dd535', fileCount: 2339, files: { 'a.js': 'x' } });
clearCache();
r = readServedTree(www);
check('positive control still passes after the negative cases', r.commit === '24dd535' && r.source === 'served-manifest', JSON.stringify(r));

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
