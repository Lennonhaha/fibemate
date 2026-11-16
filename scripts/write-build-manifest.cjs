#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * write-build-manifest.cjs - record what a release tree was built from.
 *
 * Every deploy needs to answer "is the thing on disk the commit we think it is?"
 * without a `.git` directory, because releases are produced by `git archive` and
 * the repository is no longer the thing being served. This writes BUILD-MANIFEST.json:
 * the commit, its tree, and a sha256 for every tracked file, all computed from the
 * commit object (`git cat-file --batch`), never from the working tree - a Windows
 * checkout rewrites line endings, and a manifest built from it would certify bytes
 * the commit does not contain.
 *
 * The name is not VERSION.json on purpose: since #501 that file is the version
 * single-source (3.3.3 / counts), and a build step that overwrote it would trade one
 * invisible drift for another.
 *
 * Usage:
 *   node scripts/write-build-manifest.cjs --repo /opt/fibemate-repo \
 *        --commit 54f7bad... --out /opt/fibemate/releases/54f7bad [--verify]
 *
 * --verify re-hashes the files in --out against the manifest it just would write,
 * which is the check that catches a half-extracted release before it is served.
 *
 * Exit: 0 written and consistent, 1 tree does not match the commit, 2 usage error.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SCHEMA = 'fibemate.build/v1';

function usage(msg) {
  if (msg) process.stderr.write('write-build-manifest: ' + msg + '\n');
  process.stderr.write(
    'usage: node scripts/write-build-manifest.cjs --repo <dir> --commit <sha> --out <release-dir> [--verify] [--out-name BUILD-MANIFEST.json]\n',
  );
  process.exit(2);
}

function parse(argv) {
  const o = { repo: null, commit: null, out: null, verify: false, outName: 'BUILD-MANIFEST.json' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--repo') o.repo = path.resolve(argv[(i += 1)] || '');
    else if (a === '--commit') o.commit = argv[(i += 1)] || '';
    else if (a === '--out') o.out = path.resolve(argv[(i += 1)] || '');
    else if (a === '--out-name') o.outName = argv[(i += 1)] || '';
    else if (a === '--verify') o.verify = true;
    else if (a === '--help' || a === '-h') usage('');
    else usage('unknown argument: ' + a);
  }
  if (!o.repo) usage('--repo is required');
  if (!/^[A-Za-z0-9._/~^@{}-]{2,120}$/.test(o.commit || '')) usage('--commit must be a git revision (sha, HEAD, tag)');
  if (!o.out) usage('--out is required');
  if (!/^[A-Za-z0-9._-]+$/.test(o.outName)) usage('--out-name must be a plain file name');
  return o;
}

const git = (repo, args, input) => execFileSync('git', args, { cwd: repo, input, maxBuffer: 256 * 1024 * 1024 });
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function main() {
  const o = parse(process.argv.slice(2));
  let commit;
  try {
    commit = git(o.repo, ['rev-parse', '--verify', o.commit + '^{commit}']).toString('utf8').trim();
    const tree = git(o.repo, ['rev-parse', commit + '^{tree}']).toString('utf8').trim();
    // -z gives NUL-separated "mode sha stage\tpath" records; paths with spaces stay intact.
    const raw = git(o.repo, ['ls-tree', '-r', '-z', '--full-tree', commit]);
    const entries = raw.toString('utf8').split('\0').filter(Boolean).map((rec) => {
      const tab = rec.indexOf('\t');
      // ls-tree record: "<mode> SP <type> SP <object> TAB <path>" - the order is
      // mode, type, sha. Reading it as mode, sha, type made every entry look
      // non-blob and produced a manifest with zero files that then "verified" OK.
      const [mode, type, sha] = rec.slice(0, tab).split(' ');
      const rel = rec.slice(tab + 1);
      return { mode, sha, type, rel };
    });
    const files = entries.filter((e) => e.type === 'blob' && e.mode !== '120000');
    if (files.length === 0) throw new Error('commit ' + commit + ' contains no blobs - refusing to write an empty manifest');
    if (process.env.WBM_DEBUG) {
      process.stderr.write(`debug: repo=${o.repo} commit=${commit} entries=${entries.length} files=${files.length}\n`);
    }

    // One `git cat-file --batch` for the whole tree: ~2300 blobs in well under a second.
    const batch = git(o.repo, ['cat-file', '--batch'], files.map((f) => f.sha).join('\n') + '\n');
    const map = {};
    let off = 0;
    for (const f of files) {
      const nl = batch.indexOf(0x0a, off);
      if (nl < 0) throw new Error('truncated git cat-file output at ' + f.rel);
      const header = batch.slice(off, nl).toString('utf8').split(' ');
      if (header[1] !== 'blob') throw new Error('not a blob: ' + f.rel);
      const size = Number(header[2]);
      const start = nl + 1;
      map[f.rel] = sha256(batch.slice(start, start + size));
      off = start + size + 1;
    }

    const body = {
      schema: SCHEMA,
      commit,
      commitShort: commit.slice(0, 7),
      tree,
      builtAt: new Date().toISOString(),
      fileCount: Object.keys(map).length,
      files: map,
    };
    const dest = path.join(o.out, o.outName);
    fs.writeFileSync(dest, JSON.stringify(body, null, 1) + '\n', 'utf8');
    process.stdout.write(
      `write-build-manifest: ${body.commitShort} ${body.fileCount} files -> ${dest} (${fs.statSync(dest).size} B)\n`,
    );

    if (o.verify) {
      const trust = require('./lib/expected-source.cjs').manifestSource(o.out, o.outName);
      const all = Object.keys(map);
      trust.blobs(all);
      process.stdout.write(`write-build-manifest: verify OK - ${all.length}/${all.length} files match the commit\n`);
    }
  } catch (err) {
    process.stderr.write('write-build-manifest: ' + (err && err.message ? err.message : err) + '\n');
    process.exit(1);
  }
}

main();
