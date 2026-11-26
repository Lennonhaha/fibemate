#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Multi-device readBy ordering: a device that did not exist when a message was
 * sent must not hold `isRead` back.
 *
 * The all-active-device rule was correct but had no notion of message epoch. If
 * the recipient adds a device after a message is delivered, that new device is
 * counted in `_activeDeviceIds()` forever, so `isRead` can never flip even
 * though every device that could have received the message has acknowledged it.
 * The unread badge already excludes pre-install history
 * (src/lib/unread-count.js); the isRead predicate must use the same rule or the
 * two disagree: badge says 0 unread, sender still sees "delivered, unread".
 *
 * Tests 1 and 2 are the controls: they pin the behaviour that must NOT change
 * (devices that existed at send time still gate isRead, and a device row with
 * no createdAt keeps counting).
 *
 * Isolation: SqliteDB resolves its directory from FIBEMATE_DATA_DIR at
 * construction time, so every test uses a throwaway mkdtemp dir.
 *
 * Run: node --test test/readby-device-epoch.test.js
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
const CONV = 'conv-epoch';
const MSG = 'msg-epoch';
const EARLY = 'device-early';
const LATE = 'device-late';
const LEGACY = 'device-legacy';

function makeDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-epoch-'));
  process.env.FIBEMATE_DATA_DIR = dir;
  const db = new SqliteDB(path.join(dir, 'fibemate.db'));
  const now = Date.now();
  const sentAt = now;

  db._upsert('conversations', CONV, {
    id: CONV, key: [UID, PEER].sort().join('::'), userAId: UID, userBId: PEER,
    createdAt: now - 3600_000, lastMessageAt: now
  });
  db.createDevice({
    id: EARLY, userId: UID, deviceName: 'early', isActive: true,
    lastActive: now, createdAt: sentAt - 60_000
  });
  db.createDevice({
    id: LATE, userId: UID, deviceName: 'late', isActive: true,
    lastActive: now, createdAt: sentAt + 60_000
  });
  db._upsert('messages', MSG, {
    id: MSG, conversationId: CONV, senderUserId: PEER, senderDeviceId: 'peer-dev',
    recipientUserId: UID, ciphertext: 'x', envelope: null, messageType: 'text',
    isRead: false, readBy: [], createdAt: sentAt
  });

  const cleanup = () => {
    try { db.close(); } catch (_) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    if (PREV_DATA_DIR === undefined) delete process.env.FIBEMATE_DATA_DIR;
    else process.env.FIBEMATE_DATA_DIR = PREV_DATA_DIR;
  };
  return { db, cleanup, sentAt, now };
}

function readMsg(db, id = MSG) {
  return JSON.parse(db._db.prepare('SELECT raw_json FROM messages WHERE id = ?').get(id).raw_json);
}

test('control: a device that existed at send time still gates isRead', () => {
  const { db, cleanup } = makeDb();
  try {
    db.createDevice({
      id: LEGACY, userId: UID, deviceName: 'legacy', isActive: true,
      lastActive: Date.now()
    });
    const one = db.markMessageReadByDevice(MSG, UID, EARLY);
    assert.equal(one.isRead, false, 'one eligible ack must not flip isRead');
    assert.deepEqual(one.readBy, [EARLY]);

    const two = db.markMessageReadByDevice(MSG, UID, LATE);
    assert.equal(two.isRead, false, 'the legacy row has no createdAt and must still be required');

    const three = db.markMessageReadByDevice(MSG, UID, LEGACY);
    assert.equal(three.isRead, true, 'all eligible devices have acked');
  } finally { cleanup(); }
});

test('control: a row with no createdAt is never treated as younger than the message', () => {
  const { db, cleanup } = makeDb();
  try {
    db.createDevice({
      id: LEGACY, userId: UID, deviceName: 'legacy', isActive: true,
      lastActive: Date.now()
    });
    const m = db.markMessageReadByDevice(MSG, UID, LEGACY);
    assert.equal(m.isRead, false);
    assert.deepEqual(m.readBy, [LEGACY]);
  } finally { cleanup(); }
});

test('a device created after the message does not block isRead', () => {
  const { db, cleanup } = makeDb();
  try {
    const m = db.markMessageReadByDevice(MSG, UID, EARLY);
    assert.deepEqual(m.readBy, [EARLY], 'only the acking device is recorded');
    assert.equal(m.isRead, true, 'the late device could not have received a message that predates it');
  } finally { cleanup(); }
});

test('the same rule applies to the REST conversation-level path', () => {
  const { db, cleanup } = makeDb();
  try {
    const changed = db.markMessagesRead(CONV, UID, EARLY);
    assert.equal(changed, 1);
    const m = readMsg(db);
    assert.deepEqual(m.readBy, [EARLY]);
    assert.equal(m.isRead, true, 'bulk mark must use the same epoch filter as the WS path');
  } finally { cleanup(); }
});

test('a device created before a later message still gates that message', () => {
  const { db, cleanup } = makeDb();
  try {
    const laterAt = Date.now() + 120_000;
    db._upsert('messages', 'msg-later', {
      id: 'msg-later', conversationId: CONV, senderUserId: PEER, senderDeviceId: 'peer-dev',
      recipientUserId: UID, ciphertext: 'y', envelope: null, messageType: 'text',
      isRead: false, readBy: [], createdAt: laterAt
    });
    const one = db.markMessageReadByDevice('msg-later', UID, EARLY);
    assert.equal(one.isRead, false, 'the late device existed before this newer message, so it must ack too');
    const two = db.markMessageReadByDevice('msg-later', UID, LATE);
    assert.equal(two.isRead, true);
    assert.deepEqual(two.readBy.slice().sort(), [EARLY, LATE].sort());
  } finally { cleanup(); }
});

test('a device older than the 30-day window is not required', () => {
  const { db, cleanup, now } = makeDb();
  try {
    // Re-register the late device as stale so only EARLY is eligible.
    db.createDevice({
      id: LATE, userId: UID, deviceName: 'late', isActive: true,
      lastActive: now - 40 * 24 * 3600_000, createdAt: now - 50 * 24 * 3600_000
    });
    const m = db.markMessageReadByDevice(MSG, UID, EARLY);
    assert.equal(m.isRead, true, 'stale devices are excluded from the all-ack predicate');
    assert.deepEqual(m.readBy, [EARLY]);
  } finally { cleanup(); }
});

test('isRead is not re-opened by a later device ack on an already-read message', () => {
  const { db, cleanup } = makeDb();
  try {
    db.markMessageReadByDevice(MSG, UID, EARLY);
    const again = db.markMessageReadByDevice(MSG, UID, EARLY);
    assert.equal(again, null, 'a duplicate ack is a no-op');
    const m = db.markMessageReadByDevice(MSG, UID, LATE);
    assert.equal(m.readBy.length, 2, 'a late ack is recorded but cannot unset isRead');
    assert.equal(m.isRead, true);
  } finally { cleanup(); }
});
