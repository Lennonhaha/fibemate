// SPDX-License-Identifier: GPL-3.0-only
/**
 * Unread badge count for one device.
 *
 * The conversations table keeps lifetime counters (unreadCountA/B) that are
 * incremented on every message and never decremented. Those counters are not a
 * badge: production showed 540/352 on a two-person thread that had been read.
 * The badge has to be derived from the messages, and it has to be scoped to the
 * requesting device, otherwise an inactive-but-still-"active" second device
 * (the 30-day window) keeps `isRead` false and the recipient's badge never
 * clears.
 */
'use strict';

const { isUnreadForDevice } = require('./offline-replay');

/**
 * @param {Array<object>} messages  messages of one conversation
 * @param {string} userId  the requesting user
 * @param {string} deviceId  the requesting device (JWT claim)
 * @param {number} legacyCount  stored counter for clients with no deviceId
 * @param {number} deviceCreatedAt  when this device was registered (ms)
 * @returns {number}
 */
function countUnreadForDevice(messages, userId, deviceId, legacyCount = 0, deviceCreatedAt = 0) {
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    return Number.isFinite(legacyCount) && legacyCount > 0 ? legacyCount : 0;
  }
  if (!Array.isArray(messages)) return 0;
  const floor = Number.isFinite(deviceCreatedAt) && deviceCreatedAt > 0 ? deviceCreatedAt : 0;
  let count = 0;
  for (const message of messages) {
    // A device cannot have read a message that predates it. Counting pre-install
    // history made a fresh 009 install show 101 unread messages that had already
    // been read on the account's other devices.
    if (floor > 0 && (message.createdAt || 0) < floor) continue;
    if (isUnreadForDevice(message, userId, deviceId)) count += 1;
  }
  return count;
}

module.exports = { countUnreadForDevice };
