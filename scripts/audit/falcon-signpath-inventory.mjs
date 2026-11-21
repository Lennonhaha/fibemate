// SPDX-License-Identifier: Apache-2.0
/**
 * Inventory of the Falcon *signing* path in the third-party implementation this repo calls.
 *
 * Why: `docs/research/falcon-sidechannel-threat-model.md` T2 ("floating-point FFT") asks for a
 * branch-by-branch audit with file and line numbers. A prose claim is not an audit, and a number
 * nobody can re-run is a liability, so this script re-derives the audit's two quantitative claims
 * from the installed package:
 *
 *   1. every array index used on the signing path — the claim is that none of them is derived
 *      from a coefficient value, only from loop counters, the degree and public constants;
 *   2. every branch on the signing path — the claim is that the conditions are build-time
 *      options, the degree, malformed-key checks, or the deliberately non-constant-time sampler.
 *
 * It prints, it does not judge. The judgement lives in the threat model, next to the line numbers.
 *
 * Usage:
 *   node scripts/audit/falcon-signpath-inventory.mjs [--json]
 *
 * Reads `node_modules/@noble/post-quantum/falcon.js` and
 * `node_modules/@noble/curves/abstract/fft.js`, so run it after `npm ci`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PKG = 'node_modules/@noble/post-quantum';
const DEPS = 'node_modules/@noble/curves/abstract';

/**
 * Line ranges that make up the signing path. The ranges are hand-picked and therefore the first
 * thing to re-check when the upstream file changes: they are pinned to falcon.js 0.7.1 (2,473
 * lines). If the file's line count or hash moves, this script says so instead of silently
 * auditing the wrong region.
 */
const RANGES = [
  ['getFloatPoly (FFT wrapper, iFFT scaling)', 1092, 1135],
  ['ldlFFT (the only secret-derived division)', 1155, 1172],
  ['completePrivate (integer NTT before the FFT)', 1736, 1765],
  ['FFSampler (gaussian0 / berExp / samplerZ / split / merge / Gram / ffsampRec)', 1780, 2125],
  ['signRaw (retry loop)', 2128, 2215],
];

const EXPECT = {
  falcon: {
    bytes: 132669,
    lines: 2472,
    sha256: '0db64ec731a1bd98215b7d43bf8ce74101202354752904b2e7a703cf9276368e',
  },
  fft: { lines: 567, sha256: 'b3ad080004e7d6db3839fef60de78ec12847ff508bd6a44c7e58c4658e5202b3' },
};

const COND = /^\s*(if|while|for)\s*\(|^\s*\}\s*else|^\s*else\s*\{/;

function load(rel) {
  const p = join(ROOT, rel);
  const buf = readFileSync(p);
  return {
    path: rel,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    lines: buf.toString('utf8').split('\n'),
  };
}

function conditions(file) {
  const rows = [];
  for (const [name, a, b] of RANGES) {
    const inRange = [];
    for (let i = a - 1; i < b && i < file.lines.length; i++) {
      if (COND.test(file.lines[i])) inRange.push({ line: i + 1, text: file.lines[i].trim() });
    }
    rows.push({ name, from: a, to: b, count: inRange.length, sites: inRange });
  }
  return rows;
}

function indexes(file) {
  // `X[expr]`, skipping string literals and comment prose (the ranges contain both).
  const seen = new Map();
  for (const [, a, b] of RANGES) {
    for (let i = a - 1; i < b && i < file.lines.length; i++) {
      const line = file.lines[i];
      if (/^\s*(\*|\/\/|const\s+\[|let\s+\[|return\s+\[)/.test(line)) continue; // prose and destructuring
      const re = /([A-Za-z_$][\w$.]*|\])\s*\[([^\]\n]{1,40})\]/g;
      let m;
      while ((m = re.exec(line))) {
        const expr = m[2].trim();
        if (/^['"]/.test(expr) || /[^\x00-\x7f]/.test(expr)) continue; // prose / non-ASCII comments
        if (expr.startsWith('{') || /^[a-z]\s*,\s*[a-z]/.test(expr)) continue; // object literal / destructuring
        if (!seen.has(expr)) seen.set(expr, []);
        seen.get(expr).push(i + 1);
      }
    }
  }
  const exprs = [...seen.keys()].sort();
  const tokens = new Set();
  for (const e of exprs) for (const t of e.match(/[A-Za-z_$][\w$]*/g) || []) tokens.add(t);
  return { exprs: exprs.map((e) => ({ expr: e, lines: seen.get(e) })), tokens: [...tokens].sort() };
}

/** Identifiers that would indicate an index derived from polynomial/coefficient data. */
const DATA_NAMES = ['f', 'g', 'F', 'G', 'b00', 'b01', 'b10', 'b11', 'g00', 'g01', 'g11', 't0', 't1', 's2', 'hm'];

const falcon = load(`${PKG}/falcon.js`);
const fft = load(`${DEPS}/fft.js`);
const conds = conditions(falcon);
const idx = indexes(falcon);
const dataTokens = idx.tokens.filter((t) => DATA_NAMES.includes(t));

const report = {
  package: JSON.parse(readFileSync(join(ROOT, PKG, 'package.json'), 'utf8')).version,
  falcon: { path: falcon.path, bytes: falcon.bytes, lines: falcon.lines.length - 1, sha256: falcon.sha256 },
  fft: { path: fft.path, bytes: fft.bytes, lines: fft.lines.length - 1, sha256: fft.sha256 },
  ranges: conds.map((r) => ({ name: r.name, from: r.from, to: r.to, conditions: r.count })),
  conditionsTotal: conds.reduce((n, r) => n + r.count, 0),
  indexExpressions: idx.exprs.length,
  indexTokens: idx.tokens,
  indexTokensThatLookLikeData: dataTokens,
  drift: {
    bytes: falcon.bytes !== EXPECT.falcon.bytes,
    lines: falcon.lines.length - 1 !== EXPECT.falcon.lines,
    sha256: falcon.sha256 !== EXPECT.falcon.sha256,
    fftLines: fft.lines.length - 1 !== EXPECT.fft.lines,
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`@noble/post-quantum ${report.package}`);
  console.log(`  falcon.js  ${report.falcon.bytes} B  ${report.falcon.lines} lines  sha256 ${report.falcon.sha256.slice(0, 16)}…`);
  console.log(`  fft.js     ${report.fft.bytes} B  ${report.fft.lines} lines  sha256 ${report.fft.sha256.slice(0, 16)}…`);
  const drifted = Object.entries(report.drift).filter(([, v]) => v).map(([k]) => k);
  console.log(`  pinned identity: ${drifted.length ? 'DRIFT ' + drifted.join(',') : 'unchanged'}`);
  console.log('');
  for (const r of conds) {
    console.log(`  ${String(r.count).padStart(2)} conditions  ${r.from}-${r.to}  ${r.name}`);
    for (const s of r.sites) console.log(`        ${String(s.line).padStart(5)}  ${s.text.slice(0, 96)}`);
  }
  console.log(`  ${report.conditionsTotal} conditions total`);
  console.log('');
  console.log(`  ${report.indexExpressions} distinct index expressions`);
  for (const e of idx.exprs) console.log(`        [${e.expr}]  x${e.lines.length}  first ${e.lines[0]}`);
  console.log(`  tokens inside indices: ${report.indexTokens.join(' ')}`);
  console.log(
    `  tokens that look like polynomial data: ${dataTokens.length ? dataTokens.join(',') + ' (INSPECT)' : 'none'}`
  );
}

process.exit(report.drift.sha256 || report.drift.lines ? 1 : 0);
