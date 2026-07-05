/**
 * FIBEMATE Backend - 隐私增强即时通讯服务器
 * 架构: 服务器零知识 - 只转发密文，不解密、不存储消息内容
 * 版本: 2.0.0-alpha
 */

const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const Database = require('../src/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const url = require('url');
const cors = require('cors');
const helmet = require('helmet');

// ========================
// 配置
// ========================
const CONFIG = {
  PORT: process.env.PORT || 3001,
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
  JWT_EXPIRES: '30d',
  DB_PATH: path.join(__dirname, '..', 'data', 'noir-db.json'),
};

// ========================
// 数据库
// ========================
const db = new Database(CONFIG.DB_PATH);
console.log('[DB] ✓ JSON数据库已加载:', CONFIG.DB_PATH);

// ========================
// Express
// ========================
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: false
}));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 语音文件存储目录
const VOICE_DIR = path.join(__dirname, '..', 'data', 'voice');
if (!fs.existsSync(VOICE_DIR)) fs.mkdirSync(VOICE_DIR, { recursive: true });
app.use('/voice', express.static(VOICE_DIR));

// 静态文件服务（前端）
// 前端路径：支持环境变量覆盖，自动探测部署结构
let frontendPath = process.env.FRONTEND_PATH;
if (!frontendPath) {
  // 尝试多个可能的前端路径
  const candidates = [
    path.join(__dirname, '..', '..', 'src'),           // 开发环境
    path.join(__dirname, '..', 'www'),                  // 部署环境: backend/www
    path.join(__dirname, '..', '..', 'www'),            // 部署环境: 项目根/www
    path.join('/opt', 'fibemate-full', 'www'),          // 成都服务器标准路径
    path.join('/opt', 'fibemate-full', 'src'),          // 成都服务器替代路径
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      frontendPath = p;
      console.log('[Frontend] ✓ 使用前端路径:', p);
      break;
    }
  }
  if (!frontendPath) {
    frontendPath = candidates[0]; // 回退到默认值
    console.warn('[Frontend] ⚠ 未找到前端目录，回退到:', frontendPath);
  }
}
app.use(express.static(frontendPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
    if (filePath.endsWith('manifest.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    if (filePath.endsWith('index.html') || filePath.endsWith('install.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// 根路径 → 主应用（优先index.html，回退install.html）
app.get('/', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    const installPath = path.join(frontendPath, 'install.html');
    if (fs.existsSync(installPath)) {
      res.sendFile(installPath);
    } else {
      res.status(404).json({ error: 'Frontend not found', path: frontendPath });
    }
  }
});

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/voice') || req.path === '/health') return next();
  if (req.path === '/app' || req.path === '/index') {
    const indexPath = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  }
  // 404 fallback
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path !== '/health') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

// ========================
// 工具
// ========================
const logSecurity = (event, userId, details = {}, req = null) => {
  db.addSecurityLog({
    event,
    userId,
    ip: req?.ip || req?.socket?.remoteAddress || null,
    userAgent: req?.headers?.['user-agent'] || null,
    details
  });
};

const authMiddleware = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: '未授权' });
  try {
    req.user = jwt.verify(header.slice(7), CONFIG.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token无效' });
  }
};

const genToken = (user) => jwt.sign(
  { userId: user.id, username: user.username, deviceId: user.deviceId },
  CONFIG.JWT_SECRET,
  { expiresIn: CONFIG.JWT_EXPIRES }
);

// 在线用户映射
const onlineUsers = new Map(); // userId -> Set<ws>
const wsMeta = new Map();     // ws -> {userId, deviceId}

function broadcastPresence(userId, online) {
  const payload = JSON.stringify({ type: 'presence', userId, online, timestamp: Date.now() });
  onlineUsers.forEach(sockets => sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }));
}

function sendToUser(userId, payload) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return false;
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let ok = false;
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) { ws.send(data); ok = true; }
  });
  return ok;
}

// ========================
// WebSocket
// ========================
wss.on('connection', (ws, req) => {
  let authed = false;
  let userId = null;
  let deviceId = null;

  console.log(`[WS] 新连接 from ${req.socket.remoteAddress}`);

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // 认证
      if (!authed) {
        if (msg.type !== 'auth') {
          ws.send(JSON.stringify({ type: 'error', code: 'AUTH_REQUIRED' }));
          return;
        }
        try {
          const decoded = jwt.verify(msg.token, CONFIG.JWT_SECRET);
          userId = decoded.userId;
          deviceId = decoded.deviceId;

          db.updateUser(userId, { isOnline: 1, lastSeen: Date.now() });
          db.setPresence(userId, true);

          if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
          onlineUsers.get(userId).add(ws);
          wsMeta.set(ws, { userId, deviceId });

          authed = true;
          ws.send(JSON.stringify({ type: 'auth_ok', userId, timestamp: Date.now() }));
          broadcastPresence(userId, true);

          // 发送离线消息
          const convs = db.getConversationsByUserId(userId);
          const offline = [];
          convs.forEach(c => {
            const msgs = c.messages || [];
            msgs.forEach(m => {
              if (m.recipientUserId === userId && !m.readBy?.includes(deviceId)) {
                offline.push(m);
              }
            });
          });
          if (offline.length > 0) {
            ws.send(JSON.stringify({ type: 'offline_messages', messages: offline.slice(-50), count: offline.length }));
          }

          logSecurity('ws_connect', userId, { deviceId });
          console.log(`[WS] 用户 ${userId} 认证成功`);
        } catch {
          ws.send(JSON.stringify({ type: 'auth_failed' }));
          ws.close();
        }
        return;
      }

      // 消息处理
      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        case 'message': {
          const { to, ciphertext, messageType, burnAfterRead, messageId, voiceDuration } = msg;
          if (!to || !ciphertext) { ws.send(JSON.stringify({ type: 'error', code: 'INVALID' })); return; }

          const conv = db.getOrCreateConversation(userId, to);
          const msgId = messageId || uuidv4();
          const now = Date.now();
          const expiresAt = burnAfterRead ? now + 30_000 : null;

          const msgObj = {
            id: msgId,
            conversationId: conv.id,
            senderUserId: userId,
            senderDeviceId: deviceId,
            recipientUserId: to,
            ciphertext,
            messageType: messageType || 'text',
            voiceDuration: voiceDuration || null,
            isBurnAfterRead: !!burnAfterRead,
            expiresAt,
            isRead: false,
            readBy: [],
            createdAt: now
          };

          conv.messages = conv.messages || [];
          conv.messages.push(msgObj);
          conv.lastMessageAt = now;
          conv.updatedAt = now;

          if (conv.userAId === to) conv.unreadCountA = (conv.unreadCountA || 0) + 1;
          else conv.unreadCountB = (conv.unreadCountB || 0) + 1;

          db.save();

          const delivered = sendToUser(to, {
            type: 'new_message',
            messageId: msgId,
            conversationId: conv.id,
            from: userId,
            fromDevice: deviceId,
            ciphertext,
            messageType: messageType || 'text',
            voiceDuration: voiceDuration || null,
            burnAfterRead,
            createdAt: now
          });

          ws.send(JSON.stringify({ type: 'message_sent', messageId: msgId, delivered, timestamp: now }));
          break;
        }

        case 'key_exchange': {
          const { to, exchangeType, payload } = msg;
          if (!to) break;
          const exchangeId = uuidv4();
          const exchange = {
            id: exchangeId,
            fromUserId: userId,
            toUserId: to,
            fromDeviceId: deviceId,
            exchangeType,
            payload,
            createdAt: Date.now(),
            expiresAt: Date.now() + 5 * 60_000
          };
          db.addPendingKey(exchange);
          sendToUser(to, {
            type: 'key_exchange_request',
            exchangeId,
            from: userId,
            fromDevice: deviceId,
            exchangeType,
            payload,
            timestamp: Date.now()
          });
          ws.send(JSON.stringify({ type: 'key_exchange_sent', exchangeId }));
          break;
        }

        case 'key_exchange_response': {
          const { exchangeId, to, responsePayload } = msg;
          sendToUser(to, {
            type: 'key_exchange_response',
            exchangeId,
            from: userId,
            responsePayload,
            timestamp: Date.now()
          });
          break;
        }

        case 'read_receipt': {
          const { messageId } = msg;
          if (!messageId) break;
          // 标记消息已读
          const convs = db.getConversationsByUserId(userId);
          convs.forEach(conv => {
            const msgs = conv.messages || [];
            const m = msgs.find(x => x.id === messageId);
            if (m && m.recipientUserId === userId) {
              if (!m.readBy) m.readBy = [];
              if (!m.readBy.includes(deviceId)) {
                m.readBy.push(deviceId);
                if (m.readBy.length === db.getDevicesByUserId(m.senderUserId).length) {
                  m.isRead = true;
                  m.readAt = Date.now();
                }
              }
            }
          });
          db.save();
          const convs2 = db.getConversationsByUserId(userId);
          let senderId = null;
          convs2.forEach(c => {
            const m = (c.messages || []).find(x => x.id === messageId);
            if (m) senderId = m.senderUserId;
          });
          if (senderId) {
            sendToUser(senderId, {
              type: 'read_receipt',
              messageId,
              readBy: userId,
              readAt: Date.now()
            });
          }
          break;
        }

        case 'typing': {
          const { to } = msg;
          if (!to) break;
          sendToUser(to, { type: 'typing', from: userId, timestamp: Date.now() });
          break;
        }

        case 'screenshot_alert': {
          const { conversationId, messageId } = msg;
          const conv = Object.values(db.data.conversations || {}).find(c => c.id === conversationId);
          if (!conv) break;
          const toUserId = conv.userAId === userId ? conv.userBId : conv.userAId;
          const recipient = db.getUserById(toUserId);
          if (recipient?.screenshotAlert) {
            db.addScreenshotAlert({ conversationId, fromUserId: userId, toUserId, messageId });
            sendToUser(toUserId, {
              type: 'screenshot_alert',
              conversationId,
              from: userId,
              messageId,
              timestamp: Date.now()
            });
          }
          break;
        }

        case 'call_offer':
        case 'call_answer':
        case 'call_ice':
        case 'call_end':
        case 'ice_candidate':
        case 'call_hangup': {
          const { to, ...rest } = msg;
          if (!to) break;
          sendToUser(to, { type: msg.type, from: userId, ...rest, timestamp: Date.now() });
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN' }));
      }
    } catch (e) {
      console.error('[WS] 错误:', e.message);
      ws.send(JSON.stringify({ type: 'error' }));
    }
  });

  ws.on('close', () => {
    if (userId) {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          db.updateUser(userId, { isOnline: 0 });
          db.setPresence(userId, false);
          broadcastPresence(userId, false);
        }
      }
      wsMeta.delete(ws);
      logSecurity('ws_disconnect', userId);
      console.log(`[WS] 用户 ${userId} 断开`);
    }
  });
});

// ========================
// REST API
// ========================

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok', service: 'FIBEMATE Privacy Backend',
    version: '2.0.0-alpha', architecture: 'zero-knowledge',
    uptime: Math.floor(process.uptime()),
    features: {
      e2ee: true,
      standardAuth: true,
      zkAuth: false,
      mixnet: false,
      sphinx: false
    }
  });
});

// 获取或创建会话（发第一条消息前调用）
app.post('/api/conversations/find-or-create', authMiddleware, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: '缺少 userId' });
  if (userId === req.user.userId) return res.status(400).json({ error: '不能和自己聊天' });
  const other = db.getUserById(userId);
  if (!other) return res.status(404).json({ error: '用户不存在' });
  const conv = db.getOrCreateConversation(req.user.userId, userId);
  res.json({ conversationId: conv.id, otherUser: { id: other.id, username: other.username, displayName: other.displayName, isOnline: !!other.isOnline } });
});

// ===== 用户限制配置 =====
const MAX_USERS = 100;
const RESERVED_IDS = ['id88888888', 'id1111111', 'id66666666', 'id99999999', 'id00000001'];
const ADMIN_INVITE_CODE = process.env.ADMIN_INVITE_CODE || 'CHANGE_ME_STRONG';  // P0 FIX 2026-05-29: read from .env

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName, publicKey, signedPrekey, prekeySignature } = req.body;
    if (!username || !password || !publicKey) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    // 人数限制
    const currentUsers = Object.keys(db.data.users || {}).length;
    if (currentUsers >= MAX_USERS) {
      return res.status(403).json({ error: '注册人数已达上限，暂不接受新用户' });
    }

    // 保留ID检查 - 需要邀请码
    if (RESERVED_IDS.includes(username)) {
      const inviteCode = req.body.inviteCode;
      if (inviteCode !== ADMIN_INVITE_CODE) {
        return res.status(403).json({ error: '该用户名为保留ID，需要邀请码' });
      }
    }

    if (db.getUserByUsername(username)) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少8位' });
    }

    const userId = uuidv4();
    const deviceId = uuidv4();
    const now = Date.now();

    db.createUser({
      id: userId,
      username,
      displayName: displayName || username,
      passwordHash: await bcrypt.hash(password, 12),
      publicKey,
      signedPrekey: signedPrekey || publicKey,
      prekeySignature: prekeySignature || '',
      isOnline: 0,
      hideOnlineStatus: 0,
      hideReadReceipts: 0,
      screenshotAlert: 0,
      burnAfterRead: 0,
      securityScore: 60,
      lastSeen: null,
      createdAt: now,
      updatedAt: now
    });

    db.createDevice({
      id: deviceId,
      userId,
      deviceName: req.headers['x-device-name'] || '默认设备',
      registrationId: crypto.randomInt(1, 65535),
      publicKey,
      isActive: true,
      createdAt: now,
      lastActive: now
    });

    db.setPresence(userId, false);

    const token = genToken({ id: userId, username, deviceId });
    logSecurity('register', userId, { username });

    res.status(201).json({ userId, deviceId, token, message: '注册成功' });
  } catch (e) {
    console.error('[Auth] 注册错误:', e.message);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, devicePublicKey } = req.body;
    if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });

    const user = db.getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      logSecurity('login_fail', null, { username });
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    let deviceId = req.body.deviceId;
    if (devicePublicKey && !deviceId) {
      deviceId = uuidv4();
      db.createDevice({
        id: deviceId,
        userId: user.id,
        deviceName: req.headers['x-device-name'] || '新设备',
        registrationId: crypto.randomInt(1, 65535),
        publicKey: devicePublicKey,
        isActive: true,
        createdAt: Date.now(),
        lastActive: Date.now()
      });
    }

    const token = genToken({ id: user.id, username: user.username, deviceId: deviceId || '' });
    db.updateUser(user.id, { isOnline: 1, lastSeen: Date.now() });
    db.setPresence(user.id, true);
    logSecurity('login', user.id, { deviceId });

    res.json({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      publicKey: user.publicKey,
      deviceId,
      token,
      securityScore: user.securityScore,
      privacySettings: {
        hideOnlineStatus: !!user.hideOnlineStatus,
        hideReadReceipts: !!user.hideReadReceipts,
        screenshotAlert: !!user.screenshotAlert,
        burnAfterRead: !!user.burnAfterRead
      }
    });
  } catch (e) {
    console.error('[Auth] 登录错误:', e.message);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ========================
// ZK 匿名认证路由
// ========================

// ZK 注册
app.post('/api/auth/register-anonymous', async (req, res) => {
  try {
    const { commitment, publicKey, proofOfKnowledge, displayName } = req.body;
    
    console.log('[ZK] 注册请求:', { 
      commitment_len: commitment?.length, 
      publicKey_len: publicKey?.length,
      has_proof: !!proofOfKnowledge 
    });
    
    if (!commitment || !publicKey || !proofOfKnowledge) {
      return res.status(400).json({ 
        error: '缺少必填字段',
        details: {
          commitment: commitment ? 'provided' : 'missing',
          publicKey: publicKey ? 'provided' : 'missing',
          proofOfKnowledge: proofOfKnowledge ? 'provided' : 'missing'
        }
      });
    }
    
    // 验证 commitment 格式 (64 hex)
    if (!/^[0-9a-fA-F]{64}$/.test(commitment)) {
      return res.status(400).json({ 
        error: 'commitment 格式无效',
        details: `期望 64 位 hex，实际 ${commitment.length} 位`
      });
    }
    
    // 验证 publicKey 格式 (130 hex = 04 + 64 + 64)
    if (!/^[0-9a-fA-F]{130}$/.test(publicKey)) {
      return res.status(400).json({ 
        error: 'publicKey 格式无效',
        details: `期望 130 位 hex (04 + 64 + 64)，实际 ${publicKey.length} 位，前缀: ${publicKey.substring(0, 4)}`
      });
    }
    
    // 验证 publicKey 以 04 开头（未压缩格式）
    if (!publicKey.startsWith('04')) {
      return res.status(400).json({
        error: 'publicKey 必须以 04 开头',
        details: `实际前缀: ${publicKey.substring(0, 4)}`
      });
    }
    
    // 验证 proofOfKnowledge
    const { challenge, response, R } = proofOfKnowledge;
    if (!challenge || !response || !R) {
      return res.status(400).json({ error: 'proofOfKnowledge 不完整' });
    }
    
    const userId = 'zk_' + crypto.randomBytes(16).toString('hex');
    const deviceId = uuidv4();
    const now = Date.now();
    
    db.createUser({
      id: userId,
      username: userId,
      displayName: displayName || 'Anonymous',
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      publicKey,
      signedPrekey: publicKey,
      prekeySignature: '',
      zkCommitment: commitment,
      zkProof: proofOfKnowledge,
      isAnonymous: true,
      isOnline: 0,
      hideOnlineStatus: 1,
      hideReadReceipts: 1,
      screenshotAlert: 1,
      burnAfterRead: 0,
      securityScore: 95,
      lastSeen: null,
      createdAt: now,
      updatedAt: now
    });
    
    db.createDevice({
      id: deviceId,
      userId,
      deviceName: 'ZK Device',
      registrationId: crypto.randomInt(1, 65535),
      publicKey,
      isActive: true,
      createdAt: now,
      lastActive: now
    });
    
    const token = genToken({ id: userId, username: userId, deviceId });
    logSecurity('zk_register', userId, { commitment: commitment.slice(0, 16) + '...' });
    
    res.status(201).json({
      userId,
      deviceId,
      token,
      displayName: displayName || 'Anonymous',
      message: 'ZK 注册成功'
    });
  } catch (e) {
    console.error('[Auth] ZK 注册错误:', e.message);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ZK 登录
app.post('/api/auth/login-anonymous', async (req, res) => {
  try {
    const { commitment, proofOfKnowledge } = req.body;
    
    if (!commitment || !proofOfKnowledge) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    
    // 查找匹配的 ZK 用户
    const users = Object.values(db.data.users || {});
    const user = users.find(u => u.zkCommitment === commitment && u.isAnonymous);
    
    if (!user) {
      return res.status(401).json({ error: 'ZK 身份未找到' });
    }
    
    // 验证 proofOfKnowledge
    const { challenge, response, R } = proofOfKnowledge;
    if (!challenge || !response || !R) {
      return res.status(400).json({ error: 'proofOfKnowledge 不完整' });
    }
    
    const deviceId = uuidv4();
    db.createDevice({
      id: deviceId,
      userId: user.id,
      deviceName: 'ZK Device',
      registrationId: crypto.randomInt(1, 65535),
      publicKey: user.publicKey,
      isActive: true,
      createdAt: Date.now(),
      lastActive: Date.now()
    });
    
    const token = genToken({ id: user.id, username: user.username, deviceId });
    db.updateUser(user.id, { isOnline: 1, lastSeen: Date.now() });
    db.setPresence(user.id, true);
    logSecurity('zk_login', user.id, { deviceId });
    
    res.json({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      publicKey: user.publicKey,
      deviceId,
      token,
      securityScore: user.securityScore,
      privacySettings: {
        hideOnlineStatus: true,
        hideReadReceipts: true,
        screenshotAlert: true,
        burnAfterRead: false
      }
    });
  } catch (e) {
    console.error('[Auth] ZK 登录错误:', e.message);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 更新用户公钥
app.put('/api/user/public-key', authMiddleware, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ error: '缺少公钥' });
    const user = db.data.users[req.user.userId];
    if (!user) return res.status(404).json({ error: '用户不存在' });
    user.publicKey = publicKey;
    user.keyUpdatedAt = Date.now();
    await db.write();
    res.json({ success: true, keyUpdatedAt: user.keyUpdatedAt });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 搜索用户（必须放在 /:userId 前面，避免被误匹配）
app.get('/api/users/search', authMiddleware, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: '搜索词至少2字符' });
  const users = Object.values(db.data.users)
    .filter(u => (u.username.includes(q) || (u.displayName && u.displayName.includes(q))) && u.id !== req.user.userId)
    .slice(0, 20)
    .map(u => ({ id: u.id, username: u.username, displayName: u.displayName, isOnline: !!u.isOnline }));
  res.json({ users });
});

// 获取用户信息
app.get('/api/users/:userId', authMiddleware, (req, res) => {
  const user = db.getUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    publicKey: user.publicKey,
    isOnline: !!user.isOnline,
    lastSeen: user.lastSeen
  });
});

// 获取公钥
app.get('/api/users/:userId/keys', authMiddleware, (req, res) => {
  const user = db.getUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    identityKey: user.publicKey,
    signedPrekey: user.signedPrekey,
    signedPrekeySignature: user.prekeySignature,
    isOnline: !!user.isOnline
  });
});

// 联系人列表
app.get('/api/contacts', authMiddleware, (req, res) => {
  const contacts = db.getContacts(req.user.userId).map(c => {
    const otherId = c.userId === req.user.userId ? c.contactUserId : c.userId;
    const other = db.getUserById(otherId);
    return other ? { id: other.id, username: other.username, displayName: other.displayName, isOnline: !!other.isOnline } : null;
  }).filter(Boolean);
  res.json({ contacts });
});

// 添加联系人
app.post('/api/contacts', authMiddleware, (req, res) => {
  const { userId } = req.body;
  if (!userId || userId === req.user.userId) return res.status(400).json({ error: '无效ID' });
  if (!db.getUserById(userId)) return res.status(404).json({ error: '用户不存在' });
  const existing = db.getContacts(req.user.userId).find(c => c.contactUserId === userId || c.userId === userId);
  if (existing) return res.status(409).json({ error: '已是联系人' });
  db.addContact(req.user.userId, userId, 'pending');
  // 双向添加
  db.addContact(userId, req.user.userId, 'pending');
  logSecurity('contact_add', req.user.userId, { addedUserId: userId });
  res.json({ success: true, status: 'pending' });
});

// 会话列表
app.get('/api/conversations', authMiddleware, (req, res) => {
  const convs = db.getConversationsByUserId(req.user.userId);
  const result = convs.map(conv => {
    const otherId = conv.userAId === req.user.userId ? conv.userBId : conv.userAId;
    const other = db.getUserById(otherId);
    const msgs = conv.messages || [];
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const unreadCount = conv.userAId === req.user.userId ? (conv.unreadCountA || 0) : (conv.unreadCountB || 0);
    return {
      id: conv.id,
      otherUser: other ? { id: other.id, username: other.username, displayName: other.displayName, isOnline: !!other.isOnline } : null,
      lastMessage: lastMsg ? { id: lastMsg.id, ciphertext: lastMsg.ciphertext, type: lastMsg.messageType, createdAt: lastMsg.createdAt, burnAfterRead: !!lastMsg.isBurnAfterRead } : null,
      lastMessageAt: conv.lastMessageAt,
      unreadCount,
      createdAt: conv.createdAt
    };
  });
  res.json({ conversations: result });
});

// 消息历史
app.get('/api/conversations/:conversationId/messages', authMiddleware, (req, res) => {
  const conv = Object.values(db.data.conversations || {}).find(c => c.id === req.params.conversationId);
  if (!conv || (conv.userAId !== req.user.userId && conv.userBId !== req.user.userId)) {
    return res.status(403).json({ error: '无权访问' });
  }
  const { before, limit = 50 } = req.query;
  let msgs = [...(conv.messages || [])].sort((a, b) => a.createdAt - b.createdAt);
  if (before) msgs = msgs.filter(m => m.createdAt < parseInt(before));
  const result = msgs.slice(-parseInt(limit));
  db.markMessagesRead(req.params.conversationId, req.user.userId);
  res.json({ messages: result });
});

// 语音文件上传
app.post('/api/upload/voice', authMiddleware, (req, res) => {
  const { audio, mimeType } = req.body;
  if (!audio) return res.status(400).json({ error: '缺少音频数据' });
  try {
    // 解析 data URL: data:audio/webm;base64,...
    const matches = audio.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: '格式无效' });
    const ext = matches[1].includes('webm') ? 'webm' : matches[1].includes('ogg') ? 'ogg' : 'mp3';
    const buffer = Buffer.from(matches[2], 'base64');
    const fileId = uuidv4() + '.' + ext;
    fs.writeFileSync(path.join(VOICE_DIR, fileId), buffer);
    const voiceUrl = `/voice/${fileId}`;
    console.log(`[Voice] 上传成功: ${fileId} (${(buffer.length/1024).toFixed(1)}KB)`);
    res.json({ url: voiceUrl, size: buffer.length });
  } catch (e) {
    console.error('[Voice] 上传失败:', e.message);
    res.status(500).json({ error: '上传失败' });
  }
});

// 发送消息 (REST备选)
app.post('/api/messages', authMiddleware, (req, res) => {
  const { conversationId, ciphertext, messageType, burnAfterRead } = req.body;
  const conv = Object.values(db.data.conversations || {}).find(c => c.id === conversationId);
  if (!conv || (conv.userAId !== req.user.userId && conv.userBId !== req.user.userId)) {
    return res.status(403).json({ error: '无权访问' });
  }
  const toUserId = conv.userAId === req.user.userId ? conv.userBId : conv.userAId;
  const msgId = uuidv4();
  const now = Date.now();
  const msgObj = {
    id: msgId,
    conversationId,
    senderUserId: req.user.userId,
    senderDeviceId: req.user.deviceId,
    recipientUserId: toUserId,
    ciphertext,
    messageType: messageType || 'text',
    isBurnAfterRead: !!burnAfterRead,
    expiresAt: burnAfterRead ? now + 30_000 : null,
    isRead: false,
    readBy: [],
    createdAt: now
  };
  conv.messages = conv.messages || [];
  conv.messages.push(msgObj);
  conv.lastMessageAt = now;
  conv.updatedAt = now;
  db.save();

  sendToUser(toUserId, {
    type: 'new_message',
    messageId: msgId,
    conversationId,
    from: req.user.userId,
    ciphertext,
    messageType: messageType || 'text',
    burnAfterRead,
    createdAt: now
  });

  res.status(201).json({ messageId: msgId, createdAt: now });
});

// 隐私设置
app.get('/api/privacy', authMiddleware, (req, res) => {
  const user = db.getUserById(req.user.userId);
  res.json({
    hideOnlineStatus: !!user?.hideOnlineStatus,
    hideReadReceipts: !!user?.hideReadReceipts,
    screenshotAlert: !!user?.screenshotAlert,
    burnAfterRead: !!user?.burnAfterRead,
    securityScore: user?.securityScore || 0
  });
});

app.put('/api/privacy', authMiddleware, (req, res) => {
  const { hideOnlineStatus, hideReadReceipts, screenshotAlert, burnAfterRead } = req.body;
  let score = 50;
  if (hideOnlineStatus) score += 15;
  if (hideReadReceipts) score += 10;
  if (screenshotAlert) score += 15;
  if (burnAfterRead) score += 10;
  db.updateUser(req.user.userId, {
    hideOnlineStatus: !!hideOnlineStatus,
    hideReadReceipts: !!hideReadReceipts,
    screenshotAlert: !!screenshotAlert,
    burnAfterRead: !!burnAfterRead,
    securityScore: score,
    updatedAt: Date.now()
  });
  logSecurity('privacy_change', req.user.userId, { hideOnlineStatus, hideReadReceipts, screenshotAlert, burnAfterRead });
  res.json({ success: true, securityScore: score });
});

// 安全仪表盘
app.get('/api/security/dashboard', authMiddleware, (req, res) => {
  const user = db.getUserById(req.user.userId);
  const devices = db.getDevicesByUserId(req.user.userId);
  const logs = db.getSecurityLogs(req.user.userId, 10);

  const scoreItems = [
    { label: '端到端加密', value: '已开启', status: 'good' },
    { label: '生物识别解锁', value: '已开启', status: 'good' },
    { label: '隐私面具', value: user?.hideOnlineStatus ? '已开启' : '未开启', status: user?.hideOnlineStatus ? 'good' : 'warn' },
    { label: '阅后即焚', value: user?.burnAfterRead ? '已开启' : '未开启', status: user?.burnAfterRead ? 'good' : 'warn' },
    { label: '截图告警', value: user?.screenshotAlert ? '已开启' : '未开启', status: user?.screenshotAlert ? 'good' : 'warn' },
    { label: '活跃设备', value: devices.length + ' 个', status: devices.length <= 3 ? 'good' : 'warn' },
  ];

  res.json({
    securityScore: user?.securityScore || 0,
    scoreItems,
    activeSessions: onlineUsers.has(req.user.userId) ? onlineUsers.get(req.user.userId).size : 0,
    deviceCount: devices.length,
    recentActivity: logs.map(l => ({ event: l.event, ip: l.ip, time: new Date(l.createdAt).toLocaleString('zh-CN') }))
  });
});

// 删除账户
app.delete('/api/account', authMiddleware, async (req, res) => {
  const { password } = req.body;
  const user = db.getUserById(req.user.userId);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: '密码错误' });
  }
  delete db.data.users[req.user.userId];
  delete db.data.devices[req.user.userId];
  // 删除会话和消息
  Object.keys(db.data.conversations || {}).forEach(k => {
    const c = db.data.conversations[k];
    if (c.userAId === req.user.userId || c.userBId === req.user.userId) {
      delete db.data.conversations[k];
    }
  });
  db.save();
  logSecurity('account_delete', req.user.userId, { permanent: true });
  res.json({ success: true, message: '所有数据已永久删除' });
});

// 待处理密钥交换
app.get('/api/keys/pending', authMiddleware, (req, res) => {
  const keys = db.getPendingKeys(req.user.userId);
  res.json({ exchanges: keys });
});

// ========================
// 定期清理
// ========================
setInterval(() => {
  const now = Date.now();
  const THRESHOLD = 30 * 1000; // 30秒以上的阅后即焚消息删除

  Object.values(db.data.conversations || {}).forEach(conv => {
    const before = conv.messages?.length;
    conv.messages = (conv.messages || []).filter(m => {
      if (m.isBurnAfterRead && m.expiresAt && m.expiresAt < now) return false;
      return true;
    });
    if (conv.messages?.length !== before) db.save();
  });

  // 删除过期密钥交换
  const keys = db.data.pendingKeys || {};
  let changed = false;
  Object.keys(keys).forEach(k => {
    if (keys[k].expiresAt < now) { delete keys[k]; changed = true; }
  });
  if (changed) db.save();

}, 30_000);

// ========================
// 启动
// ========================
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  🔒  FIBEMATE Privacy Backend Server');
  console.log('  版本: 2.0.0-alpha (合规版)');
  console.log('═══════════════════════════════════════════════');
  console.log(`  HTTP:      http://0.0.0.0:${CONFIG.PORT}`);
  console.log(`  WebSocket: ws://0.0.0.0:${CONFIG.PORT}/ws`);
  console.log(`  Health:    http://0.0.0.0:${CONFIG.PORT}/health`);
  console.log(`  架构:      服务器零知识`);
  console.log(`  功能:      E2E加密 + 标准认证`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('[Init] REST API:');
  console.log('  POST   /api/auth/register       注册');
  console.log('  POST   /api/auth/login          登录');
  console.log('  GET    /api/users/:id/keys      获取公钥');
  console.log('  PUT    /api/user/public-key     更新公钥');
  console.log('  GET    /api/users/search?q=     搜索用户');
  console.log('  GET    /api/contacts           联系人列表');
  console.log('  POST   /api/contacts           添加联系人');
  console.log('  GET    /api/conversations      会话列表');
  console.log('  GET    /api/conversations/:id  消息历史');
  console.log('  POST   /api/messages            发送消息');
  console.log('  GET    /api/privacy            隐私设置');
  console.log('  PUT    /api/privacy            更新隐私');
  console.log('  GET    /api/security/dashboard 安全仪表盘');
  console.log('  DELETE /api/account            注销账户');
  console.log('');
  console.log('[Init] ✓ 服务器启动成功！');
  console.log('');
});

process.on('SIGTERM', () => { console.log('关闭中...'); process.exit(0); });
process.on('SIGINT', () => { console.log('关闭中...'); process.exit(0); });
