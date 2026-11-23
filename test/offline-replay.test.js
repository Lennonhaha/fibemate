#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Regression tests for the offline-replay predicate.
 *
 * The case that matters is the '*' marker: it is not a device id, so a
 * device-id-only comparison silently replays the whole history on every
 * WebSocket auth. That is what these tests pin down.
 *
 * Run: node --test test/offline-replay.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isUnreadForDevice, READ_ALL } = require('../src/lib/offline-replay');

const UID = 'user-a';
const OTHER = 'user-b';
const DEV_A = 'device-a';
const DEV_B = 'device-b';

function msg(over) {
  return Object.assign({ recipientUserId: UID, readBy: [] }, over);
}

test("'*' marks the message as read for every device", () => {
  assert.equal(isUnreadForDevice(msg({ readBy: [READ_ALL] }), UID, DEV_A), false);
});

test("'*' wins even when a device id is also present", () => {
  assert.equal(isUnreadForDevice(msg({ readBy: [READ_ALL, DEV_A] }), UID, DEV_A), false);
});

test('empty readBy is unread', () => {
  assert.equal(isUnreadForDevice(msg({ readBy: [] }), UID, DEV_A), true);
});

test('missing readBy is unread', () => {
  assert.equal(isUnreadForDevice(msg({ readBy: undefined }), UID, DEV_A), true);
});

test('non-array readBy does not throw and is treated as empty', () => {
  assert.equal(isUnreadForDevice(msg({ readBy: READ_ALL }), UID, DEV_A), true);
});

test('this device already read it', () => {
  assert.equal(isUnreadForDevice(msg({ readBy: [DEV_A] }), UID, DEV_A), false);
});

test('another device read it, this one still needs it', () => {
  assert.equal(isUnreadForDevice(msg({ readBy: [DEV_B] }), UID, DEV_A), true);
});

test('messages addressed to somebody else are never replayed', () => {
  assert.equal(isUnreadForDevice(msg({ recipientUserId: OTHER }), UID, DEV_A), false);
});

test('a null message is not replayed', () => {
  assert.equal(isUnreadForDevice(null, UID, DEV_A), false);
});
