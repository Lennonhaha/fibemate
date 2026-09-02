// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE SQLite Database — 完全兼容 JsonDB 接口
 *
 * 替换方式（index.js 第12行）：
 *   // const Database = require('../src/db');
 *   const Database = require('../src/db-sqlite');
 *
 * 数据迁移：首次启动时自动从 noir-db.json 导入到 SQLite
 * 内存缓存：db.data 对象保持可实时访问（兼容 index.js 直接读 db.data.*）
 * 原子写入：所有写操作在 SQLite 事务中完成
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SqliteDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this._db = null;
    this._init();
  }

  // ═══════════════════════════════════════════════════════
  //  初始化 & 迁移
  // ═══════════════════════════════════════════════════════

  _init() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const dbPath = path.join(dataDir, 'fibemate.db');
    const jsonPath = path.join(dataDir, 'noir-db.json');

    this._db = new Database(dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');
    this._db.pragma('foreign_keys = ON');

    this._createTables();
    this._migrateFromJson(jsonPath);
    this._loadCache();
  }

  _createTables() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        raw_json    TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(
        json_extract(raw_json, '$.username')
      );

      CREATE TABLE IF NOT EXISTS devices (
        id       TEXT PRIMARY KEY,
        userId   TEXT NOT NULL,
        raw_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(userId);

      CREATE TABLE IF NOT EXISTS conversations (
        id       TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id             TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        raw_json       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversationId);

      CREATE TABLE IF NOT EXISTS contacts (
        id       TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS presence (
        id       TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS security_logs (
        id       TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pending_keys (
        id       TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL
      );

            CREATE TABLE IF NOT EXISTS one_time_prekeys (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        keyId TEXT NOT NULL,
        publicKey TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        used_by TEXT,
        used_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_otpk_user ON one_time_prekeys(userId, status);

      CREATE TABLE IF NOT EXISTS screenshot_alerts (
        id       TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL
      );
    `);
  }

  /**
   * 从 noir-db.json 迁移数据到 SQLite（仅首次）
   */
  _migrateFromJson(jsonPath) {
    const migratedFlag = jsonPath + '.migrated';
    if (!fs.existsSync(jsonPath) || fs.existsSync(migratedFlag)) return;

    console.log('[DB:SQLite] 检测到 noir-db.json，开始迁移...');
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const json = JSON.parse(raw);

    const tx = this._db.transaction(() => {
      // --- users ---
      for (const [id, u] of Object.entries(json.users || {})) {
        this._db.prepare('INSERT OR IGNORE INTO users (id, raw_json) VALUES (?, ?)')
          .run(id, JSON.stringify(u));
      }
      // --- devices ---
      for (const [userId, devs] of Object.entries(json.devices || {})) {
        for (const [devId, d] of Object.entries(devs)) {
          this._db.prepare('INSERT OR IGNORE INTO devices (id, userId, raw_json) VALUES (?, ?, ?)')
            .run(devId, userId, JSON.stringify(d));
        }
      }
      // --- conversations (+ message) ---
      for (const [convId, c] of Object.entries(json.conversations || {})) {
        const messages = c.messages;
        const convClean = { ...c };
        delete convClean.messages;
        this._db.prepare('INSERT OR IGNORE INTO conversations (id, raw_json) VALUES (?, ?)')
          .run(convId, JSON.stringify(convClean));
        for (const m of (messages || [])) {
          const id = m.id || crypto.randomUUID();
          this._db.prepare('INSERT OR IGNORE INTO messages (id, conversationId, raw_json) VALUES (?, ?, ?)')
            .run(id, convId, JSON.stringify(m));
        }
      }
      // --- contacts ---
      for (const [key, c] of Object.entries(json.contacts || {})) {
        this._db.prepare('INSERT OR IGNORE INTO contacts (id, raw_json) VALUES (?, ?)')
          .run(c.id || key, JSON.stringify(c));
      }
      // --- presence ---
      for (const [userId, p] of Object.entries(json.presence || {})) {
        this._db.prepare('INSERT OR REPLACE INTO presence (id, raw_json) VALUES (?, ?)')
          .run(userId, JSON.stringify(p));
      }
      // --- securityLogs ---
      for (const l of (json.securityLogs || [])) {
        const id = l.id || crypto.randomUUID();
        this._db.prepare('INSERT OR IGNORE INTO security_logs (id, raw_json) VALUES (?, ?)')
          .run(id, JSON.stringify(l));
      }
      // --- pendingKeys ---
      for (const [key, k] of Object.entries(json.pendingKeys || {})) {
        this._db.prepare('INSERT OR IGNORE INTO pending_keys (id, raw_json) VALUES (?, ?)')
          .run(key, JSON.stringify(k));
      }
      // --- screenshotAlerts ---
      for (const [key, a] of Object.entries(json.screenshotAlerts || {})) {
        const id = a.id || key;
        this._db.prepare('INSERT OR IGNORE INTO screenshot_alerts (id, raw_json) VALUES (?, ?)')
          .run(id, JSON.stringify(a));
      }
    });

    tx();
    fs.renameSync(jsonPath, migratedFlag);
    console.log('[DB:SQLite] 迁移完成 — ' + jsonPath + ' 已重命名为 .migrated');
  }

  /**
   * 从 SQLite 加载到 this.data 内存缓存
   * this.data 的格式与 JsonDB 完全一致：
   *   { users:{}, devices:{}, conversations:{}, contacts:{},
   *     presence:{}, securityLogs:[], pendingKeys:{}, screenshotAlerts:{} }
   */
  _loadCache() {
    const users = {};
    for (const r of this._db.prepare('SELECT id, raw_json FROM users').all()) {
      users[r.id] = JSON.parse(r.raw_json);
    }

    const devices = {};
    for (const r of this._db.prepare('SELECT userId, id, raw_json FROM devices').all()) {
      if (!devices[r.userId]) devices[r.userId] = {};
      devices[r.userId][r.id] = JSON.parse(r.raw_json);
    }

    const conversations = {};
    for (const r of this._db.prepare('SELECT id, raw_json FROM conversations').all()) {
      const c = JSON.parse(r.raw_json);
      c.messages = this._db.prepare(
        'SELECT raw_json FROM messages WHERE conversationId = ? ORDER BY json_extract(raw_json, \'$.createdAt\')'
      ).all(r.id).map(mr => JSON.parse(mr.raw_json));
      conversations[r.id] = c;
    }

    const contacts = {};
    for (const r of this._db.prepare('SELECT id, raw_json FROM contacts').all()) {
      const c = JSON.parse(r.raw_json);
      contacts[c.id || r.id] = c;
    }

    const presence = {};
    for (const r of this._db.prepare('SELECT id, raw_json FROM presence').all()) {
      presence[r.id] = JSON.parse(r.raw_json);
    }

    const securityLogs = this._db.prepare(
      'SELECT raw_json FROM security_logs ORDER BY json_extract(raw_json, \'$.createdAt\') DESC LIMIT 1000'
    ).all().map(r => JSON.parse(r.raw_json));

    const pendingKeys = {};
    // TODO：这里对 performance 有影响，后续可加索引
    for (const r of this._db.prepare('SELECT id, raw_json FROM pending_keys').all()) {
      const k = JSON.parse(r.raw_json);
      const now = Date.now();
      if (k.expiresAt > now && k.createdAt > now - 5 * 60 * 1000) {
        pendingKeys[r.id] = k;
      }
    }

    const screenshotAlerts = {};
    for (const r of this._db.prepare('SELECT id, raw_json FROM screenshot_alerts').all()) {
      const a = JSON.parse(r.raw_json);
      screenshotAlerts[a.id || r.id] = a;
    }

    this.data = { users, devices, conversations, contacts, presence, securityLogs, pendingKeys, screenshotAlerts, _idCounters: (this.data && this.data._idCounters) || {} };
  }

  // ═══════════════════════════════════════════════════════
  //  数据库操作
  // ═══════════════════════════════════════════════════════

  /** 插入或替换一行 */
  _upsert(table, id, obj) {
    if (table === 'messages') {
      // messages 表有独立的 conversationId NOT NULL 列
      this._db.prepare(`INSERT OR REPLACE INTO messages (id, conversationId, raw_json) VALUES (?, ?, ?)`)
        .run(id, obj.conversationId || null, JSON.stringify(obj));
      return;
    }
    this._db.prepare(`INSERT OR REPLACE INTO ${table} (id, raw_json) VALUES (?, ?)`)
      .run(id, JSON.stringify(obj));
  }

  /** 插入（跳过已有） */
  _insertSkip(table, id, obj) {
    this._db.prepare(`INSERT OR IGNORE INTO ${table} (id, raw_json) VALUES (?, ?)`)
      .run(id, JSON.stringify(obj));
  }

  /** 按主键读取一个对象 */
  _get(table, id) {
    const r = this._db.prepare(`SELECT raw_json FROM ${table} WHERE id = ?`).get(id);
    return r ? JSON.parse(r.raw_json) : null;
  }

  /** 读取全部对象（返回对象数组） */
  _getAll(table) {
    return this._db.prepare(`SELECT raw_json FROM ${table}`).all().map(r => JSON.parse(r.raw_json));
  }

  // ═══════════════════════════════════════════════════════
  //  公开 API（与 JsonDB 接口完全一致）
  // ═══════════════════════════════════════════════════════

  save() {
    // 所有写操作已实时落盘 — 不复存在 fs.writeFileSync 全量覆盖的竞争窗口
    // 保留此方法是为了兼容 index.js 中的 this.save() / db.save() 调用
  }

  close() { if (this._db) this._db.close(); }

  // ── User ───────────────────────────────────────────────

  createUser(user) {
    this._upsert('users', user.id, user);
    if (!this.data) this.data = {};
    if (!this.data.users) this.data.users = {};
    this.data.users[user.id] = user;
    return user;
  }

  getUserById(id) {
    // 防御原型污染：拒绝原型链危险键 (security 2026-08-13)
    if (typeof id !== 'string' || id === '__proto__' || id === 'constructor' || id === 'prototype') return null;
    const u = this._get('users', id);
    if (u && this.data && this.data.users && Object.prototype.hasOwnProperty.call(this.data.users, id)) this.data.users[id] = u;
    return u;
  }

  getUserByUsername(username) {
    const r = this._db.prepare(
      "SELECT raw_json FROM users WHERE json_extract(raw_json, '$.username') = ?"
    ).get(username);
    return r ? JSON.parse(r.raw_json) : null;
  }

  updateUser(id, updates) {
    const user = this.getUserById(id);
    if (!user) return;
    const merged = { ...user, ...updates, id };
    this.createUser(merged);
  }

  deleteUser(id) {
    // 防御原型污染（与 getUserById 对齐）
    if (typeof id !== 'string' || id === '__proto__' || id === 'constructor' || id === 'prototype') return;

    const tx = this._db.transaction(() => {
      // 1. 收集该用户参与的 conversation id（用于删对应 messages）
      const convIds = this._db.prepare(
        "SELECT id FROM conversations WHERE json_extract(raw_json, '$.userAId') = ? OR json_extract(raw_json, '$.userBId') = ?"
      ).all(id, id).map(r => r.id);

      // 2. 删除这些会话下的消息
      for (const cid of convIds) {
        this._db.prepare('DELETE FROM messages WHERE conversationId = ?').run(cid);
      }

      // 3. 删除会话
      this._db.prepare(
        "DELETE FROM conversations WHERE json_extract(raw_json, '$.userAId') = ? OR json_extract(raw_json, '$.userBId') = ?"
      ).run(id, id);

      // 4. 删除设备
      this._db.prepare('DELETE FROM devices WHERE userId = ?').run(id);

      // 5. 删除联系人关系
      this._db.prepare(
        "DELETE FROM contacts WHERE json_extract(raw_json, '$.userId') = ? OR json_extract(raw_json, '$.contactUserId') = ?"
      ).run(id, id);

      // 6. 删除在线状态
      this._db.prepare('DELETE FROM presence WHERE id = ?').run(id);

      // 7. 删除待处理密钥交换
      this._db.prepare(
        "DELETE FROM pending_keys WHERE json_extract(raw_json, '$.fromUserId') = ? OR json_extract(raw_json, '$.toUserId') = ?"
      ).run(id, id);

      // 8. 删除一次性预密钥
      this._db.prepare('DELETE FROM one_time_prekeys WHERE userId = ?').run(id);

      // 9. 删除截图告警
      this._db.prepare(
        "DELETE FROM screenshot_alerts WHERE json_extract(raw_json, '$.fromUserId') = ? OR json_extract(raw_json, '$.toUserId') = ?"
      ).run(id, id);

      // 10. 最后删除用户本体（保证前面引用还能查到）
      this._db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    tx();

    // 同步清理内存缓存 this.data（保持缓存与 SQLite 一致）
    if (this.data) {
      if (this.data.users) delete this.data.users[id];
      if (this.data.devices) delete this.data.devices[id];
      if (this.data.presence) delete this.data.presence[id];

      if (this.data.conversations) {
        for (const k of Object.keys(this.data.conversations)) {
          const c = this.data.conversations[k];
          if (c.userAId === id || c.userBId === id) delete this.data.conversations[k];
        }
      }
      if (this.data.contacts) {
        for (const k of Object.keys(this.data.contacts)) {
          const c = this.data.contacts[k];
          if (c.userId === id || c.contactUserId === id) delete this.data.contacts[k];
        }
      }
      if (this.data.pendingKeys) {
        for (const k of Object.keys(this.data.pendingKeys)) {
          const p = this.data.pendingKeys[k];
          if (p.fromUserId === id || p.toUserId === id) delete this.data.pendingKeys[k];
        }
      }
      if (this.data.screenshotAlerts) {
        for (const k of Object.keys(this.data.screenshotAlerts)) {
          const a = this.data.screenshotAlerts[k];
          if (a.fromUserId === id || a.toUserId === id) delete this.data.screenshotAlerts[k];
        }
      }
    }
  }

  // ── Devices ────────────────────────────────────────────

  createDevice(device) {
    this._db.prepare('INSERT OR REPLACE INTO devices (id, userId, raw_json) VALUES (?, ?, ?)')
      .run(device.id, device.userId, JSON.stringify(device));
    if (this.data && this.data.devices) {
      if (!this.data.devices[device.userId]) this.data.devices[device.userId] = {};
      this.data.devices[device.userId][device.id] = device;
    }
    return device;
  }

  getDevicesByUserId(userId) {
    return this._db.prepare(
      "SELECT raw_json FROM devices WHERE userId = ? AND CAST(json_extract(raw_json, '$.isActive') AS INTEGER) = 1"
    ).all(userId).map(r => JSON.parse(r.raw_json));
  }

  // ── Conversations ──────────────────────────────────────

  getOrCreateConversation(userAId, userBId) {
    const key = [userAId, userBId].sort().join('::');

    // 先查所有 conversations，按 key 匹配（key 在 raw_json 里）
    const all = this._db.prepare('SELECT raw_json FROM conversations').all();
    const existing = all.find(r => {
      const c = JSON.parse(r.raw_json);
      return c.key === key;
    });
    if (existing) return JSON.parse(existing.raw_json);

    const id = crypto.randomUUID();
    const now = Date.now();
    const conv = {
      id, key,
      userAId: userAId < userBId ? userAId : userBId,
      userBId: userAId < userBId ? userBId : userAId,
      messages: [],
      unreadCountA: 0, unreadCountB: 0,
      lastMessageAt: null,
      createdAt: now, updatedAt: now
    };
    this._upsert('conversations', id, conv);
    if (this.data && this.data.conversations) this.data.conversations[id] = conv;
    return conv;
  }

  getConversationsByUserId(userId) {
    const all = this._getAll('conversations');
    return all
      .filter(c => c.userAId === userId || c.userBId === userId)
      .sort((a, b) => (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt))
      .map(c => {
        c.messages = this._db.prepare(
          'SELECT raw_json FROM messages WHERE conversationId = ? ORDER BY json_extract(raw_json, \'$.createdAt\')'
        ).all(c.id).map(r => JSON.parse(r.raw_json));
        return c;
      });
  }

  getConversationById(conversationId) {
    const c = this._get('conversations', conversationId);
    if (!c) return null;
    c.messages = this._db.prepare(
      'SELECT raw_json FROM messages WHERE conversationId = ? ORDER BY json_extract(raw_json, \'$.createdAt\')'
    ).all(conversationId).map(r => JSON.parse(r.raw_json));
    return c;
  }

  // ── Messages ───────────────────────────────────────────

  createMessage(msg) {
    // 检查 conversation 是否存在
    const conv = this._get('conversations', msg.conversationId);
    if (!conv) return null;

    const id = msg.id || crypto.randomUUID();
    const now = Date.now();
    const m = { ...msg, id, createdAt: msg.createdAt || now };

    this._upsert('messages', id, m);

    // 更新 conversation lastMessageAt + 未读数
    conv.lastMessageAt = now;
    conv.updatedAt = now;
    // 未读数：发给谁就累加谁那侧
    if (msg.recipientUserId) {
      if (conv.userAId === msg.recipientUserId) {
        conv.unreadCountA = (conv.unreadCountA || 0) + 1;
      } else if (conv.userBId === msg.recipientUserId) {
        conv.unreadCountB = (conv.unreadCountB || 0) + 1;
      }
    }
    this._upsert('conversations', msg.conversationId, conv);

    // 更新缓存
    if (this.data && this.data.conversations && this.data.conversations[msg.conversationId]) {
      const c = this.data.conversations[msg.conversationId];
      if (!c.messages) c.messages = [];
      c.messages.push(m);
      c.lastMessageAt = now;
    }
    return m;
  }

  getMessages(conversationId, { before, limit = 50 } = {}) {
    let stmt;
    if (before) {
      stmt = this._db.prepare(`
        SELECT raw_json FROM messages
        WHERE conversationId = ? AND CAST(json_extract(raw_json, '$.createdAt') AS INTEGER) < ?
        ORDER BY json_extract(raw_json, '$.createdAt') ASC
        LIMIT ?
      `);
      return stmt.all(conversationId, before, limit).map(r => JSON.parse(r.raw_json));
    }
    stmt = this._db.prepare(`
      SELECT raw_json FROM messages
      WHERE conversationId = ?
      ORDER BY json_extract(raw_json, '$.createdAt') ASC
      LIMIT ?
    `);
    return stmt.all(conversationId, limit).map(r => JSON.parse(r.raw_json));
  }

  markMessagesRead(conversationId, userId) {
    const conv = this._get('conversations', conversationId);
    if (!conv) return;

    const updated = [];
    const allMsgs = this._db.prepare(
      "SELECT id, raw_json FROM messages WHERE conversationId = ?"
    ).all(conversationId);

    const tx = this._db.transaction(() => {
      for (const row of allMsgs) {
        const m = JSON.parse(row.raw_json);
        if (m.recipientUserId === userId && !m.isRead) {
          m.isRead = true;
          m.readAt = Date.now();
          this._upsert('messages', row.id, m);
        }
        updated.push(m);
      }
    });
    tx();

    // 更新未读计数
    // TODO：conversation 的 unreadCountX 在原始数据中是互动态化的，
    // 但很难保证精确。暂时忽略，后续可以算。
  }

  deleteMessage(conversationId, messageId) {
    this._db.prepare('DELETE FROM messages WHERE conversationId = ? AND id = ?')
      .run(conversationId, messageId);
  }

  // ── Contacts ───────────────────────────────────────────

  addContact(userId, contactUserId, status = 'pending') {
    const key = [userId, contactUserId].sort().join('::');
    const now = Date.now();
    const c = { id: key, userId, contactUserId, status, createdAt: now, updatedAt: now };
    this._upsert('contacts', key, c);
    if (this.data && this.data.contacts) this.data.contacts[key] = c;
    return c;
  }

  updateContactStatus(userId, contactUserId, status) {
    const key = [userId, contactUserId].sort().join('::');
    const c = this._get('contacts', key);
    if (c) {
      c.status = status;
      c.updatedAt = Date.now();
      this._upsert('contacts', key, c);
    }
  }

  getContacts(userId, includePending = false) {
    return this._getAll('contacts').filter(c =>
      (c.userId === userId || c.contactUserId === userId) &&
      (includePending || c.status === 'accepted')
    );
  }

  // ── Presence ───────────────────────────────────────────

  setPresence(userId, online) {
    const p = { userId, online, lastSeen: Date.now() };
    this._upsert('presence', userId, p);
    if (this.data && this.data.presence) this.data.presence[userId] = p;
  }

  getPresence(userId) {
    const p = this._get('presence', userId);
    return p || { userId, online: false, lastSeen: null };
  }

  // ── Security Logs ──────────────────────────────────────

  addSecurityLog(log) {
    const id = log.id || crypto.randomUUID();
    const now = Date.now();
    const l = { ...log, id, createdAt: log.createdAt || now };
    this._upsert('security_logs', id, l);

    // 只保留最近 1000 条
    this._db.prepare(`
      DELETE FROM security_logs WHERE id NOT IN (
        SELECT id FROM security_logs ORDER BY json_extract(raw_json, '$.createdAt') DESC LIMIT 1000
      )
    `).run();

    if (this.data) {
      if (!this.data.securityLogs) this.data.securityLogs = [];
      this.data.securityLogs.unshift(l);
      if (this.data.securityLogs.length > 1000) this.data.securityLogs.length = 1000;
    }
  }

  getSecurityLogs(userId, limit = 10) {
    return this._db.prepare(`
      SELECT raw_json FROM security_logs
      WHERE json_extract(raw_json, '$.userId') = ?
      ORDER BY json_extract(raw_json, '$.createdAt') DESC
      LIMIT ?
    `).all(userId, limit).map(r => JSON.parse(r.raw_json));
  }

  // ── Pending Keys ───────────────────────────────────────

  addPendingKey(keyData) {
    const key = crypto.randomUUID();
    const now = Date.now();
    const k = { ...keyData, id: key, createdAt: now,
                  expiresAt: keyData.expiresAt || (now + 5 * 60 * 1000) };
    this._upsert('pending_keys', key, k);
    if (this.data && this.data.pendingKeys) this.data.pendingKeys[key] = k;
    return key;
  }

  getPendingKeys(userId) {
    const now = Date.now();
    const all = this._db.prepare('SELECT raw_json FROM pending_keys').all();
    return all
      .map(r => JSON.parse(r.raw_json))
      .filter(k => k.toUserId === userId && k.expiresAt > now && k.createdAt > now - 5 * 60 * 1000);
  }

  // ── Screenshot Alerts ──────────────────────────────────

  addScreenshotAlert(alert) {
    const id = alert.id || crypto.randomUUID();
    const now = Date.now();
    const a = { ...alert, id, detectedAt: now };
    this._upsert('screenshot_alerts', id, a);
    if (this.data && this.data.screenshotAlerts) this.data.screenshotAlerts[id] = a;
  }
}

module.exports = SqliteDB;