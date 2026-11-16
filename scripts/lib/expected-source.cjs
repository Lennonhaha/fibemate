// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// Where does the "expected bytes" for a delivery check come from?
//
// Historically: `git cat-file`, because the commit is the authority and a Windows
// checkout rewrites line endings. That is still the best answer when the tree is a
// working copy. It stopped being an answer at all on 2026-11-16, when the deploy
// moved to an immutable release directory produced by `git archive`: no `.git`, so
// `check-live.cjs` died with "not a git repository" and the deploy lost its
// black-box gate -- exactly the gate that catches a silent 404.
//
// So the source is now an interface with two implementations:
//
//   git       - the commit is the authority (unchanged behaviour, best when available)
//   manifest  - a VERSION.json written at build time, holding the commit id and a
//               sha256 for every tracked file, computed from the commit with
//               `git cat-file` while the repo was still reachable.
//
// The manifest is not self-certifying in the way git is: it vouches for what the
// build produced, not for what is on disk now. That is why the manifest source
// re-hashes each file it is asked for and refuses when the tree and the manifest
// disagree. A release directory that was edited after the build is not the release
// that was built, and the gate must say so rather than compare live bytes against
// bytes it never verified.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SCHEMA = 'fibemate.build/v1';
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function git(dir, args, input) {
  return execFileSync('git', args, { cwd: dir, input, maxBuffer: 64 * 1024 * 1024 });
}

function gitSource(dir) {
  const short = git(dir, ['rev-parse', '--short', 'HEAD']).toString('utf8').trim();
  const commit = git(dir, ['rev-parse', 'HEAD']).toString('utf8').trim();

  function blobs(rels) {
    const raw = git(dir, ['ls-files', '-s', '-z', '--'].concat(rels));
    const wanted = new Set(rels);
    const byPath = new Map();
    for (const entry of raw.toString('utf8').split('\0')) {
      if (!entry) continue;
      const tab = entry.indexOf('\t');
      const meta = entry.slice(0, tab).split(' ');
      const rel = entry.slice(tab + 1);
      if (!wanted.has(rel)) continue;
      byPath.set(rel, { mode: meta[0], sha: meta[1], stage: meta[2] });
    }
    const missing = rels.filter((r) => !byPath.has(r));
    if (missing.length) throw new Error('not tracked in this commit: ' + missing.join(', '));
    const batch = git(dir, ['cat-file', '--batch'], rels.map((r) => byPath.get(r).sha).join('\n') + '\n');
    const out = new Map();
    let off = 0;
    for (const rel of rels) {
      const nl = batch.indexOf(0x0a, off);
      if (nl < 0) throw new Error('git cat-file produced truncated output');
      const header = batch.slice(off, nl).toString('utf8').split(' ');
      if (header[1] !== 'blob') throw new Error('not a blob: ' + rel + ' (' + header[1] + ')');
      const size = Number(header[2]);
      const start = nl + 1;
      out.set(rel, { sha: byPath.get(rel).sha, bytes: batch.slice(start, start + size) });
      off = start + size + 1;
    }
    return out;
  }

  function under(relDir) {
    const raw = git(dir, ['ls-files', '-z', '--', relDir]);
    return raw.toString('utf8').split('\0').filter(Boolean);
  }

  return { kind: 'git', dir, commit, short, blobs, under, describe: () => `git checkout at ${short}` };
}

function manifestSource(dir, manifestRel) {
  const abs = path.resolve(dir, manifestRel);
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new Error(
      `no .git in ${dir} and no build manifest at ${abs} (${err.code || err.message}); ` +
        'a release tree must carry the VERSION.json its build wrote',
    );
  }
  let m;
  try {
    m = JSON.parse(raw);
  } catch (err) {
    throw new Error('build manifest is not valid JSON: ' + err.message);
  }
  if (m.schema !== SCHEMA) throw new Error(`build manifest schema is ${JSON.stringify(m.schema)}, expected ${SCHEMA}`);
  if (!/^[0-9a-f]{40}$/.test(String(m.commit || ''))) throw new Error('build manifest has no commit id');
  if (!m.files || typeof m.files !== 'object') throw new Error('build manifest has no file digest map');

  const known = new Set(Object.keys(m.files));

  function blobs(rels) {
    const out = new Map();
    for (const rel of rels) {
      if (!known.has(rel)) throw new Error(`${rel} is not in the build manifest - the tree was not built from that commit`);
      const want = m.files[rel];
      let bytes;
      try {
        bytes = fs.readFileSync(path.join(dir, rel));
      } catch (err) {
        throw new Error(`build manifest lists ${rel} but it is missing from the tree (${err.code || err.message})`);
      }
      const got = sha256(bytes);
      if (got !== want) {
        throw new Error(
          `${rel} in the tree (${got.slice(0, 16)}) does not match the build manifest (${String(want).slice(0, 16)}) - ` +
            'the release directory was modified after it was built',
        );
      }
      out.set(rel, { sha: want, bytes });
    }
    return out;
  }

  function under(relDir) {
    const prefix = relDir.replace(/\/+$/, '') + '/';
    return [...known].filter((rel) => rel.indexOf(prefix) === 0).sort();
  }

  return {
    kind: 'manifest',
    dir,
    commit: m.commit,
    short: m.commitShort || m.commit.slice(0, 7),
    blobs,
    under,
    describe: () => `build manifest at ${m.commitShort || m.commit.slice(0, 7)} (${path.basename(abs)})`,
  };
}

/**
 * Pick the authority for expected bytes. `--expect-commit` is checked here rather
 * than later: if the tree is not the commit the deploy claims, every subsequent
 * assertion would be answering the wrong question.
 */
function openSource(dir, opts) {
  const o = opts || {};
  const source = fs.existsSync(path.join(dir, '.git'))
    ? gitSource(dir)
    : manifestSource(dir, o.manifest || 'VERSION.json');
  if (o.expectCommit) {
    const want = String(o.expectCommit);
    const got = source.commit;
    if (!(got === want || (want.length < 40 && got.indexOf(want) === 0))) {
      throw new Error(`--expect-commit ${want} does not match ${source.describe()} (commit ${got})`);
    }
  }
  return source;
}

module.exports = { openSource, gitSource, manifestSource, sha256, SCHEMA };
