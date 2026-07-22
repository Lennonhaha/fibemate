// SPDX-License-Identifier: GPL-3.0-only
// ============================================================
// FIBEMATE Legacy Crypto Bridge v2
// Bridges SessionManager (native API) to legacy MessageCrypto (compat API)
//
// Loading order: double-ratchet.js → session-manager.js → legacy-crypto-bridge.js
// ============================================================

const MessageCrypto = (() => {
  'use strict';

  const sm = window.SessionManager;
  if (!sm) throw new Error('[Bridge] SessionManager not loaded!');

  // ============================================================
  // DOM Event Forwarding
  // ============================================================
  sm.on('session:established', (data) => {
    window.dispatchEvent(new CustomEvent('fibemate:session:established', {
      detail: { peerId: data.peerId, type: 'pq_x3dh', timestamp: data.timestamp || new Date().toISOString() }
    }));
    console.log('[Bridge] → fibemate:session:established for', data.peerId);
  });

  sm.on('session:deleted', (data) => {
    window.dispatchEvent(new CustomEvent('fibemate:session:deleted', {
      detail: { peerId: data.peerId }
    }));
  });

  sm.on('keyexchange:completed', (data) => {
    window.dispatchEvent(new CustomEvent('fibemate:keyexchange:completed', {
      detail: { peerId: data.peerId, role: data.role }
    }));
  });

  sm.on('keyexchange:initiated', (data) => {
    window.dispatchEvent(new CustomEvent('fibemate:keyexchange:initiated', {
      detail: { peerId: data.peerId, role: data.role }
    }));
  });

  // ============================================================
  // Core encrypt/decrypt — direct pass-through
  // ============================================================
  async function encrypt(peerId, plaintext) {
    return sm.encrypt(peerId, plaintext);
  }

  async function decrypt(peerId, ciphertext, iv, header) {
    return sm.decrypt(peerId, ciphertext, iv, header);
  }

  async function hasSession(peerId) {
    return sm.hasSession(peerId);
  }

  // ============================================================
  // Key exchange — map legacy names to native SessionManager API
  // ============================================================
  async function initiateKeyExchange(peerId) {
    return sm.createSession(peerId);
  }

  async function respondKeyExchange(peerId, alicePublic, aliceEphemeral, alicePQPublic) {
    return sm.acceptSession(peerId, alicePublic, aliceEphemeral, alicePQPublic);
  }

  async function completeKeyExchange(peerId, bobPublic, bobEphemeral, bobPQPublic) {
    return sm.finalizeSession(peerId, bobPublic, bobEphemeral, bobPQPublic);
  }

  // ============================================================
  // Session management
  // ============================================================
  async function deleteSession(peerId) {
    return sm.deleteSession(peerId);
  }

  async function init() {
    // SessionManager initializes eagerly; no-op for compat
  }

  // ============================================================
  // Progressive API
  // ============================================================
  function getSessionManager() {
    return sm;
  }

  function getSession(peerId) {
    try {
      return sm.getSessionStatus(peerId);
    } catch (e) {
      return null;
    }
  }

  function listSessions() {
    return sm.listSessions();
  }

  // ============================================================
  // Export
  // ============================================================
  const api = {
    encrypt, decrypt, hasSession,
    initiateKeyExchange, respondKeyExchange, completeKeyExchange,
    deleteSession, init,
    getSessionManager, getSession, listSessions
  };

  console.log('[Bridge] Legacy crypto bridge v2 ready — SessionManager active, MessageCrypto API preserved');

  return api;
})();