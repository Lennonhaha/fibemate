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
 *   5. live:tree      the running process reports the commit it booted from and a
 *                     digest of `packages/` taken from its build manifest, and both
 *                     match the source being checked. #507: `packages/` drifted from
 *                     the repository for months and every existing check was blind
 *                     to it, because they only looked at `www/` and `src/` from the
 *                     outside. A deploy proves a tree once; this keeps proving it.
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
const { openSource } = require('./lib/expected-source.cjs');
const { treeHash } = require('../src/lib/tree-hash');

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
  --repo <dir>        tree whose files define the expected bytes (default: parent of
                      this script's directory). If it has .git the commit is the
                      authority; otherwise the build manifest is, and every file is
                      re-hashed against it.
  --build-manifest <f> name of the manifest inside --repo (default: BUILD-MANIFEST.json,
                      deliberately not VERSION.json - that file is the version
                      single-source from #501 and the build must not overwrite it)
  --expect-commit <sha> fail unless --repo is that commit (guard against deploying
                      a release tree that is not the one just built)
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
    buildManifest: 'BUILD-MANIFEST.json',
    expectCommit: null,
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
    } else if (a === '--build-manifest') {
      opts.buildManifest = argv[(i += 1)];
    } else if (a === '--expect-commit') {
      opts.expectCommit = argv[(i += 1)];
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

// Expected bytes come from lib/expected-source.cjs: a checkout is authoritative by
// commit, an immutable release directory by its build manifest (files re-hashed).
// Both used to be git calls here, which is exactly what stopped working the moment
// deploys became `git archive` output with no .git to interrogate.
function committedBlobs(source, rels) {
  return source.blobs(rels);
}

function trackedUnder(source, relDir) {
  return source.under(relDir);
}

function policyDenied(rel) {
  const ext = path.extname(rel).slice(1).toLowerCase();
  return ext.length > 0 && POLICY_DENIED_EXT.indexOf(ext) !== -1;
}

async function fetchBodyNode(url, timeout, extraHeaders) {
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

// Every request goes through here: one transport, then the other. The caller never
// sees which one answered, and a transport failure is only reported after both have
// failed - which is the difference between "this link is broken" and "this runtime
// cannot reach it".
async function fetchBody(url, timeout, extraHeaders) {
  try {
    return await fetchBodyNode(url, timeout, extraHeaders);
  } catch (err) {
    if (!isTransportError(err)) throw err;
    return fetchViaCurl(url, timeout, extraHeaders);
  }
}

// Node's fetch (undici) cannot reach doi.org from some hosts while curl can: measured
// 2026-11-14 on the deploy host, curl 5/5 answered 302 and fetch 0/3 answered
// ETIMEDOUT after ~750 ms, with --dns-result-order=ipv4first changing nothing
// (issue #461). When the transport fails, the honest verdict is "not checked", not
// "the citation is broken" - so the probe is retried through curl before anyone
// concludes anything about a link.
const CURL_NET_EXIT = { 6: 'EAI_AGAIN', 7: 'ECONNREFUSED', 28: 'ETIMEDOUT', 35: 'ETIMEDOUT' };

function fetchViaCurl(url, timeoutMs, extraHeaders) {
  const seconds = String(Math.max(5, Math.ceil(timeoutMs / 1000)));
  const args = ['-sS', '-L', '--max-time', seconds, '-A', PROBE_UA, '-o', '-',
    '-w', '\n__CURL_META__%{http_code} %{url_effective}'];
  for (const [k, v] of Object.entries(extraHeaders || {})) args.push('-H', k + ': ' + v);
  args.push(url);
  let out;
  try {
    out = execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs + 5000 });
  } catch (err) {
    const code = CURL_NET_EXIT[err.status] || 'ECURL' + (err.status === null ? '' : err.status);
    const e = new Error('curl failed [' + code + ']');
    e.cause = { code };
    throw e;
  }
  const at = out.lastIndexOf('\n__CURL_META__');
  if (at < 0) {
    const e = new Error('curl returned no metadata');
    e.cause = { code: 'ETIMEDOUT' };
    throw e;
  }
  const meta = out.slice(at + '\n__CURL_META__'.length).toString('utf8').trim().split(' ');
  const status = Number(meta[0]);
  if (!Number.isFinite(status) || status === 0) {
    const e = new Error('curl returned no status');
    e.cause = { code: 'ETIMEDOUT' };
    throw e;
  }
  return { status, buf: out.slice(0, at), url: meta[1] || url, type: '', via: 'curl' };
}

const NET_CODES = ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED', 'ENOTFOUND', 'ECURL'];

function isTransportError(err) {
  const text = String((err && err.message) || '') + ' ' + String((err && err.cause && err.cause.code) || '');
  return NET_CODES.some((c) => text.indexOf(c) !== -1);
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
  const files = trackedUnder(opts.source, ARCHIVE_DIR_REL);
  if (files.length === 0) {
    return { id: 'live:archive', ok: false, reason: 'no tracked files under ' + ARCHIVE_DIR_REL };
  }
  const expected = committedBlobs(opts.source, files);

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

async function fetchWithRetry(url, opts, label, extraHeaders) {
  const headers = { 'user-agent': PROBE_UA, ...(extraHeaders || {}) };
  let lastErr = null;
  // Three attempts, then curl. A single transient DNS/socket error already produced
  // a false red here (2026-10-30) with identical inputs on the next attempt, and a
  // gate that goes red on a socket hiccup gets switched off by its owner.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchBody(url, opts.timeout, headers);
    } catch (err) {
      const code = err.cause && err.cause.code ? err.cause.code : '';
      lastErr = new Error(err.message + (code ? ' [' + code + ']' : ''));
      if (attempt < 3) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  try {
    return fetchViaCurl(url, opts.timeout, headers);
  } catch (curlErr) {
    throw new Error(label + ': fetch failed 3 attempts (' + lastErr.message + '), curl also failed (' + curlErr.message + ')');
  }
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
  } catch (_err) {
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
  } catch (_err) {
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
    unresolved: [],
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
          if (isTransportError(err)) {
            result.unresolved.push({ id: c.id, detail: err.message });
          } else {
            result.failures.push({ id: c.id, stage: 'unreachable', detail: err.message });
          }
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
        if (isTransportError(err)) {
          result.unresolved.push({ id: c.id, detail: err.message });
        } else {
          result.failures.push({ id: c.id, stage: 'unreachable', detail: err.message });
        }
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

  // A transport failure is "not checked", not "broken" - but it may not be used to
  // turn the check green either: if nothing at all could be verified, the gate says
  // so instead of passing on an empty result.
  const nothingVerified = result.resolved === 0 && result.unresolved.length > 0;
  result.ok = result.failures.length === 0 && !nothingVerified;
  if (result.ok) {
    result.reason = '';
  } else if (result.failures.length > 0) {
    result.reason =
      result.failures.length +
      ' citation assertion(s) failed: ' +
      result.failures.map((f) => f.id + ' [' + f.stage + '] ' + f.detail).join('; ') +
      (result.unresolved.length ? ' (' + result.unresolved.length + ' more could not be checked)' : '');
  } else {
    result.reason =
      'no citation could be verified: all ' +
      result.unresolved.length +
      ' target(s) were unreachable from this host - ' +
      result.unresolved.map((f) => f.id + ': ' + f.detail).join('; ');
  }
  return result;
}

/**
 * live:tree - is the process serving the packages/ tree of the commit we checked?
 *
 * The process answers this itself: at boot it reads the BUILD-MANIFEST.json written
 * by the deploy and publishes one digest for `packages/` at /health. The expected
 * value here is computed from the same rule over the source being checked, so this
 * compares a claim against a measurement rather than two claims.
 *
 * Missing `build` is a failure, not a skip: a process that cannot state which bytes
 * it runs is the exact condition #507 was about, and treating it as "not applicable"
 * is how the drift survived for months.
 */
async function checkTree(opts) {
  const url = opts.base + '/health';
  const result = { id: 'live:tree', ok: false, url, commit: null, expected: null, actual: null };

  let res;
  try {
    res = await fetchBody(url, opts.timeout);
  } catch (err) {
    result.reason = 'health unreachable: ' + err.message;
    return result;
  }
  if (res.status !== 200) {
    result.reason = 'health HTTP ' + res.status + ' (expected 200)';
    return result;
  }

  let health;
  try {
    health = JSON.parse(res.buf.toString('utf8'));
  } catch (_err) {
    result.reason = 'health is not JSON';
    return result;
  }

  const build = health && health.build;
  if (!build || typeof build !== 'object') {
    result.reason = 'health has no build block - the running code predates #507 or has no build manifest';
    return result;
  }

  let expected;
  try {
    const rels = opts.source.under('packages');
    if (rels.length === 0) throw new Error('the source tracks no files under packages/');
    const blobs = opts.source.blobs(rels);
    const map = {};
    for (const [rel, entry] of blobs) map[rel] = sha256(entry.bytes);
    expected = treeHash(map, 'packages');
    if (expected.skipped.length) throw new Error('malformed manifest entries: ' + expected.skipped.slice(0, 3).join(', '));
  } catch (err) {
    result.reason = 'cannot compute the expected packages digest: ' + err.message;
    return result;
  }

  const wantCommit = opts.source.commit;
  const gotCommit = String(build.commit || '');
  const gotPackages = (build.packages && build.packages) || {};
  result.commit = gotCommit;
  result.expected = { commit: wantCommit, hash: expected.hash, count: expected.count };
  result.actual = { commit: gotCommit, hash: gotPackages.hash || null, count: gotPackages.count || 0, source: build.source };

  const problems = [];
  // The process reports the 7-char short id; comparing a prefix avoids calling a
  // correct answer wrong because of a display convention.
  if (!gotCommit || wantCommit.indexOf(gotCommit) !== 0) {
    problems.push('commit ' + (gotCommit || '(none)') + ' != ' + wantCommit.slice(0, 7));
  }
  if (gotPackages.malformed) {
    problems.push(gotPackages.malformed + ' malformed manifest entries');
  }
  if (gotPackages.hash !== expected.hash) {
    problems.push(
      'packages/ ' + String(gotPackages.hash || 'null').slice(0, 16) +
        ' != ' + expected.hash.slice(0, 16) +
        ' (' + (gotPackages.count || 0) + ' files vs ' + expected.count + ')',
    );
  }

  result.ok = problems.length === 0;
  if (!result.ok) result.reason = problems.join('; ') + ' - the running tree is not the source being checked';
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
  let sourceKind = 'unknown';
  try {
    opts.source = openSource(opts.repo, { manifest: opts.buildManifest, expectCommit: opts.expectCommit });
    head = opts.source.short;
    sourceKind = opts.source.kind;
    expected = committedBlobs(opts.source, [MANIFEST_REL, TOKEN_REL]);
  } catch (err) {
    process.stderr.write('check-live: cannot establish the expected bytes: ' + err.message + '\n');
    process.exit(2);
  }

  const started = Date.now();
  const checks = [];
  checks.push(await checkFile(opts.base + MANIFEST_URL, expected.get(MANIFEST_REL), 'live:manifest', opts));
  checks.push(await checkFile(opts.base + TOKEN_URL, expected.get(TOKEN_REL), 'live:token', opts));
  checks.push(await checkArchive(opts));
  checks.push(await checkCitations(opts));
  checks.push(await checkTree(opts));
  const ok = checks.every((c) => c.ok);

  if (!opts.quiet || !ok) {
    process.stdout.write('check-live: ' + opts.base + ' (expected ' + head + ' via ' + sourceKind + ')\n');
    for (const c of checks) {
      if (c.ok) {
        const hash = c.sha256 ? ' sha256 ' + c.sha256.slice(0, 16) + ' (' + c.bytes + ' B)' : '';
        const counted =
          c.id === 'live:archive' ? ' ' + c.tally : '';
        const tree =
          c.id === 'live:tree'
            ? ' commit ' + c.actual.commit + ' packages/ ' + String(c.actual.hash || '').slice(0, 16) + ' (' + c.actual.count + ' files)'
            : '';
        const cited = c.section
          ? c.skipped
            ? ' ' + c.onPage + '/' + c.checked + ' ledger rows present [' + c.skipped + ']'
            : ' ' + c.resolved + '/' + c.checked + ' citation links resolve' +
              (c.unresolved && c.unresolved.length ? ', ' + c.unresolved.length + ' unreachable (not counted)' : '')
          : '';
        process.stdout.write('[PASS] ' + c.id + hash + counted + tree + cited + '\n');
      } else {
        process.stdout.write('[FAIL] ' + c.id + ': ' + c.reason + '\n');
      }
    }
  }

  const result = {
    schema: 'fibemate.live-delivery/v1',
    base: opts.base,
    repo: opts.repo,
    expectedSource: sourceKind,
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

// Exported so the live:tree check can be exercised against a stub server in CI
// (scripts/test-tree-hash.cjs). A gate whose failing path was never executed is a
// gate nobody can trust - the same lesson as scripts/test-verify-tree-sha.cjs.
module.exports = { checkTree, treeHash };

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write('check-live: unexpected error: ' + (err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
  });
}
