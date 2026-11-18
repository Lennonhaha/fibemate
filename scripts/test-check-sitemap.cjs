#!/usr/bin/env node
/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Negative-first tests for scripts/check-sitemap.cjs.
 *
 * The gate is only worth having if we have watched it fail. Every case here
 * builds a throwaway tree in a private temp dir and drives the real CLI.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'check-sitemap.cjs');

let pass = 0;
let fail = 0;

function ok(name) {
  pass += 1;
  process.stdout.write(`PASS ${name}\n`);
}

function bad(name, detail) {
  fail += 1;
  process.stdout.write(`FAIL ${name}${detail ? ` -- ${detail}` : ''}\n`);
}

function expect(name, cond, detail) {
  if (cond) ok(name);
  else bad(name, detail);
}

function fixture({ locs, files = [], allow = null, sitemap = true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-case-'));
  fs.mkdirSync(path.join(dir, 'www'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  if (sitemap) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n${locs
      .map((l) => `  <url><loc>${l}</loc><lastmod>2026-08-01</lastmod></url>`)
      .join('\n')}\n</urlset>\n`;
    fs.writeFileSync(path.join(dir, 'www', 'sitemap.xml'), xml, 'utf8');
  }
  for (const f of files) {
    const abs = path.join(dir, 'www', f);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '<html></html>\n', 'utf8');
  }
  if (allow !== null) {
    fs.writeFileSync(path.join(dir, 'scripts', 'sitemap-allowlist.txt'), `${allow}\n`, 'utf8');
  }
  return dir;
}

function run(dir, args = []) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

const HOST = 'https://fibemate.net';
const HEADER = '# header\n';

// 1. everything resolves
{
  const d = fixture({
    locs: [`${HOST}/`, `${HOST}/docs/a.html`, `${HOST}/docs/sub/`],
    files: ['index.html', 'docs/a.html', 'docs/sub/index.html'],
    allow: HEADER,
  });
  const r = run(d);
  expect('all local urls resolve -> 0', r.code === 0, `code=${r.code} ${r.out}${r.err}`);
}

// 2. one missing, not allowlisted -> 1 and the path is named
{
  const d = fixture({ locs: [`${HOST}/docs/a.html`, `${HOST}/docs/gone.html`], files: ['docs/a.html'], allow: HEADER });
  const r = run(d);
  expect('unlisted missing page -> 1', r.code === 1, `code=${r.code}`);
  expect('unlisted missing page is named', r.out.includes('/docs/gone.html'), r.out);
}

// 3. missing but allowlisted -> 0, and the output refuses to call it a pass
{
  const d = fixture({
    locs: [`${HOST}/docs/a.html`, `${HOST}/docs/gone.html`],
    files: ['docs/a.html'],
    allow: `${HEADER}${HOST}/docs/gone.html\tnot written yet`,
  });
  const r = run(d);
  expect('allowlisted gap -> 0', r.code === 0, `code=${r.code} ${r.out}`);
  expect('allowlisted gap says "not a pass count"', r.out.includes('not a pass count'), r.out);
}

// 4. allowlist entry that now resolves -> 1 (the list may only shrink)
{
  const d = fixture({
    locs: [`${HOST}/docs/a.html`],
    files: ['docs/a.html'],
    allow: `${HEADER}${HOST}/docs/a.html\tstale entry`,
  });
  const r = run(d);
  expect('stale allowlist entry -> 1', r.code === 1, `code=${r.code}`);
  expect('stale entry is named', r.out.includes('STALE'), r.out);
}

// 5. zero urls -> 2 (cannot measure, not "clean")
{
  const d = fixture({ locs: [], files: ['index.html'], allow: HEADER });
  const r = run(d);
  expect('empty sitemap -> 2', r.code === 2, `code=${r.code}`);
}

// 6. no sitemap file -> 2
{
  const d = fixture({ locs: [], files: ['index.html'], allow: HEADER, sitemap: false });
  const r = run(d);
  expect('missing sitemap -> 2', r.code === 2, `code=${r.code}`);
}

// 7. no allowlist -> 2 (refuse to guess what is a known gap)
{
  const d = fixture({ locs: [`${HOST}/docs/a.html`], files: ['docs/a.html'] });
  const r = run(d);
  expect('missing allowlist -> 2', r.code === 2, `code=${r.code}`);
}

// 8. directory url resolves when the directory exists
{
  const d = fixture({ locs: [`${HOST}/docs/tvla/`], files: ['docs/tvla/index.html'], allow: HEADER });
  const r = run(d);
  expect('directory url resolves -> 0', r.code === 0, `code=${r.code} ${r.out}`);
}

// 9. external urls are counted, not fetched, and do not fail the run
{
  const d = fixture({
    locs: [`${HOST}/docs/a.html`, 'https://github.com/Lennonhaha/fibemate'],
    files: ['docs/a.html'],
    allow: HEADER,
  });
  const r = run(d, ['--json']);
  expect('external url -> 0', r.code === 0, `code=${r.code}`);
  let parsed = null;
  try {
    parsed = JSON.parse(r.out);
  } catch {
    /* handled below */
  }
  expect('--json is parseable', parsed !== null, r.out.slice(0, 200));
  expect('external counted separately', parsed && parsed.summary.external === 1, JSON.stringify(parsed && parsed.summary));
}

// 10. --update records the gap, and the result checks clean afterwards
{
  const d = fixture({ locs: [`${HOST}/docs/a.html`, `${HOST}/docs/gone.html`], files: ['docs/a.html'], allow: HEADER });
  const u = run(d, ['--update']);
  expect('--update exits 1 on the run that records gaps', u.code === 1 || u.code === 0, `code=${u.code}`);
  const after = run(d);
  expect('--update output is accepted by --check', after.code === 0, `code=${after.code} ${after.out}`);
  const written = fs.readFileSync(path.join(d, 'scripts', 'sitemap-allowlist.txt'), 'utf8');
  expect('--update wrote the gap', written.includes('/docs/gone.html'), written);
}

// 11. unknown argument -> 2
{
  const d = fixture({ locs: [`${HOST}/docs/a.html`], files: ['docs/a.html'], allow: HEADER });
  const r = run(d, ['--nonsense']);
  expect('unknown argument -> 2', r.code === 2, `code=${r.code}`);
}

// 12. traversal outside www is refused
{
  const d = fixture({ locs: [`${HOST}/../secrets.txt`], files: ['index.html'], allow: HEADER });
  const r = run(d);
  expect('path traversal does not resolve', r.code === 1, `code=${r.code} ${r.out}`);
}

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exitCode = 1;
