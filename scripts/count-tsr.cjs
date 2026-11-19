#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE contributors
//
// Canonical counters for the .tsr evidence files (issue #509, extended by #579).
//
// Why this exists: the website and the README have quoted three different
// numbers ("372 个", "261 个唯一令牌", "200+") because each was counted by hand
// at a different time with a different definition. This script fixes the
// vocabulary, so any number that reaches a document can be reproduced:
//
//   raw       git-tracked *.tsr paths                       <- "N 个 .tsr 文件"
//   invalid   files that are not RFC 3161 tokens            <- "N 个不可采"
//   valid     raw - invalid                                 <- "N 份有效证据"
//   tokens    distinct `lg-NNN` token in a basename          <- "N 个唯一令牌"
//   basenames distinct basenames (dates stripped)
//
// `files` is kept as an alias of `raw` because check-tsr-copy.cjs reads it;
// renaming a field silently turned a working gate into one that compared every
// published number against `undefined`.
//
// basenames/tokens/duplicates keep counting every tracked file so that numbers
// already published stay reproducible; `valid` is the only figure that may be
// called evidence. When a document says "N 份认证 / attestations", it must use
// valid.
//
// The invalid classification is by content, not by name: a saved TSA error page
// with a .tsr extension is still not a token (issue #579 recorded ten of them).
// Treating them as attestations inflates every number quoted downstream.
//
// Usage:
//   node scripts/count-tsr.cjs [--root <dir>] [--json] [--list-invalid]
//
// Exit codes: 0 ok, 2 IO/git failure. This script does not fail on invalid files:
// it reports them. The gate that refuses to ship a mismatched number is
// check-tsr-copy.cjs.
//
// Read-only: it only runs `git ls-files`, never writes.

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function gitFiles(root) {
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

// A real RFC 3161 token is DER: it starts with a SEQUENCE tag (0x30). Saving the
// HTTP response body of an error page to a .tsr file keeps the extension and
// loses the token, so extension-only counting is not enough.
function classify(buf) {
  if (!buf || buf.length === 0) return 'empty';
  const head = buf.subarray(0, 512).toString('latin1');
  if (/<!DOCTYPE html|<title>\s*Error!?\s*<\/title>/i.test(head)) return 'html_error_page';
  if (/Bad request format or system error/i.test(head)) return 'tsa_text_error';
  if (buf[0] !== 0x30) return 'not_der';
  if (buf.length < 64) return 'truncated';
  return null; // valid
}

const base = (p) => path.basename(p).replace(/\.tsr$/i, '');
const tokenOf = (s) => {
  const m = s.match(/lg[-_]?(\d{1,4})/i);
  return m ? `lg-${m[1]}` : null;
};

function summarize(root, files) {
  const invalid = [];
  let validCount = 0;
  for (const rel of files) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(root, rel));
    } catch (err) {
      invalid.push({ path: rel, reason: 'unreadable', size: 0, error: err.code || 'ERR' });
      continue;
    }
    const reason = classify(buf);
    if (reason) invalid.push({ path: rel, reason, size: buf.length });
    else validCount++;
  }
  const bases = files.map(base);
  const tokens = bases.map(tokenOf).filter(Boolean);
  return {
    root: path.resolve(root),
    files: files.length, // kept: check-tsr-copy.cjs reads this field
    raw: files.length,
    invalid: invalid.length,
    valid: validCount,
    tokens: new Set(tokens).size,
    basenames: new Set(bases).size,
    untokened: bases.filter((b) => !tokenOf(b)).length,
    duplicates: bases.length - new Set(bases).size,
    invalidFiles: invalid,
  };
}

function main(argv) {
  const asJson = argv.includes('--json');
  const listInvalid = argv.includes('--list-invalid');
  const rootFlag = argv.indexOf('--root');
  const root = rootFlag >= 0 ? argv[rootFlag + 1] : process.cwd();

  const files = gitFiles(root);
  const r = summarize(root, files);

  if (asJson) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  console.log(`root            ${r.root}`);
  console.log(`raw             ${r.raw}   (git ls-files '*.tsr')`);
  console.log(`invalid         ${r.invalid}   (content is not an RFC 3161 token)`);
  console.log(`valid           ${r.valid}   (raw - invalid; the only figure safe to quote)`);
  console.log(`tokens          ${r.tokens}   (distinct lg-NNN)`);
  console.log(`basenames       ${r.basenames}   (distinct, .tsr stripped)`);
  console.log(`duplicates      ${r.duplicates}   (extra copies sharing a basename)`);
  console.log(`without token   ${r.untokened}   (basenames not matching lg-NNN)`);

  if (listInvalid && r.invalidFiles.length) {
    console.log('\ninvalid files');
    for (const f of r.invalidFiles) console.log(`  ${f.reason.padEnd(15)} ${String(f.size).padStart(5)}B ${f.path}`);
  }
}

module.exports = { classify, summarize };

if (require.main === module) main(process.argv.slice(2));
