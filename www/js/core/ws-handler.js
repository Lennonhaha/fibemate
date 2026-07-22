// SPDX-License-Identifier: GPL-3.0-only
/**
 * WSHandler — WebSocket connection lifecycle + message dispatch
 * FIBEMATE v2.21-zk-ts
 *
 * Extracted from main.js onmessage (lines 135-240).
 * Handles: message, key_exchange_request, key_exchange_response,
 *          typing, call_offer/call_answer/ice_candidate.
 *
 * Usage:
 *   import { WSHandler } from './js/core/ws-handler.js';
 *   const wsHandler = new WSHandler({ sessionManager, onMessage, onStatusChange, onToast });
 *   wsHandler.connect();
 */

import { getWebSocketUrl } from './backend-router.js';

const RECONNECT_DELAY = 5000;   // ms
const TYPING_TIMEOUT  = 2000;   // ms

export class WSHandler {
  /**
   * @param {object} opts
   * @param {object} opts.sessionManager  — SessionManager instance
   * @param {function} opts.onMessage      — (peerId, plaintext, timestamp) => void
   * @param {function} opts.onStatusChange — (statusText) => void
   * @param {function} opts.onToast        — (message, type) => void
   * @param {function} opts.onHandshake    — ({ pqEnabled, peerId }) => void (optional)
   * @param {function} opts.onWebRTC       — (msg) => void (optional, delegates call_offer/answer/ice)
   * @param {function} opts.getCurrentPeer — () => currentPeerId  (optional, for typing filter)
   */
  constructor(opts = {}) {
    this._sm         = opts.sessionManager;
    this._onMessage  = opts.onMessage  || (() => {});
    this._onStatus   = opts.onStatusChange || (() => {});
    this._onToast    = opts.onToast    || (() => {});
    this._onHandshake = opts.onHandshake || (() => {});
    this._onWebRTC   = opts.onWebRTC   || (() => {});
    this._getPeer    = opts.getCurrentPeer || (() => null);

    this._ws        = null;
    this._reconnect = null;
    this._typingTimer = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  /** Open (or reopen) the WebSocket connection. */
  connect() {
    const token = localStorage.getItem('fibemate_token');
    if (!token) {
      console.warn('[WSHandler] No token — cannot connect');
      return;
    }

    // Prevent double-connect
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = getWebSocketUrl() + '?token=' + token;
    console.log('[WSHandler] Connecting to', url);

    try {
      this._ws = new WebSocket(url);
    } catch (err) {
      console.error('[WSHandler] WebSocket constructor failed:', err);
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      console.log('[WSHandler] Connected');
      this._onToast('Real-time connected', 'success');
    };

    this._ws.onmessage = async (e) => { await this._dispatch(e); };

    this._ws.onclose = () => {
      console.log('[WSHandler] Disconnected');
      this._scheduleReconnect();
    };

    this._ws.onerror = (err) => {
      console.error('[WSHandler] Error:', err);
    };
  }

  /** Graceful close. */
  disconnect() {
    if (this._reconnect) { clearTimeout(this._reconnect); this._reconnect = null; }
    if (this._ws) {
      this._ws.onclose = null;  // suppress reconnect
      this._ws.close();
      this._ws = null;
    }
  }

  // ==========================================
  // Send helpers
  // ==========================================

  send(obj) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      console.warn('[WSHandler] Cannot send — socket not open');
      return false;
    }
    this._ws.send(JSON.stringify(obj));
    return true;
  }

  /** Initiate key exchange as Alice. */
  sendKeyExchange(to, keyData) {
    return this.send({
      type: 'key_exchange',
      to,
      exchangeType: 'x3dh_init',
      payload: {
        identityPublic: keyData.identityPublic,
        ephemeralPublic: keyData.ephemeralPublic,
        ...(keyData.pqPk ? { pqPk: keyData.pqPk } : {}),
      },
    });
  }

  /** Send encrypted message. */
  sendMessage(to, { ciphertext, iv, header }) {
    return this.send({
      type: 'message',
      to,
      ciphertext,
      iv,
      header,
    });
  }

  /** Respond to key exchange request (Bob). */
  sendKeyExchangeResponse(to, exchangeId, responseData) {
    return this.send({
      type: 'key_exchange_response',
      exchangeId,
      to,
      responsePayload: {
        identityPublic: responseData.identityPublic,
        signedPreKeyPublic: responseData.signedPreKeyPublic,
        ...(responseData.pqCt ? { pqCt: responseData.pqCt } : {}),
      },
    });
  }

  /** WebRTC signaling. */
  sendCallOffer(to, offer) {
    return this.send({ type: 'call_offer', to, offer });
  }
  sendCallAnswer(to, answer) {
    return this.send({ type: 'call_answer', to, answer });
  }
  sendIceCandidate(to, candidate) {
    return this.send({ type: 'ice_candidate', to, candidate });
  }

  // ==========================================
  // Incoming dispatch
  // ==========================================

  async _dispatch(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn('[WSHandler] Non-JSON message ignored');
      return;
    }

    try {
      switch (msg.type) {
        case 'message':
          await this._handleMessage(msg);
          break;
        case 'key_exchange_request':
          await this._handleKeyExchangeRequest(msg);
          break;
        case 'key_exchange_response':
          await this._handleKeyExchangeResponse(msg);
          break;
        case 'typing':
          this._handleTyping(msg);
          break;
        case 'call_offer':
        case 'call_answer':
        case 'ice_candidate':
          this._onWebRTC(msg);
          break;
        default:
          console.log('[WSHandler] Unknown message type:', msg.type);
      }
    } catch (err) {
      console.error('[WSHandler] Dispatch error:', err);
    }
  }

  // ==========================================
  // Message handlers
  // ==========================================

  async _handleMessage(msg) {
    const currentPeer = this._getPeer();
    try {
      let plaintext = msg.text;

      if (msg.ciphertext && msg.header && msg.iv) {
        if (msg.from === currentPeer) {
          plaintext = await this._sm.decrypt(msg.from, msg.ciphertext, msg.iv, msg.header);
        }
      }

      if (msg.from === currentPeer) {
        this._onMessage(false, plaintext, msg.timestamp || Date.now());
      } else {
        this._onToast('New message from ' + msg.from, 'info');
        // trigger conversation list refresh — caller can listen to this via custom event
        window.dispatchEvent(new CustomEvent('ws-new-message', { detail: { from: msg.from } }));
      }
    } catch (decryptErr) {
      console.error('[WSHandler] Decrypt error:', decryptErr);
      if (msg.from === currentPeer) {
        this._onMessage(false, '[Encrypted message]', msg.timestamp || Date.now());
      }
    }
  }

  async _handleKeyExchangeRequest(msg) {
    console.log('[WSHandler] Key exchange request from', msg.from);
    try {
      const payload = msg.payload || {};
      const responseData = await this._sm.acceptSession(
        msg.from,
        payload.identityPublic || payload.publicKey,
        payload.ephemeralPublic,
        payload.pqPk,
      );

      this.sendKeyExchangeResponse(msg.from, msg.exchangeId, responseData);

      this._onStatus(
        responseData.pqEnabled
          ? 'End-to-end encrypted \u00B7 PQ-X3DH'
          : 'End-to-end encrypted \u00B7 ECDH P-256'
      );

      this._onHandshake({ pqEnabled: !!responseData.pqEnabled, peerId: msg.from });
    } catch (e) {
      console.error('[WSHandler] Key exchange response failed:', e.message);
    }
  }

  async _handleKeyExchangeResponse(msg) {
    const currentPeer = this._getPeer();
    if (msg.from !== currentPeer) return;

    console.log('[WSHandler] Key exchange response from', msg.from);
    try {
      const payload = msg.responsePayload || {};
      const result = await this._sm.finalizeSession(
        msg.from,
        payload.identityPublic || payload.publicKey,
        payload.signedPreKeyPublic || payload.ephemeralPublic,
        payload.pqCt,
      );

      // PQ decaps failed → auto-degrade retry
      if (result && result.degraded) {
        console.log('[WSHandler] PQ decaps failed, retrying without PQ...');
        this._onToast('PQ key exchange unavailable, falling back to classical encryption...', 'warning');

        const keyData = await this._sm.createSession(msg.from, { skipPQ: true });
        this.sendKeyExchange(msg.from, keyData);
        return;
      }

      const pq = !!(result && result.pqEnabled);
      this._onStatus(pq ? 'End-to-end encrypted \u00B7 PQ-X3DH' : 'End-to-end encrypted \u00B7 ECDH P-256');
      this._onHandshake({ pqEnabled: pq, peerId: msg.from });
      this._onToast(pq ? 'PQ Hybrid encryption established' : 'Encryption established', 'success');
    } catch (e) {
      console.error('[WSHandler] Key exchange completion failed:', e.message);
    }
  }

  _handleTyping(msg) {
    const currentPeer = this._getPeer();
    if (msg.from !== currentPeer) return;

    this._onStatus('Typing...');
    if (this._typingTimer) clearTimeout(this._typingTimer);
    this._typingTimer = setTimeout(() => {
      this._onStatus('End-to-end encrypted \u00B7 ECDH P-256');
    }, TYPING_TIMEOUT);
  }

  // ==========================================
  // Internal
  // ==========================================

  _scheduleReconnect() {
    if (this._reconnect) return;
    this._reconnect = setTimeout(() => {
      this._reconnect = null;
      this.connect();
    }, RECONNECT_DELAY);
  }
}
