#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// find-ctrl-chars.cjs — scan tracked text files for ASCII control chars (except \t \n \r)
// Control chars (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) are classic GBK-misdecode / corruption markers.
const { execSync } = require('child_process');
const fs = require('fs');

const PATTERN = /\.(js|mjs|cjs|ts|tsx|html|htm|md|json|css|scss|ya?ml|toml|py|rs|sh|ps1|sql|vue|txt|tcl|xml)$/i;

// Legit: \f (0x0C) is a standard IETF RFC page-break separator in draft-*.txt files.
const ALLOW_FF_IN = /^ietf\//;

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(f => f && PATTERN.test(f));

let bad = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const b = fs.readFileSync(f);
  const hits = [];
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) {
      if (c === 0x0c && ALLOW_FF_IN.test(f)) continue; // RFC form-feed is legit
      hits.push('0x' + c.toString(16).padStart(2, '0') + '@' + i);
    }
  }
  if (hits.length) {
    bad++;
    console.log(f + ' : ' + hits.join(', '));
  }
}

console.log('--- total files with control chars: ' + bad + ' ---');
process.exit(bad ? 1 : 0);
