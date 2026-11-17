#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE contributors
//
// Keep the public TSR numbers equal to the canonical counter.
//
// Why this exists: the site quoted 372 files / 261 "unique tokens" / 111 copies
// for two weeks after the tree said otherwise, and the README quoted 261 tokens
// that were really basenames. Each number was typed by hand, at a different time,
// from a different definition. scripts/count-tsr.cjs fixed the vocabulary; this
// gate stops the copy from drifting away from it again.
//
// What it checks (public copy only):
//   "<N> 份 ... .tsr"      -> files
//   "<N> 个不同 basename"   -> basenames
//   "<N> 个 lg-NNN 令牌"    -> tokens
//   "<N> 份为逐字节副本"     -> duplicates
//
// Usage: node scripts/check-tsr-copy.cjs [--json]
// Exit:  0 consistent, 1 drift found, 2 cannot measure.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const json = process.argv.includes('--json');

const counter = JSON.parse(
  execFileSync(process.execPath, [path.join(root, 'scripts', 'count-tsr.cjs'), '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);

// Public copy, not archives and not historical change logs.
const TARGETS = [
  'README.md',
  'PRINCIPLES.md',
  'docs/ENGINEERING-DISCIPLINE.md',
  'docs/tsr-count.md',
  'www/index.html',
  'www/blog.html',
  'www/security.html',
  'www/docs/index.html',
  'www/docs/architecture.html',
  'www/docs/crypto-time-ledger.html',
  'www/docs/nist-csf-gap.html',
  'www/docs/PQC_MIGRATION_PLAN.md',
  'www/docs/INCIDENT_RESPONSE_PLAN.md',
];

const RULES = [
  { name: 'files', re: /(\d+)\s*份[^。\n]{0,16}\.tsr/g, expect: counter.files },
  { name: 'files-en', re: /(\d+)\s+tracked\s+\.tsr\s+files/gi, expect: counter.files },
  { name: 'basenames', re: /(\d+)\s*个\s*不同\s*basename/g, expect: counter.basenames },
  { name: 'basenames-en', re: /(\d+)\s+distinct\s+basenames/gi, expect: counter.basenames },
  { name: 'tokens', re: /(\d+)\s*个\s*lg-NNN\s*令牌/g, expect: counter.tokens },
  { name: 'tokens-en', re: /(\d+)\s+lg-NNN\s+tokens/gi, expect: counter.tokens },
  { name: 'duplicates', re: /(\d+)\s*份为逐字节副本/g, expect: counter.duplicates },
];

const findings = [];
let checkedLines = 0;
let exemptLines = 0;

// A quoted historical claim is evidence, not copy. Lines carrying this marker are
// skipped, and the count is printed so the exemption cannot grow silently.
const EXEMPT = 'tsr-count-exempt';

for (const rel of TARGETS) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    findings.push({ file: rel, line: 0, rule: 'missing-file', found: '-', expected: 'present' });
    continue;
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    checkedLines += 1;
    if (line.includes(EXEMPT)) {
      exemptLines += 1;
      return;
    }
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        const found = Number(m[1]);
        if (found !== rule.expect) {
          findings.push({
            file: rel,
            line: i + 1,
            rule: rule.name,
            found,
            expected: rule.expect,
            text: line.trim().slice(0, 160),
          });
        }
      }
    }
  });
}

if (json) {
  console.log(JSON.stringify({ counter, checkedLines, exemptLines, findings }, null, 2));
} else if (findings.length === 0) {
  console.log(
    `OK: ${TARGETS.length} public files, ${checkedLines} lines (${exemptLines} exempt), numbers match ` +
      `files=${counter.files} basenames=${counter.basenames} tokens=${counter.tokens} duplicates=${counter.duplicates}`,
  );
} else {
  console.error(`DRIFT: ${findings.length} mismatch(es) against scripts/count-tsr.cjs`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line} [${f.rule}] found ${f.found}, expected ${f.expected}`);
    if (f.text) console.error(`      ${f.text}`);
  }
  console.error('Rule: run node scripts/count-tsr.cjs, paste its output, keep the unit.');
}

process.exit(findings.length === 0 ? 0 : 1);
