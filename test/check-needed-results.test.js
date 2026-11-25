#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * The aggregate gate must be able to say no.
 *
 * A gate that only ever prints "everything ran" is decoration. These cases
 * pin the negative direction: cancelled blocks, failure blocks, a skipped
 * MUST_RUN job blocks, while a path-filtered skip is allowed and named.
 *
 * Run: node --test test/check-needed-results.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-needed-results.cjs');

function run(needs) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, NEEDS_JSON: needs === null ? '' : JSON.stringify(needs) },
  });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

test('everything succeeded -> exit 0', () => {
  const r = run({ lint: { result: 'success' }, bench: { result: 'success' }, 'node-test': { result: 'success' } });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /every needed job ran and passed/);
});

test('cancelled blocks, even when it is a job nobody marked required', () => {
  const r = run({ lint: { result: 'success' }, 'node-test': { result: 'cancelled' } });
  assert.equal(r.code, 1, 'a cancelled job must fail the gate');
  assert.match(r.stdout, /BLOCK {2}node-test {2}cancelled/);
  assert.match(r.stdout, /RESULT: 1 job\(s\) did not run or did not pass/);
});

test('failure blocks', () => {
  const r = run({ lint: { result: 'failure' } });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /BLOCK {2}lint {2}failure/);
});

test('timed_out blocks', () => {
  const r = run({ bench: { result: 'timed_out' } });
  assert.equal(r.code, 1);
});

test('a skipped job outside MUST_RUN is allowed but named', () => {
  const r = run({ lint: { result: 'success' }, 'mlkem-kat': { result: 'skipped' } });
  assert.equal(r.code, 0, 'path-filtered skips must not freeze every PR');
  assert.match(r.stdout, /note: path-filtered skip, not a failure: mlkem-kat/);
});

test('a skipped MUST_RUN job blocks', () => {
  const r = run({ lint: { result: 'skipped' }, bench: { result: 'success' } });
  assert.equal(r.code, 1, 'lint must not be allowed to skip its way to green');
  assert.match(r.stdout, /BLOCK {2}lint {2}skipped/);
});

test('neutral and success are ok', () => {
  const r = run({ lint: { result: 'success' }, bench: { result: 'neutral' } });
  assert.equal(r.code, 0);
});

test('empty needs is not a verdict: exit 2', () => {
  const r = run({});
  assert.equal(r.code, 2, 'no jobs is not "everything passed"');
  assert.match(r.stderr, /refusing to report a verdict over nothing/);
});

test('missing NEEDS_JSON is not a verdict: exit 2', () => {
  const r = run(null);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /NEEDS_JSON is empty/);
});

test('unknown result value blocks rather than passing silently', () => {
  const r = run({ lint: { result: 'weird-new-state' } });
  assert.equal(r.code, 1);
});
