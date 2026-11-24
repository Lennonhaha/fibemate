// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * Device identity helpers.
 *
 * The client generates a UUID once per account and sends it on login. The
 * server validates the shape and binds the id to exactly one account; an id
 * that already belongs to another account is a hard error, not a silent
 * overwrite (devices.id is the primary key).
 */

const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const STALE_DEVICE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {unknown} raw
 * @returns {{ok: true, value: string} | {ok: false, code: 'E_DEVICE_ID'}}
 */
function normalizeDeviceId(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, code: 'E_DEVICE_ID' };
  const value = raw.trim().toLowerCase();
  if (value === '') return { ok: true, value: '' };
  if (!DEVICE_ID_RE.test(value)) return { ok: false, code: 'E_DEVICE_ID' };
  return { ok: true, value };
}

/** Devices whose lastActive is older than this are no longer counted for isRead. */
function staleCutoff(now = Date.now(), maxAgeMs = STALE_DEVICE_MS) {
  return now - maxAgeMs;
}

module.exports = { DEVICE_ID_RE, STALE_DEVICE_MS, normalizeDeviceId, staleCutoff };
