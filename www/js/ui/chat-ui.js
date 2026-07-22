// SPDX-License-Identifier: GPL-3.0-only
/**
 * ChatUI — chat rendering, conversation list, view management, utilities
 * FIBEMATE v2.21-zk-ts
 *
 * Extracted from main.js: appendMessage, loadMessages, loadConversations,
 * showChatEmpty, hideAllMainViews, switchTab, showToast, escapeHtml,
 * formatTime, showModal, hideModal.
 *
 * Usage:
 *   import { ChatUI } from './js/ui/chat-ui.js';
 *   const chatUI = new ChatUI({ apiBase: '/api', onOpenChat: (userId, name) => { ... } });
 */

export class ChatUI {
  /**
   * @param {object} opts
   * @param {string} opts.apiBase          — REST API base URL
   * @param {function} opts.onOpenChat     — (userId, name) => void
   * @param {function} opts.getToken       — () => JWT token
   * @param {function} opts.getCurrentTab  — () => 'messages'|'contacts'|...
   * @param {function} opts.setCurrentTab  — (tab) => void
   * @param {function} opts.setCurrentPeer — (peerId, peerName) => void
   * @param {function} opts.clearCurrentPeer — () => void
   */
  constructor(opts = {}) {
    this._apiBase   = opts.apiBase || '/api';
    this._onOpenChat = opts.onOpenChat || (() => {});
    this._getToken   = opts.getToken || (() => localStorage.getItem('fibemate_token'));
    this._getTab     = opts.getCurrentTab || (() => 'messages');
    this._setTab     = opts.setCurrentTab || (() => {});
    this._setPeer    = opts.setCurrentPeer || (() => {});
    this._clearPeer  = opts.clearCurrentPeer || (() => {});
    this._toastTimer = null;
  }

  // ==========================================
  // View management
  // ==========================================

  hideAllMainViews() {
    const ids = ['chatEmpty', 'chatWindow', 'callView', 'keyDetailView', 'settingsDetailView'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
  }

  showChatEmpty() {
    this.hideAllMainViews();
    const el = document.getElementById('chatEmpty');
    if (el) el.style.display = 'flex';
    document.querySelectorAll('.conversation-item').forEach(item => item.classList.remove('active'));
    this._clearPeer();
  }

  /** Switch to a tab and update nav / panels. */
  switchTab(tab) {
    this._setTab(tab);

    document.querySelectorAll('.nav-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tab));

    document.querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === `panel${ChatUI.capitalize(tab)}`));

    this.hideAllMainViews();
    if (tab === 'messages') {
      const el = document.getElementById('chatEmpty');
      if (el) el.style.display = 'flex';
    } else if (tab === 'keys') {
      const el = document.getElementById('keyDetailView');
      if (el) el.style.display = 'flex';
    } else if (tab === 'settings') {
      const el = document.getElementById('settingsDetailView');
      if (el) el.style.display = 'flex';
    }

    const placeholders = {
      messages: 'Search messages...', contacts: 'Search contacts...',
      vault: 'Search vault...', keys: 'Search keys...', settings: 'Search settings...',
    };
    const input = document.getElementById('searchInput');
    if (input) input.placeholder = placeholders[tab] || 'Search...';
  }

  initNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        this.switchTab(target);
      });
    });
  }

  handleSearch(query) {
    const lower = query.toLowerCase();
    const currentTab = this._getTab();

    if (currentTab === 'messages') {
      document.querySelectorAll('.conversation-item').forEach(item => {
        const name = item.dataset.name?.toLowerCase() || '';
        item.style.display = name.includes(lower) ? 'flex' : 'none';
      });
    } else if (currentTab === 'contacts') {
      document.querySelectorAll('.contact-item').forEach(item => {
        const name = item.dataset.name?.toLowerCase() || '';
        item.style.display = name.includes(lower) ? 'flex' : 'none';
      });
    }
  }

  // ==========================================
  // Chat messages
  // ==========================================

  appendMessage(sent, text, timestamp) {
    const list = document.getElementById('messagesList');
    if (!list) return;
    const time = timestamp ? ChatUI.formatTime(timestamp) : ChatUI.formatTime(Date.now());
    const msg = document.createElement('div');
    msg.className = `message ${sent ? 'sent' : 'received'}`;
    msg.innerHTML = '<div class="msg-bubble">' + ChatUI.escapeHtml(text) + '</div><div class="msg-time">' + time + '</div>';
    list.appendChild(msg);
    list.scrollTop = list.scrollHeight;
  }

  async loadMessages(peerId) {
    const list = document.getElementById('messagesList');
    if (!list) return;
    list.innerHTML = '<div class="date-divider"><span>Today</span></div>';
    try {
      const token = this._getToken();
      const res = await fetch(
        this._apiBase + '/conversations/' + encodeURIComponent(peerId) + '/messages',
        { headers: { Authorization: 'Bearer ' + token } },
      );
      if (!res.ok) throw new Error();
      const msgs = await res.json();
      msgs.forEach(m => this.appendMessage(m.direction === 'sent', m.text, m.timestamp));
    } catch {
      // silent — will show empty chat
    }
    const input = document.getElementById('messageInput');
    if (input) input.focus();
  }

  // ==========================================
  // Conversation list
  // ==========================================

  async loadConversations() {
    const list = document.getElementById('conversationList');
    const empty = document.getElementById('emptyState');
    try {
      const token = this._getToken();
      const res = await fetch(this._apiBase + '/conversations', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) throw new Error();
      const convs = await res.json();
      if (!convs || convs.length === 0) {
        if (empty) empty.style.display = 'flex';
        return this._addDemoConversations(list, empty);
      }
      if (empty) empty.style.display = 'none';
      list.innerHTML = convs.map(c => this._buildConvItem(c)).join('');
      this._bindConvClicks(list);
    } catch {
      if (empty) empty.style.display = 'flex';
      this._addDemoConversations(list, empty);
    }
  }

  _buildConvItem(c) {
    const time = c.lastMessageTime ? ChatUI.formatTime(c.lastMessageTime) : '';
    const preview = c.lastMessage || 'No messages yet';
    const badge = c.unread ? '<span class="conv-badge">' + c.unread + '</span>' : '';
    const online = c.online ? '<span class="online-dot"></span>' : '';
    return '<div class="conversation-item" data-user-id="' + c.userId + '" data-name="' + c.name + '">' +
      '<div class="conv-avatar">' + (c.name || 'U').charAt(0).toUpperCase() + online + '</div>' +
      '<div class="conv-info"><div class="conv-name">' + (c.name || 'Unknown') + '</div><div class="conv-preview">' + ChatUI.escapeHtml(preview) + '</div></div>' +
      '<div class="conv-meta"><span class="conv-time">' + time + '</span>' + badge + '</div>' +
    '</div>';
  }

  _addDemoConversations(list, empty) {
    if (empty) empty.style.display = 'none';
    const demos = [
      { userId: 'demo1', name: 'Alice', lastMessage: 'Hey, is the ZK auth working?', lastMessageTime: Date.now() - 300000, online: true, unread: 2 },
      { userId: 'demo2', name: 'Bob', lastMessage: 'Sphinx packet test passed!', lastMessageTime: Date.now() - 3600000, online: false, unread: 0 },
      { userId: 'demo3', name: 'Charlie', lastMessage: 'Mixnet latency looks good', lastMessageTime: Date.now() - 7200000, online: true, unread: 0 },
    ];
    list.innerHTML = demos.map(c => this._buildConvItem(c)).join('');
    this._bindConvClicks(list);
  }

  _bindConvClicks(list) {
    list.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () =>
        this._onOpenChat(item.dataset.userId, item.dataset.name));
    });
  }

  // ==========================================
  // Status bar
  // ==========================================

  updatePeerStatus(text) {
    const el = document.getElementById('chatPeerStatus');
    if (el) el.textContent = text;
  }

  setPeerHeader(name) {
    const nameEl = document.getElementById('chatPeerName');
    const avatarEl = document.getElementById('chatPeerAvatar');
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  highlightConversation(userId) {
    document.querySelectorAll('.conversation-item').forEach(el =>
      el.classList.remove('active'));
    const el = document.querySelector('[data-user-id="' + userId + '"]');
    if (el) el.classList.add('active');
  }

  // ==========================================
  // Toast
  // ==========================================

  showToast(message, type = 'info') {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.style.display = 'block';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }

  // ==========================================
  // Modals
  // ==========================================

  showModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  }

  hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  // ==========================================
  // Static utilities
  // ==========================================

  static escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  static formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  static capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}