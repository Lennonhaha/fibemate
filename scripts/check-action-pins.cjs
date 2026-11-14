#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * Verify every `uses:` reference in .github/workflows and .github/actions.
 *
 * Three questions per pin, all answered by the API rather than by reading the line:
 *   1. Does the pinned commit exist?
 *   2. (when the line carries a `# vX.Y.Z` comment) Does that tag point at this commit?
 *   3. If either answer is "no", is it because the thing is absent, or because we
 *      could not look? Those are different verdicts and different exit codes.
 *
 * Motivation: a pin written from memory rather than resolved from the API
 * (49933ea5288caeca8642d1e84c2dfa7cb0a0a8e1, 2026-11-15) looked correct in review,
 * passed every shell-level test, and only failed when the workflow was actually
 * executed, at "Set up job".
 *
 * Usage:
 *   node scripts/check-action-pins.cjs              # verify every pin (needs network)
 *   node scripts/check-action-pins.cjs --offline    # list pins, no API calls
 *   node scripts/check-action-pins.cjs --self-test  # prove the checker can fail
 *   node scripts/check-action-pins.cjs --check-one actions/checkout@<sha>[#v4.2.2]
 *
 * Exit codes (verified / unverifiable are kept apart on purpose):
 *   0  every pin verified
 *   1  at least one pin is missing, or its comment drifted from the commit
 *   2  at least one pin could not be verified (rate limit, 5xx, network) and no
 *      definite failure was found. Never reported as success.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const ROOT = process.cwd();
const DIRS = ['.github/workflows', '.github/actions'];
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const TIMEOUT_MS = 20000;

// PINS_API_BASE exists so --self-test can point the checker at a dead port and prove
// the "cannot verify" path is not silently green. Anything but https is refused
// unless it is loopback, so a stray value in the real environment cannot redirect
// the gate to a host that says yes to everything.
function apiBase() {
  const raw = process.env.PINS_API_BASE;
  if (!raw) return 'https://api.github.com';
  const url = new URL(raw);
  const loopback = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) {
    throw new Error(`PINS_API_BASE must be https (got ${url.protocol}//${url.hostname}); loopback is allowed for --self-test only`);
  }
  return url.origin;
}

class Unverifiable extends Error {}

async function api(base, route) {
  let res;
  try {
    res = await fetch(`${base}${route}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fibemate-action-pin-check',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Unverifiable(`${route}: ${err.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS}ms` : err.message}`);
  }
  if (res.status === 404) return { missing: true };
  if (res.status === 422) {
    // A SHA that does not exist in an existing repository answers 422, not 404:
    // {"message":"No commit found for SHA: <sha>"}. Treating that as "cannot
    // verify" would let a missing pin exit 2 and read as a network problem, which
    // is precisely the failure this script exists to prevent. The self-test caught
    // this: its invented-SHA control came back unverifiable instead of missing.
    const body = await res.text();
    if (/no commit found/i.test(body)) return { missing: true, reason: 'no such commit' };
    throw new Unverifiable(`${route}: HTTP 422 ${body.slice(0, 120)}`);
  }
  if (res.status === 403 || res.status === 429) {
    const body = await res.text();
    if (/rate limit/i.test(body)) {
      throw new Unverifiable(`${route}: API rate limit - set GITHUB_TOKEN and retry`);
    }
    throw new Unverifiable(`${route}: HTTP ${res.status}`);
  }
  if (!res.ok) throw new Unverifiable(`${route}: HTTP ${res.status}`);
  return { body: await res.json() };
}

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
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/^\s*-?\s*uses:\s*(\S+)\s*(?:#\s*(\S+))?/);
      if (!m) return;
      const ref = m[1].replace(/^['"]|['"]$/g, '');
      if (ref.startsWith('./') || ref.startsWith('docker://')) return;
      const at = ref.lastIndexOf('@');
      if (at <= 0) return;
      // A reference may name a file inside the action repo, e.g.
      // github/codeql-action/init@<sha> or owner/repo/.github/workflows/x.yml@<sha>.
      // Only owner/repo belongs in the API route; the rest is display information.
      // Getting this wrong produced four false failures on correct pins.
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

function makeChecker(base) {
  const repoCache = new Map();
  const tagCache = new Map();

  async function repoExists(repo) {
    if (!repoCache.has(repo)) {
      const r = await api(base, `/repos/${repo}`);
      repoCache.set(repo, !r.missing);
    }
    return repoCache.get(repo);
  }

  async function tagCommit(repo, tag) {
    const key = `${repo}#${tag}`;
    if (!tagCache.has(key)) {
      const r = await api(base, `/repos/${repo}/git/ref/tags/${tag}`);
      let sha = null;
      if (!r.missing) {
        sha = r.body.object.sha;
        if (r.body.object.type === 'tag') {
          const t = await api(base, `/repos/${repo}/git/tags/${sha}`);
          sha = t.missing ? null : t.body.object.sha;
        }
      }
      tagCache.set(key, sha);
    }
    return tagCache.get(key);
  }

  /**
   * Verdicts:
   *   ok          commit exists, and the comment (if it names a tag) matches it
   *   missing     repository, commit or claimed tag does not exist
   *   drift       commit exists, tag exists, but they are different commits
   *   unpinned    not a 40-hex pin (warning: moving tag, still resolves at run time)
   *   unverifiable could not ask the API (throws, never a verdict of ok)
   */
  return async function classify({ repo, ref, comment }) {
    if (!/^[0-9a-f]{40}$/.test(ref)) return { verdict: 'unpinned' };
    if (!(await repoExists(repo))) return { verdict: 'missing', detail: 'repository not found' };

    const c = await api(base, `/repos/${repo}/commits/${ref}`);
    if (c.missing) return { verdict: 'missing', detail: 'no such commit' };

    if (!comment || !/^v\d/.test(comment)) return { verdict: 'ok' };

    const tagged = await tagCommit(repo, comment);
    if (!tagged) return { verdict: 'missing', detail: `no tag ${comment}, but the pin claims it` };
    if (tagged !== ref) return { verdict: 'drift', detail: `tag ${comment} is ${tagged.slice(0, 12)}` };
    return { verdict: 'ok' };
  };
}

function parseSpec(spec) {
  const at = spec.lastIndexOf('@');
  if (at <= 0) throw new Error(`--check-one wants owner/repo@ref[#comment], got ${spec}`);
  const [head, comment = ''] = spec.slice(at + 1).split('#');
  const segments = spec.slice(0, at).split('/');
  if (segments.length < 2) throw new Error(`--check-one wants owner/repo, got ${spec}`);
  return { repo: segments.slice(0, 2).join('/'), subpath: segments.slice(2).join('/'), ref: head, comment };
}

function report(verdict, detail, where) {
  const tail = detail ? ` (${detail})` : '';
  switch (verdict) {
    case 'ok':
      return { line: `ok    ${where}`, counted: 'ok' };
    case 'missing':
      return { line: `FAIL  missing: ${where}${tail}`, counted: 'failure' };
    case 'drift':
      return { line: `FAIL  drifted: ${where}${tail}`, counted: 'failure' };
    case 'unpinned':
      return { line: `WARN  not a 40-hex pin: ${where}`, counted: 'warning' };
    default:
      throw new Error(`unknown verdict ${verdict}`);
  }
}

async function scan(base) {
  const classify = makeChecker(base);
  const pins = collectPins();
  const files = new Set(pins.map((p) => p.file)).size;
  console.log(`found ${pins.length} remote pin(s) in ${files} file(s)`);
  console.log(`distinct action repo(s): ${new Set(pins.map((p) => p.repo)).size}`);

  const tally = { ok: 0, failure: 0, warning: 0 };
  const unverified = [];

  for (const p of pins) {
    const where = `${p.repo}${p.subpath ? '/' + p.subpath : ''}@${p.ref.slice(0, 12)}  ${p.file}:${p.line}`;
    try {
      const { verdict, detail } = await classify(p);
      const { line, counted } = report(verdict, detail, where);
      tally[counted] += 1;
      console.log(line);
    } catch (err) {
      if (!(err instanceof Unverifiable)) throw err;
      unverified.push(`${where}: ${err.message}`);
      console.log(`ERROR unverifiable: ${where} (${err.message})`);
    }
  }

  console.log(
    `\n${pins.length} pin(s), ${tally.failure} failure(s), ${unverified.length} unverifiable, ${tally.warning} warning(s)`
  );
  if (tally.failure > 0) return 1;
  if (unverified.length > 0) return 2;
  return 0;
}

async function checkOne(base, spec) {
  const classify = makeChecker(base);
  const pin = parseSpec(spec);
  try {
    const { verdict, detail } = await classify(pin);
    const { line } = report(verdict, detail, `${pin.repo}@${pin.ref.slice(0, 12)}`);
    console.log(line);
    return verdict === 'ok' ? 0 : 1;
  } catch (err) {
    if (!(err instanceof Unverifiable)) throw err;
    console.log(`ERROR unverifiable: ${err.message}`);
    return 2;
  }
}

// --- self-test -------------------------------------------------------------
// The point is not that the checker agrees with itself. Each control states the
// answer in advance and the script exits non-zero if the checker disagrees. Two of
// them are negative controls: a checker that cannot say "fail" is decoration.

async function selfTest() {
  const base = apiBase();
  const self = __filename;
  const controls = [];

  function child(env, spec) {
    const r = spawnSync(process.execPath, [self, '--check-one', spec], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 60000,
    });
    return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
  }

  // A random 40-hex cannot plausibly exist anywhere; determinism is not wanted here,
  // certainty that the commit is absent is.
  const fake = crypto.randomBytes(20).toString('hex');
  const fakeResult = child({}, `actions/checkout@${fake}`);
  controls.push({
    name: 'invented SHA is reported missing (exit 1)',
    pass: fakeResult.code === 1 && /missing/.test(fakeResult.out),
    detail: `exit ${fakeResult.code}: ${fakeResult.out.split('\n')[0]}`,
  });

  // Positive control: take a real tag from the API, then pin exactly its commit.
  let realSha = null;
  try {
    const r = await api(base, '/repos/actions/checkout/git/ref/tags/v4.2.2');
    if (!r.missing) {
      realSha = r.body.object.type === 'tag'
        ? (await api(base, `/repos/actions/checkout/git/tags/${r.body.object.sha}`)).body.object.sha
        : r.body.object.sha;
    }
  } catch (err) {
    controls.push({ name: 'real SHA is reported ok (exit 0)', pass: false, detail: `could not resolve v4.2.2: ${err.message}` });
  }
  if (realSha) {
    const okResult = child({}, `actions/checkout@${realSha}#v4.2.2`);
    controls.push({
      name: 'real SHA with the right tag is reported ok (exit 0)',
      pass: okResult.code === 0 && /^ok/.test(okResult.out),
      detail: `exit ${okResult.code}: ${okResult.out.split('\n')[0]}`,
    });
    const driftResult = child({}, `actions/checkout@${realSha}#v4.0.0`);
    controls.push({
      name: 'real SHA with the wrong tag is reported as drift (exit 1)',
      pass: driftResult.code === 1 && /drift/.test(driftResult.out),
      detail: `exit ${driftResult.code}: ${driftResult.out.split('\n')[0]}`,
    });
  }

  // Fail-closed control: a dead API must yield "unverifiable", never "ok".
  const dead = child({ PINS_API_BASE: 'http://127.0.0.1:9' }, `actions/checkout@${realSha || fake}#v4.2.2`);
  controls.push({
    name: 'unreachable API is unverifiable (exit 2), never ok',
    pass: dead.code === 2 && /unverifiable/.test(dead.out) && !/^ok/m.test(dead.out),
    detail: `exit ${dead.code}: ${dead.out.split('\n')[0]}`,
  });

  // And the guard on the override itself: a non-loopback plain-http host is refused.
  const refused = child({ PINS_API_BASE: 'http://example.com' }, `actions/checkout@${realSha || fake}`);
  controls.push({
    name: 'plain-http non-loopback API base is refused (exit 2)',
    pass: refused.code === 2 && /must be https/.test(refused.out),
    detail: `exit ${refused.code}: ${refused.out.split('\n')[0]}`,
  });

  let failed = 0;
  for (const c of controls) {
    if (!c.pass) failed += 1;
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}`);
  }
  console.log(`\nself-test: ${controls.length - failed}/${controls.length} passed`);
  return failed === 0 ? 0 : 1;
}

// --- entry -----------------------------------------------------------------

(async () => {
  const base = apiBase();
  if (process.argv.includes('--self-test')) process.exit(await selfTest());

  const oneAt = process.argv.indexOf('--check-one');
  if (oneAt !== -1) {
    const spec = process.argv[oneAt + 1];
    if (!spec) throw new Error('--check-one needs a spec');
    process.exit(await checkOne(base, spec));
  }

  if (process.argv.includes('--offline')) {
    const pins = collectPins();
    for (const p of pins) {
      const pinned = /^[0-9a-f]{40}$/.test(p.ref);
      console.log(`${pinned ? 'pinned  ' : 'UNPINNED'} ${p.repo}@${p.ref.slice(0, 12)}${p.comment ? ` (${p.comment})` : ''}  ${p.file}:${p.line}`);
    }
    console.log(`\n${pins.length} pin(s) listed, no API calls made`);
    process.exit(0);
  }

  process.exit(await scan(base));
})().catch((err) => {
  console.error(`ERROR ${err.message}`);
  process.exit(2);
});
