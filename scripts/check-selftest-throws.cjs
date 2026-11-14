#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// scripts/check-selftest-throws.cjs
//
// Gate for discipline item N1 (self-tests must be able to fail).
//
// Background: packages/fml-dsa/src/core/verify.js printed
// "❌ verify: self-tests FAILED" and then returned normally. CI stayed green for
// months while the module's own tests were failing. Four sibling modules were
// fixed on 2026-11-14 (encode, reduce, keygen, sign); verify was missed because
// the fix was done file by file instead of by rule. This script is the rule.
//
// Rule: any file under packages/*/src/ that prints a FAIL/failure verdict from a
// self-test must also contain a `throw` in that same file. A file that can only
// print is a file that cannot fail a build.
//
// Exit codes: 0 = clean, 1 = at least one offender, 2 = usage/IO error.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));

// A line that reports a self-test failure. Deliberately narrow: `console.log`
// with PASS is fine, so is a throw. Only "print a failure and keep going" is a bug.
const FAIL_LINE = /console\s*\.\s*(?:error|log|warn)\s*\([^)]*(?:FAIL(?:ED)?|self-?tests?\s+failed)/i;
const THROW_ANY = /\bthrow\b/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(p, out);
    } else if (e.isFile() && p.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

function packageSrcDirs() {
  const pkgs = path.join(ROOT, 'packages');
  return fs
    .readdirSync(pkgs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(pkgs, e.name, 'src'))
    .filter((d) => fs.existsSync(d));
}

function main() {
  const offenders = [];
  let scanned = 0;

  for (const dir of packageSrcDirs()) {
    for (const file of walk(dir)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch (e) {
        console.error(`SELFTEST GATE: cannot read ${rel}: ${e.message}`);
        return 2;
      }
      scanned++;
      const hits = [];
      text.split('\n').forEach((line, i) => {
        if (FAIL_LINE.test(line) && !THROW_ANY.test(line)) hits.push(i + 1);
      });
      if (hits.length === 0) continue;
      if (THROW_ANY.test(text)) continue; // the file can fail the build somewhere
      offenders.push({ rel, hits });
    }
  }

  if (offenders.length === 0) {
    console.log(`SELFTEST GATE: PASS (${scanned} files scanned, 0 offenders)`);
    return 0;
  }

  console.error('SELFTEST GATE: FAIL');
  for (const o of offenders) {
    console.error(`  ${o.rel}: prints a failure verdict without any throw (line ${o.hits.join(', ')})`);
  }
  console.error('  A self-test that only prints cannot fail the build. Replace the console.error with throw.');
  return 1;
}

process.exit(main());
