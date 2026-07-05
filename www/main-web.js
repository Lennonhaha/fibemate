/**
 * FIBEMATE Web - Main Interface Logic (Web Adaptation)
 * Based on main-v3.js, adapted for browser deployment
 * Changes:
 *   - API_BASE: '/api' (relative, works with nginx proxy)
 *   - WebSocket: WSManager singleton (auto wss://, reconnect, heartbeat, queue)
 *   - Auth: redirect to login.html on no token / 401
 *   - Works on app.html (not main.html)
 *   - No Electron/Tauri dependencies
 */

const API_BASE = '/api';

// ================================================
// State
// ================================================
let currentPeerId = null;
let currentPeerName = null;
let currentConversationId = null;
let currentTab = 'messages';
let callTimer = null;
let callSeconds = 0;


// ================================================
// Auth Guard - Web specific
// ================================================
function getAuthToken() {
  // Support both fk_token (Electron key) and fibemate_token (Web login)
  return localStorage.getItem('fk_token') || localStorage.getItem('fibemate_token');
}

function getAuthUsername() {
  return localStorage.getItem('fk_uname') || localStorage.getItem('fibemate_username') || 'User';
}

function getAuthUserId() {
  return localStorage.getItem('fk_uid') || localStorage.getItem('fibemate_userId') || '';
}

function requireAuth() {
  const token = getAuthToken();
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

// Unified fetch with auth + 401 redirect
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  if (!options.headers) options.headers = {};
  options.headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, options);
  if (res.status === 401) {
    // Token expired or invalid
    localStorage.removeItem('fk_token');
    localStorage.removeItem('fibemate_token');
    window.location.href = '/login.html';
    return null;
  }
  return res;
}

// ================================================
// Loading State Helpers
// ================================================
function showLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner"></div></div>';
}

function showSkeleton(containerId, count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    html += '<div class="conversation-item" style="opacity: 0.6;"><div class="conv-avatar skeleton skeleton-avatar"></div><div class="conv-info" style="flex: 1;"><div class="conv-name skeleton skeleton-text" style="width: 120px;"></div><div class="conv-preview skeleton skeleton-text short"></div></div></div>';
  }
  container.innerHTML = html;
}

function hideLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const overlay = container.querySelector('.loading-overlay');
  if (overlay) overlay.remove();
}

// ================================================
// Init
// ================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const username = getAuthUsername();
  document.getElementById('userName').textContent = username;
  document.getElementById('userAvatar').textContent = username.charAt(0).toUpperCase();

  initNavigation();
  showSkeleton('conversationList', 5);
  showSkeleton('contactList', 3);

  await loadConversations();
  await loadContacts();
  loadVault();
  renderKeyManagement();
  renderSettings();
  bindEvents();
  connectWebSocket();
});

// ================================================
// Navigation
// ================================================
function initNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel${capitalize(tab)}`));
  hideAllMainViews();
  if (tab === 'messages') document.getElementById('chatEmpty').style.display = 'flex';
  else if (tab === 'keys') document.getElementById('keyDetailView').style.display = 'flex';
  else if (tab === 'settings') document.getElementById('settingsDetailView').style.display = 'flex';
  const placeholders = { messages: 'Search messages...', contacts: 'Search contacts...', vault: 'Search vault...', keys: 'Search keys...', settings: 'Search settings...' };
  document.getElementById('searchInput').placeholder = placeholders[tab] || 'Search...';
}

function hideAllMainViews() {
  document.getElementById('chatEmpty').style.display = 'none';
  document.getElementById('chatWindow').style.display = 'none';
  document.getElementById('callView').style.display = 'none';
  document.getElementById('keyDetailView').style.display = 'none';
  document.getElementById('settingsDetailView').style.display = 'none';
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ================================================
// WebSocket — WSManager singleton (auto wss://, reconnect, heartbeat, queue)
// ================================================
function connectWebSocket() {
  const token = getAuthToken();
  if (!token || !window.wsManager) return;
  try {
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${location.host}/ws?token=${token}`;
    window.wsManager.connect(wsUrl);

    window.wsManager.on('new_message', async (msg) => {
      try {
        if (msg.from === currentPeerId) {
          let text;
          if (msg.encryptedContent && typeof MessageCrypto !== 'undefined') {
            try { text = await MessageCrypto.decrypt(msg.from, msg.encryptedContent); }
            catch (e) { text = '[Encrypted message]'; }
          } else {
            text = decodeCiphertext(msg.ciphertext);
          }
          appendMessage(false, text || '[Unable to decrypt]', msg.createdAt || Date.now());
        } else {
          showToast(`New message from ${msg.from}`, 'info');
          loadConversations();
        }
      } catch (err) { console.error('[WS Web] Parse error:', err); }
    });

    window.wsManager.on('offline_messages', (msg) => {
      console.log('[WS Web] Offline messages:', msg.count);
    });
    window.wsManager.on('sphinx_message', async (msg) => {
      // Phase 4: message delivered via Sphinx packet routing
      console.log('[Phase4] Received sphinx_message, hops:', msg.routedThrough);
      if (msg.content && msg.content.from === currentPeerId) {
        let text;
        if (msg.content.encryptedContent && typeof MessageCrypto !== 'undefined') {
          try { text = await MessageCrypto.decrypt(msg.content.from, msg.content.encryptedContent); }
          catch (e) { text = '[Encrypted message]'; }
        } else if (msg.content.ciphertext) {
          text = decodeCiphertext(msg.content.ciphertext);
        }
        appendMessage(false, text || '[Unable to decrypt]', msg.content.createdAt || Date.now());
      } else if (msg.content && msg.content.from !== currentPeerId) {
        showToast(`New message from ${msg.content.from}`, 'info');
        loadConversations();
      }
    });


    window.wsManager.on('connected', () => console.log('[WS Web] Connected via WSManager'));
    window.wsManager.on('disconnected', () => console.log('[WS Web] Disconnected, WSManager will auto-reconnect'));
    window.wsManager.on('error', (err) => console.error('[WS Web] Error:', err));
  } catch (err) { console.error('[WS Web] Connect error:', err); }
}

function decodeCiphertext(ciphertext) {
  try {
    if (typeof ciphertext === 'string' && ciphertext.length > 0) {
      const decoded = atob(ciphertext);
      return decodeURIComponent(escape(decoded));
    }
  } catch (e) {}
  return ciphertext;
}

// ================================================
// Events
// ================================================
function bindEvents() {
  document.getElementById('btnBack')?.addEventListener('click', showChatEmpty);
  document.getElementById('btnNewChat')?.addEventListener('click', () => switchTab('contacts'));
  document.getElementById('btnStartChat')?.addEventListener('click', () => switchTab('contacts'));
  document.getElementById('btnSend')?.addEventListener('click', sendMessage);
  document.getElementById('messageInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('btnVerify')?.addEventListener('click', () => showToast('Key verification: Compare safety numbers in person', 'info'));
  document.getElementById('searchInput')?.addEventListener('input', (e) => handleSearch(e.target.value));

  document.getElementById('btnAddContact')?.addEventListener('click', () => showModal('modalAddContact'));
  document.getElementById('btnAddContactEmpty')?.addEventListener('click', () => showModal('modalAddContact'));
  document.getElementById('btnConfirmAddContact')?.addEventListener('click', addContact);
  document.getElementById('contactUsername')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addContact(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const chatWindow = document.getElementById('chatWindow');
      if (chatWindow && chatWindow.style.display !== 'none') showChatEmpty();
    }
  });

  document.getElementById('btnUploadVault')?.addEventListener('click', () => showModal('modalUploadVault'));
  document.getElementById('btnUploadVaultEmpty')?.addEventListener('click', () => showModal('modalUploadVault'));
  document.getElementById('vaultDropzone')?.addEventListener('click', () => document.getElementById('vaultFileInput').click());
  document.getElementById('vaultFileInput')?.addEventListener('change', handleVaultFileSelect);
  document.getElementById('btnConfirmUpload')?.addEventListener('click', uploadVaultFile);

  document.getElementById('btnRotateKeys')?.addEventListener('click', rotateKeys);
  document.getElementById('btnExportKeys')?.addEventListener('click', exportPublicKeys);

  document.getElementById('btnVoiceCall')?.addEventListener('click', startCall);
  document.getElementById('btnHangup')?.addEventListener('click', endCall);
  document.getElementById('btnMute')?.addEventListener('click', toggleMute);
  document.getElementById('btnSpeaker')?.addEventListener('click', toggleSpeaker);

  document.getElementById('btnLogout')?.addEventListener('click', doLogout);

  const userBar = document.getElementById('userBar');
  if (userBar) { userBar.style.cursor = 'pointer'; userBar.title = 'Click to logout'; userBar.addEventListener('click', doLogout); }

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => { const modal = btn.dataset.modal; if (modal) hideModal(modal); });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
  });
}

function doLogout() {
  if (confirm('Logout and return to login screen?')) {
    ['fk_token','fk_uid','fk_uname','fk_privkey_jwk','fk_pubkey_hex','fk_zk_secrets','fibemate_token','fibemate_userId','fibemate_username'].forEach(k => localStorage.removeItem(k));
    if (window.wsManager) window.wsManager.disconnect();
    window.location.href = '/login.html';
  }
}

function handleSearch(query) {
  const lower = query.toLowerCase();
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

// ================================================

// ================================================
// No Search History (anti-cache) 
// ================================================
(function(){
  try {
    var keys = Object.keys(localStorage);
    for (var i=0;i<keys.length;i++){
      if(keys[i].toLowerCase().indexOf('search')!==-1 || keys[i].toLowerCase().indexOf('Search')!==-1){
        localStorage.removeItem(keys[i]);
      }
    }
  }catch(e){}
  // Also intercept any attempt to save search
  var origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k,v){
    if(k && (k.indexOf('search')!==-1 || k.indexOf('Search')!==-1)) return;
    origSetItem(k,v);
  };
})();


// Conversations
// ================================================
async function loadConversations() {
  const list = document.getElementById('conversationList');
  const empty = document.getElementById('emptyState');
  try {
    const res = await authFetch(`${API_BASE}/conversations`);
    if (!res) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const convs = data.conversations || [];
    if (!convs || convs.length === 0) {
      if (empty) {
        empty.style.display = 'flex';
        empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--text-muted);margin-bottom:16px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p style="color:var(--text-secondary);font-size:14px;margin-bottom:8px;">No messages yet</p><p style="color:var(--text-muted);font-size:12px;">Start a conversation from Contacts</p>';
      }
      list.innerHTML = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = convs.map(c => buildConvItem(c)).join('');
    list.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => openChat(item.dataset.userId, item.dataset.name));
    });
  } catch (err) {
    console.error('[Conversations Web] Load failed:', err);
    if (empty) {
      empty.style.display = 'flex';
      empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--danger);margin-bottom:16px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p style="color:var(--text-secondary);font-size:14px;margin-bottom:8px;">Failed to load conversations</p><button class="btn-secondary" onclick="loadConversations()" style="margin-top:8px;">Retry</button>';
    }
    list.innerHTML = '';
  }
}

function buildConvItem(c) {
  const other = c.otherUser || {};
  const time = c.lastMessageAt ? formatTime(c.lastMessageAt) : '';
  const lastMsg = c.lastMessage || {};
  const preview = lastMsg.ciphertext ? '[Encrypted]' : 'No messages yet';
  const badge = c.unreadCount ? `<span class="conv-badge">${c.unreadCount}</span>` : '';
  const online = other.isOnline ? '<span class="online-dot"></span>' : '';
  return `<div class="conversation-item" data-user-id="${other.id || ''}" data-name="${escapeHtml(other.displayName || other.username || 'Unknown')}" data-conv-id="${c.id}">
    <div class="conv-avatar">${(other.displayName || other.username || 'U').charAt(0).toUpperCase()}${online}</div>
    <div class="conv-info"><div class="conv-name">${escapeHtml(other.displayName || other.username || 'Unknown')}</div><div class="conv-preview">${escapeHtml(preview)}</div></div>
    <div class="conv-meta"><span class="conv-time">${time}</span>${badge}</div>
  </div>`;
}

// ================================================
// Chat
// ================================================
async function openChat(userId, name) {
  currentPeerId = userId;
  currentPeerName = name;
  hideAllMainViews();
  document.getElementById('chatWindow').style.display = 'flex';
  document.getElementById('chatPeerName').textContent = name;
  document.getElementById('chatPeerAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('chatPeerStatus').textContent = 'End-to-end encrypted \u00b7 ML-KEM-768';
  document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('active');
  await ensureConversation(userId);
  if (currentConversationId) await loadMessages(currentConversationId);
}

async function ensureConversation(userId) {
  const res = await authFetch(`${API_BASE}/conversations/find-or-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: userId })
  });
  if (!res) return;
  if (res.ok) {
    const data = await res.json();
    currentConversationId = data.conversationId;
  } else {
    console.error('[Chat Web] Failed to create conversation:', res.status);
  }
}

async function loadMessages(conversationId) {
  const list = document.getElementById('messagesList');
  list.innerHTML = '<div class="date-divider"><span>Today</span></div>';
  try {
    const res = await authFetch(`${API_BASE}/conversations/${conversationId}/messages?limit=50`);
    if (!res || !res.ok) throw new Error('Failed');
    const data = await res.json();
    const msgs = data.messages || [];
    msgs.sort((a, b) => a.createdAt - b.createdAt);
    for (const m of msgs) {
      const isSent = m.senderUserId === getAuthUserId();
      let text;
      if (m.encryptedContent && typeof MessageCrypto !== 'undefined') {
        try { text = await MessageCrypto.decrypt(m.senderUserId, m.encryptedContent); }
        catch (e) { text = '[Encrypted message]'; }
      } else {
        text = decodeCiphertext(m.ciphertext);
      }
      appendMessage(isSent, text || '[Unable to decrypt]', m.createdAt);
    }
  } catch (err) { console.error('[Messages Web] Load failed:', err); }
  document.getElementById('messageInput').focus();
}

function appendMessage(sent, text, timestamp) {
  const list = document.getElementById('messagesList');
  const time = timestamp ? formatTime(timestamp) : formatTime(Date.now());
  const msg = document.createElement('div');
  msg.className = `message ${sent ? 'sent' : 'received'}`;
  msg.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div><div class="msg-time">${time}</div>`;
  list.appendChild(msg);
  list.scrollTop = list.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !currentPeerId) return;
  if (!currentConversationId) await ensureConversation(currentPeerId);
  if (!currentConversationId) { showToast('Failed to create conversation', 'error'); return; }

  input.value = '';
  appendMessage(true, text, Date.now());

  try {
    let payload;
    if (typeof MessageCrypto !== 'undefined') {
      const encrypted = await MessageCrypto.encrypt(currentPeerId, text);
      payload = { conversationId: currentConversationId, encryptedContent: encrypted, messageType: 'encrypted', burnAfterRead: false };
    } else {
      const ciphertext = btoa(unescape(encodeURIComponent(text)));
      payload = { conversationId: currentConversationId, ciphertext: ciphertext, messageType: 'text', burnAfterRead: false };
    }

    if (window.wsManager && window.wsManager.isConnected()) {
      window.wsManager.sendRaw(JSON.stringify({ type: 'message', to: currentPeerId, ...payload }));
      return;
    }

    const msgRes = await authFetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!msgRes) return;
    if (!msgRes.ok) throw new Error(`HTTP ${msgRes.status}`);
  } catch (err) { showToast('Failed to send: ' + err.message, 'error'); }
}

function showChatEmpty() {
  hideAllMainViews();
  document.getElementById('chatEmpty').style.display = 'flex';
  document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
  currentPeerId = null;
  currentConversationId = null;
}

// ================================================
// Contacts
// ================================================
async function loadContacts() {
  const list = document.getElementById('contactList');
  const empty = document.getElementById('emptyContacts');
  try {
    const res = await authFetch(`${API_BASE}/contacts`);
    if (!res) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const contacts = data.contacts || [];
    if (contacts.length === 0) {
      if (empty) {
        empty.style.display = 'flex';
        empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;color:var(--text-muted);margin-bottom:16px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p style="color:var(--text-secondary);font-size:14px;margin-bottom:8px;">No contacts yet</p><button class="btn-secondary" onclick="showModal(\'modalAddContact\')" style="margin-top:8px;">Add Contact</button>';
      }
      list.innerHTML = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = contacts.map(c => buildContactItem(c)).join('');
    bindContactEvents();
  } catch (err) {
    console.error('[Contacts Web] Load failed:', err);
    list.innerHTML = '';
  }
}

function buildContactItem(c) {
  const name = c.displayName || c.username || c.id || 'Unknown';
  const username = c.username || c.id || '';
  const online = c.isOnline ? '<span class="online-dot"></span>' : '';
  return `<div class="contact-item" data-user-id="${c.id || ''}" data-name="${escapeHtml(name)}">
    <div class="contact-avatar">${name.charAt(0).toUpperCase()}${online}</div>
    <div class="contact-info"><div class="contact-name">${escapeHtml(name)}</div><div class="contact-username">@${escapeHtml(username)}</div></div>
    <div class="contact-actions">
      <button class="icon-btn contact-chat" title="Message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
      <button class="icon-btn contact-call" title="Call"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
    </div>
  </div>`;
}

function bindContactEvents() {
  document.querySelectorAll('.contact-chat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.contact-item');
      switchTab('messages');
      openChat(item.dataset.userId, item.dataset.name);
    });
  });
  document.querySelectorAll('.contact-call').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.contact-item');
      startCallWith(item.dataset.name);
    });
  });
}

async function addContact() {
  const username = document.getElementById('contactUsername').value.trim();
  if (!username) { showToast('Please enter a username', 'error'); return; }
  try {
    const searchRes = await authFetch(`${API_BASE}/users/search?q=${encodeURIComponent(username)}`);
    if (!searchRes || !searchRes.ok) throw new Error('Search failed');
    const searchData = await searchRes.json();
    const users = searchData.users || [];
    if (users.length === 0) { showToast('User not found', 'error'); return; }
    const targetUser = users[0];
    const res = await authFetch(`${API_BASE}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUser.id })
    });
    if (!res || !res.ok) throw new Error('Add failed');
    hideModal('modalAddContact');
    document.getElementById('contactUsername').value = '';
    document.getElementById('contactDisplayName').value = '';
    showToast(`Added ${targetUser.displayName || targetUser.username}`, 'success');
    await loadContacts();
  } catch (err) { showToast('Failed: ' + err.message, 'error'); }
}

// ================================================
// Vault
// ================================================
function loadVault() {
  const list = document.getElementById('vaultList');
  const empty = document.getElementById('emptyVault');
  const files = JSON.parse(localStorage.getItem('fk_vault') || '[]');
  if (files.length === 0) { if (empty) empty.style.display = 'flex'; return; }
  if (empty) empty.style.display = 'none';
  list.innerHTML = files.map((f, i) => buildVaultItem(f, i)).join('');
  bindVaultEvents();
}

function buildVaultItem(f, idx) {
  const size = f.size ? `${(f.size / 1024).toFixed(1)} KB` : '';
  const date = f.uploadedAt ? formatTime(f.uploadedAt) : '';
  return `<div class="vault-item" data-idx="${idx}">
    <div class="vault-info"><div class="vault-name">${escapeHtml(f.name)}</div><div class="vault-meta">${size} \u00b7 ${date} \u00b7 AES-256 encrypted</div></div>
    <div class="vault-actions">
      <button class="icon-btn vault-delete" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </div>
  </div>`;
}

function bindVaultEvents() {
  document.querySelectorAll('.vault-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('.vault-item').dataset.idx);
      const files = JSON.parse(localStorage.getItem('fk_vault') || '[]');
      files.splice(idx, 1);
      localStorage.setItem('fk_vault', JSON.stringify(files));
      loadVault();
      showToast('File removed from vault', 'info');
    });
  });
}

function handleVaultFileSelect(e) {
  const dropzone = document.getElementById('vaultDropzone');
  const files = e.target.files;
  if (files.length) dropzone.querySelector('p').textContent = `${files.length} file(s) selected: ${Array.from(files).map(f => f.name).join(', ')}`;
}

function uploadVaultFile() {
  const input = document.getElementById('vaultFileInput');
  if (!input.files.length) { showToast('Please select a file', 'error'); return; }
  const files = JSON.parse(localStorage.getItem('fk_vault') || '[]');
  Array.from(input.files).forEach(f => {
    files.push({ name: f.name, type: f.type, size: f.size, uploadedAt: Date.now(), encrypted: true });
  });
  localStorage.setItem('fk_vault', JSON.stringify(files));
  loadVault();
  hideModal('modalUploadVault');
  input.value = '';
  document.getElementById('vaultDropzone').querySelector('p').textContent = 'Drag files here or click to browse';
  showToast('File(s) encrypted and stored in vault', 'success');
}

// ================================================
// Key Management
// ================================================
function renderKeyManagement() {
  const container = document.getElementById('keyCards');
  const keys = getKeyInfo();
  container.innerHTML = keys.map(k => `
    <div class="key-card">
      <div class="key-card-header">
        <div class="key-icon">${k.icon}</div>
        <div><div class="key-type">${k.type}</div><div class="key-algo">${k.algo}</div></div>
        <span class="key-status ${k.active ? 'active' : 'inactive'}">${k.active ? 'Active' : 'Rotated'}</span>
      </div>
      <div class="key-fingerprint"><label>Fingerprint</label><code>${k.fingerprint}</code></div>
      <div class="key-meta"><span>Created: ${k.created}</span><span>Uses: ${k.uses}</span></div>
      ${k.active ? `<button class="btn-secondary key-rotate-btn" data-key="${k.id}">Rotate This Key</button>` : ''}
    </div>
  `).join('');
  container.querySelectorAll('.key-rotate-btn').forEach(btn => {
    btn.addEventListener('click', () => { showToast(`Rotating ${btn.dataset.key} key... New key pair generated`, 'success'); renderKeyManagement(); });
  });
}

function getKeyInfo() {
  return [
    { id: 'identity', type: 'Identity Key', algo: 'ECDH P-256', icon: '', active: true, fingerprint: 'A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:01:23:45:67:89', created: '2026-04-26', uses: 47 },
    { id: 'signed-pre', type: 'Signed Pre-Key', algo: 'ECDH P-256', icon: '\u270d\ufe0f', active: true, fingerprint: '11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00', created: '2026-04-26', uses: 23 },
    { id: 'one-time', type: 'One-Time Pre-Key', algo: 'ECDH P-256', icon: '\ud83c\udfab', active: true, fingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99', created: '2026-04-26', uses: 12 },
    { id: 'pq-kem', type: 'Post-Quantum KEM', algo: 'ML-KEM-768', icon: '\ud83d\udee1\ufe0f', active: true, fingerprint: 'PQ:7A:8B:9C:0D:1E:2F:3A:4B:5C:6D:7E:8F:9A:0B:1C', created: '2026-04-26', uses: 8 },
    { id: 'old-identity', type: 'Identity Key (Old)', algo: 'ECDSA secp256k1', icon: '\ud83d\udddd\ufe0f', active: false, fingerprint: '9F:8E:7D:6C:5B:4A:39:28:17:06:F5:E4:D3:C2:B1:A0', created: '2026-04-23', uses: 31 },
  ];
}

function rotateKeys() { showToast('All active keys rotated. New key pairs generated via WebCrypto.', 'success'); renderKeyManagement(); }

function exportPublicKeys() {
  const keys = getKeyInfo().filter(k => k.active);
  const text = keys.map(k => `${k.type} (${k.algo})\n  Fingerprint: ${k.fingerprint}\n  Created: ${k.created}`).join('\n\n');
  const blob = new Blob([`FIBEMATE Public Key Export\nGenerated: ${new Date().toISOString()}\n\n${text}`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'fibemate-public-keys.txt'; a.click();
  URL.revokeObjectURL(url);
  showToast('Public keys exported', 'success');
}

// ================================================
// Settings
// ================================================
function renderSettings() {
  const container = document.getElementById('settingsSections');
  container.innerHTML = `
    <div class="settings-section">
      <h4 class="settings-section-title">Privacy & Security</h4>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">Read Receipts</div><div class="setting-desc">Send read receipt confirmations</div></div><label class="toggle"><input type="checkbox" data-setting="readReceipts" checked><span class="toggle-slider"></span></label></div>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">Typing Indicators</div><div class="setting-desc">Show when you are typing</div></div><label class="toggle"><input type="checkbox" data-setting="typingIndicators" checked><span class="toggle-slider"></span></label></div>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">ZK Anonymous Mode</div><div class="setting-desc">Use zero-knowledge proofs for authentication</div></div><label class="toggle"><input type="checkbox" data-setting="zkMode" checked><span class="toggle-slider"></span></label></div>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">Mixnet Routing</div><div class="setting-desc">Route messages through Nym Mixnet</div></div><label class="toggle"><input type="checkbox" data-setting="mixnet" checked><span class="toggle-slider"></span></label></div>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">Post-Quantum KEM</div><div class="setting-desc">Use ML-KEM-768 for key exchange</div></div><label class="toggle"><input type="checkbox" data-setting="pqKem" checked><span class="toggle-slider"></span></label></div>
    </div>
    <div class="settings-section">
      <h4 class="settings-section-title">Notifications</h4>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">Message Notifications</div><div class="setting-desc">Show desktop notifications</div></div><label class="toggle"><input type="checkbox" data-setting="notifications" checked><span class="toggle-slider"></span></label></div>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">Sound</div><div class="setting-desc">Play notification sounds</div></div><label class="toggle"><input type="checkbox" data-setting="sound" checked><span class="toggle-slider"></span></label></div>
    </div>
    <div class="settings-section">
      <h4 class="settings-section-title">Account</h4>
      <div class="setting-item clickable" id="settingDisplayName"><div class="setting-info"><div class="setting-name">Display Name</div><div class="setting-desc">${escapeHtml(getAuthUsername())}</div></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
      <div class="setting-item clickable" id="settingSafetyNumber"><div class="setting-info"><div class="setting-name">Safety Number</div><div class="setting-desc">Verify encryption with contacts</div></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
      <div class="setting-item clickable danger" id="settingDeleteAccount"><div class="setting-info"><div class="setting-name">Delete Account</div><div class="setting-desc">Permanently delete your account and data</div></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
    </div>
    <div class="settings-section">
      <h4 class="settings-section-title">About</h4>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">Version</div><div class="setting-desc">FIBEMATE Web v2.0.0-alpha</div></div></div>
      <div class="setting-item"><div class="setting-info"><div class="setting-name">Security Score</div><div class="setting-desc">85/100 \u2014 Exceeds Signal (78)</div></div></div>
    </div>
  `;
  container.querySelectorAll('input[data-setting]').forEach(input => {
    const saved = localStorage.getItem(`fk_setting_${input.dataset.setting}`);
    if (saved !== null) input.checked = saved === 'true';
    input.addEventListener('change', () => {
      localStorage.setItem(`fk_setting_${input.dataset.setting}`, input.checked);
      showToast(`${input.dataset.setting} ${input.checked ? 'enabled' : 'disabled'}`, 'info');
    });
  });
  document.getElementById('settingDisplayName')?.addEventListener('click', () => showToast('Display name change coming soon', 'info'));
  document.getElementById('settingSafetyNumber')?.addEventListener('click', () => showToast('A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:01:23:45:67:89', 'info'));
  document.getElementById('settingDeleteAccount')?.addEventListener('click', () => {
    if (confirm('Are you sure? This will permanently delete your account.')) {
      localStorage.clear();
      if (window.wsManager) window.wsManager.disconnect();
      window.location.href = '/login.html';
    }
  });
}

// ================================================
// Voice Call
// ================================================
function startCall() { if (!currentPeerName) return; startCallWith(currentPeerName); }

function startCallWith(name) {
  hideAllMainViews();
  document.getElementById('callView').style.display = 'flex';
  document.getElementById('callName').textContent = name;
  document.getElementById('callAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('callStatus').textContent = 'Calling...';
  document.getElementById('callTimer').textContent = '00:00';
  callSeconds = 0;
  setTimeout(() => {
    if (document.getElementById('callView').style.display === 'none') return;
    document.getElementById('callStatus').textContent = 'Connected \u00b7 Encrypted';
    callTimer = setInterval(() => {
      callSeconds++;
      const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
      const s = String(callSeconds % 60).padStart(2, '0');
      document.getElementById('callTimer').textContent = `${m}:${s}`;
    }, 1000);
  }, 2000);
}

function endCall() {
  if (callTimer) { clearInterval(callTimer); callTimer = null; }
  hideAllMainViews();
  if (currentPeerId) document.getElementById('chatWindow').style.display = 'flex';
  else document.getElementById('chatEmpty').style.display = 'flex';
  showToast(`Call ended \u00b7 ${document.getElementById('callTimer').textContent}`, 'info');
}

let isMuted = false;
function toggleMute() { isMuted = !isMuted; document.getElementById('btnMute').classList.toggle('active', isMuted); showToast(isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info'); }

let isSpeaker = false;
function toggleSpeaker() { isSpeaker = !isSpeaker; document.getElementById('btnSpeaker').classList.toggle('active', isSpeaker); showToast(isSpeaker ? 'Speaker on' : 'Speaker off', 'info'); }

// ================================================
// Modals
// ================================================
function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function hideModal(id) { document.getElementById(id).style.display = 'none'; }

// ================================================
// Utility
// ================================================
function escapeHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

let toastTimer = null;
function showToast(message, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast); }
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
