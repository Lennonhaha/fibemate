// SPDX-License-Identifier: GPL-3.0-only
'use strict';
/**
 * Test-account classification for FIBEMATE accounts.
 *
 * Why this module exists
 * ----------------------
 * `users.isTestUser` used to be hard-coded to `true` in the registration
 * handler (src/index.js:1218 for the user record and :1230 for the device
 * record). Every account created through POST /api/auth/register therefore
 * carried the flag, and `/api/users/count` reported `testUsers === totalUsers`
 * for the whole database. The flag was not a fact about the account, it was a
 * constant.
 *
 * The classification below is a *rule*, applied to the username, so it can be
 * re-evaluated for accounts that were written before the rule existed. It is
 * deliberately boring and auditable, and every branch returns a `reason` so a
 * count can be explained line by line instead of asserted.
 *
 * Precedence (first match wins):
 *   1. FIBEMATE_REAL_USERS        comma-separated allowlist  -> real
 *   2. FIBEMATE_TEST_USERS        comma-separated force-test -> test
 *   3. FIBEMATE_TEST_MODE=1       force everything to test   -> test
 *   4. FIBEMATE_TEST_USER_REGEX   operator-supplied regex    -> test
 *   5. exact names                (gma, gmb)                 -> test
 *   6. known test prefixes        (autotester, test, alice…) -> test
 *   7. `<name>_<10+ digits>`      epoch-seconds/ms suffix    -> test
 *   8. `aa|bb<6+ digits>`         paired fixture names       -> test
 *   9. digits only                (009, 007, 0008)           -> test
 *  10. otherwise                                             -> real
 *
 * The allowlist is first so an operator can always correct a false positive
 * without editing code, which is the failure mode a heuristic deserves.
 *
 * Limits worth stating out loud: this is naming evidence, not identity
 * evidence. An account named `alice` is classified as test even if a human
 * signed up under that name, and a test account named `刘秀` is classified as
 * real. It is still strictly better than the constant it replaces, and the
 * allowlist is the documented way out.
 */

/** Prefixes (lower-cased, case-insensitive) used by the automated test suites. */
const TEST_USER_PREFIXES = [
  'autotester',
  'diag_',
  'test',
  'login_test',
  'pw_test',
  'clicker',
  'clicktest',
  'debug_',
  'rotate_test',
  'b64test',
  'flash_test',
  'spktest',
  'regtest',
  'dummy_test',
  'p1_',
  'opk_',
  'xs_',
  'gmtest_',
  'gmchat',
  'cleartest',
  'nx_fix',
  'fixalice',
  'fixbob',
  'alice',
  'bob',
];

/** Exact names that the prefix list would miss or over-match. */
const TEST_USER_EXACT = ['gma', 'gmb'];

/** `alice_1788256756216` — an epoch timestamp appended by a fixture generator. */
const EPOCH_SUFFIX = /_\d{10,}$/;

/** `009`, `007`, `0008` — device-slot numbers used by the dual-device setup. */
const DIGITS_ONLY = /^\d+$/;

/** `aa1788246241` / `bb1788246241` — the AA/BB pair a fixture creates in one call. */
const PAIRED_FIXTURE = /^(aa|bb)\d{6,}$/;

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Classify one username.
 *
 * @param {string} username
 * @param {object} [env] - injectable for tests; defaults to process.env
 * @returns {{isTest: boolean, reason: string}}
 */
function classify(username, env) {
  const e = env || process.env;
  const name = String(username == null ? '' : username);
  if (!name) return { isTest: true, reason: 'empty-username' };

  const allowlist = splitList(e.FIBEMATE_REAL_USERS);
  const lower = name.toLowerCase();
  if (allowlist.some((x) => x.toLowerCase() === lower)) {
    return { isTest: false, reason: 'allowlist:FIBEMATE_REAL_USERS' };
  }

  if (String(e.FIBEMATE_TEST_MODE || '') === '1') {
    return { isTest: true, reason: 'env:FIBEMATE_TEST_MODE' };
  }

  // Force-test list, symmetric to FIBEMATE_REAL_USERS: the way to pin a name
  // whose shape the rules below cannot see (e.g. an early pinyin alias).
  const forced = splitList(e.FIBEMATE_TEST_USERS);
  if (forced.some((x) => x.toLowerCase() === lower)) {
    return { isTest: true, reason: 'env:FIBEMATE_TEST_USERS' };
  }

  const pattern = e.FIBEMATE_TEST_USER_REGEX;
  if (pattern) {
    try {
      if (new RegExp(pattern, 'i').test(name)) {
        return { isTest: true, reason: 'env:FIBEMATE_TEST_USER_REGEX' };
      }
    } catch (_) {
      // An invalid operator regex must not flip accounts; fall through.
    }
  }

  if (TEST_USER_EXACT.includes(lower)) return { isTest: true, reason: 'exact:' + lower };

  const prefix = TEST_USER_PREFIXES.find((p) => lower.startsWith(p));
  if (prefix) return { isTest: true, reason: 'prefix:' + prefix };

  if (EPOCH_SUFFIX.test(lower)) return { isTest: true, reason: 'epoch-suffix' };
  if (PAIRED_FIXTURE.test(lower)) return { isTest: true, reason: 'paired-fixture' };
  if (DIGITS_ONLY.test(name)) return { isTest: true, reason: 'digits-only' };

  return { isTest: false, reason: 'default-real' };
}

/** Convenience wrapper: true when the username looks like a test account. */
function isTestUsername(username, env) {
  return classify(username, env).isTest;
}

module.exports = { classify, isTestUsername, TEST_USER_PREFIXES, TEST_USER_EXACT };
