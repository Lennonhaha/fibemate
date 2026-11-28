#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Deactivating the previous device rows is what makes read receipts work again.
 *
 * Production measured 2026-11-28: one account had 6 device rows, 3 of them
 * isActive, all created by reinstalls inside the 30-day window. isRead requires
 * every active device to ack, so messages the account received stayed unread
 * forever even though readBy recorded the real device.
 *
 * Run: node --test test/device-cap.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const M = require('../src/db-sqlite');
const SqliteDB = M.SqliteDB || M.default || M;
const PREV = process.env.FIBEMATE_DATA_DIR;

const UID = 'user-a';
const PEER = 'user-b';
const CONV = 'conv-1';
const MID = 'msg-1';

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-cap-'));
  process.env.FIBEMATE_DATA_DIR = dir;
  const db = new SqliteDB(path.join(dir, 'fibemate.db'));
  const now = Date.now();
  db._upsert('conversations', CONV, {
    id: CONV, key: [UID, PEER].sort().join('::'), userAId: UID, userBId: PEER,
    createdAt: now, lastMessageAt: now
  });
  ['dev-old-1', 'dev-old-2', 'dev-new'].forEach((id) => {
    db.createDevice({ id, userId: UID, deviceName: id, isActive: 1, lastActive: now });
  });
  db._upsert('messages', MID, {
    id: MID, conversationId: CONV, senderUserId: PEER, senderDeviceId: 'peer-dev',
    recipientUserId: UID, ciphertext: 'x', envelope: null, messageType: 'text',
    isRead: false, readBy: [], createdAt: now
  });
  return {
    db,
    cleanup: () => {
      try { db.close(); } catch (_) {}
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
      if (PREV === undefined) delete process.env.FIBEMATE_DATA_DIR;
      else process.env.FIBEMATE_DATA_DIR = PREV;
    },
  };
}

function msg(db) {
  return JSON.parse(db._db.prepare('SELECT raw_json FROM messages WHERE id = ?').get(MID).raw_json);
}

test('precondition: two orphan active devices hold isRead back', () => {
  const ctx = fresh();
  try {
    ctx.db.markMessageReadByDevice(MID, UID, 'dev-new');
    assert.equal(msg(ctx.db).isRead, false, 'old rows are still active, so one ack is not enough');
  } finally { ctx.cleanup(); }
});

test('deactivateOtherDevices leaves one live device and unblocks isRead', () => {
  const ctx = fresh();
  try {
    ctx.db.markMessageReadByDevice(MID, UID, 'dev-new');
    const changed = ctx.db.deactivateOtherDevices(UID, 'dev-new');
    assert.equal(changed, 2, 'both stale rows must be deactivated');
    assert.equal(ctx.db.getDevicesByUserId(UID).length, 1, 'exactly one live device remains');
    ctx.db.markMessageReadByDevice(MID, UID, 'dev-new');
    assert.equal(msg(ctx.db).isRead, true, 'duplicate ack must recompute isRead after the prune');
  } finally { ctx.cleanup(); }
});

test('the prune is idempotent and does not touch other accounts', () => {
  const ctx = fresh();
  try {
    ctx.db.createDevice({ id: 'peer-dev', userId: PEER, deviceName: 'peer', isActive: 1, lastActive: Date.now() });
    assert.equal(ctx.db.deactivateOtherDevices(UID, 'dev-new'), 2);
    assert.equal(ctx.db.deactivateOtherDevices(UID, 'dev-new'), 0, 'second call changes nothing');
    assert.equal(ctx.db.getDevicesByUserId(PEER).length, 1, 'other users keep their devices');
  } finally { ctx.cleanup(); }
});
