// SPDX-License-Identifier: GPL-3.0-only
'use strict';
/**
 * tree-hash.js - one digest for a subtree of a build manifest.
 *
 * Why this exists (#507): a release directory is verified file-by-file at deploy
 * time, and then nothing looks at it again. `packages/` in particular reached
 * production by hand for months (65 of 133 files differed) and no check ever said
 * so. A deploy gate can only cover the moment of the deploy; drift after that is
 * invisible from outside unless the running process can state, in one value, which
 * bytes it is serving.
 *
 * The digest is over the manifest's own view of the tree (relative path + sha256),
 * never over directory listing order: `readdir` order is not stable across
 * filesystems, and a hash that changes when nothing changed is worse than none.
 *
 * Format: for every entry, sorted by path, `sha256(path + "\0" + digest + "\n")`.
 * Both the running process and `scripts/check-live.cjs` compute it from the same
 * manifest data, so a one-byte change in any covered file changes the digest.
 */

const crypto = require('crypto');

const DIGEST_RE = /^[0-9a-f]{64}$/;

function normalizePrefix(prefix) {
  return String(prefix || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

/**
 * @param {Object<string,string>} files  relative path -> sha256 (as BUILD-MANIFEST.json stores them)
 * @param {string} [prefix]              only entries under this directory ('' = whole tree)
 * @returns {{hash: string, count: number, skipped: string[]}}
 */
function treeHash(files, prefix) {
  const p = normalizePrefix(prefix);
  const all = files && typeof files === 'object' ? files : {};
  const rels = Object.keys(all)
    .filter((rel) => (p === '' ? true : rel === p || rel.indexOf(p + '/') === 0))
    .sort();

  const h = crypto.createHash('sha256');
  let count = 0;
  const skipped = [];
  for (const rel of rels) {
    const digest = String(all[rel] || '').trim().toLowerCase();
    // A malformed entry is reported, not silently dropped: skipping it would produce
    // a stable-looking digest for a tree the manifest cannot describe.
    if (!DIGEST_RE.test(digest)) {
      skipped.push(rel);
      continue;
    }
    h.update(rel + '\0' + digest + '\n');
    count += 1;
  }
  return { hash: h.digest('hex'), count, skipped };
}

module.exports = { treeHash, normalizePrefix };
