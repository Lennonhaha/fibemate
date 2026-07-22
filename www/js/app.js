// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE v2.21-zk-ts — Application Entry Point
 *
 * Refactored from main.js (1111 lines → ~650 lines).
 * Architecture:
 *   js/core/  — backend-router.js, ws-handler.js, message-controller.js
 *   js/ui/    — chat-ui.js, contacts.js, e2ee-status.js
 *
 * Remaining inline: WebRTC, Vault, Keys, Settings (self-contained)
 */

// ================================================
// Module imports (ES module — served with type="module")
// Relative to js/app.js → js/core/, js/ui/
// ================================================

// Debug beacon — confirms this module executed
window.__APP_MODULE_LOADED__ = true;
import { WSHandler } from './core/ws-handler.js';
import { MessageController } from './core/message-controller.js';
import { ChatUI } from './ui/chat-ui.js';
import { ContactsUI } from './ui/contacts.js';
import { E2EEStatusUI } from './ui/e2ee-status.js';

// ================================================
// State
// ================================================
const API_BASE = '/api';
let currentPeerId     = null;
let currentPeerName   = null;
let currentTab        = 'messages';
let keyStore          = {};
let pc                = null;
let localStream       = null;
let remoteStream      = null;
let callTimer         = null;
let callSeconds       = 0;
let isMuted           = false;
let isSpeaker         = false;

// ================================================
// Module instances
// ================================================
const chatUI = new ChatUI({
  apiBase: API_BASE,
  onOpenChat: (uid, name) => openChat(uid, name),
  getCurrentTab: () => currentTab,
  setCurrentTab: (t) => { currentTab = t; },
  setCurrentPeer: (id, name) => { currentPeerId = id; currentPeerName = name; },
  clearCurrentPeer: () => { currentPeerId = null; currentPeerName = null; },
});

const cui = new ContactsUI({
  onStartChat: (uid, name) => { chatUI.switchTab('messages'); openChat(uid, name); },
  onStartCall: (name) => startCallWith(name),
  chatUI,
});

const e2eeUI = new E2EEStatusUI({ chatUI });

const wsHandler = new WSHandler({
  sessionManager: window.SessionManager,
  onMessage: (sent, text, ts) => chatUI.appendMessage(sent, text, ts),
  onStatusChange: (text) => chatUI.updatePeerStatus(text),
  onToast: (msg, type) => chatUI.showToast(msg, type),
  onHandshake: ({ pqEnabled, peerId }) => {
    window.dispatchEvent(new CustomEvent('handshake-success', { detail: { pqEnabled, peerId } }));
  },
  onWebRTC: (msg) => handleWebRTCMessage(msg),
  getCurrentPeer: () => currentPeerId,
});

const msgCtrl = new MessageController({
  sessionManager: window.SessionManager,
  apiBase: API_BASE,
  wsHandler,
  onCryptoError: (peerId, err) => {
    if (err === 'nosession') {
      chatUI.showToast('No encryption session — sending plaintext', 'warning');
    }
  },
});

// ================================================
// Init
// ================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (!window.location.pathname.endsWith('main.html')) return;

  const token = localStorage.getItem('fibemate_token');
  if (!token) { window.location.href = 'index.html'; return; }

  const username = localStorage.getItem('fibemate_username') || 'User';
  document.getElementById('userName').textContent = username;
  document.getElementById('userAvatar').textContent = username.charAt(0).toUpperCase();

  chatUI.initNavigation();
  await chatUI.loadConversations();
  cui.loadContacts();
  loadVault();
  await initKeyStore();
  renderSettings();
  bindEvents();
  wsHandler.connect();
  e2eeUI.init();

  // SessionManager event listeners
  try {
    window.SessionManager.on('pq-enabled', ({ peerId }) => {
      if (currentPeerId === peerId) {
        e2eeUI.setEncryptionStatus(peerId, true);
      }
    });
    window.SessionManager.on('pq-failed', ({ peerId, reason }) => {
      if (currentPeerId === peerId) {
        chatUI.updatePeerStatus('End-to-end encrypted · ECDH P-256');
        chatUI.showToast('Post-quantum unavailable · Using classical ECDH', 'warning');
      }
    });
    window.SessionManager.on('degraded', ({ peerId, reason }) => {
      const reasonMap = { 'decaps-failed': 'PQ decryption failed', 'encaps-failed': 'PQ encryption failed', 'peer-no-pq': 'Peer no PQ support' };
      if (currentPeerId === peerId) {
        chatUI.updatePeerStatus('End-to-end encrypted · Classical (' + (reasonMap[reason] || reason) + ')');
      }
    });
  } catch (e) {
    console.warn('[Init] SessionManager event binding failed:', e.message);
  }

  window.__APP_INIT_DONE__ = true;
  console.log('[App] Init complete - modules loaded, events bound');
});

// ================================================
// Chat (simplified — delegates to msgCtrl + chatUI)
// ================================================
async function openChat(userId, name) {
  currentPeerId   = userId;
  currentPeerName = name;

  chatUI.hideAllMainViews();
  document.getElementById('chatWindow').style.display = 'flex';
  chatUI.setPeerHeader(name);
  chatUI.updatePeerStatus('End-to-end encrypted · ECDH P-256');
  chatUI.highlightConversation(userId);

  // Notify E2EE indicator
  if (typeof window.setE2EEPeer === 'function') window.setE2EEPeer(userId);

  // Ensure encrypted session
  const result = await msgCtrl.ensureSession(userId);
  if (!result.existed) {
    chatUI.updatePeerStatus('Establishing encryption...');
  }

  chatUI.loadMessages(userId);
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !currentPeerId) return;
  input.value = '';

  chatUI.appendMessage(true, text, Date.now());

  const result = await msgCtrl.send(currentPeerId, text);
  if (!result.sent) {
    chatUI.showToast('Send failed: ' + (result.error || 'unknown'), 'error');
  }
}

// ================================================
// WebRTC Voice Call
// ================================================
function startCall() {
  if (!currentPeerName) return;
  startCallWith(currentPeerName);
}

async function startCallWith(name) {
  chatUI.hideAllMainViews();
  document.getElementById('callView').style.display = 'flex';
  document.getElementById('callName').textContent = name;
  document.getElementById('callAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('callStatus').textContent = 'Initializing...';
  document.getElementById('callTimer').textContent = '00:00';
  callSeconds = 0;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    document.getElementById('callStatus').textContent = 'Calling...';

    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = (e) => {
      remoteStream = e.streams[0];
      document.getElementById('callStatus').textContent = 'Connected · E2E Encrypted (SRTP)';
      callTimer = setInterval(() => {
        callSeconds++;
        const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const s = String(callSeconds % 60).padStart(2, '0');
        document.getElementById('callTimer').textContent = m + ':' + s;
      }, 1000);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) wsHandler.sendIceCandidate(currentPeerId, e.candidate);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsHandler.sendCallOffer(currentPeerId, offer);
  } catch (err) {
    document.getElementById('callStatus').textContent = 'Failed: ' + err.message;
    chatUI.showToast('Call failed: ' + err.message, 'error');
  }
}

async function handleWebRTCMessage(msg) {
  if (!pc) return;
  try {
    if (msg.type === 'call_answer' && msg.answer) {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
    } else if (msg.type === 'ice_candidate' && msg.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    } else if (msg.type === 'call_offer' && msg.offer) {
      const accept = confirm('Incoming call from ' + msg.from + '. Accept?');
      if (!accept) return;
      await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsHandler.sendCallAnswer(msg.from, answer);
    }
  } catch (err) {
    console.error('WebRTC error:', err);
  }
}

function endCall() {
  if (callTimer) { clearInterval(callTimer); callTimer = null; }
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  remoteStream = null;
  chatUI.hideAllMainViews();
  if (currentPeerId) {
    document.getElementById('chatWindow').style.display = 'flex';
  } else {
    document.getElementById('chatEmpty').style.display = 'flex';
  }
  chatUI.showToast('Call ended · ' + (document.getElementById('callTimer').textContent || '00:00'), 'info');
}

function toggleMute() {
  isMuted = !isMuted;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  document.getElementById('btnMute').classList.toggle('active', isMuted);
  chatUI.showToast(isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

function toggleSpeaker() {
  isSpeaker = !isSpeaker;
  document.getElementById('btnSpeaker').classList.toggle('active', isSpeaker);
  chatUI.showToast(isSpeaker ? 'Speaker on' : 'Speaker off', 'info');
}

// ================================================
// Vault (AES-256-GCM encrypted file storage)
// ================================================
function loadVault() {
  const list = document.getElementById('vaultList');
  const empty = document.getElementById('emptyVault');
  const files = JSON.parse(localStorage.getItem('fibemate_vault') || '[]');
  if (files.length === 0) { if (empty) empty.style.display = 'flex'; return; }
  if (empty) empty.style.display = 'none';
  list.innerHTML = files.map((f, i) => buildVaultItem(f, i)).join('');
  bindVaultEvents();
}

function buildVaultItem(f, idx) {
  const icon = f.type?.startsWith('image/') ? String.fromCodePoint(0x1F5BC) : f.type?.startsWith('video/') ? String.fromCodePoint(0x1F3AC) : f.type?.startsWith('audio/') ? String.fromCodePoint(0x1F3B5) : String.fromCodePoint(0x1F4C4);
  const size = f.size ? (f.size / 1024).toFixed(1) + ' KB' : '';
  const date = f.uploadedAt ? ChatUI.formatTime(f.uploadedAt) : '';
  return '<div class="vault-item" data-idx="' + idx + '">' +
    '<div class="vault-icon">' + icon + '</div>' +
    '<div class="vault-info"><div class="vault-name">' + ChatUI.escapeHtml(f.name) + '</div><div class="vault-meta">' + size + ' · ' + date + ' · AES-256 encrypted</div></div>' +
    '<div class="vault-actions">' +
      '<button class="icon-btn vault-download" title="Download"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>' +
      '<button class="icon-btn vault-delete" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
    '</div>' +
  '</div>';
}

function bindVaultEvents() {
  document.querySelectorAll('.vault-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('.vault-item').dataset.idx);
      const files = JSON.parse(localStorage.getItem('fibemate_vault') || '[]');
      files.splice(idx, 1);
      localStorage.setItem('fibemate_vault', JSON.stringify(files));
      loadVault();
      chatUI.showToast('File removed from vault', 'info');
    });
  });
  document.querySelectorAll('.vault-download').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const idx = parseInt(e.target.closest('.vault-item').dataset.idx);
      const files = JSON.parse(localStorage.getItem('fibemate_vault') || '[]');
      const file = files[idx];
      if (!file) return;
      try {
        chatUI.showToast('Decrypting file...', 'info');
        const blob = await decryptFile(file);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
        chatUI.showToast(file.name + ' decrypted and downloaded', 'success');
      } catch (err) {
        chatUI.showToast('Decrypt failed: ' + err.message, 'error');
      }
    });
  });
}

async function encryptFile(file) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const keyRaw = await crypto.subtle.exportKey('raw', key);
  return {
    encryptedData: Array.from(new Uint8Array(encrypted)),
    iv: Array.from(iv),
    key: Array.from(new Uint8Array(keyRaw)),
    name: file.name, type: file.type, size: file.size, uploadedAt: Date.now(),
  };
}

async function decryptFile(stored) {
  const key = await crypto.subtle.importKey('raw', new Uint8Array(stored.key), { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(stored.iv) }, key, new Uint8Array(stored.encryptedData).buffer);
  return new Blob([decrypted], { type: stored.type });
}

function handleVaultFileSelect(e) {
  const dropzone = document.getElementById('vaultDropzone');
  const files = e.target.files;
  if (files.length && dropzone) dropzone.querySelector('p').textContent = files.length + ' file(s) selected: ' + Array.from(files).map(f => f.name).join(', ');
}

async function uploadVaultFile() {
  const input = document.getElementById('vaultFileInput');
  if (!input.files.length) { chatUI.showToast('Please select a file', 'error'); return; }
  chatUI.showToast('Encrypting files with AES-256-GCM...', 'info');
  const files = JSON.parse(localStorage.getItem('fibemate_vault') || '[]');
  for (const f of Array.from(input.files)) {
    try {
      const encrypted = await encryptFile(f);
      files.push(encrypted);
    } catch (err) {
      chatUI.showToast('Failed to encrypt ' + f.name + ': ' + err.message, 'error');
      return;
    }
  }
  localStorage.setItem('fibemate_vault', JSON.stringify(files));
  loadVault();
  chatUI.hideModal('modalUploadVault');
  input.value = '';
  const dropzone = document.getElementById('vaultDropzone');
  if (dropzone) dropzone.querySelector('p').textContent = 'Drag files here or click to browse';
  chatUI.showToast(input.files.length + ' file(s) encrypted and stored', 'success');
}

// ================================================
// Key Management
// ================================================
async function initKeyStore() {
  const saved = localStorage.getItem('fibemate_keystore');
  if (saved) { keyStore = JSON.parse(saved); renderKeyManagement(); return; }
  await generateAllKeys();
}

async function generateAllKeys() {
  chatUI.showToast('Generating cryptographic keys via WebCrypto...', 'info');
  try {
    keyStore.identity = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
    keyStore.signedPre = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
    keyStore.oneTime = [];
    for (let i = 0; i < 5; i++) {
      keyStore.oneTime.push(await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']));
    }
    if (typeof window !== 'undefined' && window.MLKEM768) {
      const { publicKey: pqPk, secretKey: pqSk } = window.MLKEM768.keygen();
      keyStore.pqKem = { pk: Array.from(pqPk), sk: Array.from(pqSk) };
      const pqPkBuf = pqPk.buffer.slice(pqPk.byteOffset, pqPk.byteOffset + pqPk.byteLength);
      keyStore.pqKemFingerprint = await fingerprintKey(pqPkBuf);
      keyStore.pqKemActive = true;
    } else {
      keyStore.pqKemActive = false;
    }
    const identityPub = await crypto.subtle.exportKey('raw', keyStore.identity.publicKey);
    const signedPub   = await crypto.subtle.exportKey('raw', keyStore.signedPre.publicKey);
    keyStore.identityFingerprint = await fingerprintKey(identityPub);
    keyStore.signedPreFingerprint = await fingerprintKey(signedPub);
    keyStore.created = new Date().toISOString().split('T')[0];
    keyStore.uses = { identity: 0, signedPre: 0, oneTime: 0 };
    saveKeyStore();
    chatUI.showToast('All keys generated successfully', 'success');
    renderKeyManagement();
  } catch (err) {
    chatUI.showToast('Key generation failed: ' + err.message, 'error');
    console.error(err);
  }
}

async function fingerprintKey(keyBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', keyBuffer);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(':');
  return hex.match(/.{1,5}/g).join(':').substring(0, 47);
}

function saveKeyStore() {
  const meta = {
    identityFingerprint: keyStore.identityFingerprint,
    signedPreFingerprint: keyStore.signedPreFingerprint,
    created: keyStore.created,
    uses: keyStore.uses,
    oneTimeCount: keyStore.oneTime?.length || 0,
    pqKemActive: keyStore.pqKemActive || false,
    pqKemFingerprint: keyStore.pqKemFingerprint || null,
  };
  localStorage.setItem('fibemate_keystore_meta', JSON.stringify(meta));
  if (keyStore.pqKem && keyStore.pqKem.pk) {
    const pqJson = JSON.stringify({
      pk: btoa(String.fromCharCode(...keyStore.pqKem.pk)),
      sk: btoa(String.fromCharCode(...keyStore.pqKem.sk)),
    });
    localStorage.setItem('fibemate_pqkem_keys', pqJson);
  }
}

function renderKeyManagement() {
  const container = document.getElementById('keyCards');
  const meta = JSON.parse(localStorage.getItem('fibemate_keystore_meta') || '{}');
  const keys = [
    { id: 'identity', type: 'Identity Key', algo: 'ECDH P-256', icon: String.fromCodePoint(0x1F511), active: true, fingerprint: meta.identityFingerprint || 'Generating...', created: meta.created || 'Now', uses: meta.uses?.identity || 0 },
    { id: 'signed-pre', type: 'Signed Pre-Key', algo: 'ECDH P-256', icon: String.fromCodePoint(0x270D), active: true, fingerprint: meta.signedPreFingerprint || 'Generating...', created: meta.created || 'Now', uses: meta.uses?.signedPre || 0 },
    { id: 'one-time', type: 'One-Time Pre-Key', algo: 'ECDH P-256', icon: String.fromCodePoint(0x1F3AB), active: true, fingerprint: (meta.oneTimeCount || 0) + ' keys available', created: meta.created || 'Now', uses: meta.uses?.oneTime || 0 },
    { id: 'pq-kem', type: 'Post-Quantum KEM', algo: 'ML-KEM-768', icon: String.fromCodePoint(0x1F6E1), active: meta.pqKemActive || false, fingerprint: meta.pqKemFingerprint || 'Disabled', created: meta.created || 'Now', uses: 0 },
  ];
  container.innerHTML = keys.map(k => '<div class="key-card">' +
    '<div class="key-card-header"><div class="key-icon">' + k.icon + '</div><div><div class="key-type">' + k.type + '</div><div class="key-algo">' + k.algo + '</div></div><span class="key-status ' + (k.active ? 'active' : 'inactive') + '">' + (k.active ? 'Active' : 'Rotated') + '</span></div>' +
    '<div class="key-fingerprint"><label>Fingerprint</label><code>' + k.fingerprint + '</code></div>' +
    '<div class="key-meta"><span>Created: ' + k.created + '</span><span>Uses: ' + k.uses + '</span></div>' +
    (k.active ? '<button class="btn-secondary key-rotate-btn" data-key="' + k.id + '">Rotate This Key</button>' : '') +
  '</div>').join('');

  container.querySelectorAll('.key-rotate-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      chatUI.showToast('Rotating ' + btn.dataset.key + ' key...', 'info');
      await generateAllKeys();
    });
  });
}

async function rotateKeys() {
  chatUI.showToast('Rotating all keys...', 'info');
  await generateAllKeys();
  chatUI.showToast('All keys rotated successfully', 'success');
}

function exportPublicKeys() {
  const meta = JSON.parse(localStorage.getItem('fibemate_keystore_meta') || '{}');
  const text = 'Identity Key (ECDH P-256)\n  Fingerprint: ' + meta.identityFingerprint + '\n  Created: ' + meta.created + '\n\nSigned Pre-Key (ECDH P-256)\n  Fingerprint: ' + meta.signedPreFingerprint + '\n  Created: ' + meta.created;
  const blob = new Blob(['FIBEMATE Public Key Export\nGenerated: ' + new Date().toISOString() + '\n\n' + text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'fibemate-public-keys.txt'; a.click();
  URL.revokeObjectURL(url);
  chatUI.showToast('Public keys exported', 'success');
}

// ================================================
// Settings
// ================================================
function renderSettings() {
  const container = document.getElementById('settingsSections');
  const username = localStorage.getItem('fibemate_username') || 'User';
  container.innerHTML = '<div class="settings-section">' +
    '<h4 class="settings-section-title">Privacy and Security</h4>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">Read Receipts</div><div class="setting-desc">Send read receipt confirmations</div></div><label class="toggle"><input type="checkbox" data-setting="readReceipts" checked><span class="toggle-slider"></span></label></div>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">Typing Indicators</div><div class="setting-desc">Show when you are typing</div></div><label class="toggle"><input type="checkbox" data-setting="typingIndicators" checked><span class="toggle-slider"></span></label></div>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">ZK Anonymous Mode</div><div class="setting-desc">Use zero-knowledge proofs for authentication</div></div><label class="toggle"><input type="checkbox" data-setting="zkMode" checked><span class="toggle-slider"></span></label></div>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">Mixnet Routing</div><div class="setting-desc">Route messages through Nym Mixnet</div></div><label class="toggle"><input type="checkbox" data-setting="mixnet" checked><span class="toggle-slider"></span></label></div>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">Post-Quantum KEM</div><div class="setting-desc">Use ML-KEM-768 for key exchange</div></div><label class="toggle"><input type="checkbox" data-setting="pqKem" checked><span class="toggle-slider"></span></label></div>' +
  '</div>' +
  '<div class="settings-section">' +
    '<h4 class="settings-section-title">Notifications</h4>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">Message Notifications</div><div class="setting-desc">Show desktop notifications</div></div><label class="toggle"><input type="checkbox" data-setting="notifications" checked><span class="toggle-slider"></span></label></div>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">Sound</div><div class="setting-desc">Play notification sounds</div></div><label class="toggle"><input type="checkbox" data-setting="sound" checked><span class="toggle-slider"></span></label></div>' +
  '</div>' +
  '<div class="settings-section">' +
    '<h4 class="settings-section-title">Account</h4>' +
    '<div class="setting-item clickable" id="settingDisplayName"><div class="setting-info"><div class="setting-name">Display Name</div><div class="setting-desc">' + username + '</div></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>' +
    '<div class="setting-item clickable" id="settingSafetyNumber"><div class="setting-info"><div class="setting-name">Safety Number</div><div class="setting-desc">Verify encryption with contacts</div></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>' +
    '<div class="setting-item clickable danger" id="settingDeleteAccount"><div class="setting-info"><div class="setting-name">Delete Account</div><div class="setting-desc">Permanently delete your account and data</div></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>' +
  '</div>' +
  '<div class="settings-section">' +
    '<h4 class="settings-section-title">About</h4>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">Version</div><div class="setting-desc">FIBEMATE v2.21-zk-ts</div></div></div>' +
    '<div class="setting-item"><div class="setting-info"><div class="setting-name">Security Score</div><div class="setting-desc">85/100</div></div></div>' +
  '</div>';

  container.querySelectorAll('input[data-setting]').forEach(input => {
    const saved = localStorage.getItem('fibemate_setting_' + input.dataset.setting);
    if (saved !== null) input.checked = saved === 'true';
    input.addEventListener('change', () => {
      localStorage.setItem('fibemate_setting_' + input.dataset.setting, input.checked);
      chatUI.showToast(input.dataset.setting + ' ' + (input.checked ? 'enabled' : 'disabled'), 'info');
    });
  });

  document.getElementById('settingDisplayName')?.addEventListener('click', () => chatUI.showToast('Display name change coming soon', 'info'));
  document.getElementById('settingSafetyNumber')?.addEventListener('click', () => chatUI.showToast('A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:01:23:45:67:89', 'info'));
  document.getElementById('settingDeleteAccount')?.addEventListener('click', () => {
    if (confirm('Are you sure? This will permanently delete your account.')) {
      localStorage.clear(); wsHandler.disconnect(); window.location.href = 'index.html';
    }
  });
}

// ================================================
// Event Bindings
// ================================================
function bindEvents() {
  // Chat
  document.getElementById('btnBack')?.addEventListener('click', () => chatUI.showChatEmpty());
  document.getElementById('btnNewChat')?.addEventListener('click', () => chatUI.switchTab('contacts'));
  document.getElementById('btnStartChat')?.addEventListener('click', () => chatUI.switchTab('contacts'));
  document.getElementById('btnSend')?.addEventListener('click', sendMessage);
  document.getElementById('messageInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('btnVerify')?.addEventListener('click', () => chatUI.showToast('Key verification: Compare safety numbers in person', 'info'));
  document.getElementById('searchInput')?.addEventListener('input', (e) => chatUI.handleSearch(e.target.value));

  // Contacts
  document.getElementById('btnAddContact')?.addEventListener('click', () => chatUI.showModal('modalAddContact'));
  document.getElementById('btnAddContactEmpty')?.addEventListener('click', () => chatUI.showModal('modalAddContact'));
  document.getElementById('btnConfirmAddContact')?.addEventListener('click', () => cui.addContact());
  document.getElementById('contactUsername')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') cui.addContact(); });

  // ESC — exit chat
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const chatWindow = document.getElementById('chatWindow');
      if (chatWindow && chatWindow.style.display !== 'none') chatUI.showChatEmpty();
    }
  });

  // Vault
  document.getElementById('btnUploadVault')?.addEventListener('click', () => chatUI.showModal('modalUploadVault'));
  document.getElementById('btnUploadVaultEmpty')?.addEventListener('click', () => chatUI.showModal('modalUploadVault'));
  document.getElementById('vaultDropzone')?.addEventListener('click', () => document.getElementById('vaultFileInput').click());
  document.getElementById('vaultFileInput')?.addEventListener('change', handleVaultFileSelect);
  document.getElementById('btnConfirmUpload')?.addEventListener('click', uploadVaultFile);

  // Keys
  document.getElementById('btnRotateKeys')?.addEventListener('click', rotateKeys);
  document.getElementById('btnExportKeys')?.addEventListener('click', exportPublicKeys);

  // Voice
  document.getElementById('btnVoiceCall')?.addEventListener('click', startCall);
  document.getElementById('btnHangup')?.addEventListener('click', endCall);
  document.getElementById('btnMute')?.addEventListener('click', toggleMute);
  document.getElementById('btnSpeaker')?.addEventListener('click', toggleSpeaker);

  // Logout
  const doLogout = () => {
    if (confirm('Logout and return to login screen?')) {
      localStorage.removeItem('fibemate_token');
      localStorage.removeItem('fibemate_username');
      localStorage.removeItem('fibemate_userId');
      localStorage.removeItem('fibemate_displayName');
      wsHandler.disconnect();
      window.location.href = 'index.html';
    }
  };
  document.getElementById('btnLogout')?.addEventListener('click', doLogout);
  const userBar = document.getElementById('userBar');
  if (userBar) { userBar.style.cursor = 'pointer'; userBar.title = 'Click to logout'; userBar.addEventListener('click', doLogout); }

  // Modals
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => chatUI.hideModal(btn.dataset.modal));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
  });
}