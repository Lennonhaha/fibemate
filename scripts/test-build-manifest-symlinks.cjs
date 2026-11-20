#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * test-build-manifest-symlinks.cjs - the manifest must account for symlinks (issue #602).
 *
 * Why this test exists: write-build-manifest.cjs has always excluded mode 120000 from
 * the digest map, because a symlink is a blob whose content is a path string, not the
 * bytes of the thing it points at. Excluding it silently made 10 tracked paths look
 * like an arithmetic error for weeks. Recording them is the fix; this test is the
 * proof that recording happens and that nothing else moves.
 *
 * The symlinks are built with `git update-index --add --cacheinfo 120000,...` rather
 * than `ln -s`, so the test runs on Windows CI without developer mode and without
 * touching the filesystem's symlink semantics at all. What is being tested is the
 * manifest, not the OS.
 *
 * Exit: 0 all assertions hold, 1 an assertion failed.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WRITER = path.join(__dirname, 'write-build-manifest.cjs');
let failed = 0;
let passed = 0;

function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    process.stdout.write('PASS ' + name + '\n');
  } else {
    failed += 1;
    process.stdout.write('FAIL ' + name + (detail ? ' -> ' + detail : '') + '\n');
  }
}

function git(cwd, args, input) {
  return execFileSync('git', args, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function repo(files, links) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbm-'));
  git(dir, ['init', '-q']);
  for (const [rel, body] of Object.entries(files || {})) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body, 'utf8');
    git(dir, ['add', '--', rel]);
  }
  for (const [rel, target] of Object.entries(links || {})) {
    const blob = git(dir, ['hash-object', '-w', '--stdin'], target).trim();
    git(dir, ['update-index', '--add', '--cacheinfo', '120000,' + blob + ',' + rel]);
  }
  const tree = git(dir, ['write-tree']).trim();
  // commit-tree needs an identity. A CI runner has none configured, and relying on the
  // developer machine has one is how this test passed locally and failed on ubuntu/windows.
  const commit = git(dir, [
    '-c', 'user.name=manifest fixture',
    '-c', 'user.email=fixture@example.invalid',
    'commit-tree', tree, '-m', 'fixture',
  ]).trim();
  return { dir, commit, out: fs.mkdtempSync(path.join(os.tmpdir(), 'wbm-out-')) };
}

function run(fx) {
  try {
    const stdout = execFileSync('node', [WRITER, '--repo', fx.dir, '--commit', fx.commit, '--out', fx.out], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(fx.out, 'BUILD-MANIFEST.json'), 'utf8'));
    return { code: 0, stdout, manifest };
  } catch (err) {
    return { code: err.status, stderr: String(err.stderr || err.message), stdout: String(err.stdout || '') };
  }
}

// C1: two regular files and two links, one relative and one absolute.
const c1 = repo({ 'a.txt': 'alpha\n', 'src/b.js': 'beta\n' }, {
  'rel-link': 'src/b.js',
  'abs-link': '/opt/fibemate-full/www/docs/tvla/sm2/tvla-sm2-v3-output.txt',
});
const r1 = run(c1);
check('C1 writer exits 0', r1.code === 0, 'code=' + r1.code + ' ' + (r1.stderr || ''));
check('C1 fileCount counts regular files only', r1.manifest && r1.manifest.fileCount === 2, JSON.stringify(r1.manifest && r1.manifest.fileCount));
check('C1 symlinkCount is 2', r1.manifest && r1.manifest.symlinkCount === 2, JSON.stringify(r1.manifest && r1.manifest.symlinkCount));
check('C1 treeEntryCount is 4', r1.manifest && r1.manifest.treeEntryCount === 4, JSON.stringify(r1.manifest && r1.manifest.treeEntryCount));
check('C1 relative target recorded verbatim', r1.manifest && r1.manifest.symlinks['rel-link'] === 'src/b.js', JSON.stringify(r1.manifest && r1.manifest.symlinks));
check(
  'C1 absolute target recorded verbatim, not resolved',
  r1.manifest && r1.manifest.symlinks['abs-link'] === '/opt/fibemate-full/www/docs/tvla/sm2/tvla-sm2-v3-output.txt',
  JSON.stringify(r1.manifest && r1.manifest.symlinks['abs-link']),
);
check('C1 links are not hashed as files', r1.manifest && !('rel-link' in r1.manifest.files) && !('abs-link' in r1.manifest.files));
check('C1 regular files still hashed', r1.manifest && /^[0-9a-f]{64}$/.test(r1.manifest.files['a.txt'] || ''));
check('C1 stdout mentions the link count', r1.code === 0 && /2 symlinks/.test(r1.stdout), r1.stdout);

// C2: a commit that holds only a symlink must not crash the writer.
const c2 = repo({}, { 'only-link': '../docs' });
const r2 = run(c2);
check('C2 link-only commit still writes a manifest', r2.code === 0, 'code=' + r2.code + ' ' + (r2.stderr || ''));
check('C2 link-only manifest has zero files and one link', r2.manifest && r2.manifest.fileCount === 0 && r2.manifest.symlinkCount === 1, JSON.stringify(r2.manifest && [r2.manifest.fileCount, r2.manifest.symlinkCount]));

// C3: the empty-tree guard still refuses rather than writing an empty manifest.
const c3 = repo({}, {});
const r3 = run(c3);
check('C3 empty commit is refused', r3.code === 1, 'code=' + r3.code);
check('C3 refusal names the reason', /refusing to write an empty manifest/.test(r3.stderr || ''), (r3.stderr || '').slice(0, 120));

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
