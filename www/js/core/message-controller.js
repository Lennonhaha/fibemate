/**
 * MessageController — encryption pipeline + conversation management
 * FIBEMATE v2.21-zk-ts
 *
 * Extracted from main.js: openChat() session init + sendMessage() encryption flow.
 * Bridges UI ← → SessionManager ← → WSHandler ← → REST API.
 *
 * Usage:
 *   import { MessageController } from './js/core/message-controller.js';
 *   const msgCtrl = new MessageController({ sessionManager, apiBase, wsHandler });
 *   await msgCtrl.ensureSession(peerId);          // replaced openChat crypto block
 *   await msgCtrl.send(peerId, text);             // replaced sendMessage pipeline
 */

export class MessageController {
  /**
   * @param {object} opts
   * @param {object} opts.sessionManager  — SessionManager instance
   * @param {object} opts.wsHandler       — WSHandler instance
   * @param {string} opts.apiBase         — REST API base URL (e.g. '/api')
   * @param {function} opts.getToken      — () => JWT token string
   * @param {function} opts.onCryptoError — (peerId, error) => void
   */
  constructor(opts = {}) {
    this._sm       = opts.sessionManager;
    this._ws       = opts.wsHandler;
    this._apiBase  = opts.apiBase   || '/api';
    this._getToken = opts.getToken  || (() => localStorage.getItem('fibemate_token'));
    this._onError  = opts.onCryptoError || (() => {});

    // peerId → conversationId cache
    this._convIds  = new Map();
  }

  // ==========================================
  // Session lifecycle
  // ==========================================

  /** Check if an encrypted session exists with peer. */
  async hasSession(peerId) {
    try { return await this._sm.hasSession(peerId); }
    catch { return false; }
  }

  /**
   * Ensure a session exists. If not, create one and initiate key exchange.
   * Returns: { existed: bool, keyData?: object, pqEnabled?: bool }
   *
   * Replaces the crypto block inside openChat().
   */
  async ensureSession(peerId) {
    try {
      const existed = await this._sm.hasSession(peerId);
      if (existed) {
        return { existed: true };
      }
    } catch {
      // IndexedDB may be unavailable — treat as no session
    }

    console.log('[MsgCtrl] No session with %s, initiating key exchange...', peerId);

    // Try PQ hybrid first
    const keyData = await this._sm.createSession(peerId);

    this._ws.sendKeyExchange(peerId, keyData);

    return {
      existed: false,
      keyData,
      pqEnabled: !!keyData.pqPk,
    };
  }

  /**
   * Accept an incoming key exchange request (Bob side).
   * Returns the response data to send back.
   */
  async acceptSession(peerId, identityPublic, ephemeralPublic, pqPk) {
    return this._sm.acceptSession(peerId, identityPublic, ephemeralPublic, pqPk);
  }

  /**
   * Finalize a key exchange (Alice receives Bob's response).
   * Returns { pqEnabled, degraded?, degradeReason? }.
   * Auto-degrades if PQ decaps fails.
   */
  async finalizeSession(peerId, identityPublic, signedPreKeyPublic, pqCt) {
    return this._sm.finalizeSession(peerId, identityPublic, signedPreKeyPublic, pqCt);
  }

  /** Create session with skipPQ fallback (for degraded retry). */
  async createSessionFallback(peerId) {
    return this._sm.createSession(peerId, { skipPQ: true });
  }

  // ==========================================
  // Message send pipeline
  // ==========================================

  /**
   * Encrypt + send a message via WebSocket (primary) and REST (persistence).
   *
   * Pipeline:
   *   1. Ensure conversation exists → get conversationId
   *   2. Try PQ hybrid encrypt → fallback to plaintext
   *   3. Send ciphertext via WS
   *   4. POST ciphertext to REST for server-side persistence
   *
   * Returns: { sent: bool, encrypted: bool, error?: string }
   */
  async send(peerId, text) {
    // --- 1. Ensure conversation ---
    let convId = this._convIds.get(peerId);
    if (!convId) {
      convId = await this._ensureConversation(peerId);
      if (convId) this._convIds.set(peerId, convId);
    }

    // --- 2. Encrypt ---
    let encrypted = false;
    let ciphertextBase64;
    let cryptoHeader = null;
    let ivBase64 = null;

    try {
      const hasSession = await this._sm.hasSession(peerId);
      if (hasSession) {
        const result = await this._sm.encrypt(peerId, text);
        ciphertextBase64 = btoa(String.fromCharCode(...result.ciphertext));
        ivBase64         = btoa(String.fromCharCode(...result.iv));
        cryptoHeader     = JSON.stringify(result.header);
        encrypted        = true;
        console.log('[MsgCtrl] Message encrypted for', peerId);
      } else {
        // No session — send plaintext with base64 fallback
        ciphertextBase64 = btoa(unescape(encodeURIComponent(text)));
        console.warn('[MsgCtrl] No session with %s, sending plaintext', peerId);
        this._onError(peerId, 'nosession');
      }
    } catch (encryptErr) {
      console.warn('[MsgCtrl] Encrypt failed, sending plaintext:', encryptErr.message);
      ciphertextBase64 = btoa(unescape(encodeURIComponent(text)));
      this._onError(peerId, encryptErr.message);
    }

    // --- 3. Send via WebSocket (real-time) ---
    this._ws.sendMessage(peerId, {
      ciphertext: ciphertextBase64,
      iv: ivBase64,
      header: cryptoHeader,
    });

    // --- 4. POST to REST (persistence) ---
    try {
      const token = this._getToken();
      const res = await fetch(`${this._apiBase}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: convId,
          ciphertext: ciphertextBase64,
          messageType: 'text',
          burnAfterRead: false,
          ...(cryptoHeader && { cryptoHeader, iv: ivBase64 }),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { sent: false, encrypted, error: `HTTP ${res.status}: ${text}` };
      }

      return { sent: true, encrypted };
    } catch (err) {
      return { sent: false, encrypted, error: err.message };
    }
  }

  // ==========================================
  // Message receive pipeline
  // ==========================================

  /**
   * Decrypt an incoming message.
   * Returns: { plaintext: string, encrypted: bool }
   */
  async decrypt(peerId, ciphertext, iv, header) {
    try {
      const plaintext = await this._sm.decrypt(peerId, ciphertext, iv, header);
      return { plaintext, encrypted: true };
    } catch (err) {
      console.warn('[MsgCtrl] Decrypt failed:', err.message);
      return { plaintext: '[Encrypted message]', encrypted: false };
    }
  }

  // ==========================================
  // Conversation Id management
  // ==========================================

  /** Get (or create) the REST conversation id for a peer. */
  async _ensureConversation(peerId) {
    try {
      const token = this._getToken();
      const res = await fetch(`${this._apiBase}/conversations/find-or-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ peerId }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.id || data.conversationId || data._id || null;
    } catch (err) {
      console.warn('[MsgCtrl] ensureConversation failed:', err.message);
      return null;
    }
  }

  /** Look up cached convId (non-blocking). */
  getConversationId(peerId) {
    return this._convIds.get(peerId) || null;
  }

  /** Invalidate convId cache (e.g. on logout). */
  clearCache() {
    this._convIds.clear();
  }
}