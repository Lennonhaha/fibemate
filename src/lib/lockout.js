// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * Account lockout module — minimal in-memory implementation.
 *
 * Strategy:
 *   - Key by username (primary identity)
 *   - 5 failed attempts → locked
 *   - 15-minute lockout duration
 *   - In-memory Map (resets on process restart; acceptable for pm2 low-restart freq)
 *   - While locked, recordFailedLogin is ignored (no lock extension)
 *
 * Exports:
 *   checkAccountLockout(username) → { locked, remaining, remainingSec }
 *   recordFailedLogin(username, ip) → void
 *   resetLoginAttempts(username) → void
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Map<username, { failures: number, lockedAt: number|null, lastIp: string|null }>
const store = new Map();

function _now() {
  return Date.now();
}

function _get(username) {
  if (!store.has(username)) {
    store.set(username, { failures: 0, lockedAt: null, lastIp: null });
  }
  return store.get(username);
}

/**
 * Check if account is locked.
 * @param {string} username
 * @returns {{ locked: boolean, remaining: number, remainingSec: number }}
 */
function checkAccountLockout(username) {
  if (!username) return { locked: false, remaining: MAX_ATTEMPTS, remainingSec: 0 };
  const entry = _get(username);

  if (entry.lockedAt !== null) {
    const elapsed = _now() - entry.lockedAt;
    if (elapsed >= LOCKOUT_MS) {
      // Lockout expired — auto-reset
      entry.failures = 0;
      entry.lockedAt = null;
      return { locked: false, remaining: MAX_ATTEMPTS, remainingSec: 0 };
    }
    const remainingSec = Math.ceil((LOCKOUT_MS - elapsed) / 1000);
    return { locked: true, remaining: 0, remainingSec };
  }

  return {
    locked: false,
    remaining: MAX_ATTEMPTS - entry.failures,
    remainingSec: 0,
  };
}

/**
 * Record a failed login attempt.
 * If account is already locked, this is a no-op (lock period is not extended).
 * @param {string} username
 * @param {string} ip — recorded for audit but not used as lock key
 */
function recordFailedLogin(username, ip) {
  if (!username) return;
  const entry = _get(username);
  entry.lastIp = ip || null;

  // If already locked, ignore (no lock extension)
  if (entry.lockedAt !== null) {
    const elapsed = _now() - entry.lockedAt;
    if (elapsed < LOCKOUT_MS) return;
    // Lock expired — reset and count this failure
    entry.failures = 0;
    entry.lockedAt = null;
  }

  entry.failures++;
  if (entry.failures >= MAX_ATTEMPTS) {
    entry.lockedAt = _now();
  }
}

/**
 * Reset failed attempts after successful login.
 * @param {string} username
 */
function resetLoginAttempts(username) {
  if (!username) return;
  store.delete(username);
}

module.exports = { checkAccountLockout, recordFailedLogin, resetLoginAttempts };
