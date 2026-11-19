#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * check-measured-date.cjs - the date that qualifies a count must be the date the
 * count was taken.
 *
 * Why: #595 moved every public TSR number to 364 and the copy gate went green,
 * because that gate compares digits. The same sentence still said "measured
 * 2026-11-17" two days later. A number with a stale date is a weaker claim than a
 * number with no date, because the stale one looks checked.
 *
 * Scope, narrowly: a line must (a) make a TSR-count claim and (b) attach a date
 * *to the measurement* - "2026-11-19 实测" or "measured 2026-11-19". The date has
 * to be adjacent to that qualifier. An earlier draft compared every date on any
 * count line and produced four false positives on real files: a "last updated"
 * status line, a TSA issuance date (2026-06-26) sitting beside a live measurement,
 * and the lg-069 audit record date (2026-07-14). Historical facts keep their dates;
 * only the measurement date is policed.
 *
 * Exemptions: a line carrying `tsr-count-exempt:` or `measured-date-exempt:` is
 * skipped, and the number skipped is printed. An uncounted exemption grows quietly.
 *
 * Usage: node scripts/check-measured-date.cjs [--root <dir>]
 * Exit: 0 every dated count is current, 1 at least one is stale, 2 cannot run.
 */

const fs = require('node:fs');
const path = require('node:path');

let root = process.cwd();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--root' && argv[i + 1]) {
    root = path.resolve(argv[i + 1]);
    i += 1;
  }
}

const fail = (code, msg) => {
  console.error(msg);
  process.exit(code);
};

let targets;
try {
  targets = require(path.join(__dirname, 'lib', 'public-targets.cjs'));
} catch (err) {
  fail(2, 'CANNOT RUN: public-targets.cjs not found next to this script');
}

let metrics;
try {
  metrics = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'metrics.json'), 'utf8'));
} catch (err) {
  fail(2, 'CANNOT RUN: docs/metrics.json unreadable: ' + err.message);
}
const updated = metrics && metrics.updated;
if (typeof updated !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(updated)) {
  fail(2, 'CANNOT RUN: docs/metrics.json updated is not YYYY-MM-DD (got ' + JSON.stringify(updated) + ')');
}

// (a) the line talks about the TSR corpus
const COUNT_SHAPES = [
  /\d+\s*\u4efd[^\n]{0,24}(?:\.tsr|\u65f6\u95f4\u6233\u5b58\u8bc1|TSR)/, // "364 份 .tsr" / "364 份 TSR"
  /\d+\s+tracked\s+\.tsr\s+files/,
  /\d+\s+timestamped\s+evidence\s+files/,
  /\d+\s+distinct\s+basenames/,
];

// (b) a date attached to the measurement, not merely present on the line
const MEASURE_SHAPES = [
  { name: 'zh-after', re: /(20\d{2}-\d{2}-\d{2})\s*\u5b9e\u6d4b/g },
  { name: 'en-after', re: /measured\s+(20\d{2}-\d{2}-\d{2})/g },
];

const EXEMPT_RE = /(tsr-count-exempt|measured-date-exempt):/;

let checked = 0;
let exempt = 0;
const stale = [];

for (const rel of targets) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, rel), 'utf8');
  } catch (err) {
    fail(2, 'CANNOT RUN: cannot read ' + rel + ': ' + err.message);
  }
  text.split(/\r?\n/).forEach((line, idx) => {
    if (EXEMPT_RE.test(line)) {
      exempt += 1;
      return;
    }
    if (!COUNT_SHAPES.some((re) => re.test(line))) return;
    let sawMeasure = false;
    for (const shape of MEASURE_SHAPES) {
      shape.re.lastIndex = 0;
      let m;
      while ((m = shape.re.exec(line))) {
        sawMeasure = true;
        if (m[1] !== updated) {
          stale.push({ file: rel, line: idx + 1, date: m[1], shape: shape.name, snippet: line.trim().slice(0, 120) });
        }
      }
    }
    if (sawMeasure) checked += 1;
  });
}

if (stale.length > 0) {
  for (const s of stale) {
    console.error(`STALE_DATE ${s.file}:${s.line} found ${s.date} expected ${updated} [${s.shape}]`);
    console.error(`            ${s.snippet}`);
  }
  console.error(`FAIL: ${stale.length} stale date(s) across ${checked} dated count line(s), ${exempt} exempt`);
  process.exit(1);
}

console.log(`OK: ${checked} dated TSR-count line(s) all say ${updated} (${exempt} exempt, ${targets.length} files)`);
