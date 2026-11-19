#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Decide whether the CodeQL analysis counts as a pass.
//
// The ruleset treats `skipped` and `neutral` as satisfied, so a required `Analyze (...)`
// context turns green whenever the job stops running -- a paths filter, a job-level `if`,
// a removed matrix entry. That is the one failure mode a required check must not have, and
// it is why the required context is a separate job that reads the analyze result instead of
// the analyze job itself (#582).
//
// This script owns the verdict so that the verdict can be tested. The workflow only passes
// ${{ needs.analyze.result }} to it.
'use strict';

const PASS = 'success';

const REASONS = {
  skipped:
    'the analysis job did not run; a check that stops running cannot be distinguished from a clean scan',
  cancelled: 'the analysis job was cancelled; there is no scan result to gate on',
  failure: 'the analysis job failed',
};

function verdict(result) {
  const r = String(result == null ? '' : result).trim();
  if (r === PASS) return { ok: true, why: 'the analysis ran and completed' };
  return { ok: false, why: REASONS[r] || 'unrecognised result "' + r + '"' };
}

const SELF_TESTS = [
  ['success', 0],
  ['skipped', 1],
  ['cancelled', 1],
  ['failure', 1],
  ['neutral', 1],
  ['', 1],
];

function main(argv) {
  const v = verdict(argv[0]);
  console.log('analyze result: ' + (String(argv[0] || '').trim() || '<empty>'));
  console.log((v.ok ? 'OK: ' : 'FAIL: ') + v.why);
  return v.ok ? 0 : 1;
}

function selfTest() {
  let pass = 0;
  for (const [input, want] of SELF_TESTS) {
    const got = verdict(input).ok ? 0 : 1;
    const ok = got === want;
    if (ok) pass += 1;
    console.log(
      (ok ? 'PASS' : 'FAIL') + ' self-test ' + JSON.stringify(input) + ' -> exit ' + got + ' (want ' + want + ')'
    );
  }
  console.log(pass + '/' + SELF_TESTS.length + ' self-test cases behaved as expected');
  return pass === SELF_TESTS.length ? 0 : 1;
}

if (require.main === module) {
  if (process.argv[2] === '--self-test') process.exit(selfTest());
  process.exit(main(process.argv.slice(2)));
}

module.exports = { verdict };
