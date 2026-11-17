#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * test-verify-tree-sha.cjs - the negative tests for verify-tree-sha.cjs.
 *
 * A gate that cannot be shown to fail on a single flipped byte is decoration. This
 * builds a throwaway repository, materialises its tree, and asserts the gate passes,
 * then fails for a flipped byte, a missing file, and a file replaced by a directory.
 *
 * Run: node scripts/test-verify-tree-sha.cjs
 * Exit: 0 all cases pass, 1 a case failed.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const GATE = path.join(__dirname, 'verify-tree-sha.cjs');
const results = [];

function ok(name, cond, detail) {
  results.push({ name, cond: Boolean(cond), detail: detail || '' });
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' - ' + detail}\n`);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function runGate(args) {
  const r = spawnSync(process.execPath, [GATE].concat(args), { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-tree-sha-'));
  const repo = path.join(root, 'repo');
  const target = path.join(root, 'runtime');
  fs.mkdirSync(repo);
  fs.mkdirSync(target);

  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.name', 'Test']);
  git(repo, ['config', 'user.email', 'test@example.invalid']);
  // The gate hashes git blobs. A checkout that rewrites line endings would make the
  // working tree differ from those blobs for reasons unrelated to the gate.
  git(repo, ['config', 'core.autocrlf', 'false']);

  fs.mkdirSync(path.join(repo, 'src'));
  fs.mkdirSync(path.join(repo, 'packages', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'index.js'), 'module.exports = 1;\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'packages', 'demo', 'blob.bin'), Buffer.from([0, 1, 2, 3, 254, 255]));
  fs.writeFileSync(path.join(repo, 'packages', 'demo', 'readme.md'), '# demo\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'untracked.txt'), 'not in the commit\n', 'utf8');
  git(repo, ['add', 'src', 'packages']);
  git(repo, ['commit', '-q', '-m', 'fixture']);

  // Materialise the tracked trees, then add runtime-only state the gate must ignore.
  fs.mkdirSync(path.join(target, 'src'), { recursive: true });
  fs.mkdirSync(path.join(target, 'packages', 'demo', 'node_modules', 'dep'), { recursive: true });
  fs.mkdirSync(path.join(target, 'packages', 'demo', 'native', 'build', 'Release'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'src', 'index.js'), path.join(target, 'src', 'index.js'));
  fs.copyFileSync(
    path.join(repo, 'packages', 'demo', 'blob.bin'),
    path.join(target, 'packages', 'demo', 'blob.bin'),
  );
  fs.copyFileSync(
    path.join(repo, 'packages', 'demo', 'readme.md'),
    path.join(target, 'packages', 'demo', 'readme.md'),
  );
  fs.writeFileSync(path.join(target, 'packages', 'demo', 'node_modules', 'dep', 'index.js'), 'x\n');
  fs.writeFileSync(path.join(target, 'packages', 'demo', 'native', 'build', 'Release', 'demo.node'), 'x');

  const base = ['--repo', repo, '--target', target];

  let r = runGate(base.concat(['--tree', 'src', '--tree', 'packages']));
  ok(
    'identical tree passes',
    r.code === 0 && /3\/3 identical/.test(r.stdout),
    `code=${r.code} out=${r.stdout.trim()} err=${r.stderr.trim()}`,
  );

  // One flipped byte in the middle of a binary file.
  const blob = path.join(target, 'packages', 'demo', 'blob.bin');
  const bytes = fs.readFileSync(blob);
  bytes[2] ^= 0x01;
  fs.writeFileSync(blob, bytes);
  r = runGate(base.concat(['--tree', 'packages']));
  ok(
    'one flipped byte fails the gate',
    r.code === 1 && /MISMATCH packages\/demo\/blob\.bin/.test(r.stderr),
    `code=${r.code} err=${r.stderr.trim()}`,
  );

  // The same mismatch is not fatal in --report mode; that mode exists so the deploy
  // can print drift before it decides to block.
  r = runGate(base.concat(['--tree', 'packages', '--report']));
  ok(
    'report mode measures without blocking',
    r.code === 0 && /MISMATCH packages\/demo\/blob\.bin/.test(r.stderr),
    `code=${r.code}`,
  );
  fs.copyFileSync(path.join(repo, 'packages', 'demo', 'blob.bin'), blob);

  // A tracked file that the runtime tree never received.
  fs.unlinkSync(path.join(target, 'packages', 'demo', 'readme.md'));
  r = runGate(base.concat(['--tree', 'packages']));
  ok(
    'missing tracked file fails',
    r.code === 1 && /MISSING packages\/demo\/readme\.md/.test(r.stderr),
    `code=${r.code} err=${r.stderr.trim()}`,
  );
  fs.copyFileSync(
    path.join(repo, 'packages', 'demo', 'readme.md'),
    path.join(target, 'packages', 'demo', 'readme.md'),
  );

  // A tracked path replaced by a directory is missing, not "identical enough".
  fs.unlinkSync(path.join(target, 'packages', 'demo', 'readme.md'));
  fs.mkdirSync(path.join(target, 'packages', 'demo', 'readme.md'));
  r = runGate(base.concat(['--tree', 'packages']));
  ok(
    'directory in place of a file fails',
    r.code === 1 && /MISSING packages\/demo\/readme\.md \(not a regular file\)/.test(r.stderr),
    `code=${r.code} err=${r.stderr.trim()}`,
  );
  fs.rmdirSync(path.join(target, 'packages', 'demo', 'readme.md'));
  fs.copyFileSync(
    path.join(repo, 'packages', 'demo', 'readme.md'),
    path.join(target, 'packages', 'demo', 'readme.md'),
  );

  // An empty --tree is a usage error, not a silent pass over zero files.
  r = runGate(['--repo', repo, '--target', target, '--tree', '']);
  ok('empty tree is a usage error', r.code === 2, `code=${r.code}`);

  // A tree with no tracked files must not "pass" by checking nothing: the summary
  // reports 0 files, and the caller is expected to notice. Assert the measurement.
  r = runGate(base.concat(['--tree', 'src']));
  ok('per-tree count is reported', /src: 1 tracked files/.test(r.stdout), r.stdout.trim());

  fs.rmSync(root, { recursive: true, force: true });

  const failed = results.filter((x) => !x.cond);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} cases passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
