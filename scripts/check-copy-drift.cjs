#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// check-copy-drift.cjs - files that exist as copies must stay byte-identical.
//
// Why: `message-crypto.js` existed as three copies. Two of them were fixed and
// one was not, so the repo kept a version whose saveSession() threw
// `ReferenceError: request is not defined` and whose initAsInitiator() passed a
// key that the function does not take (2 params, 3 args). Nothing noticed,
// because no gate compares copies against each other and no page loads that
// path. A stale copy is a bug that waits for someone to import it.
//
// Keeping copies identical is a weaker guarantee than having one copy, and it is
// the guarantee that this repo can hold today without rewriting how www/ is
// published. If a copy should legitimately differ, remove it from the manifest
// and say why in the commit - do not let it drift in silence.
//
// Usage:
//   node scripts/check-copy-drift.cjs
//   node scripts/check-copy-drift.cjs --selftest   # proves it can go red
//
// Exit codes: 0 identical, 1 DRIFT/MISSING (named), 2 manifest empty or usage.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');

// Files that are published from more than one path. The first entry is the
// reference; every other entry must be byte-identical to it.
const MANIFEST = [
  { name: 'message-crypto', files: ['www/js/message-crypto.js', 'www/message-crypto.js', 'message-crypto.js'] },
];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function check(root, manifest) {
  const drift = [];
  const missing = [];
  let compared = 0;
  for (const group of manifest) {
    const [ref, ...rest] = group.files;
    const refPath = path.join(root, ref);
    if (!fs.existsSync(refPath)) { missing.push({ group: group.name, file: ref, reason: 'reference file absent' }); continue; }
    const refBuf = fs.readFileSync(refPath);
    const refSha = sha(refBuf);
    for (const other of rest) {
      const otherPath = path.join(root, other);
      if (!fs.existsSync(otherPath)) { missing.push({ group: group.name, file: other, reason: 'copy absent' }); continue; }
      const buf = fs.readFileSync(otherPath);
      compared++;
      if (sha(buf) !== refSha) {
        drift.push({ group: group.name, file: other, ref, refSha: refSha.slice(0, 12), sha: sha(buf).slice(0, 12), refBytes: refBuf.length, bytes: buf.length });
      }
    }
  }
  return { drift, missing, compared };
}

function report(result) {
  for (const d of result.drift) {
    console.log('DRIFT    ' + d.file + ' differs from ' + d.ref + '  (' + d.sha + ' vs ' + d.refSha + ', ' + d.bytes + ' B vs ' + d.refBytes + ' B)');
  }
  for (const m of result.missing) console.log('MISSING  ' + m.file + ' - ' + m.reason);
  const bad = result.drift.length + result.missing.length;
  if (bad) {
    console.log('');
    console.log('FAIL: ' + bad + ' copy problem(s). Make the copies identical, or drop the file from MANIFEST with a stated reason.');
    return 1;
  }
  if (result.compared === 0) {
    console.log('FAIL: manifest produced 0 comparisons - a gate that checks nothing cannot be green.');
    return 2;
  }
  console.log('OK: ' + result.compared + ' copy comparison(s), all identical');
  return 0;
}

function selftest() {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-drift-test-'));
  const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), s, 'utf8'); };
  const manifest = [{ name: 'pair', files: ['a.js', 'b.js'] }];
  const cases = [];

  // 1. identical -> green
  w('a.js', 'const x = 1;\n'); w('b.js', 'const x = 1;\n');
  let code = report(check(dir, manifest));
  console.log('');
  cases.push({ name: 'identical copies pass', expect: 0, got: code, ok: code === 0 });

  // 2. one byte different -> red, naming the file
  w('b.js', 'const x = 2;\n');
  const r2 = check(dir, manifest);
  code = report(r2);
  console.log('');
  cases.push({ name: 'one changed byte is red', expect: 1, got: code, ok: code === 1 && r2.drift.length === 1 && r2.drift[0].file === 'b.js' });

  // 3. missing copy -> red
  fs.unlinkSync(path.join(dir, 'b.js'));
  code = report(check(dir, manifest));
  console.log('');
  cases.push({ name: 'missing copy is red', expect: 1, got: code, ok: code === 1 });

  // 4. empty manifest -> 2, never 0
  code = report(check(dir, []));
  console.log('');
  cases.push({ name: 'empty manifest is 2, never 0', expect: 2, got: code, ok: code === 2 });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('');
  let bad = 0;
  for (const c of cases) {
    if (c.ok) console.log('SELFTEST PASS  ' + c.name);
    else { bad++; console.log('SELFTEST FAIL  ' + c.name + '  expected ' + c.expect + ', got ' + c.got); }
  }
  console.log('');
  console.log('selftest: ' + (cases.length - bad) + '/' + cases.length + ' as expected');
  return bad === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes('--selftest')) process.exit(selftest());
if (args.length) { console.error('unknown argument: ' + args[0]); process.exit(2); }
process.exit(report(check(REPO_ROOT, MANIFEST)));
