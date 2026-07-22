// SPDX-License-Identifier: GPL-3.0-only
/**
 * E2EEStatusUI — end-to-end encryption status display
 * FIBEMATE v2.21-zk-ts
 *
 * Minimal module: listens for handshake events and updates the
 * chat header status bar + global indicator.
 *
 * Usage:
 *   import { E2EEStatusUI } from './js/ui/e2ee-status.js';
 *   const statusUI = new E2EEStatusUI({ chatUI });
 *   statusUI.init();
 */

export class E2EEStatusUI {
  /**
   * @param {object} opts
   * @param {object} opts.chatUI — ChatUI instance (for updatePeerStatus)
   */
  constructor(opts = {}) {
    this._chatUI = opts.chatUI || null;
  }

  /** Bind global handshake event listeners. */
  init() {
    window.addEventListener('handshake-success', (e) => {
      const { pqEnabled, peerId } = e.detail || {};
      this.setEncryptionStatus(peerId, pqEnabled);
    });

    window.addEventListener('e2ee-status', (e) => {
      const { peerId, status } = e.detail || {};
      if (status) this.setRawStatus(status);
    });
  }

  /**
   * Set E2EE status for a peer (called on handshake).
   * @param {string} peerId
   * @param {boolean} pqEnabled
   */
  setEncryptionStatus(peerId, pqEnabled) {
    const text = pqEnabled
      ? 'End-to-end encrypted · PQ-X3DH'
      : 'End-to-end encrypted · ECDH P-256';

    // Chat header
    if (this._chatUI) this._chatUI.updatePeerStatus(text);

    // Global indicator (if present)
    const indicator = document.getElementById('e2ee-global-indicator');
    if (indicator) {
      indicator.textContent = pqEnabled ? '🔐 PQ' : '🔒 E2EE';
      indicator.className = pqEnabled ? 'e2ee-pq' : 'e2ee-classic';
    }
  }

  /** Raw status text override (e.g. 'Typing...', 'Establishing encryption...'). */
  setRawStatus(text) {
    if (this._chatUI) this._chatUI.updatePeerStatus(text);
  }
}