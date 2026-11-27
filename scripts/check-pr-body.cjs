#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Required sections in a PR description: three headings, case-insensitive, each
// with at least one non-empty body line. An empty template is not evidence.
'use strict';
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('usage: check-pr-body.cjs <body.md>'); process.exit(2); }
const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const required = ['Action', 'Evidence', 'Delta'];
const missing = [];
for (const name of required) {
  const re = new RegExp('^#{1,3}\\s*' + name + '\\s*$', 'im');
  const m = text.match(re);
  if (!m) { missing.push(name + ' (heading absent)'); continue; }
  const after = text.slice(m.index + m[0].length);
  const next = after.search(/^#{1,3}\s/m);
  const body = (next === -1 ? after : after.slice(0, next)).trim();
  if (body.length < 3 || /^(_?no response_?|n\/a|tbd)$/i.test(body)) missing.push(name + ' (empty)');
}
if (missing.length) {
  console.error('PR description is missing required sections:');
  for (const m of missing) console.error('  - ' + m);
  console.error('Fill Action / Evidence / Delta. Evidence must be a command, run URL, or file path.');
  process.exit(1);
}
console.log('PR body gate: Action / Evidence / Delta present.');
