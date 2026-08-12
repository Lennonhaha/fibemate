// SPDX-License-Identifier: GPL-3.0-only
/**
 * Simple File-based JSON Database - zero dependencies
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class JsonDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { users: {}, devices: {}, messages: {}, conversations: {}, contacts: {}, presence: {}, securityLogs: [], pendingKeys: {}, screenshotAlerts: {}, _idCounters: {} };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch (e) {
      console.log('[DB] 新建数据库文件');
    }
  }

  save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  // --- User ---
  createUser(user) {
    this.data.users[user.id] = { ...user };
    this.save();
    return user;
  }

  getUserById(id) {
    // 防御原型污染：__proto__/constructor 等键不可作为用户 ID 访问 (security 2026-08-13)
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(this.data.users, id)) return null;
    return this.data.users[id] || null;
  }
  getUserByUsername(username) {
    return Object.values(this.data.users).find(u => u.username === username) || null;
  }

  updateUser(id, updates) {
    if (this.data.users[id]) {
      this.data.users[id] = { ...this.data.users[id], ...updates };
      this.save();
    }
  }

  // --- Devices ---
  createDevice(device) {
    if (!this.data.devices[device.userId]) this.data.devices[device.userId] = {};
    this.data.devices[device.userId][device.id] = device;
    this.save();
    return device;
  }

  getDevicesByUserId(userId) {
    const devs = this.data.devices[userId];
    return devs ? Object.values(devs).filter(d => d.isActive !== false) : [];
  }

  // --- Messages ---
  createMessage(msg) {
    const conv = this.data.conversations[msg.conversationId];
    if (!conv) return null;
    if (!conv.messages) conv.messages = [];
    conv.messages.push(msg);
    this.save();
    return msg;
  }

  getMessages(conversationId, { before, limit = 50 } = {}) {
    const conv = this.data.conversations[conversationId];
    if (!conv || !conv.messages) return [];
    let msgs = [...conv.messages].sort((a, b) => a.createdAt - b.createdAt);
    if (before) msgs = msgs.filter(m => m.createdAt < before);
    return msgs.slice(-limit);
  }

  markMessagesRead(conversationId, userId) {
    const conv = this.data.conversations[conversationId];
    if (!conv || !conv.messages) return;
    let updated = false;
    conv.messages.forEach(m => {
      if (m.recipientUserId === userId && !m.isRead) {
        m.isRead = true;
        m.readAt = Date.now();
        updated = true;
      }
    });
    if (updated) {
      if (conv.userAId === userId) conv.unreadCountA = 0;
      else conv.unreadCountB = 0;
      this.save();
    }
  }

  deleteMessage(conversationId, messageId) {
    const conv = this.data.conversations[conversationId];
    if (!conv || !conv.messages) return;
    conv.messages = conv.messages.filter(m => m.id !== messageId);
    this.save();
  }

  // --- Conversations ---
  getOrCreateConversation(userAId, userBId) {
    const key = [userAId, userBId].sort().join('::');
    const existing = Object.values(this.data.conversations).find(c => c.key === key);
    if (existing) return existing;

    const id = crypto.randomUUID();
    const conv = {
      id,
      key,
      userAId: userAId < userBId ? userAId : userBId,
      userBId: userAId < userBId ? userBId : userAId,
      messages: [],
      unreadCountA: 0,
      unreadCountB: 0,
      lastMessageAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.data.conversations[id] = conv;
    this.save();
    return conv;
  }

  getConversationsByUserId(userId) {
    return Object.values(this.data.conversations)
      .filter(c => c.userAId === userId || c.userBId === userId)
      .sort((a, b) => (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt));
  }

  // --- Contacts ---
  addContact(userId, contactUserId, status = 'pending') {
    const key = [userId, contactUserId].sort().join('::');
    if (!this.data.contacts[key]) {
      this.data.contacts[key] = {
        id: key,
        userId,
        contactUserId,
        status,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.save();
    }
    return this.data.contacts[key];
  }

  updateContactStatus(userId, contactUserId, status) {
    const key = [userId, contactUserId].sort().join('::');
    if (this.data.contacts[key]) {
      this.data.contacts[key].status = status;
      this.data.contacts[key].updatedAt = Date.now();
      this.save();
    }
  }

  getContacts(userId, includePending = false) {
    return Object.values(this.data.contacts).filter(
      c => (c.userId === userId || c.contactUserId === userId) && (includePending ? true : c.status === 'accepted')
    );
  }

  // --- Presence ---
  setPresence(userId, online) {
    this.data.presence[userId] = { userId, online, lastSeen: Date.now() };
    this.save();
  }

  getPresence(userId) { return this.data.presence[userId] || { userId, online: false, lastSeen: null }; }

  // --- Security Logs ---
  addSecurityLog(log) {
    this.data.securityLogs.unshift({ ...log, id: crypto.randomUUID(), createdAt: Date.now() });
    if (this.data.securityLogs.length > 1000) this.data.securityLogs = this.data.securityLogs.slice(0, 1000);
    this.save();
  }

  getSecurityLogs(userId, limit = 10) {
    return this.data.securityLogs.filter(l => l.userId === userId).slice(0, limit);
  }

  // --- Pending Keys ---
  addPendingKey(keyData) {
    const key = crypto.randomUUID();
    this.data.pendingKeys[key] = { ...keyData, id: key, createdAt: Date.now() };
    this.save();
    return key;
  }

  getPendingKeys(userId) {
    const now = Date.now();
    return Object.values(this.data.pendingKeys)
      .filter(k => k.toUserId === userId && k.expiresAt > now && k.createdAt > now - 5 * 60 * 1000);
  }

  // --- Screenshot Alerts ---
  addScreenshotAlert(alert) {
    this.data.screenshotAlerts[alert.id || crypto.randomUUID()] = { ...alert, id: alert.id || crypto.randomUUID(), detectedAt: Date.now() };
    this.save();
  }
}

module.exports = JsonDB;
