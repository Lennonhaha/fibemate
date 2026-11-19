#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Structural check on .github/workflows/codeql.yml: the gate that #582 asks for must exist,
// must be wired to the analyze result, and must run even when the matrix does not.
//
// Every rule here corresponds to a way the gate can be quietly turned into decoration:
//   - the job removed or renamed      -> nothing reports, or the context name changes
//   - `needs: analyze` dropped        -> `needs.analyze.result` evaluates empty
//   - `if: always()` dropped          -> a failed matrix skips the gate and the required
//                                        check never reports (blocked, not green -- still
//                                        a broken merge path)
//   - the verdict script not invoked  -> the step can echo anything and still exit 0
//   - a `paths:` filter added         -> on docs-only PRs the whole workflow is skipped,
//                                        which is exactly what the summary job exists to
//                                        make impossible
'use strict';

const fs = require('fs');
const path = require('path');

const WORKFLOW = path.join(__dirname, '..', '.github', 'workflows', 'codeql.yml');
const GATE_JOB = 'codeql-gate';

// The gate's own block: from "  codeql-gate:" to the next top-level job key.
function gateBlock(text) {
  const start = text.search(new RegExp('^  ' + GATE_JOB + ':\\s*$', 'm'));
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const next = rest.search(/^ {2}[A-Za-z0-9_-]+:\s*$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

const RULES = [
  {
    id: 'gate-job-exists',
    why: 'without the job there is no context to require, and the analyze matrix keeps reporting a conclusion that satisfies the ruleset',
    test: (s) => gateBlock(s) !== null,
    expect: 'a job named ' + GATE_JOB + ' in codeql.yml',
  },
  {
    id: 'gate-needs-analyze',
    why: 'needs.analyze.result is empty without the edge, so the verdict would read an empty string',
    test: (s) => {
      const b = gateBlock(s);
      return b !== null && /^\s+needs:\s*(\[[^\]]*\banalyze\b[^\]]*\]|\banalyze\b)\s*$/m.test(b);
    },
    expect: 'the gate job to declare needs: analyze',
  },
  {
    id: 'gate-always-runs',
    why: 'if: always() is what makes the gate report when the matrix fails or is skipped',
    test: (s) => {
      const b = gateBlock(s);
      return b !== null && /^\s+if:\s*always\(\)\s*$/m.test(b);
    },
    expect: 'if: always() on the gate job',
  },
  {
    id: 'gate-invokes-verdict',
    why: 'a step that does not run the tested verdict can print anything and still exit 0',
    test: (s) => {
      const b = gateBlock(s);
      if (b === null) return false;
      return /node scripts\/codeql-gate\.cjs/.test(b) && /needs\.analyze\.result/.test(b);
    },
    expect: 'the gate step to pass needs.analyze.result to scripts/codeql-gate.cjs',
  },
  {
    id: 'no-paths-filter',
    why: 'a paths filter skips the whole workflow, so a docs-only pull request never reports the gate',
    test: (s) => !/^\s+paths(-ignore)?:/m.test(s),
    expect: 'no paths / paths-ignore filter anywhere in codeql.yml',
  },
];

function findings(text) {
  return RULES.filter((r) => !r.test(text));
}

function report(text, label) {
  const bad = findings(text);
  for (const r of bad) {
    console.log('MISSING ' + r.id + ': expected ' + r.expect);
    console.log('  reason: ' + r.why);
  }
  console.log(
    (bad.length ? 'FAIL' : 'OK') +
      ': ' + (RULES.length - bad.length) + '/' + RULES.length +
      ' codeql gate rules hold' + (label ? ' (' + label + ')' : '')
  );
  return bad.length;
}

function selfTest() {
  const real = fs.readFileSync(WORKFLOW, 'utf8');
  const cases = [
    ['baseline', real, 0],
    ['no needs edge', real.replace(/^(\s+)needs:\s*analyze\s*$/m, '$1needs: []'), 1],
    ['no always()', real.replace(/^(\s+)if:\s*always\(\)\s*$/m, '$1if: success()'), 1],
    ['verdict not invoked', real.replace(/node scripts\/codeql-gate\.cjs/g, 'echo gate-skipped'), 1],
    [
      'paths filter added',
      real.replace(/( {2}pull_request:\n {4}branches: \[main\])/, '$1\n    paths:\n      - "**.js"'),
      1,
    ],
  ];
  let pass = 0;
  for (const [name, text, want] of cases) {
    const got = findings(text).length;
    const ok = got === want;
    if (ok) pass += 1;
    console.log((ok ? 'PASS' : 'FAIL') + ' self-test ' + name + ': expected ' + want + ' missing, got ' + got);
  }
  console.log(pass + '/' + cases.length + ' self-test cases behaved as expected');
  return pass === cases.length ? 0 : 1;
}

const arg = process.argv[2];
if (arg === '--self-test') process.exit(selfTest());
if (arg && arg !== '--check') {
  console.log('usage: node scripts/test-codeql-gate.cjs [--check|--self-test]');
  process.exit(2);
}
if (!fs.existsSync(WORKFLOW)) {
  console.log('FAIL: workflow not found at ' + WORKFLOW + ' -- refusing to report success');
  process.exit(2);
}
process.exit(report(fs.readFileSync(WORKFLOW, 'utf8'), 'codeql.yml') ? 1 : 0);
