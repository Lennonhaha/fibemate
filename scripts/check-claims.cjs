#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// check-claims.cjs — guard the public-facing wording rules written down in
// docs/pre-release-claims.md §三 (机械核).
//
// Currently enforced rule:
//   R1  the OpenSSF programme must not be spelled "CII / BP" (mixed abbreviation);
//       write "CII Best Practices" instead.
//
// Scope: www/ and README.md — the pages and readme a visitor actually reads.
// Skipped on purpose:
//   - www/docs/tsa/**  frozen timestamp archives; evidence snapshots are not
//     editable copy, and rewriting them would invalidate the TSR trail.
//   - files above MAX_BYTES (vendored bundles) and binary files.
//
// Rules R2 (absolute wording) and R4 (first-party wording) are deliberately NOT
// automated: their matches include honest copy ("不保证绝对安全", "自研 core 未接入")
// and a naive regex would fail the build on true statements.
//
// Usage: node scripts/check-claims.cjs      (exit 0 = clean, exit 1 = violations)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAX_BYTES = 2 * 1024 * 1024;
const SKIP_REL_DIRS = [path.join('www', 'docs', 'tsa')];

const RULES = [
  {
    id: 'R1',
    what: '混写「CII / BP」',
    re: /CII\s*\/\s*BP/,
    hint: '改写为 “CII Best Practices”（见 docs/pre-release-claims.md §三 R1）',
  },
];

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function skipped(dir) {
  const r = rel(dir);
  return SKIP_REL_DIRS.some((s) => r === s || r.startsWith(s + '/'));
}

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'node_modules') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!skipped(p)) yield* walk(p);
    } else if (ent.isFile()) {
      yield p;
    }
  }
}

function isText(buf) {
  const head = buf.subarray(0, 8192);
  return !head.includes(0);
}

function main() {
  const targets = [path.join(ROOT, 'README.md')];
  const www = path.join(ROOT, 'www');
  if (fs.existsSync(www)) targets.push(...walk(www));

  let scanned = 0;
  let skippedBig = 0;
  let skippedBin = 0;
  const hits = [];

  for (const file of targets) {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch (err) {
      console.error(`[claims] cannot read ${rel(file)}: ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    if (buf.length > MAX_BYTES) {
      skippedBig += 1;
      continue;
    }
    if (!isText(buf)) {
      skippedBin += 1;
      continue;
    }
    scanned += 1;
    const lines = buf.toString('utf8').split('\n');
    for (const rule of RULES) {
      lines.forEach((line, i) => {
        if (rule.re.test(line)) {
          hits.push({ rule, file: rel(file), line: i + 1, text: line.trim().slice(0, 120) });
        }
      });
    }
  }

  console.log(`[claims] scanned ${scanned} text files under www/ + README.md`);
  if (skippedBig || skippedBin) {
    console.log(`[claims] skipped ${skippedBig} oversized, ${skippedBin} binary`);
  }

  if (hits.length === 0) {
    console.log('[claims] OK — no violations');
    return;
  }

  console.error(`[claims] ${hits.length} violation(s):`);
  for (const h of hits) {
    console.error(`  ${h.rule.id} ${h.file}:${h.line}  ${h.text}`);
    console.error(`       -> ${h.rule.hint}`);
  }
  process.exitCode = 1;
}

main();
