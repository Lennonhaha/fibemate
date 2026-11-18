#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Offline check: every local URL advertised in www/sitemap.xml must resolve to
 * something that exists in www/.
 *
 * Why this exists: the sitemap advertised four pages that were never in the
 * tree (they are not in git history either), so search engines kept fetching
 * 404s. Nothing noticed, because the only link step in CI ended in "|| true".
 *
 * Rules:
 *   - local locs (fibemate.net / www.fibemate.net) map to a path under www/
 *   - a path resolves if the file exists, or a directory exists (nginx serves
 *     directory indexes for some paths)
 *   - a missing path is a failure UNLESS it is listed in the allowlist
 *   - an allowlist entry that now resolves is also a failure: the list can only
 *     shrink, never quietly stay stale
 *   - an allowlist entry for a url the sitemap no longer advertises is also a
 *     failure: it would linger forever and look like a tracked gap
 *
 * The allowlist is a list of named gaps, not a pass count. The output says so.
 *
 * Exit codes: 0 clean, 1 drift, 2 cannot measure.
 *
 * Usage:
 *   node scripts/check-sitemap.cjs [--root .] [--json] [--update]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LOCAL_HOSTS = new Set(['fibemate.net', 'www.fibemate.net']);

function parseArgs(argv) {
  const opts = { root: '.', json: false, update: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') {
      opts.root = argv[i + 1];
      i += 1;
    } else if (a === '--json') {
      opts.json = true;
    } else if (a === '--update') {
      opts.update = true;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else {
      opts.bad = a;
    }
  }
  return opts;
}

function readAllowlist(p) {
  const text = fs.readFileSync(p, 'utf8');
  const entries = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [loc, ...rest] = line.split('\t');
    if (!loc) continue;
    entries.set(loc.trim(), rest.join('\t').trim());
  }
  return entries;
}

function locs(sitemapXml) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let m;
  while ((m = re.exec(sitemapXml)) !== null) out.push(m[1]);
  return out;
}

function toLocalPath(loc) {
  let url;
  try {
    url = new URL(loc);
  } catch {
    return { kind: 'unparseable', loc };
  }
  if (!LOCAL_HOSTS.has(url.hostname)) return { kind: 'external', loc, host: url.hostname };
  let p = decodeURIComponent(url.pathname);
  if (p === '') p = '/';
  return { kind: 'local', loc, path: p };
}

function resolves(wwwRoot, p) {
  const rel = p.replace(/^\/+/, '');
  const abs = path.join(wwwRoot, rel);
  if (rel === '') return fs.existsSync(path.join(wwwRoot, 'index.html')) || fs.existsSync(wwwRoot);
  if (!abs.startsWith(path.resolve(wwwRoot))) return false;
  if (!fs.existsSync(abs)) return false;
  return true;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write('usage: node scripts/check-sitemap.cjs [--root .] [--json] [--update]\n');
    return 0;
  }
  if (opts.bad) {
    process.stderr.write(`check-sitemap: unknown argument ${opts.bad}\n`);
    return 2;
  }

  const root = path.resolve(opts.root);
  const sitemapPath = path.join(root, 'www', 'sitemap.xml');
  const allowPath = path.join(root, 'scripts', 'sitemap-allowlist.txt');
  const wwwRoot = path.join(root, 'www');

  if (!fs.existsSync(sitemapPath)) {
    process.stderr.write(`check-sitemap: no sitemap at ${sitemapPath} - cannot measure\n`);
    return 2;
  }
  if (!fs.existsSync(wwwRoot)) {
    process.stderr.write(`check-sitemap: no www root at ${wwwRoot} - cannot measure\n`);
    return 2;
  }

  const all = locs(fs.readFileSync(sitemapPath, 'utf8'));
  if (all.length === 0) {
    process.stderr.write('check-sitemap: sitemap lists zero urls - cannot measure\n');
    return 2;
  }

  let allow = new Map();
  if (opts.update) {
    allow = fs.existsSync(allowPath) ? readAllowlist(allowPath) : new Map();
  } else {
    if (!fs.existsSync(allowPath)) {
      process.stderr.write(`check-sitemap: no allowlist at ${allowPath} - cannot measure\n`);
      return 2;
    }
    allow = readAllowlist(allowPath);
  }

  const missing = [];
  const stale = [];
  let localCount = 0;
  let externalCount = 0;

  for (const loc of all) {
    const r = toLocalPath(loc);
    if (r.kind === 'external') {
      externalCount += 1;
      continue;
    }
    if (r.kind === 'unparseable') {
      missing.push({ loc, path: null, why: 'unparseable url' });
      continue;
    }
    localCount += 1;
    if (!resolves(wwwRoot, r.path)) missing.push({ loc, path: r.path });
  }

  for (const [loc] of allow) {
    const r = toLocalPath(loc);
    if (r.kind === 'local' && resolves(wwwRoot, r.path)) stale.push(loc);
  }

  const advertised = new Set(all);
  const orphans = [];
  for (const [loc] of allow) {
    if (!advertised.has(loc)) orphans.push(loc);
  }

  if (opts.update) {
    const header = [
      '# Known gaps: urls advertised in www/sitemap.xml that do not resolve in www/.',
      '# This is a list of named gaps, not a pass count. It may only shrink.',
      '# Remove an entry once the page exists; the checker fails if an entry resolves.',
      '# path\twhy-it-is-still-here',
    ].join('\n');
    const body = missing
      .map((m) => `${m.loc}\t${m.path ? 'page not in www/ (never committed)' : m.why}`)
      .sort()
      .join('\n');
    fs.writeFileSync(allowPath, `${header}\n${body}\n`, 'utf8');
  }

  const unlisted = missing.filter((m) => !allow.has(m.loc));
  const drift = unlisted.length > 0 || stale.length > 0 || orphans.length > 0;

  const summary = {
    urls: all.length,
    local: localCount,
    external: externalCount,
    missing: missing.length,
    allowlisted: missing.filter((m) => allow.has(m.loc)).length,
    unlisted: unlisted.length,
    stale: stale.length,
    orphan: orphans.length,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ summary, unlisted, stale, orphans, allowlist: [...allow.keys()] }, null, 2)}\n`);
  } else {
    process.stdout.write(
      `sitemap: ${summary.urls} urls (local ${summary.local}, external ${summary.external}); ` +
        `missing ${summary.missing}, allowlisted ${summary.allowlisted} known gaps (not a pass count), ` +
        `unlisted ${summary.unlisted}, stale entries ${summary.stale}, orphan entries ${summary.orphan}\n`,
    );
    for (const m of unlisted) process.stdout.write(`  UNLISTED  ${m.loc}\n`);
    for (const s of stale) process.stdout.write(`  STALE     ${s} (now resolves; drop it from the allowlist)\n`);
    for (const o of orphans) process.stdout.write(`  ORPHAN    ${o} (not advertised in the sitemap; drop it from the allowlist)\n`);
    if (summary.allowlisted > 0 && !drift) {
      process.stdout.write('  note: the advertised pages above are missing and named in the allowlist;\n');
      process.stdout.write('        they are still 404s until the pages exist or the sitemap drops them.\n');
    }
  }

  if (drift) return 1;
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { parseArgs, locs, toLocalPath, resolves, readAllowlist };
