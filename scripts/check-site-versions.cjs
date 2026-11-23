#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// check-site-versions.cjs - fail when www/ advertises a package version that the
// registry does not publish any more (or never published).
//
// Why: on 2026-11-23 /tools/ still said `cbom-tools@0.3.1` and
// `fibemate-xdiff@0.1.0` hours after 0.3.2 and 0.1.1 were published. Every other
// gate was green, because `www/**` is excluded from verifact's scan (mirror
// copies of docs live there) - so `drift 0` was structurally incapable of
// noticing. This script reads the page that visitors read and the registry that
// they install from, and compares them by name.
//
// Usage:
//   node scripts/check-site-versions.cjs                       # local www/ page
//   node scripts/check-site-versions.cjs --url https://fibemate.net/tools/
//   node scripts/check-site-versions.cjs --file www/tools/index.html
//   node scripts/check-site-versions.cjs --no-cache --verbose
//   node scripts/check-site-versions.cjs --selftest            # no network
//
// Exit codes (a green run means "checked, and every checked package matched"):
//   0  every package on the page matches its registry's latest
//   1  at least one MISMATCH - printed by name, page value and registry value
//   2  usage or parse problem, including "parsed 0 packages" (never a pass)
//   3  ADVISORY: the page was fine but a registry could not be reached, so the
//      comparison did not happen. Distinct from 0 on purpose: an unreachable
//      registry must never render as green.
//
// Network is optional: `--selftest` needs none, and a cached answer younger than
// --cache-ttl (default 6h) is reused without a request.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILE = path.join(REPO_ROOT, 'www', 'tools', 'index.html');
const DEFAULT_CACHE = path.join(os.homedir(), '.cache', 'fibemate', 'site-versions.json');
const NPM_REGISTRY = 'https://registry.npmjs.org';
const PYPI_REGISTRY = 'https://pypi.org/pypi';

function parseArgs(argv) {
  const opts = {
    file: DEFAULT_FILE,
    url: null,
    cache: DEFAULT_CACHE,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    noCache: false,
    selftest: false,
    verbose: false,
    timeoutMs: 15000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') opts.file = path.resolve(argv[++i]);
    else if (a === '--url') opts.url = argv[++i];
    else if (a === '--cache') opts.cache = path.resolve(argv[++i]);
    else if (a === '--cache-ttl') opts.cacheTtlMs = Number(argv[++i]) * 1000;
    else if (a === '--no-cache') opts.noCache = true;
    else if (a === '--selftest') opts.selftest = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--timeout') opts.timeoutMs = Number(argv[++i]) * 1000;
    else if (a === '-h' || a === '--help') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(22, 36).join('\n'));
      process.exit(0);
    } else {
      console.error('unknown argument: ' + a);
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.cacheTtlMs) || opts.cacheTtlMs < 0) {
    console.error('--cache-ttl must be a non-negative number of seconds');
    process.exit(2);
  }
  return opts;
}

// One page block looks like:
//   <p class="meta">npm <code>verifact@0.2.5</code> · Node.js · <a ...>源码</a></p>
//   <p class="meta">PyPI <code>crypto-time-machine@0.1.2</code> · Python · ...</p>
// Only `name@x.y.z` inside <code> counts; prose that happens to mention a version
// is deliberately ignored, because this gate is about what a visitor is told to
// install.
const TOKEN = /^(@[^/@\s]+\/[^@\s]+|[A-Za-z0-9._-]+)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

function extractVersions(html, sourceLabel) {
  const found = [];
  const blocks = html.split('<p class="meta">').slice(1);
  for (const raw of blocks) {
    const block = raw.split('</p>')[0];
    let registry = null;
    if (/\bPyPI\b/.test(block)) registry = 'pypi';
    else if (/\bnpm\b/.test(block)) registry = 'npm';
    if (!registry) continue;
    const codes = [...block.matchAll(/<code>([^<]+)<\/code>/g)].map((m) => m[1].trim());
    for (const code of codes) {
      const m = TOKEN.exec(code);
      if (!m) continue;
      found.push({ pkg: m[1], version: m[2], registry, source: sourceLabel });
    }
  }
  return found;
}

function fetchJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { headers: { 'user-agent': 'fibemate-site-version-gate/1.0 (+https://fibemate.net)' }, timeout: timeoutMs },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          res.resume();
          resolve(fetchJson(res.headers.location, timeoutMs));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          resolve({ ok: false, error: 'HTTP ' + res.statusCode });
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve({ ok: true, json: JSON.parse(body) }); }
          catch (e) { resolve({ ok: false, error: 'invalid JSON: ' + e.message }); }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout after ' + timeoutMs + 'ms' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
  });
}

function fetchText(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'user-agent': 'Mozilla/5.0 (site-version-gate)' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        res.resume();
        resolve(fetchText(res.headers.location, timeoutMs));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, error: 'HTTP ' + res.statusCode }); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ ok: true, text: body }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout after ' + timeoutMs + 'ms' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
  });
}

function readCache(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}

function writeCache(file, data) {
  // Not os.tmpdir(): a predictable path in a world-writable directory is a
  // symlink target, and CodeQL is right to call that an insecure temporary
  // file. A private directory under the user's home, created 0700 and written
  // 0600, has no such property. Still best effort - a cache miss is not an error.
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch (e) { /* cache is best effort */ }
}

async function latestVersion(entry, opts, cache) {
  const key = entry.registry + ':' + entry.pkg;
  const cached = cache[key];
  if (!opts.noCache && cached && Date.now() - cached.at < opts.cacheTtlMs) {
    return { ok: true, version: cached.version, cached: true };
  }
  // encodeURIComponent escapes the scope marker in `@scope/name`; the registry
  // accepts either form, but leave the leading @ alone so the URL a human reads
  // in --verbose matches the package name. split/join instead of replace()
  // because replace() with a string argument only touches the first match.
  const npmPath = encodeURIComponent(entry.pkg).split('%40').join('@');
  const url = entry.registry === 'pypi'
    ? PYPI_REGISTRY + '/' + encodeURIComponent(entry.pkg) + '/json'
    : NPM_REGISTRY + '/' + npmPath;
  const res = await fetchJson(url, opts.timeoutMs);
  if (!res.ok) return { ok: false, error: res.error };
  let version;
  if (entry.registry === 'pypi') version = res.json && res.json.info && res.json.info.version;
  else version = res.json && res.json['dist-tags'] && res.json['dist-tags'].latest;
  if (!version) return { ok: false, error: 'no latest/dist-tag in registry response' };
  cache[key] = { version, at: Date.now() };
  return { ok: true, version, cached: false };
}

async function runCompare(entries, opts, fetcher) {
  const cache = opts.noCache ? {} : readCache(opts.cache);
  const rows = [];
  for (const entry of entries) {
    const got = fetcher
      ? await fetcher(entry)
      : await latestVersion(entry, opts, cache);
    if (!got.ok) rows.push({ state: 'unknown', entry, error: got.error });
    else if (got.version === entry.version) rows.push({ state: 'pass', entry, registry: got.version, cached: got.cached });
    else rows.push({ state: 'mismatch', entry, registry: got.version });
  }
  if (!opts.noCache && !fetcher) writeCache(opts.cache, cache);
  return rows;
}

function report(rows, opts) {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  let pass = 0, mismatch = 0, unknown = 0;
  for (const r of rows) {
    const left = pad(r.entry.pkg, 30) + pad(r.entry.registry, 6);
    if (r.state === 'pass') {
      pass++;
      console.log('PASS      ' + left + 'page=' + r.entry.version + '  registry=' + r.registry + (r.cached ? '  (cache)' : ''));
    } else if (r.state === 'mismatch') {
      mismatch++;
      console.log('MISMATCH  ' + left + 'page=' + r.entry.version + '  registry=' + r.registry + '   <- ' + r.entry.source);
    } else {
      unknown++;
      console.log('ADVISORY  ' + left + 'page=' + r.entry.version + '  registry lookup failed: ' + r.error);
    }
  }
  console.log('');
  console.log('summary: checked=' + rows.length + ' pass=' + pass + ' mismatch=' + mismatch + ' unknown=' + unknown);
  if (mismatch > 0) {
    console.log('FAIL: the page advertises a version the registry does not call latest. Fix the page, or say why the pin is deliberate.');
    return 1;
  }
  if (unknown > 0) {
    console.log('ADVISORY (not a pass): at least one registry was unreachable, so those packages were not compared.');
    return 3;
  }
  if (rows.length === 0) {
    console.log('FAIL: parsed 0 packages - the gate checked nothing, so it cannot be green.');
    return 2;
  }
  return 0;
}

// ---- selftest: proves the gate goes red on an old version, without network ----

async function selftest() {
  const cases = [];
  const page = (pkg, ver, reg) => '<p class="meta">' + (reg === 'pypi' ? 'PyPI' : 'npm') + ' <code>' + pkg + '@' + ver + '</code> · Node.js</p>';
  const fixed = (map) => async (entry) => {
    const v = map[entry.pkg];
    return v ? { ok: true, version: v } : { ok: false, error: 'ENOTFOUND (fixture)' };
  };

  // 1. RED: page says 0.3.1, registry says 0.3.2
  let rows = await runCompare(extractVersions(page('cbom-tools', '0.3.1', 'npm'), 'fixture-red'), { noCache: true }, fixed({ 'cbom-tools': '0.3.2' }));
  let code = report(rows, {});
  cases.push({ name: 'old version must be red', expect: 1, got: code, ok: code === 1, expectName: rows[0] && rows[0].state === 'mismatch' && rows[0].registry === '0.3.2' });

  // 2. GREEN: control group - same input, matching version
  console.log('');
  rows = await runCompare(extractVersions(page('cbom-tools', '0.3.2', 'npm'), 'fixture-green'), { noCache: true }, fixed({ 'cbom-tools': '0.3.2' }));
  code = report(rows, {});
  cases.push({ name: 'matching version must be green', expect: 0, got: code, ok: code === 0 });

  // 3. ADVISORY: unreachable registry must not read as green
  console.log('');
  rows = await runCompare(extractVersions(page('cbom-tools', '0.3.2', 'npm'), 'fixture-netfail'), { noCache: true }, fixed({}));
  code = report(rows, {});
  cases.push({ name: 'unreachable registry must be 3, never 0', expect: 3, got: code, ok: code === 3 });

  // 4. ZERO COVERAGE: a page with no version tokens may not exit 0
  console.log('');
  rows = await runCompare(extractVersions('<p>no packages here</p>', 'fixture-empty'), { noCache: true }, fixed({}));
  code = report(rows, {});
  cases.push({ name: 'parsed 0 packages must be 2, never 0', expect: 2, got: code, ok: code === 2 });

  // 5. PyPI path and a scoped npm name still parse
  console.log('');
  const mixed = extractVersions(page('crypto-time-machine', '0.1.2', 'pypi') + page('@scope/pkg', '1.4.0', 'npm'), 'fixture-parse');
  cases.push({
    name: 'parse: pypi + scoped package',
    expect: 'pypi:crypto-time-machine=0.1.2,npm:@scope/pkg=1.4.0',
    got: mixed.map((m) => m.registry + ':' + m.pkg + '=' + m.version).join(','),
    ok: mixed.length === 2 && mixed[0].registry === 'pypi' && mixed[1].pkg === '@scope/pkg',
  });

  console.log('');
  let bad = 0;
  for (const c of cases) {
    if (c.ok) console.log('SELFTEST PASS  ' + c.name);
    else { bad++; console.log('SELFTEST FAIL  ' + c.name + '  expected ' + c.expect + ', got ' + c.got); }
  }
  console.log('');
  console.log('selftest: ' + (cases.length - bad) + '/' + cases.length + ' as expected');
  return bad === 0 ? 0 : 1;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selftest) process.exit(await selftest());

  let html, label;
  if (opts.url) {
    const res = await fetchText(opts.url, opts.timeoutMs);
    if (!res.ok) {
      console.log('ADVISORY: could not read ' + opts.url + ': ' + res.error);
      console.log('summary: checked=0 pass=0 mismatch=0 unknown=1');
      process.exit(3);
    }
    html = res.text;
    label = opts.url;
  } else {
    if (!fs.existsSync(opts.file)) {
      console.log('FAIL: page not found: ' + opts.file);
      process.exit(2);
    }
    html = fs.readFileSync(opts.file, 'utf8');
    label = path.relative(REPO_ROOT, opts.file).replace(/\\/g, '/');
  }

  const entries = extractVersions(html, label);
  if (opts.verbose) console.log('parsed ' + entries.length + ' package(s) from ' + label);
  const rows = await runCompare(entries, opts);
  process.exit(report(rows, opts));
}

main();
