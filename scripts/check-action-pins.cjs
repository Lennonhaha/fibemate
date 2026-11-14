#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * Verify every `uses:` reference in .github/workflows and .github/actions.
 *
 * Two checks, both against the GitHub API:
 *   1. A 40-hex commit pin must resolve to a real commit.
 *   2. When the line carries a `# vX.Y.Z` comment, the tag must resolve to that
 *      same commit. A pin that points somewhere else, or a comment that drifted
 *      from the pin, both mean the workflow says something untrue.
 *
 * Motivation: a pin written from memory rather than resolved from the API
 * (49933ea5288caeca8642d1e84c2dfa7cb0a0a8e1, 2026-11-15) looked correct in
 * review, passed every shell-level test, and only failed when the workflow was
 * actually executed, at "Set up job". This script is the check that would have
 * caught it before it ran.
 *
 * Usage:
 *   node scripts/check-action-pins.cjs             # verify (needs network)
 *   node scripts/check-action-pins.cjs --offline   # list pins only, no API calls
 *
 * Exit codes: 0 all pins verified, 1 at least one failure, 2 cannot check
 * (network/auth failure — never silently green).
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIRS = ['.github/workflows', '.github/actions'];
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.ya?ml$/i.test(entry.name)) out.push(rel);
  }
  return out;
}

function collectPins() {
  const pins = [];
  for (const file of DIRS.flatMap((d) => walk(d))) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/^\s*-?\s*uses:\s*(\S+)\s*(?:#\s*(\S+))?/);
      if (!m) return;
      const ref = m[1].replace(/^['"]|['"]$/g, '');
      if (ref.startsWith('./') || ref.startsWith('docker://')) return;
      const at = ref.lastIndexOf('@');
      if (at <= 0) return;
      // A reference may name a file inside the action repo, e.g.
      // github/codeql-action/init@<sha> or owner/repo/.github/workflows/x.yml@<sha>.
      // The API route needs only owner/repo; the rest is display information.
      const segments = ref.slice(0, at).split('/');
      if (segments.length < 2) return;
      pins.push({
        file,
        line: i + 1,
        repo: segments.slice(0, 2).join('/'),
        subpath: segments.slice(2).join('/'),
        ref: ref.slice(at + 1),
        comment: m[2] ? m[2].replace(/^['"]|['"]$/g, '') : '',
      });
    });
  }
  return pins;
}

async function api(route) {
  const res = await fetch(`https://api.github.com${route}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'fibemate-action-pin-check',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (res.status === 404) return { status: 404 };
  if (res.status === 403 && /rate limit/i.test(await res.clone().text())) {
    // Cannot verify is not the same as does not exist. Report it as unknown so the
    // run fails closed and loudly instead of blaming a pin that is probably fine.
    const err = new Error(`API refused the request: unauthenticated rate limit. Set GITHUB_TOKEN and retry.`);
    err.unverifiable = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${route}: ${(await res.text()).slice(0, 200)}`);
  }
  return { status: res.status, body: await res.json() };
}

async function commitSha(repo, sha) {
  const r = await api(`/repos/${repo}/commits/${sha}`);
  return r.status === 200 ? r.body.sha : null;
}

async function tagSha(repo, tag) {
  const r = await api(`/repos/${repo}/git/ref/tags/${tag}`);
  if (r.status !== 200) return null;
  let { sha, type } = r.body.object;
  if (type === 'tag') {
    const t = await api(`/repos/${repo}/git/tags/${sha}`);
    if (t.status !== 200) return null;
    sha = t.body.object.sha;
  }
  return sha;
}

(async () => {
  const offline = process.argv.includes('--offline');
  const pins = collectPins();
  const files = new Set(pins.map((p) => p.file)).size;
  console.log(`found ${pins.length} remote pin(s) in ${files} file(s)`);

  const uniqueRepos = new Set(pins.map((p) => p.repo));
  console.log(`distinct action repo(s): ${uniqueRepos.size}`);

  if (offline) {
    for (const p of pins) {
      const pinned = /^[0-9a-f]{40}$/.test(p.ref);
      console.log(`${pinned ? 'pinned  ' : 'UNPINNED'} ${p.repo}@${p.ref.slice(0, 12)}${p.comment ? ` (${p.comment})` : ''}  ${p.file}:${p.line}`);
    }
    process.exit(0);
  }

  let failures = 0;
  let warnings = 0;

  for (const p of pins) {
    const where = `${p.file}:${p.line}`;
    if (!/^[0-9a-f]{40}$/.test(p.ref)) {
      warnings += 1;
      console.log(`WARN  ${p.repo}@${p.ref} is not a 40-hex pin  ${where}`);
      continue;
    }

    let resolved;
    try {
      resolved = await commitSha(p.repo, p.ref);
    } catch (err) {
      console.log(`ERROR cannot reach the API: ${err.message}`);
      process.exit(2);
    }
    if (!resolved) {
      failures += 1;
      console.log(`FAIL  ${p.repo}@${p.ref} does not resolve to any commit  ${where}`);
      continue;
    }

    if (!p.comment) {
      console.log(`ok    ${p.repo}@${p.ref.slice(0, 12)}  ${where}`);
      continue;
    }
    if (!/^v\d/.test(p.comment)) {
      console.log(`ok    ${p.repo}@${p.ref.slice(0, 12)} (comment ${p.comment} is not a tag, skipped)  ${where}`);
      continue;
    }

    let tagged;
    try {
      tagged = await tagSha(p.repo, p.comment);
    } catch (err) {
      console.log(`ERROR cannot reach the API: ${err.message}`);
      process.exit(2);
    }
    if (!tagged) {
      failures += 1;
      console.log(`FAIL  ${p.repo} has no tag ${p.comment}, but the pin claims it  ${where}`);
    } else if (tagged !== resolved) {
      failures += 1;
      console.log(`FAIL  ${p.repo}@${p.ref.slice(0, 12)} is not ${p.comment} (that tag is ${tagged.slice(0, 12)})  ${where}`);
    } else {
      console.log(`ok    ${p.repo}@${p.ref.slice(0, 12)} = ${p.comment}  ${where}`);
    }
  }

  console.log(`\n${pins.length} pin(s), ${failures} failure(s), ${warnings} warning(s)`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(`ERROR ${err.message}`);
  process.exit(2);
});
