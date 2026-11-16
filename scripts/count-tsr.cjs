#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE contributors
//
// Canonical counters for the .tsr evidence files (issue #509).
//
// Why this exists: the website and the README have quoted three different
// numbers ("372 份", "261 个唯一令牌", "200+") because each was counted by hand
// at a different time with a different definition. This script fixes the
// vocabulary, so any number that reaches a document can be reproduced:
//
//   files    git-tracked *.tsr paths                 <- "N 份 .tsr 存证"
//   tokens   distinct `lg-NNN` token in the basename <- "N 个唯一令牌"
//   basenames distinct basenames (dates stripped)    <- de-duplicated view
//
// Usage:
//   node scripts/count-tsr.cjs [--root <dir>] [--json]
//
// Read-only: it only runs `git ls-files`, never writes.

'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const rootFlag = argv.indexOf('--root');
const root = rootFlag >= 0 ? argv[rootFlag + 1] : process.cwd();

function gitFiles() {
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '*.tsr'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    console.error(`count-tsr: git ls-files failed under ${root}: ${err.message}`);
    process.exit(2);
  }
}

const base = (p) => path.basename(p).replace(/\.tsr$/i, '');
const tokenOf = (s) => {
  const m = s.match(/lg[-_]?(\d{1,4})/i);
  return m ? `lg-${m[1]}` : null;
};

const files = gitFiles();
const basenames = files.map(base);
const tokens = basenames.map(tokenOf).filter(Boolean);

const result = {
  root: path.resolve(root),
  files: files.length,
  basenames: new Set(basenames).size,
  tokens: new Set(tokens).size,
  untokened: basenames.filter((b) => !tokenOf(b)).length,
  duplicates: basenames.length - new Set(basenames).size,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log(`root            ${result.root}`);
console.log(`files           ${result.files}   (git ls-files '*.tsr')`);
console.log(`basenames       ${result.basenames}   (distinct, .tsr stripped)`);
console.log(`tokens          ${result.tokens}   (distinct lg-NNN)`);
console.log(`duplicates      ${result.duplicates}   (extra copies sharing a basename)`);
console.log(`without token   ${result.untokened}   (basenames not matching lg-NNN)`);
