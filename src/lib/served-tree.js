// SPDX-License-Identifier: GPL-3.0-only
'use strict';
/**
 * served-tree.js - what the static site is serving, as opposed to what this process is.
 *
 * Why this exists (#603): a deploy replaced the static tree but did not restart the API,
 * which was the right call - the only runtime change was behind a flag that is off. The
 * side effect was that GET / and GET /health answered in the same second with different
 * commit ids, and each was individually defensible. Two truthful-looking numbers that
 * disagree are worse than one missing number, because neither reader can tell which one
 * describes the page in front of them.
 *
 * So the process states both facts and never merges them:
 *   build  - the manifest next to this code, loaded at startup (what is running)
 *   served - the manifest of the static root on disk (what the web server is handing out)
 *
 * `served` is read from disk with an mtime-keyed cache, so switching a symlink is visible
 * on the next request without a restart, and a per-request read does not cost anything.
 * Every failure mode returns null rather than throwing: a health endpoint that 500s
 * because a manifest is missing is a worse monitor than one that says "absent".
 */

const fs = require('fs');
const path = require('path');

const COMMIT_RE = /^[0-9a-f]{7,40}$/;

/**
 * Where the served tree might keep its manifest. A release directory holds
 * BUILD-MANIFEST.json next to www/, so the parent of the static root is first;
 * a checkout that keeps the manifest inside the static root is second.
 */
function candidateManifests(staticRoot) {
  return [
    path.join(staticRoot, '..', 'BUILD-MANIFEST.json'),
    path.join(staticRoot, 'BUILD-MANIFEST.json'),
  ];
}

const cache = new Map(); // manifest path -> { mtimeMs, value }

function readManifest(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch (_) {
    return null;
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.value;

  let value = null;
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (m && typeof m.commitShort === 'string' && COMMIT_RE.test(m.commitShort)) {
      value = {
        commit: m.commitShort,
        source: 'served-manifest',
        files: typeof m.fileCount === 'number' ? m.fileCount : Object.keys(m.files || {}).length,
        manifest: file,
      };
    }
  } catch (_) {
    // A malformed manifest is reported as absent, not as a crash. The caller can see
    // `source: 'absent'` and knows the difference between "no answer" and "wrong answer".
    value = null;
  }
  cache.set(file, { mtimeMs: st.mtimeMs, value });
  return value;
}

/**
 * @param {string} staticRoot directory the web server serves
 * @returns {{commit: string|null, source: string, files?: number, manifest?: string}}
 */
function readServedTree(staticRoot) {
  if (!staticRoot || typeof staticRoot !== 'string') return { commit: null, source: 'not-configured' };
  for (const file of candidateManifests(staticRoot)) {
    const v = readManifest(file);
    if (v) return v;
  }
  return { commit: null, source: 'absent' };
}

/** Test hook: forget cached mtimes. */
function clearCache() {
  cache.clear();
}

module.exports = { readServedTree, clearCache, candidateManifests };
