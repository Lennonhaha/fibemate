// SPDX-License-Identifier: GPL-3.0-only
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { countUnreadForDevice } = require('../src/lib/unread-count');

const USER = 'user-1';
const DEVICE_A = 'device-a';
const DEVICE_B = 'device-b';

function message(readBy, recipientUserId = USER) {
  return { recipientUserId, readBy };
}

test('counts only messages this device has not acked', () => {
  const messages = [
    message([]),
    message([DEVICE_B]),
    message([DEVICE_A]),
    message([DEVICE_A, DEVICE_B]),
  ];
  assert.equal(countUnreadForDevice(messages, USER, DEVICE_A), 2);
});

test('READ_ALL marker counts as read for every device', () => {
  assert.equal(countUnreadForDevice([message(['*'])], USER, DEVICE_A), 0);
});

test('messages for another recipient are never counted', () => {
  assert.equal(countUnreadForDevice([message([], 'someone-else')], USER, DEVICE_A), 0);
});

test('missing readBy is treated as unread', () => {
  assert.equal(countUnreadForDevice([{ recipientUserId: USER }], USER, DEVICE_A), 1);
});

test('a different active device does not keep this device unread', () => {
  // The production bug: device A read the thread, device B was still inside the
  // 30-day window, so isRead stayed false. The badge must follow this device.
  assert.equal(countUnreadForDevice([message([DEVICE_A, DEVICE_B])], USER, DEVICE_A), 0);
});

test('legacy clients without a deviceId keep the stored counter', () => {
  assert.equal(countUnreadForDevice([message([])], USER, '', 17), 17);
  assert.equal(countUnreadForDevice([message([])], USER, '', -4), 0);
  assert.equal(countUnreadForDevice([message([])], USER, '', Number.NaN), 0);
});

test('non-array input cannot throw or report a stale count', () => {
  assert.equal(countUnreadForDevice(null, USER, DEVICE_A), 0);
  assert.equal(countUnreadForDevice(undefined, USER, DEVICE_A), 0);
});
