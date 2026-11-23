#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Tests for the account test/reality classifier and for the wiring that no
 * longer hard-codes `isTestUser: true`.
 *
 * Two things are pinned here:
 *   1. the classification rule itself (src/lib/test-user.js), including the
 *      allowlist precedence and the "invalid operator regex must not flip
 *      accounts" case;
 *   2. a source-level guard that the four security-log call sites carry the
 *      request object, because dropping `req` is a one-token regression that
 *      is invisible at runtime — ip/userAgent simply come back null again.
 *
 * Run: node --test test/test-user-rule.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { classify, isTestUsername } = require('../src/lib/test-user');

const ROOT = path.join(__dirname, '..');
const EMPTY_ENV = {};

test('human Chinese username is real', () => {
  const r = classify('刘秀', EMPTY_ENV);
  assert.equal(r.isTest, false);
  assert.equal(r.reason, 'default-real');
});

test('latin human username is real', () => {
  assert.equal(isTestUsername('Liuxiu', EMPTY_ENV), false);
});

test('digits-only device slots are test accounts', () => {
  for (const name of ['009', '007', '0008']) {
    const r = classify(name, EMPTY_ENV);
    assert.equal(r.isTest, true, name);
    assert.equal(r.reason, 'digits-only', name);
  }
});

test('fixture prefixes are test accounts', () => {
  const cases = [
    'autotester_1788263228',
    'debug_user_1788256373756',
    'alice_test_01',
    'bob_27451',
    'diag_1788250604',
    'pw_test_1788256043638',
    'cleartest_1780946638',
    'opk_smoke_165419',
  ];
  for (const name of cases) {
    const r = classify(name, EMPTY_ENV);
    assert.equal(r.isTest, true, name);
    assert.match(r.reason, /^(prefix|epoch-suffix):?/, name);
  }
});

test('epoch suffix alone is enough to flag a fixture', () => {
  const r = classify('someone_1788256373756', EMPTY_ENV);
  assert.equal(r.isTest, true);
  assert.equal(r.reason, 'epoch-suffix');
});

test('exact names gma/gmb are test accounts', () => {
  assert.equal(classify('gma', EMPTY_ENV).reason, 'exact:gma');
  assert.equal(classify('gmb', EMPTY_ENV).reason, 'exact:gmb');
});

test('paired fixture names (aa/bb + digits) are test accounts', () => {
  for (const name of ['aa1788246241', 'bb1788246241']) {
    const r = classify(name, EMPTY_ENV);
    assert.equal(r.isTest, true, name);
    assert.equal(r.reason, 'paired-fixture', name);
  }
  // The rule must not swallow real names that merely start with aa/bb.
  assert.equal(classify('aaron', EMPTY_ENV).isTest, false);
  assert.equal(classify('bbking_fan', EMPTY_ENV).isTest, false);
});

test('FIBEMATE_TEST_USERS pins a name the rules cannot see', () => {
  const r = classify('Liuxiu', { FIBEMATE_TEST_USERS: 'Liuxiu' });
  assert.equal(r.isTest, true);
  assert.equal(r.reason, 'env:FIBEMATE_TEST_USERS');
});

test('allowlist wins over the force-test list', () => {
  const r = classify('Liuxiu', { FIBEMATE_REAL_USERS: 'Liuxiu', FIBEMATE_TEST_USERS: 'Liuxiu' });
  assert.equal(r.isTest, false);
  assert.equal(r.reason, 'allowlist:FIBEMATE_REAL_USERS');
});

test('FIBEMATE_TEST_MODE=1 forces everything to test', () => {
  const r = classify('刘秀', { FIBEMATE_TEST_MODE: '1' });
  assert.equal(r.isTest, true);
  assert.equal(r.reason, 'env:FIBEMATE_TEST_MODE');
});

test('FIBEMATE_TEST_USER_REGEX classifies by operator rule', () => {
  const r = classify('zz_alpha', { FIBEMATE_TEST_USER_REGEX: '^zz' });
  assert.equal(r.isTest, true);
  assert.equal(r.reason, 'env:FIBEMATE_TEST_USER_REGEX');
});

test('allowlist beats every test rule (operator escape hatch)', () => {
  const r = classify('009', { FIBEMATE_REAL_USERS: '009,someone' });
  assert.equal(r.isTest, false);
  assert.equal(r.reason, 'allowlist:FIBEMATE_REAL_USERS');
});

test('allowlist is case-insensitive', () => {
  assert.equal(classify('Liuxiu', { FIBEMATE_REAL_USERS: 'liuxiu' }).isTest, false);
});

test('invalid operator regex does not flip accounts', () => {
  const r = classify('刘秀', { FIBEMATE_TEST_USER_REGEX: '([' });
  assert.equal(r.isTest, false);
  assert.equal(r.reason, 'default-real');
});

test('empty username is treated as test and says why', () => {
  const r = classify('', EMPTY_ENV);
  assert.equal(r.isTest, true);
  assert.equal(r.reason, 'empty-username');
});

test('registration no longer hard-codes isTestUser: true', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  assert.equal(
    /isTestUser:\s*true/.test(src),
    false,
    'src/index.js still hard-codes isTestUser: true'
  );
  assert.match(src, /isTestUser:\s*classifyUser\(username\)\.isTest/);
});

test('the four audited security-log call sites pass the request object', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  const sites = [
    /logSecurity\('register',[^;]*,\s*req\);/,
    /logSecurity\('login_blocked',[^;]*,\s*req\);/,
    /logSecurity\('login_fail',[^;]*,\s*req\);/,
    /logSecurity\('login',[^;]*,\s*req\);/,
  ];
  for (const re of sites) {
    assert.match(src, re, 'missing req in ' + re);
  }
});

test('user count is derived from the rule, not from the stored flag', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  assert.match(src, /filter\(u => isTestUsername\(u\.username\)\)/);
  assert.match(src, /realUsers:\s*totalUsers - testUsers/);
});
