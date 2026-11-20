#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Guard for the deployment workflows (issue #617).
//
// A workflow cannot be trusted to police itself by reading its own prose, so the
// question is answered structurally: does the file contain a string that can start
// a write, and does it carry the DRY_RUN latch every step checks?
//
// Two modes, and the difference is the whole point:
//   default        no write marker may appear at all (day 1 and day 2 workflows).
//   --allow-intent write markers may appear only inside strings that are printed:
//                  an echo/printf, or a comment. The same words outside quotes, or
//                  behind a shell that would run them, are still a violation.
//                  One narrow exception: the deployer itself may be *executed* only
//                  with --dry-run on the same line, never with --apply.
// Day 3 is the first workflow that has to *name* the deployer without publishing,
// so "the words are text, not a command" has to be checkable rather than promised.
//
// --self-test proves both directions, including that intent mode still rejects a
// real invocation.
//
// exit 0 clean | 1 violation | 2 usage

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Strings that can only be there on purpose. Deliberately not exhaustive: the point
// is that a step reaching the host to change it would have to say one of these words.
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

// Intent mode needs three more things to be true, or printing a command is just a
// promise that this particular file happens not to be the one that runs it.
const INTENT_REQUIRED = ['--dry-run', '"$DRY_RUN" != "true"', 'environment: production'];

const OTHER_TRIGGERS = ['push:', 'pull_request:', 'schedule:', 'workflow_run:', 'release:'];

// The only marker-free reading of a line: strip what an echo prints, then ask
// whether a marker survived outside the quotes.
function inertLine(line) {
  if (/^\s*#/.test(line)) return true;
  const printer = /(?:^|[\s;|&(])(?:echo|printf)\s/.exec(line);
  if (!printer) return false;
  const rest = line.slice(0, printer.index) + line.slice(printer.index).replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return !WRITE_MARKERS.some((m) => rest.includes(m));
}

function inspect(text, opts) {
  const intent = Boolean(opts && opts.allowIntent);
  const problems = [];
  for (const marker of WRITE_MARKERS) {
    if (!text.includes(marker)) continue;
    if (!intent) {
      problems.push('contains write marker: ' + marker);
      continue;
    }
    // The deployer may be run for real only as a preview: --dry-run on the same
    // line, and no --apply anywhere on it. That is how day 3 proves the argument
    // parser works without giving the workflow a way to publish.
    const previewOk = (l) => marker === 'deploy-release' && l.includes('--dry-run') && !l.includes('--apply');
    const offenders = text.split('\n').filter((l) => l.includes(marker) && !inertLine(l) && !previewOk(l));
    if (offenders.length) {
      problems.push('write marker outside a printed string or a dry-run preview: ' + marker + ' -> ' + offenders[0].trim().slice(0, 100));
    }
  }
  for (const need of REQUIRED) {
    if (!text.includes(need)) problems.push('missing required latch: ' + need);
  }
  if (intent) {
    for (const need of INTENT_REQUIRED) {
      if (!text.includes(need)) problems.push('missing intent requirement: ' + need);
    }
    const onBlock = /^on:\s*$([\s\S]*?)^[a-zA-Z]/m.exec(text);
    const on = onBlock ? onBlock[1] : text;
    for (const t of OTHER_TRIGGERS) {
      if (new RegExp('^\\s{2}' + t.replace(':', '\\s*:'), 'm').test(on)) {
        problems.push('intent workflow may only be workflow_dispatch, found trigger: ' + t);
      }
    }
  }
  return problems;
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dryrun-guard-'));
  const base = 'name: x\non:\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    env:\n      DRY_RUN: "true"\n';
  const intentBase =
    'name: x\non:\n  workflow_dispatch:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    environment: production\n    env:\n      DRY_RUN: "true"\n    steps:\n' +
    '      - run: |\n          if [ "$DRY_RUN" != "true" ]; then echo no; exit 1; fi\n          bash scripts/deploy-release.sh --sha x --dry-run\n';
  const cases = [
    { name: 'clean file passes', body: base, wantExit: 0 },
    { name: 'workflow without workflow_dispatch is rejected', body: 'name: x\non:\n  push:\njobs:\n  a:\n    env:\n      DRY_RUN: "true"\n', wantExit: 1 },
    { name: 'a release call is rejected', body: 'on:\n  workflow_dispatch:\nDRY_RUN: "true"\nrun: bash scripts/deploy-release.sh\n', wantExit: 1 },
    { name: 'an apply flag is rejected', body: 'on:\n  workflow_dispatch:\nDRY_RUN: "true"\nrun: x --apply\n', wantExit: 1 },
    { name: 'a missing latch is rejected', body: 'on:\n  workflow_dispatch:\nrun: echo hi\n', wantExit: 1 },
    // intent mode
    { name: 'intent: a dry-run preview of the real script passes', body: intentBase, wantExit: 0, allowIntent: true },
    { name: 'intent: a named deployer inside echo passes', body: intentBase.replace('bash scripts/deploy-release.sh', 'echo "bash scripts/deploy-release.sh --apply"'), wantExit: 0, allowIntent: true },
    { name: 'intent: a real invocation is still rejected', body: intentBase.replace('--dry-run', '--apply'), allowIntent: true, wantExit: 1 },
    { name: 'intent: dry-run and apply on one line is rejected', body: intentBase.replace('--sha x --dry-run', '--sha x --dry-run --apply'), allowIntent: true, wantExit: 1 },
    { name: 'intent: a marker outside the quotes is rejected', body: intentBase.replace('bash scripts/deploy-release.sh --sha x --dry-run', 'echo "x"; --apply'), allowIntent: true, wantExit: 1 },
    { name: 'intent: a comment passes', body: intentBase.replace('bash scripts/deploy-release.sh', '# never call deploy-release.sh'), wantExit: 0, allowIntent: true },
  ];

  let failed = 0;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const p = path.join(dir, 'case' + i + '.yml');
    fs.writeFileSync(p, c.body, 'utf8');
    const problems = inspect(fs.readFileSync(p, 'utf8'), { allowIntent: Boolean(c.allowIntent) });
    const got = problems.length ? 1 : 0;
    const ok = got === c.wantExit;
    if (!ok) failed++;
    console.log((ok ? 'PASS ' : 'FAIL ') + c.name + (ok ? '' : ' (wanted exit ' + c.wantExit + ', got ' + got + ')'));
    if (problems.length && ok) console.log('     ' + problems.join('; '));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('self-test: ' + (cases.length - failed) + '/' + cases.length + ' behaved');
  return failed === 0 ? 0 : 1;
}

function main(argv) {
  const args = argv.slice(2);
  const i = args.indexOf('--file');
  const file = i !== -1 ? args[i + 1] : null;
  const allowIntent = args.includes('--allow-intent');

  if (args.includes('--self-test')) return selfTest();
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: check-dry-run-guard.cjs --file <workflow.yml> [--allow-intent] | --self-test');
    return 0;
  }
  if (!file) {
    console.error('usage: check-dry-run-guard.cjs --file <workflow.yml> [--allow-intent] | --self-test');
    return 2;
  }
  if (!fs.existsSync(file)) {
    console.error('no such file: ' + file);
    return 2;
  }

  const problems = inspect(fs.readFileSync(file, 'utf8'), { allowIntent });
  if (problems.length) {
    for (const p of problems) console.error('VIOLATION ' + file + ': ' + p);
    return 1;
  }
  console.log('OK ' + file + (allowIntent ? ' names the deployer only in printed strings' : ' can only read') + ': no executed write marker, DRY_RUN latch present');
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { inspect, inertLine, WRITE_MARKERS, REQUIRED, INTENT_REQUIRED };
