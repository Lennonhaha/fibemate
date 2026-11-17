#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * verify-tree-sha.cjs - prove that a runtime directory contains the bytes of a commit.
 *
 * The hashes are taken from the git object database, not from the working tree. That
 * distinction matters: a Windows checkout rewrites line endings, so hashing
 * `$REPO_DIR/$file` certifies bytes the commit does not contain. This is the same
 * reason write-build-manifest.cjs reads through `git cat-file --batch`.
 *
 * Usage:
 *   node scripts/verify-tree-sha.cjs --repo <checkout> --target <runtime-dir> \
 *        [--commit <sha>] [--tree <path>]... [--report]
 *
 *   --tree may be repeated (default: src). Every tracked blob below the tree must
 *   exist under <target>/<tree> and hash to the same sha256.
 *
 *   --report prints the same measurements but exits 0 when only mismatches were
 *   found; use it where a check should inform before it blocks.
 *
 *   --json emits one object ({commit, trees, checked, same, different, missing,
 *   mismatched:[...]}) so a deploy step can branch on the counts instead of
 *   scraping prose.
 *
 * Exit: 0 identical, 1 mismatch or missing, 2 usage error.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function usage(msg) {
  if (msg) process.stderr.write('verify-tree-sha: ' + msg + '\n');
  process.stderr.write(
    'usage: node scripts/verify-tree-sha.cjs --repo <dir> --target <dir> [--commit <sha>] [--tree <path>]... [--report]\n',
  );
  process.exit(2);
}

function parse(argv) {
  const o = { repo: null, target: null, commit: 'HEAD', trees: [], report: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--repo') o.repo = path.resolve(argv[(i += 1)] || '');
    else if (a === '--target') o.target = path.resolve(argv[(i += 1)] || '');
    else if (a === '--commit') o.commit = argv[(i += 1)] || '';
    else if (a === '--tree') o.trees.push(argv[(i += 1)] || '');
    else if (a === '--report') o.report = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') usage('');
    else usage('unknown argument: ' + a);
  }
  if (!o.repo) usage('--repo is required');
  if (!o.target) usage('--target is required');
  if (!o.commit) usage('--commit must not be empty');
  if (o.trees.length === 0) o.trees.push('src');
  for (const t of o.trees) {
    if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(t) || t.split('/').includes('..')) {
      usage('--tree must be a repository-relative path: ' + JSON.stringify(t));
    }
  }
  return o;
}

const git = (repo, args, input) =>
  execFileSync('git', args, { cwd: repo, input, maxBuffer: 512 * 1024 * 1024 });

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function trackedBlobs(repo, commit, tree) {
  // -z keeps paths with spaces intact. --full-tree keeps the path repository-relative.
  const raw = git(repo, ['ls-tree', '-r', '-z', '--full-tree', commit, '--', tree]);
  return raw
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((rec) => {
      const tab = rec.indexOf('\t');
      const [mode, type, sha] = rec.slice(0, tab).split(' ');
      return { mode, type, sha, rel: rec.slice(tab + 1) };
    })
    // Symlinks are tracked as blobs whose content is the link target; comparing them
    // byte for byte against a regular file would be a false mismatch.
    .filter((e) => e.type === 'blob' && e.mode !== '120000');
}

function blobHashes(repo, blobs) {
  if (blobs.length === 0) return new Map();
  const batch = git(repo, ['cat-file', '--batch'], blobs.map((b) => b.sha).join('\n') + '\n');
  const out = new Map();
  let off = 0;
  for (const b of blobs) {
    const nl = batch.indexOf(0x0a, off);
    if (nl < 0) throw new Error('truncated git cat-file output at ' + b.rel);
    const header = batch.slice(off, nl).toString('utf8').split(' ');
    if (header[1] !== 'blob') throw new Error('not a blob: ' + b.rel);
    const size = Number(header[2]);
    const start = nl + 1;
    out.set(b.rel, sha256(batch.slice(start, start + size)));
    off = start + size + 1;
  }
  return out;
}

function main() {
  const o = parse(process.argv.slice(2));
  const commit = git(o.repo, ['rev-parse', '--verify', o.commit + '^{commit}']).toString('utf8').trim();

  let checked = 0;
  let same = 0;
  const missing = [];
  const different = [];

  for (const tree of o.trees) {
    const blobs = trackedBlobs(o.repo, commit, tree);
    const expected = blobHashes(o.repo, blobs);
    for (const b of blobs) {
      checked += 1;
      // ls-tree paths are repository-relative, so the target path drops the tree prefix.
      const rel = b.rel.startsWith(tree + '/') ? b.rel.slice(tree.length + 1) : b.rel;
      const target = path.join(o.target, tree, rel);
      let actual;
      let stat;
      try {
        stat = fs.lstatSync(target);
      } catch {
        missing.push(b.rel);
        continue;
      }
      if (!stat.isFile()) {
        missing.push(b.rel + ' (not a regular file)');
        continue;
      }
      actual = sha256(fs.readFileSync(target));
      if (actual === expected.get(b.rel)) same += 1;
      else different.push({ rel: b.rel, expected: expected.get(b.rel), actual });
    }
    if (!o.json) {
      process.stdout.write(
        `verify-tree-sha: ${tree}: ${blobs.length} tracked files at ${commit.slice(0, 8)}\n`,
      );
    }
  }

  for (const rel of missing) process.stderr.write(`  MISSING ${rel}\n`);
  for (const d of different) {
    process.stderr.write(
      `  MISMATCH ${d.rel} (commit ${d.expected.slice(0, 12)} != runtime ${d.actual.slice(0, 12)})\n`,
    );
  }

  const bad = missing.length + different.length;
  if (o.json) {
    process.stdout.write(
      JSON.stringify({
        commit,
        trees: o.trees,
        checked,
        same,
        different: different.length,
        missing: missing.length,
        mismatched: different.map((d) => d.rel),
        missingFiles: missing,
      }) + '\n',
    );
  } else {
    process.stdout.write(
      `verify-tree-sha: ${same}/${checked} identical, ${different.length} differ, ${missing.length} missing\n`,
    );
  }

  if (bad !== 0 && !o.report) {
    process.stderr.write(
      `verify-tree-sha: FAIL - ${bad} of ${checked} tracked files do not match ${commit}\n`,
    );
    process.exit(1);
  }
  if (bad !== 0) {
    process.stderr.write('verify-tree-sha: report-only; the mismatch above is not fatal in --report mode\n');
  }
}

main();
