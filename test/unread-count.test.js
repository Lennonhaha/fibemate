// SPDX-License-Identifier: GPL-3.0-only
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { countUnreadForDevice } = require('../src/lib/unread-count');

const USER = 'user-1';
const DEVICE_A = 'device-a';
const DEVICE_B = 'device-b';

function message(readBy, recipientUserId = USER, createdAt = 0) {
  return { recipientUserId, readBy, createdAt };
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

test('a device is not shown messages that predate its registration', () => {
  // Production 2026-11-26: a fresh 009 device (createdAt 1795649461476) was
  // shown 101 unread messages that had already been read on the other devices.
  const registered = 1_795_649_461_476;
  const messages = [
    message([], USER, registered - 1),
    message([], USER, registered),
    message([], USER, registered + 1),
    message([DEVICE_A], USER, registered + 2),
  ];
  assert.equal(countUnreadForDevice(messages, USER, DEVICE_A, 0, registered), 2);
});

test('without a device creation time the old device-scoped count is unchanged', () => {
  const messages = [message([], USER, 10), message([], USER, 20)];
  assert.equal(countUnreadForDevice(messages, USER, DEVICE_A, 0, 0), 2);
});
