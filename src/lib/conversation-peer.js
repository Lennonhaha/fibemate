// SPDX-License-Identifier: GPL-3.0-only
/**
 * conversation-peer.js — resolve the other participant of a 1:1 conversation.
 *
 * Why this exists:
 *   src/index.js used to read `conv.participantUserId` / `conv.ownerUserId` when a
 *   client sent only `conversationId`. Conversations are stored with `userAId` and
 *   `userBId` (see src/db-sqlite.js conversations table), so that lookup produced
 *   `undefined` and the key-exchange handler hit `if (!recipientUserId) break;`
 *   — a silent drop that left the handshake stuck at "establishing secure session".
 *
 * Contract:
 *   - returns the peer id when `userId` is one of the two participants
 *   - returns null when the conversation is missing, malformed, or `userId` is not
 *     a participant (callers must treat null as "drop", never as "send to someone")
 *   - compares ids as strings so numeric/string ids from different layers still match
 */

/**
 * @param {{userAId?: string, userBId?: string}|null|undefined} conv
 * @param {string|null|undefined} userId
 * @returns {string|null}
 */
function resolvePeerId(conv, userId) {
  if (!conv || userId === undefined || userId === null || userId === '') return null;
  const a = conv.userAId;
  const b = conv.userBId;
  if (a === undefined || a === null || a === '' || b === undefined || b === null || b === '') {
    return null;
  }
  const me = String(userId);
  if (String(a) === me) return b;
  if (String(b) === me) return a;
  return null;
}

module.exports = { resolvePeerId };
