#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * Device identity: shape validation, ownership, stale-device pruning.
 *
 * The login handler must never overwrite a device row that belongs to another
 * account, and must not count a device that has been silent for 30+ days when
 * deciding isRead. These tests pin both rules at the DB boundary and pin the
 * UUID normalisation used by the handler.
 *
 * Run: node --test test/device-id.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const M = require('../src/db-sqlite');
const SqliteDB = M.SqliteDB || M.default || M;
const { normalizeDeviceId, staleCutoff, STALE_DEVICE_MS } = require('../src/device-id');

const PREV_DATA_DIR = process.env.FIBEMATE_DATA_DIR;
const UID = 'user-a';
const OTHER = 'user-b';
const DEV_A = '11111111-1111-4111-8111-111111111111';
const DEV_B = '22222222-2222-4222-8222-222222222222';
const DEV_C = '33333333-3333-4333-8333-333333333333';

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-device-'));
  process.env.FIBEMATE_DATA_DIR = dir;
  const db = new SqliteDB(path.join(dir, 'fibemate.db'));
  return {
    db,
    cleanup() {
      try { db.close(); } catch (_) { /* already closed */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* WAL handle */ }
      if (PREV_DATA_DIR === undefined) delete process.env.FIBEMATE_DATA_DIR;
      else process.env.FIBEMATE_DATA_DIR = PREV_DATA_DIR;
    }
  };
}

test('normalizeDeviceId: absent values stay empty (backward compatible)', () => {
  for (const v of [undefined, null, '']) {
    assert.deepEqual(normalizeDeviceId(v), { ok: true, value: '' });
  }
});

test('normalizeDeviceId: valid UUID is lower-cased, v1-v8 accepted', () => {
  assert.deepEqual(normalizeDeviceId(DEV_A), { ok: true, value: DEV_A });
  assert.deepEqual(normalizeDeviceId('  ' + DEV_A.toUpperCase() + '  '), { ok: true, value: DEV_A });
  // v7 shape (version nibble 7, variant 8) must not be rejected just because
  // crypto.randomUUID() currently returns v4.
  const v7 = '018f4f7e-7a3b-7c2d-8e1f-123456789abc';
  assert.deepEqual(normalizeDeviceId(v7), { ok: true, value: v7 });
});

test('normalizeDeviceId: malformed / non-string values are rejected', () => {
  for (const v of ['not-a-uuid', '1111', '11111111-1111-4111-8111-11111111111z', 42, {}]) {
    assert.deepEqual(normalizeDeviceId(v), { ok: false, code: 'E_DEVICE_ID' });
  }
});

test('staleCutoff is exactly 30 days before now', () => {
  assert.equal(staleCutoff(1000000000000), 1000000000000 - STALE_DEVICE_MS);
});

test('getDeviceById returns null for unknown ids', () => {
  const ctx = freshDb();
  try {
    assert.equal(ctx.db.getDeviceById(DEV_A), null);
  } finally { ctx.cleanup(); }
});

test('createDeviceIfAbsent never replaces another account\'s device', () => {
  const ctx = freshDb();
  try {
    ctx.db.createDevice({ id: DEV_A, userId: UID, deviceName: 'A', isActive: true, lastActive: Date.now() });
    const refused = ctx.db.createDeviceIfAbsent({
      id: DEV_A, userId: OTHER, deviceName: 'stolen', isActive: true, lastActive: Date.now()
    });
    assert.equal(refused, null);
    assert.equal(ctx.db.getDeviceById(DEV_A).userId, UID, 'owner must not change');
  } finally { ctx.cleanup(); }
});

test('touchDevice updates only the owner and refuses a foreign user', () => {
  const ctx = freshDb();
  try {
    const before = Date.now() - 1000;
    ctx.db.createDevice({ id: DEV_A, userId: UID, deviceName: 'A', isActive: true, lastActive: before });
    assert.equal(ctx.db.touchDevice(DEV_A, OTHER, {}), null);
    const updated = ctx.db.touchDevice(DEV_A, UID, { publicKey: 'pk-new' });
    assert.equal(updated.userId, UID);
    assert.equal(updated.publicKey, 'pk-new');
    assert.ok(updated.lastActive > before);
    assert.equal(ctx.db.getDeviceById(DEV_A).publicKey, 'pk-new');
  } finally { ctx.cleanup(); }
});

test('deactivateStaleDevices drops old devices but keeps recent ones and the current one', () => {
  const ctx = freshDb();
  try {
    const now = Date.now();
    const old = now - STALE_DEVICE_MS - 1000;
    ctx.db.createDevice({ id: DEV_A, userId: UID, isActive: true, lastActive: old });
    ctx.db.createDevice({ id: DEV_B, userId: UID, isActive: true, lastActive: now });
    ctx.db.createDevice({ id: DEV_C, userId: UID, isActive: false, lastActive: old });

    const changed = ctx.db.deactivateStaleDevices(UID, staleCutoff(now));
    assert.equal(changed, 1, 'only the active stale row changes');
    assert.equal(ctx.db.getDeviceById(DEV_A).isActive, false);
    assert.equal(ctx.db.getDeviceById(DEV_B).isActive, true);
    assert.equal(ctx.db.getDeviceById(DEV_C).isActive, false);
    assert.deepEqual(ctx.db.getDevicesByUserId(UID).map(d => d.id), [DEV_B]);
  } finally { ctx.cleanup(); }
});
