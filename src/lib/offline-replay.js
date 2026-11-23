// SPDX-License-Identifier: GPL-3.0-only
/**
 * Which stored messages must be replayed to a device when it authenticates.
 *
 * readBy is a list of device ids that have already received the message. There
 * is one marker that is not a device id: '*' means "every device, past and
 * future" and was written in bulk on 2026-11-22 to stop history from being
 * replayed into live ratchet sessions.
 *
 * The trap: no real device id ever equals '*', so a plain
 * `readBy.includes(deviceId)` check reports such a message as unread forever.
 * Measured on production data on 2026-11-23: 498 messages replayed per
 * WebSocket auth, 459 of which carried '*'.
 */
'use strict';

const READ_ALL = '*';

/**
 * @param {{recipientUserId?: string, readBy?: unknown}} message
 * @param {string} userId  the authenticating user
 * @param {string} deviceId  the authenticating device
 * @returns {boolean} true when the message still has to be delivered
 */
function isUnreadForDevice(message, userId, deviceId) {
  if (!message || message.recipientUserId !== userId) return false;
  const readBy = Array.isArray(message.readBy) ? message.readBy : [];
  if (readBy.includes(READ_ALL)) return false;
  return !readBy.includes(deviceId);
}

module.exports = { isUnreadForDevice, READ_ALL };
