#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * markMessageReadByDevice — the write path behind readBy / offline replay.
 *
 * History: the websocket handler mutated the object returned by
 * getConversationsByUserId() and then called db.save(). That object is a fresh
 * JSON.parse() copy and save() is a no-op, so the write vanished with no error.
 * Production readBy only ever contained [] or ['*'] (measured 2026-11-24),
 * which is why the offline queue never converged: 44 frames re-sent per auth.
 *
 * The first test is the negative control — it pins the old behaviour so a
 * future refactor cannot quietly reintroduce it.
 *
 * Isolation: SqliteDB resolves its directory from FIBEMATE_DATA_DIR at
 * construction time (the filePath constructor argument is unused), so every
 * test points that env var at a throwaway mkdtemp dir. Without this the suite
 * would write fixture rows into the developer's real data/fibemate.db.
 *
 * Run: node --test test/db-readby.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const M = require('../src/db-sqlite');
const SqliteDB = M.SqliteDB || M.default || M;

const PREV_DATA_DIR = process.env.FIBEMATE_DATA_DIR;

const UID = 'user-a';
const PEER = 'user-b';
const DEV_A = 'device-a';
const DEV_B = 'device-b';
const DEV_OFF = 'device-off';
const CONV = 'conv-1';
const MID = 'msg-1';

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-readby-'));
  process.env.FIBEMATE_DATA_DIR = dir;

  const ctx = { dir, db: new SqliteDB(path.join(dir, 'fibemate.db')) };
  const now = Date.now();

  ctx.db._upsert('conversations', CONV, {
    id: CONV, key: [UID, PEER].sort().join('::'), userAId: UID, userBId: PEER,
    createdAt: now, lastMessageAt: now
  });
  // devices need the NOT NULL userId column, so createDevice(), not _upsert().
  ctx.db.createDevice({ id: DEV_A, userId: UID, deviceName: 'A', isActive: 1 });
  ctx.db.createDevice({ id: DEV_B, userId: UID, deviceName: 'B', isActive: 1 });
  ctx.db.createDevice({ id: DEV_OFF, userId: UID, deviceName: 'OFF', isActive: 0 });
  ctx.db._upsert('messages', MID, {
    id: MID, conversationId: CONV, senderUserId: PEER, senderDeviceId: 'peer-dev',
    recipientUserId: UID, ciphertext: 'x', envelope: null, messageType: 'text',
    isRead: false, readBy: [], createdAt: now
  });

  ctx.reopen = () => {
    ctx.db.close();
    ctx.db = new SqliteDB(path.join(dir, 'fibemate.db'));
    return ctx.db;
  };
  ctx.cleanup = () => {
    try { ctx.db.close(); } catch (_) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    if (PREV_DATA_DIR === undefined) delete process.env.FIBEMATE_DATA_DIR;
    else process.env.FIBEMATE_DATA_DIR = PREV_DATA_DIR;
  };
  return ctx;
}

function row(db, id = MID) {
  return JSON.parse(db._db.prepare('SELECT raw_json FROM messages WHERE id = ?').get(id).raw_json);
}
function readBy(db, id = MID) { return row(db, id).readBy; }
function isRead(db, id = MID) { return row(db, id).isRead; }

test('negative control: mutating the copy + save() loses the write', () => {
  const ctx = freshDb();
  try {
    const convs = ctx.db.getConversationsByUserId(UID);
    let touched = false;
    convs.forEach(c => {
      const m = (c.messages || []).find(x => x.id === MID);
      if (m) { m.readBy.push(DEV_A); touched = true; }
    });
    assert.equal(touched, true, 'precondition: the copy must have been mutated');
    ctx.db.save();
    assert.deepEqual(readBy(ctx.db), [], 'save() is a no-op; the write must still be lost');
  } finally { ctx.cleanup(); }
});

test('markMessageReadByDevice persists a real device id', () => {
  const ctx = freshDb();
  try {
    const m = ctx.db.markMessageReadByDevice(MID, UID, DEV_A);
    assert.ok(m, 'should return the updated message');
    assert.deepEqual(readBy(ctx.db), [DEV_A]);
    assert.equal(isRead(ctx.db), false, 'one of two active devices is not enough');
  } finally { ctx.cleanup(); }
});

test('the write survives a close/reopen (real disk, not cache)', () => {
  const ctx = freshDb();
  try {
    ctx.db.markMessageReadByDevice(MID, UID, DEV_A);
    const db2 = ctx.reopen();
    assert.deepEqual(readBy(db2), [DEV_A]);
  } finally { ctx.cleanup(); }
});

test('second call is idempotent', () => {
  const ctx = freshDb();
  try {
    ctx.db.markMessageReadByDevice(MID, UID, DEV_A);
    assert.equal(ctx.db.markMessageReadByDevice(MID, UID, DEV_A), null);
    assert.deepEqual(readBy(ctx.db), [DEV_A]);
  } finally { ctx.cleanup(); }
});

test('isRead flips only when every active device has acked', () => {
  const ctx = freshDb();
  try {
    ctx.db.markMessageReadByDevice(MID, UID, DEV_A);
    assert.equal(isRead(ctx.db), false);
    ctx.db.markMessageReadByDevice(MID, UID, DEV_B);
    assert.equal(isRead(ctx.db), true, 'inactive devices must not hold isRead back');
    assert.deepEqual(readBy(ctx.db).sort(), [DEV_A, DEV_B]);
  } finally { ctx.cleanup(); }
});

test('rejects a non-recipient', () => {
  const ctx = freshDb();
  try {
    assert.equal(ctx.db.markMessageReadByDevice(MID, PEER, DEV_A), null);
    assert.deepEqual(readBy(ctx.db), []);
  } finally { ctx.cleanup(); }
});

test('unknown message returns null (lookup outcome, not misuse)', () => {
  const ctx = freshDb();
  try {
    assert.equal(ctx.db.markMessageReadByDevice('nope', UID, DEV_A), null);
  } finally { ctx.cleanup(); }
});

// G-06 negative control: a missing identity field must throw, not return null.
// Before the fix all four of these returned null and the caller treated that as
// "nothing to do", which is exactly how an empty deviceId stayed invisible.
test('negative control: empty deviceId throws E_REQUIRED_FIELD instead of returning null', () => {
  const ctx = freshDb();
  try {
    assert.throws(
      () => ctx.db.markMessageReadByDevice(MID, UID, ''),
      (e) => e instanceof TypeError && e.code === 'E_REQUIRED_FIELD' && e.field === 'deviceId',
      'empty deviceId must throw E_REQUIRED_FIELD'
    );
    assert.throws(
      () => ctx.db.markMessageReadByDevice(MID, UID),
      (e) => e.code === 'E_REQUIRED_FIELD' && e.field === 'deviceId',
      'undefined deviceId must throw E_REQUIRED_FIELD'
    );
    assert.deepEqual(readBy(ctx.db), [], 'a rejected call must not write anything');
  } finally { ctx.cleanup(); }
});

test('missing messageId or userId throws E_REQUIRED_FIELD', () => {
  const ctx = freshDb();
  try {
    assert.throws(() => ctx.db.markMessageReadByDevice(null, UID, DEV_A),
      (e) => e.code === 'E_REQUIRED_FIELD' && e.field === 'messageId');
    assert.throws(() => ctx.db.markMessageReadByDevice('', UID, DEV_A),
      (e) => e.code === 'E_REQUIRED_FIELD' && e.field === 'messageId');
    assert.throws(() => ctx.db.markMessageReadByDevice(MID, null, DEV_A),
      (e) => e.code === 'E_REQUIRED_FIELD' && e.field === 'userId');
    assert.throws(() => ctx.db.markMessageReadByDevice(MID, '', DEV_A),
      (e) => e.code === 'E_REQUIRED_FIELD' && e.field === 'userId');
    assert.throws(() => ctx.db.markMessageReadByDevice(MID, UID, 42),
      (e) => e.code === 'E_REQUIRED_FIELD' && e.field === 'deviceId',
      'non-string deviceId must throw as well');
    assert.deepEqual(readBy(ctx.db), []);
  } finally { ctx.cleanup(); }
});

test('a message already stamped "*" is left alone', () => {
  const ctx = freshDb();
  try {
    const m = row(ctx.db);
    m.readBy = ['*'];
    ctx.db._upsert('messages', MID, m);
    assert.equal(ctx.db.markMessageReadByDevice(MID, UID, DEV_A), null);
    assert.deepEqual(readBy(ctx.db), ['*']);
  } finally { ctx.cleanup(); }
});

test('a missing readBy field is treated as empty', () => {
  const ctx = freshDb();
  try {
    const m = row(ctx.db);
    delete m.readBy;
    ctx.db._upsert('messages', MID, m);
    ctx.db.markMessageReadByDevice(MID, UID, DEV_A);
    assert.deepEqual(readBy(ctx.db), [DEV_A]);
  } finally { ctx.cleanup(); }
});
