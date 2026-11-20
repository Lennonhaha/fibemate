#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Guard for the read-only deployment dry-run workflow (issue #617, day 1).
//
// A workflow cannot be trusted to police itself by reading its own prose, so the
// question is answered structurally: does the file contain any string that can
// start a write, and does it carry the DRY_RUN latch every step checks?
//
// --self-test proves both directions: a clean file passes, four broken files fail.
//
// exit 0 clean | 1 violation | 2 usage

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Strings that can only be there on purpose. Deliberately not exhaustive: the
// point is that a step reaching the host to change it would have to say one of
// these words, and the day-1 key is restricted to a single cat on the host.
const WRITE_MARKERS = [
  'deploy-release',
  '--apply',
  'sudo ',
  'rsync ',
  'systemctl ',
  'pm2 restart',
  'npm publish',
  'git push',
];

const REQUIRED = ['workflow_dispatch:', 'DRY_RUN: "true"'];

function inspect(text) {
  const problems = [];
  for (const marker of WRITE_MARKERS) {
    if (text.includes(marker)) problems.push('contains write marker: ' + marker);
  }
  for (const need of REQUIRED) {
    if (!text.includes(need)) problems.push('missing required latch: ' + need);
  }
  return problems;
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dryrun-guard-'));
  const cases = [
    {
      name: 'clean file passes',
      body: 'name: x\non:\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    env:\n      DRY_RUN: "true"\n',
      wantExit: 0,
    },
    {
      name: 'workflow without workflow_dispatch is rejected',
      body: 'name: x\non:\n  push:\njobs:\n  a:\n    env:\n      DRY_RUN: "true"\n',
      wantExit: 1,
    },
    {
      name: 'a release call is rejected',
      body: 'on:\n  workflow_dispatch:\nDRY_RUN: "true"\nrun: bash scripts/deploy-release.sh\n',
      wantExit: 1,
    },
    {
      name: 'an apply flag is rejected',
      body: 'on:\n  workflow_dispatch:\nDRY_RUN: "true"\nrun: x --apply\n',
      wantExit: 1,
    },
    {
      name: 'a missing latch is rejected',
      body: 'on:\n  workflow_dispatch:\nrun: echo hi\n',
      wantExit: 1,
    },
  ];

  let failed = 0;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const p = path.join(dir, 'case' + i + '.yml');
    fs.writeFileSync(p, c.body, 'utf8');
    const problems = inspect(fs.readFileSync(p, 'utf8'));
    const got = problems.length ? 1 : 0;
    const ok = got === c.wantExit;
    if (!ok) failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + c.name + (ok ? '' : ' (wanted exit ' + c.wantExit + ', got ' + got + ')'));
    if (problems.length) console.log('     ' + problems.join('; '));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('self-test: ' + (cases.length - failed) + '/' + cases.length + ' behaved');
  return failed === 0 ? 0 : 1;
}

function main(argv) {
  const args = argv.slice(2);
  const i = args.indexOf('--file');
  const file = i !== -1 ? args[i + 1] : null;

  if (args.includes('--self-test')) return selfTest();
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: check-dry-run-guard.cjs --file <workflow.yml> | --self-test');
    return 0;
  }
  if (!file) {
    console.error('usage: check-dry-run-guard.cjs --file <workflow.yml> | --self-test');
    return 2;
  }
  if (!fs.existsSync(file)) {
    console.error('no such file: ' + file);
    return 2;
  }

  const problems = inspect(fs.readFileSync(file, 'utf8'));
  if (problems.length) {
    for (const p of problems) console.error('VIOLATION ' + file + ': ' + p);
    return 1;
  }
  console.log('OK ' + file + ' can only read: no write marker, DRY_RUN latch present');
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { inspect, WRITE_MARKERS, REQUIRED };
