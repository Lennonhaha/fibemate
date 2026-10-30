#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * check-live.cjs - black-box delivery gate for fibemate.net.
 *
 * Purpose: a deploy is not done because `git reset --hard` succeeded. It is done
 * when the public site actually serves the bytes the repo says it should. This
 * script asserts that from the outside, so a silent 404 or a stale mirror fails
 * the deploy instead of waiting for a human to click a link.
 *
 * Checks (all required):
 *   1. live:manifest  GET /docs/TSR-MANIFEST-20261029.md -> 200 and byte-identical
 *                     to the blob committed at docs/TSR-MANIFEST-20261029.md
 *   2. live:token     GET /docs/tsa/2026-10-28-interop-matrix/
 *                     lg-116-interop-matrix-SHA256SUMS.tsr -> 200 and byte-identical
 *                     to the committed blob
 *   3. live:archive   /docs/tsa/ is browsable, and every file tracked under
 *                     docs/tsa/ is either served byte-identically or refused by an
 *                     explicit nginx deny rule (see POLICY_DENIED_EXT below)
 *   4. live:citations the "archive and citation" ledger on the homepage lists every
 *                     cited work, and each target still answers 200 and carries the
 *                     identifier it is cited by (DOI landing pages carry their PID,
 *                     repository pages carry their name, ORCID carries the iD).
 *                     A link that exists only in the HTML is not a delivered
 *                     citation, so the targets are queried too: a withdrawn DOI or
 *                     a renamed repository fails the deploy instead of rotting
 *                     quietly inside a list that looks like a record.
 *
 * Two deliberate design points:
 *
 *   - Expected bytes come from `git cat-file`, never from the working tree. On a
 *     Windows checkout .gitattributes rewrites line endings on disk, so hashing
 *     the file you can see reports drift that the deployed copy does not have.
 *     The commit is the authority; the checkout is a rendering of it.
 *
 *   - The published tree (www/docs/tsa) is deliberately a SUPERSET of the repo
 *     tree. Since PR #399 the site also carries tokens minted directly into www,
 *     so "counts must be equal" would be red forever and would prove nothing.
 *     The assertion used here is stronger where it matters: nothing from the repo
 *     may be missing, and everything served must be byte-identical.
 *
 *   - `.sh` and friends are denied by nginx on purpose (see
 *     deploy/nginx/fibemate.net.conf, the `deny all` location for
 *     (bak|config|sql|...|sh|...)). For those the gate requires the refusal: a
 *     200 would mean the deny rule stopped working.
 *
 * Exit codes: 0 = delivered, 1 = delivery failed, 2 = usage/config error.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const MANIFEST_REL = 'docs/TSR-MANIFEST-20261029.md';
const MANIFEST_URL = '/docs/TSR-MANIFEST-20261029.md';
const TOKEN_REL = 'docs/tsa/2026-10-28-interop-matrix/lg-116-interop-matrix-SHA256SUMS.tsr';
const TOKEN_URL = '/docs/tsa/2026-10-28-interop-matrix/lg-116-interop-matrix-SHA256SUMS.tsr';
const ARCHIVE_DIR_REL = 'docs/tsa';
const ARCHIVE_DIR_URL = '/docs/tsa/';

// The preprint that the homepage cites. The gate asserts two things that can
// break independently: the page still carries the link, and the DOI still
// resolves. Both are cheap; neither is implied by the other.
// The ledger at id="citation" is the record of everything this project cites.
// Each entry is asserted twice: the homepage still carries the href inside that
// section, and the target still resolves to a page that carries the identifier.
// `anchor` is the text that proves the entry is the one we mean - without it a
// page could keep the URL while citing something else entirely.
const CITATION_SECTION_ID = 'id="citation"';
const CITATIONS = [
  {
    id: 'preprint-engineering-verification',
    url: 'https://doi.org/10.5281/zenodo.23808518',
    token: '10.5281/zenodo.23808518',
    identity: 'body',
    anchor: 'Engineering Verification of PQC: A Case Study',
  },
  {
    id: 'formalization-codebase',
    url: 'https://doi.org/10.5281/zenodo.23622795',
    token: '10.5281/zenodo.23622795',
    identity: 'body',
  },
  {
    id: 'technical-note-zh',
    url: 'https://doi.org/10.5281/zenodo.23632173',
    token: '10.5281/zenodo.23632173',
    identity: 'body',
  },
  {
    id: 'methodology-keccak',
    url: 'https://doi.org/10.5281/zenodo.23637405',
    token: '10.5281/zenodo.23637405',
    identity: 'body',
  },
  {
    id: 'negative-result-dmtc',
    url: 'https://doi.org/10.5281/zenodo.23638522',
    token: '10.5281/zenodo.23638522',
    identity: 'body',
  },
  { id: 'repo-vwz-formalization', url: 'https://github.com/Lennonhaha/vwz-formalization', token: 'vwz-formalization' },
  { id: 'repo-fibemate-core', url: 'https://github.com/Lennonhaha/fibemate-core', token: 'fibemate-core' },
  { id: 'orcid', url: 'https://orcid.org/0009-0009-1407-686X', token: '0009-0009-1407-686X' },
];

// doi.org and github.com sit behind WAFs that answer 403 to requests carrying
// Node's default `node` User-Agent while answering the same request from the same
// IP with 200 once a browser-style UA is present. Measured 2026-10-30 on
// doi.org (403 vs 200, seconds apart, same IP). Without this header the probes
// fail for a reason that has nothing to do with the citation.
const PROBE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

// Kept in sync with deploy/nginx/fibemate.net.conf: the `deny all` location that
// matches `\.(bak|config|sql|fla|psd|ini|log|sh|inc|swp|dist|old|orig|save|zip|tar\.gz|sqlite|db)$`.
// `scripts/check-nginx-drift.cjs` already watches that file for drift; if the list
// there changes, change it here too or the gate will call a 403 a failure.
const POLICY_DENIED_EXT = [
  'bak',
  'config',
  'sql',
  'fla',
  'psd',
  'ini',
  'log',
  'sh',
  'inc',
  'swp',
  'dist',
  'old',
  'orig',
  'save',
  'zip',
  'sqlite',
  'db',
];

const USAGE = `Usage: node scripts/check-live.cjs [options]

  --base <url>        site root to probe (default: https://fibemate.net)
  --repo <dir>        repository working tree whose commits define the expected
                      bytes (default: parent of this script's directory)
  --concurrency <n>   parallel requests (default: 8)
  --timeout <ms>      per-request timeout (default: 20000)
  --json <file>       also write the machine-readable result here
  --probe-only        assert only the outbound link probes, ignoring whether the
                      homepage still carries the rows (for checking the resolver
                      side before a deploy)
  --no-external       skip the outbound link probes (keeps the on-page ledger
                      assertions); use where outbound DNS to doi.org /
                      github.com is blocked, and say so when you report the
                      result
  --quiet             only print failures and the final verdict
  --help              show this text

Exit codes: 0 delivered, 1 delivery failed, 2 usage/config error.`;

function parseArgs(argv) {
  const opts = {
    base: 'https://fibemate.net',
    repo: path.resolve(__dirname, '..'),
    concurrency: 8,
    timeout: 20000,
    json: null,
    quiet: false,
    external: true,
    probeOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE + '\n');
      process.exit(0);
    } else if (a === '--base') {
      opts.base = argv[(i += 1)];
    } else if (a === '--repo') {
      opts.repo = path.resolve(argv[(i += 1)]);
    } else if (a === '--concurrency') {
      opts.concurrency = Number(argv[(i += 1)]);
    } else if (a === '--timeout') {
      opts.timeout = Number(argv[(i += 1)]);
    } else if (a === '--json') {
      opts.json = argv[(i += 1)];
    } else if (a === '--quiet') {
      opts.quiet = true;
    } else if (a === '--no-external') {
      opts.external = false;
    } else if (a === '--probe-only') {
      opts.probeOnly = true;
    } else {
      throw new Error('unknown argument: ' + a);
    }
  }
  if (!Number.isFinite(opts.concurrency) || opts.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer');
  }
  if (!Number.isFinite(opts.timeout) || opts.timeout < 1) {
    throw new Error('--timeout must be a positive integer');
  }
  opts.base = String(opts.base || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(opts.base)) {
    throw new Error('--base must start with http:// or https://');
  }
  return opts;
}

function encodePath(relPath) {
  return relPath.split('/').map(encodeURIComponent).join('/');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function git(repo, args, input) {
  return execFileSync('git', args, {
    cwd: repo,
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Read the committed bytes for the given repository-relative paths.
 * Returns a Map of rel -> { sha, bytes }.
 */
function committedBlobs(repo, rels) {
  const raw = git(repo, ['ls-files', '-s', '-z', '--'].concat(rels));
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
  if (missing.length) {
    throw new Error('not tracked in this commit: ' + missing.join(', '));
  }
  const shas = rels.map((r) => byPath.get(r).sha);
  const batch = git(repo, ['cat-file', '--batch'], shas.join('\n') + '\n');
  const out = new Map();
  let off = 0;
  for (const rel of rels) {
    const nl = batch.indexOf(0x0a, off);
    if (nl < 0) throw new Error('git cat-file produced truncated output');
    const header = batch.slice(off, nl).toString('utf8').split(' ');
    if (header[1] !== 'blob') throw new Error('not a blob: ' + rel + ' (' + header[1] + ')');
    const size = Number(header[2]);
    const start = nl + 1;
    const bytes = batch.slice(start, start + size);
    off = start + size + 1;
    out.set(rel, { sha: byPath.get(rel).sha, bytes });
  }
  return out;
}

function trackedUnder(repo, relDir) {
  const raw = git(repo, ['ls-files', '-z', '--', relDir]);
  return raw.toString('utf8').split('\0').filter(Boolean);
}

function policyDenied(rel) {
  const ext = path.extname(rel).slice(1).toLowerCase();
  return ext.length > 0 && POLICY_DENIED_EXT.indexOf(ext) !== -1;
}

async function fetchBody(url, timeout, extraHeaders) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      ...(extraHeaders || {}),
    },
    signal: AbortSignal.timeout(timeout),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, type: res.headers.get('content-type') || '' };
}

async function checkFile(url, expected, label, opts) {
  let remote;
  try {
    remote = await fetchBody(url, opts.timeout);
  } catch (err) {
    return { id: label, ok: false, reason: 'request failed: ' + err.message, url, expectedBytes: expected.bytes.length };
  }
  if (remote.status !== 200) {
    return { id: label, ok: false, reason: 'HTTP ' + remote.status + ' (expected 200)', url, expectedBytes: expected.bytes.length };
  }
  if (sha256(expected.bytes) !== sha256(remote.buf)) {
    return {
      id: label,
      ok: false,
      reason:
        'byte mismatch: live ' +
        sha256(remote.buf).slice(0, 16) +
        ' (' +
        remote.buf.length +
        ' B) vs committed ' +
        sha256(expected.bytes).slice(0, 16) +
        ' (' +
        expected.bytes.length +
        ' B)',
      url,
    };
  }
  return {
    id: label,
    ok: true,
    url,
    bytes: expected.bytes.length,
    sha256: sha256(expected.bytes),
    contentType: remote.type,
  };
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(limit, items.length || 1)).fill(null).map(async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function checkArchive(opts) {
  const files = trackedUnder(opts.repo, ARCHIVE_DIR_REL);
  if (files.length === 0) {
    return { id: 'live:archive', ok: false, reason: 'no tracked files under ' + ARCHIVE_DIR_REL };
  }
  const expected = committedBlobs(opts.repo, files);

  let indexStatus = 0;
  let indexError = '';
  try {
    const res = await fetchBody(opts.base + ARCHIVE_DIR_URL, opts.timeout);
    indexStatus = res.status;
  } catch (err) {
    indexError = err.message;
  }

  const perFile = await pool(files, opts.concurrency, async (rel) => {
    const want = expected.get(rel);
    const url = opts.base + '/' + encodePath(rel);
    const denied = policyDenied(rel);
    let remote;
    try {
      remote = await fetchBody(url, opts.timeout);
    } catch (err) {
      return { rel, status: 'unreachable', detail: err.message };
    }
    if (denied) {
      if (remote.status === 403) return { rel, status: 'denied', detail: '' };
      if (remote.status === 404) return { rel, status: 'http-404', detail: 'deny rule should answer 403' };
      if (remote.status === 200) return { rel, status: 'policy-regression', detail: '200 but nginx should deny this extension' };
      return { rel, status: 'http-' + remote.status, detail: 'expected 403' };
    }
    if (remote.status !== 200) return { rel, status: 'http-' + remote.status, detail: 'expected 200' };
    if (sha256(want.bytes) !== sha256(remote.buf)) {
      return {
        rel,
        status: 'mismatch',
        detail: sha256(remote.buf).slice(0, 16) + ' != ' + sha256(want.bytes).slice(0, 16),
      };
    }
    return { rel, status: 'ok', detail: '' };
  });

  const bad = perFile.filter((r) => r.status !== 'ok' && r.status !== 'denied');
  const served = perFile.filter((r) => r.status === 'ok').length;
  const denied = perFile.filter((r) => r.status === 'denied').length;
  const ok = indexStatus === 200 && bad.length === 0;
  const detail = bad
    .slice(0, 12)
    .map((r) => '    ' + r.status + ' ' + r.rel + ' (' + r.detail + ')')
    .join('\n');
  const tally =
    served + '/' + perFile.length + ' identical' +
    (denied ? ', ' + denied + ' denied by policy' : '') +
    (bad.length ? ', ' + bad.length + ' not delivered' : '');
  let reason = '';
  if (!ok) {
    if (indexError) reason = 'archive index unreachable: ' + indexError + '; ';
    else if (indexStatus !== 200) reason = 'archive index HTTP ' + indexStatus + '; ';
    reason += tally + (detail ? '\n' + detail : '');
  }
  return {
    id: 'live:archive',
    ok,
    url: opts.base + ARCHIVE_DIR_URL,
    checked: perFile.length,
    served,
    denied,
    missingOrWrong: bad.length,
    tally,
    indexStatus,
    indexError,
    reason,
    failures: bad.map((r) => ({ path: r.rel, status: r.status, detail: r.detail })),
  };
}

function sliceCitationSection(html, sectionId) {
  const at = html.indexOf(sectionId);
  if (at < 0) return null;
  const open = html.lastIndexOf('<section', at);
  const close = html.indexOf('</section>', at);
  if (open < 0 || close < 0) return null;
  return html.slice(open, close);
}

async function fetchWithRetry(url, opts, label) {
  let lastErr = null;
  // Two attempts: a single transient DNS/socket error already produced a false red
  // here (2026-10-30) with identical inputs on the next attempt, and a gate that
  // goes red on a socket hiccup gets switched off by its owner.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetchBody(url, opts.timeout, { 'user-agent': PROBE_UA });
    } catch (err) {
      const code = err.cause && err.cause.code ? err.cause.code : '';
      lastErr = new Error(err.message + (code ? ' [' + code + ']' : ''));
      if (attempt === 1) await new Promise((r) => setTimeout(r, 900));
    }
  }
  throw new Error(label + ' did not answer in 2 attempts: ' + lastErr.message);
}

/**
 * Identity rules, chosen so that no assertion depends on JavaScript-rendered text:
 *   body  - the resolved page carries this string (Zenodo/DOI landing pages are
 *           server-rendered and carry their own PID; a withdrawn DOI 404s).
 *   url   - the resolved URL still ends with this path (a renamed or transferred
 *           repository redirects somewhere else, which is the breakage we want).
 * ORCID deliberately uses 'url': the profile page is a JS app, and its body
 * intermittently does not contain the iD even at a constant byte size (measured
 * 2026-10-30), so body matching there would be a flaky assertion, not a stronger one.
 *
 * DOIs are checked at the registration agency instead of through the landing page.
 * Measured 2026-10-30 from the deploy host: https://doi.org/api/handles/<pid> answers
 * in 1-2 s with the registered URL, while the redirect chain into the Zenodo landing
 * page did not finish inside 25 s. Following the redirect therefore made a healthy
 * citation look broken; the handle record is the authoritative statement that the DOI
 * exists and points where we say it does.
 */
function isDoi(entry) {
  return entry.token.indexOf('10.') === 0;
}

async function probeDoi(entry, opts) {
  const api = 'https://doi.org/api/handles/' + entry.token;
  let res;
  try {
    res = await fetchWithRetry(api, opts, api);
  } catch (err) {
    // Resolver unreachable is distinct from "DOI does not exist": fall back to the
    // landing page once so a doi.org outage does not turn into a content verdict.
    res = await fetchWithRetry(entry.url, opts, entry.url);
    if (res.status !== 200) return { ok: false, stage: 'resolve', detail: 'HTTP ' + res.status + ' (expected 200)' };
    return identityOk(entry, res)
      ? { ok: true, target: res.url || entry.url }
      : { ok: false, stage: 'identity', detail: 'landing page ' + (res.url || entry.url) + ' does not carry ' + entry.token };
  }
  if (res.status !== 200) return { ok: false, stage: 'resolve', detail: 'handle API HTTP ' + res.status };
  let body;
  try {
    body = JSON.parse(res.buf.toString('utf8'));
  } catch (err) {
    return { ok: false, stage: 'resolve', detail: 'handle API returned non-JSON' };
  }
  if (body.responseCode !== 1) return { ok: false, stage: 'resolve', detail: 'handle API responseCode ' + body.responseCode };
  if (body.handle !== entry.token) {
    return { ok: false, stage: 'identity', detail: 'handle API answered for ' + body.handle };
  }
  const urlValue = (body.values || []).filter((v) => v && v.type === 'URL' && v.data && v.data.value)[0];
  if (!urlValue) return { ok: false, stage: 'identity', detail: 'handle record has no registered URL' };
  return { ok: true, target: urlValue.data.value };
}

function identityOk(entry, res) {
  const know = entry.identity || 'url';
  if (know === 'body') return res.buf.toString('utf8').indexOf(entry.token) !== -1;
  return String(res.url || entry.url)
    .replace(/\/+$/, '')
    .endsWith(entry.token);
}

async function checkCitations(opts) {
  const result = {
    id: 'live:citations',
    ok: false,
    section: CITATION_SECTION_ID,
    checked: CITATIONS.length,
    onPage: 0,
    resolved: 0,
    failures: [],
  };

  let home;
  try {
    home = await fetchBody(opts.base + '/', opts.timeout);
  } catch (err) {
    result.reason = 'homepage unreachable: ' + err.message;
    return result;
  }
  if (home.status !== 200) {
    result.reason = 'homepage HTTP ' + home.status + ' (expected 200)';
    return result;
  }

  // Half one: every row of the ledger is still there. This is the half that fails
  // when someone edits index.html, which is the case that actually happens.
  if (!opts.probeOnly) {
    const section = sliceCitationSection(home.buf.toString('utf8'), CITATION_SECTION_ID);
    if (!section) {
      result.failures.push({ id: 'citation-section', stage: 'on-page', detail: 'no <section id="citation"> on the homepage' });
    } else {
      for (const c of CITATIONS) {
        const hasHref = section.indexOf('href="' + c.url + '"') !== -1;
        const hasAnchor = c.anchor ? section.indexOf(c.anchor) !== -1 : true;
        if (hasHref && hasAnchor) {
          result.onPage += 1;
        } else {
          result.failures.push({
            id: c.id,
            stage: 'on-page',
            detail: !hasHref ? 'href missing from the citation ledger' : 'entry no longer names "' + c.anchor + '"',
          });
        }
      }
    }
  }

  // Half two: each target still resolves and still carries its identifier. A DOI
  // that 404s or a repository that was renamed is worse than no citation, because
  // the row still looks like proof.
  if (opts.external) {
    for (const c of CITATIONS) {
      if (isDoi(c)) {
        let verdict;
        try {
          verdict = await probeDoi(c, opts);
        } catch (err) {
          result.failures.push({ id: c.id, stage: 'unreachable', detail: err.message });
          continue;
        }
        if (!verdict.ok) {
          result.failures.push({ id: c.id, stage: verdict.stage, detail: verdict.detail });
          continue;
        }
        result.resolved += 1;
        continue;
      }
      let res;
      try {
        res = await fetchWithRetry(c.url, opts, c.url);
      } catch (err) {
        result.failures.push({ id: c.id, stage: 'unreachable', detail: err.message });
        continue;
      }
      if (res.status !== 200) {
        result.failures.push({ id: c.id, stage: 'resolve', detail: 'HTTP ' + res.status + ' (expected 200)' });
        continue;
      }
      if (!identityOk(c, res)) {
        result.failures.push({
          id: c.id,
          stage: 'identity',
          detail: 'resolved to ' + (res.url || c.url) + ' which does not carry ' + c.token,
        });
        continue;
      }
      result.resolved += 1;
    }
  } else {
    result.skipped = 'link probes skipped (--no-external)';
  }

  result.ok = result.failures.length === 0;
  result.reason = result.ok
    ? ''
    : result.failures.length +
      ' citation assertion(s) failed: ' +
      result.failures.map((f) => f.id + ' [' + f.stage + '] ' + f.detail).join('; ');
  return result;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write('check-live: ' + err.message + '\n\n' + USAGE + '\n');
    process.exit(2);
  }

  let expected;
  let head = '(unknown)';
  try {
    head = git(opts.repo, ['rev-parse', '--short', 'HEAD']).toString('utf8').trim();
    expected = committedBlobs(opts.repo, [MANIFEST_REL, TOKEN_REL]);
  } catch (err) {
    process.stderr.write('check-live: cannot read the expected artifacts from git: ' + err.message + '\n');
    process.exit(2);
  }

  const started = Date.now();
  const checks = [];
  checks.push(await checkFile(opts.base + MANIFEST_URL, expected.get(MANIFEST_REL), 'live:manifest', opts));
  checks.push(await checkFile(opts.base + TOKEN_URL, expected.get(TOKEN_REL), 'live:token', opts));
  checks.push(await checkArchive(opts));
  checks.push(await checkCitations(opts));
  const ok = checks.every((c) => c.ok);

  if (!opts.quiet || !ok) {
    process.stdout.write('check-live: ' + opts.base + ' (repo HEAD ' + head + ')\n');
    for (const c of checks) {
      if (c.ok) {
        const hash = c.sha256 ? ' sha256 ' + c.sha256.slice(0, 16) + ' (' + c.bytes + ' B)' : '';
        const counted =
          c.id === 'live:archive' ? ' ' + c.tally : '';
        const cited = c.section
          ? c.skipped
            ? ' ' + c.onPage + '/' + c.checked + ' ledger rows present [' + c.skipped + ']'
            : ' ' + c.resolved + '/' + c.checked + ' citation links resolve'
          : '';
        process.stdout.write('[PASS] ' + c.id + hash + counted + cited + '\n');
      } else {
        process.stdout.write('[FAIL] ' + c.id + ': ' + c.reason + '\n');
      }
    }
  }

  const result = {
    schema: 'fibemate.live-delivery/v1',
    base: opts.base,
    repo: opts.repo,
    head,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    ok,
    checks,
  };
  if (opts.json) {
    fs.writeFileSync(opts.json, JSON.stringify(result, null, 2) + '\n', 'utf8');
  }

  process.stdout.write(
    (ok ? 'DEPLOY VERIFY: PASS' : 'DEPLOY VERIFY: FAIL') + ' (' + checks.length + ' checks, ' + result.durationMs + ' ms)\n',
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write('check-live: unexpected error: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
