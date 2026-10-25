// SPDX-License-Identifier: GPL-3.0-only
/**
 * key-exchange-recipient.test.js — guards the peer resolution behind the WS
 * `key_exchange` / `key_exchange_response` handlers.
 *
 * Regression being locked down (2026-10-25):
 *   The handlers resolved the peer with `conv.participantUserId` /
 *   `conv.ownerUserId`, but conversations are persisted with `userAId` /
 *   `userBId`. When a client sent only `conversationId` (no `to`), the lookup
 *   produced `undefined`, the handler hit `if (!recipientUserId) break;`, and
 *   the handshake was dropped without a single log line. The initiator then sat
 *   on "establishing secure session" forever.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolvePeerId } = require('../src/lib/conversation-peer');

const ALICE = '10ae1ef0-bf0f-4094-83da-acdb6036b8ff';
const BOB = 'beae8501-1bed-40e6-af02-ef7aa90ae06d';

// Shape of a row as parsed out of the conversations table (see src/db-sqlite.js).
const conv = () => ({
  id: '0150f946-5df1-48cb-8e8a-f7009e6674a5',
  key: ALICE + '::' + BOB,
  userAId: ALICE,
  userBId: BOB,
  messages: [],
  unreadCountA: 0,
  unreadCountB: 0,
});

test('returns userB when the caller is userA', () => {
  assert.equal(resolvePeerId(conv(), ALICE), BOB);
});

test('returns userA when the caller is userB', () => {
  assert.equal(resolvePeerId(conv(), BOB), ALICE);
});

test('resolves the peer without any `to` field (conversationId-only path)', () => {
  // This is the exact shape the WS handler sees: { conversationId } and nothing else.
  const msg = { type: 'key_exchange', conversationId: conv().id };
  const db = { getConversationById: () => conv() };
  let recipientUserId = msg.to;
  if (!recipientUserId && msg.conversationId) {
    recipientUserId = resolvePeerId(db.getConversationById(msg.conversationId), ALICE);
  }
  assert.equal(recipientUserId, BOB);
});

test('documents why the old lookup failed: conv has no participantUserId/ownerUserId', () => {
  const c = conv();
  assert.equal(c.participantUserId, undefined);
  assert.equal(c.ownerUserId, undefined);
  // Old expression: conv.participantUserId === userId ? conv.ownerUserId : conv.participantUserId
  const oldResult = c.participantUserId === ALICE ? c.ownerUserId : c.participantUserId;
  assert.equal(oldResult, undefined);
});

test('returns null instead of guessing when the caller is not a participant', () => {
  assert.equal(resolvePeerId(conv(), 'intruder'), null);
});

test('returns null for missing or malformed conversations', () => {
  assert.equal(resolvePeerId(null, ALICE), null);
  assert.equal(resolvePeerId(undefined, ALICE), null);
  assert.equal(resolvePeerId({}, ALICE), null);
  assert.equal(resolvePeerId({ userAId: ALICE }, ALICE), null);
  assert.equal(resolvePeerId({ userAId: '', userBId: BOB }, ''), null);
});

test('returns null when the caller id is absent', () => {
  assert.equal(resolvePeerId(conv(), ''), null);
  assert.equal(resolvePeerId(conv(), null), null);
  assert.equal(resolvePeerId(conv(), undefined), null);
});

test('matches ids across numeric/string layers', () => {
  assert.equal(resolvePeerId({ userAId: 123, userBId: 456 }, '123'), 456);
  assert.equal(resolvePeerId({ userAId: '123', userBId: '456' }, 456), '123');
});

test('self-conversation resolves back to the caller', () => {
  assert.equal(resolvePeerId({ userAId: BOB, userBId: BOB }, BOB), BOB);
});

test('handlers no longer use the wrong conversation field names', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.equal(src.includes('conv.participantUserId'), false);
  assert.equal(src.includes('conv.ownerUserId'), false);
  assert.equal(src.includes('resolvePeerId(db.getConversationById(conversationId), userId)'), true);
});
