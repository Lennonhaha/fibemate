// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * Minimal tests for lib/lockout.js
 * Run: node test/lockout.test.js
 */

const { checkAccountLockout, recordFailedLogin, resetLoginAttempts } = require('../src/lib/lockout');

let passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { console.log(`  PASS ${name}`); passed++; }
  else { console.error(`  FAIL ${name}`); failed++; }
}

// --- Test 1: Fresh account is not locked ---
const user1 = 'testuser_fresh_' + Date.now();
const s1 = checkAccountLockout(user1);
assert('fresh account not locked', s1.locked === false);
assert('fresh account remaining = 5', s1.remaining === 5);
assert('fresh account remainingSec = 0', s1.remainingSec === 0);

// --- Test 2: 5 failures lock the account ---
const user2 = 'testuser_lock_' + Date.now();
for (let i = 0; i < 5; i++) {
  recordFailedLogin(user2, '127.0.0.1');
}
const s2 = checkAccountLockout(user2);
assert('after 5 failures: locked', s2.locked === true);
assert('after 5 failures: remaining = 0', s2.remaining === 0);
assert('after 5 failures: remainingSec > 0', s2.remainingSec > 0);
assert('after 5 failures: remainingSec <= 900', s2.remainingSec <= 900);

// --- Test 3: Locked account ignores recordFailedLogin (no lock extension) ---
const s2_before = checkAccountLockout(user2);
recordFailedLogin(user2, '192.168.1.1'); // should be no-op
const s2_after = checkAccountLockout(user2);
// remainingSec should not increase (no extension)
assert('locked: recordFailedLogin does not extend lock', s2_after.remainingSec <= s2_before.remainingSec);

// --- Test 4: remainingSec decreases over time ---
const user3 = 'testuser_decay_' + Date.now();
for (let i = 0; i < 5; i++) recordFailedLogin(user3, '10.0.0.1');
const s3a = checkAccountLockout(user3);
// Wait 1.1 seconds
setTimeout(() => {
  const s3b = checkAccountLockout(user3);
  assert('remainingSec decreases over time', s3b.remainingSec < s3a.remainingSec);

  // --- Test 5: resetLoginAttempts clears state ---
  resetLoginAttempts(user3);
  const s3c = checkAccountLockout(user3);
  assert('after reset: not locked', s3c.locked === false);
  assert('after reset: remaining = 5', s3c.remaining === 5);

  // --- Test 6: Lockout auto-expires ---
  const user4 = 'testuser_expire_' + Date.now();
  for (let i = 0; i < 5; i++) recordFailedLogin(user4, '10.0.0.2');
  assert('locked before expiry', checkAccountLockout(user4).locked === true);
  // Can't wait 15 min in test — verify via _get internal or just trust logic
  // But we can test that recordFailedLogin after lock expiry resets and counts fresh
  // Simulate by checking that a failed login after expiry doesn't re-lock immediately
  
  // --- Test 7: 4 failures do not lock ---
  const user5 = 'testuser_under_' + Date.now();
  for (let i = 0; i < 4; i++) recordFailedLogin(user5, '10.0.0.3');
  const s5 = checkAccountLockout(user5);
  assert('4 failures: not locked', s5.locked === false);
  assert('4 failures: remaining = 1', s5.remaining === 1);

  // --- Test 8: empty username is safe ---
  assert('empty username check', checkAccountLockout('').locked === false);
  recordFailedLogin('', '1.2.3.4'); // should not throw
  resetLoginAttempts(''); // should not throw

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  lockout.test: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
}, 1100);