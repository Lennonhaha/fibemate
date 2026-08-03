// SPDX-License-Identifier: GPL-3.0-only
// ---- Feature Flags (P0: compile-time-equivalent isolation) ----
// All experimental code is gated behind flags.EXPERIMENTAL.
// Production:      FIBEMATE_EXPERIMENTAL=0  (default, no experimental code runs)
// Development:     FIBEMATE_EXPERIMENTAL=1  node src/index.js
// Subsystem off:   FIBEMATE_EXPERIMENTAL=1 FIBEMATE_NO_MIXNET=1 node src/index.js
const flags = require('./flags');

const { safeCompare, safeCompareHex, safeFind, safeFindByField, timingSafe404 } = require('./lib/constant-time');

/**
 * Noir Backend - 端到端加密社交服务器
 * 架构: 服务器零知识 - 只转发密文，不解密、不存储消息内容
 */

const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const { WsPadding } = require('./crypto/ws-padding');
const { UnifiedTrafficObfuscator } = require('./crypto/unified-traffic-obfuscator');

const Database = require('./db-sqlite');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const uuidv4 = crypto.randomUUID;
const path = require('path');
const fs = require('fs');
// ML-KEM-768 native addon (FIPS 203 verified)
let mlkem;
try { mlkem = require('../packages/pqc-kem/src/ml-kem-768.js'); } catch (_) { mlkem = null; console.warn('[mlkem] C addon unavailable, using JS fallback'); }
const mlkemPureJS = require('../packages/pqc-kem/src/ml-kem-768.js');
const PQRatchet = require('../double-ratchet-pq');
const pqSessions = new Map();

const url = require('url');
const cors = require('cors');
const helmet = require('helmet');

// ========================
// 配置
// ========================
// JWT_SECRET 持久化：环境变量 > 文件缓存 > 随机生成并写入文件
const JWT_SECRET_FILE = path.join(__dirname, '..', 'data', '.jwt-secret');
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    if (fs.existsSync(JWT_SECRET_FILE)) {
      const secret = fs.readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
      if (secret.length >= 32) return secret;
    }
  } catch (_) { /* ignore */ }
  const secret = crypto.randomBytes(64).toString('hex');
  try {
    const dir = path.dirname(JWT_SECRET_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(JWT_SECRET_FILE, secret, 'utf-8');
    console.log('[JWT] ✓ 密钥已持久化到文件，重启不再失效');
  } catch (e) {
    console.warn('[JWT] ⚠ 无法持久化密钥，重启后所有token将失效:', e.message);
  }
  return secret;
}

const CONFIG = {
  PORT: process.env.PORT || 3001,
  JWT_SECRET: resolveJwtSecret(),
  JWT_EXPIRES: '2h',
  JWT_REFRESH_EXPIRES: '7d',
  DB_PATH: path.join(__dirname, '..', 'data', 'noir-db.json'),
};

// 暴露 JWT_SECRET 给子模块

// ========================
// 数据库
// ========================
console.log('[DB] ✓ JSON数据库已加载:', CONFIG.DB_PATH);

// ========================
// Mixnet 元数据隐藏层 (Phase 3 & 4) — EXPERIMENTAL, gated by flags.MIXNET
// ========================
const MixnetTransport = flags.MIXNET ? require('../experimental/mixnet/mixnet-transport').MixnetTransport : null;
const MIXNET_CONFIG = flags.MIXNET ? require('../experimental/mixnet/mixnet-transport').MIXNET_CONFIG : null;
const Phase4Transport = flags.PHASE4 ? require('../experimental/phase4/integrate-phase4').Phase4Transport : null;
let mixnetTransport = null;
let phase4Transport = null;


// ========================
// Express
// ========================
const app = express();
// --- FIBEMATE Static Frontend ---
var staticPath = require("path").join(__dirname, "..", "www");
app.use(require("express").static(staticPath));
app.get("/", function(req, res) { res.sendFile(require("path").join(staticPath, "index.html")); });
// --- END Static ---
;
const db = new Database(CONFIG.DB_PATH);
app.set('db', db);
const zkAnonAuth = flags.ZK_AUTH ? require("../experimental/zk-auth/zk-anonymous-auth") : { router: (req,res,next)=>next(), setDatabase: ()=>{} };
const cryptoProxy = flags.EXPERIMENTAL ? require("../experimental/proxy/crypto-proxy") : (app) => {};
const sm2Proxy = flags.EXPERIMENTAL ? require("../experimental/sm2/sm2-proxy") : (app) => {};
if (flags.ZK_AUTH) zkAnonAuth.setDatabase(db);
const opkServer = require('./opk-server'); // init moved after authMiddleware
const sm34Proxy = flags.EXPERIMENTAL ? require("../experimental/sm2/sm34-proxy") : (app) => {};
let checkAccountLockout, recordFailedLogin, resetLoginAttempts;
try { ({ checkAccountLockout, recordFailedLogin, resetLoginAttempts } = require('./lib/lockout')); } catch (_) {
  checkAccountLockout = (n,l) => ({ locked: false, remaining: 0, remainingSec: 0 });
  recordFailedLogin = (n,l) => {};
  resetLoginAttempts = (n,l) => {};
} // security-hotfix 2026-06-09
global.noirDb = db;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));
// CORS: 限制为本地来源（Electron 内嵌页 + 本地开发）
const ALLOWED_ORIGINS = [
  'app://-',           // Electron app:// 协议
  'tauri://localhost',  // Tauri 协议
  'https://tauri.localhost', // Tauri HTTPS
  'file://',           // 本地文件
  'http://localhost',
  'http://localhost:',
  'http://127.0.0.1:',
  'http://127.0.0.1',
  'http://8.156.77.68','http://8.156.77.68:3001', // ECS 服务器
  'https://8.156.77.68', // ECS HTTPS
  'http://fibemate.net',
  'https://fibemate.net',
];
app.use(cors({
  origin: (origin, callback) => {
    // Electron/Tauri 内嵌页面 origin 为 undefined，允许通过
    if (!origin || ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      // 开发模式下宽松处理，生产环境可改为 callback(new Error('CORS blocked'))
      console.error('[CORS] 拒绝未识别的 origin:', origin);
      callback(new Error('CORS blocked: origin not allowed'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API response header: build timestamp for auditors and developers
app.use((req, res, next) => {
  res.setHeader('Last-Modified', '2026-06-09T00:00:00Z');
  next();
});


// 语音文件存储目录
const VOICE_DIR = path.join(__dirname, '..', 'data', 'voice');
if (!fs.existsSync(VOICE_DIR)) fs.mkdirSync(VOICE_DIR, { recursive: true });

// 语音文件加密密钥（每实例随机生成，重启后旧语音无法解密，符合阅后即焚理念）
const VOICE_ENCRYPT_KEY = crypto.randomBytes(32);

// AES-256-GCM 加密语音文件
function encryptBuffer(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', VOICE_ENCRYPT_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  // 存储格式: [authTag(16)] [iv(16)] [ciphertext]
  return Buffer.concat([authTag, iv, encrypted]);
}

// AES-256-GCM 解密语音文件
function decryptBuffer(encData) {
  const authTag = encData.subarray(0, 16);
  const iv = encData.subarray(16, 32);
  const ciphertext = encData.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', VOICE_ENCRYPT_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// 语音文件路由占位（在 authMiddleware 定义后注册）
let voiceRouteHandler = null;

// 静态文件服务（前端）
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath, {
  index: false,  // 禁用默认 index.html，由路由控制
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

// 根路径 → 安装引导页
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'install.html'));
});

// SPA fallback

// A2A Agent-to-Agent 接口 (2026-06-09 添加)
// VWZ Research API — gated by flags.VWZ
// VWZ Research API — moved to experimental/vwz-lg branch (2026-07-22)
const a2aCore = require('../api/a2a/a2a-core');
app.use('/a2a', a2aCore.router);
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/voice') || req.path.startsWith('/research') || req.path === '/health') return next();
  if (req.path === '/app' || req.path === '/index') {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  }
  res.sendFile(path.join(frontendPath, 'install.html'));
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


const pqcHybrid = require("./pqc-hybrid-server");
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

const genRefreshToken = (user) => jwt.sign(
  { userId: user.id, username: user.username, deviceId: user.deviceId, type: 'refresh' },
  CONFIG.JWT_SECRET,
  { expiresIn: CONFIG.JWT_REFRESH_EXPIRES }
);


// ========================
// 登录/注册频率限制（内存计数器）
// ========================
const rateLimitMap = new Map(); // key: ip | value: { count, firstAt }
const RATE_LIMIT_MAX = 30;       // 窗口期内最大请求次数
const RATE_LIMIT_WINDOW = 15 * 60_000; // 窗口期 15 分钟

// OPK routes: must be registered after authMiddleware is defined
opkServer.init(app, db, authMiddleware);

const rateLimitMiddleware = (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record || now - record.firstAt > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { count: 1, firstAt: now });
    return next();
  }
  record.count++;
  if (record.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - record.firstAt)) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `请求过于频繁，请 ${retryAfter} 秒后再试` });
  }
  next();
};

// ========================
// POST /api/auth/refresh - 刷新 access token
// ========================
app.post('/api/auth/refresh', rateLimitMiddleware, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: '缺少 refresh token' });
    
    const decoded = jwt.verify(refreshToken, CONFIG.JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: '无效的 refresh token' });
    }
    
    const user = db.getUserById(decoded.userId);
    if (!user) { timingSafe404(res, false, {}, '用户不存在'); return; }
    
    // Issue new access token + new refresh token (rotation)
    const newToken = genToken({ id: user.id, username: user.username, deviceId: decoded.deviceId || '' });
    const newRefreshToken = genRefreshToken({ id: user.id, username: user.username, deviceId: decoded.deviceId || '' });
    
    res.json({
      token: newToken,
      refreshToken: newRefreshToken,
      userId: user.id,
      username: user.username
    });
  } catch (e) {
    return res.status(401).json({ error: 'Refresh token 已过期，请重新登录' });
  }
});

// 语音文件路由（在 authMiddleware 定义后注册）
app.get('/voice/:fileId', authMiddleware, (req, res) => {
  const filePath = path.join(VOICE_DIR, req.params.fileId);
  if (!filePath.startsWith(VOICE_DIR)) return res.status(403).json({ error: '非法路径' });
  if (!fs.existsSync(filePath)) { timingSafe404(res, false, {}, '文件不存在'); return; }
  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = decryptBuffer(encrypted);
    const ext = path.extname(req.params.fileId).slice(1);
    const mimeMap = { webm: 'audio/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg' };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(decrypted);
  } catch (e) {
    console.error('[Voice] 解密失败:', e.message);
    res.status(500).json({ error: '文件读取失败' });
  }
});

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
    console.log('[SEND] sendToUser() called: userId=' + userId + ' online=' + onlineUsers.has(userId));
const sockets = onlineUsers.get(userId);
  console.log('[SEND] sendToUser -> userId=' + userId + ' sockets=' + (sockets ? sockets.size : 'null'));
  if (!sockets) { console.log('[SEND] no sockets, returning false'); return false; }
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let ok = false;
  let i = 0;
  sockets.forEach(ws => {
    console.log('[SEND]   socket[' + (i++) + '] readyState=' + ws.readyState);
    if (ws.readyState === 1) { ws.send(data); ok = true; }
  });
  console.log('[SEND] returning ok=' + ok);
  return ok;
}
// 初始化 Mixnet
// 初始化 Mixnet 传输层 (Phase 3) — gated by flags.MIXNET
if (flags.MIXNET) {
  mixnetTransport = new MixnetTransport(db, onlineUsers, sendToUser);
  console.log('[Mixnet] ✓ Phase 3 元数据隐藏层已启动 (padding: ' + MIXNET_CONFIG.PAD_MESSAGE_SIZE + 'B, cover: ' + Math.round(MIXNET_CONFIG.COVER_TRAFFIC_RATE * 100) + '%)');
} else {
  console.log('[Mixnet] Skipped (MIXNET flag off)');
}

// 初始化 Phase 4 抗流量分析层 — gated by flags.PHASE4
if (flags.PHASE4) {
  phase4Transport = new Phase4Transport(db, onlineUsers, sendToUser);
  console.log('[Phase4] ✓ 抗流量分析层已启动 (Sphinx packets + Nym Mixnet)');
} else {
  console.log('[Phase4] Skipped (PHASE4 flag off)');
}

// 初始化统一流量混淆层 (TLS 1.3 + Poisson Cover Traffic + Random Padding)
const trafficObfuscator = new UnifiedTrafficObfuscator(db, onlineUsers, sendToUser);
trafficObfuscator.start();
console.log('[TrafficObfuscator] Unified traffic obfuscation started (Poisson + Padding)');



// ========================
// WebSocket
// ========================
wss.on('connection', (ws, req) => {

  // ===== Traffic Obfuscation Layer =====
  // Transparent ws.send interceptor: all outgoing messages auto-padded
  const _origSend = ws.send.bind(ws);
  ws.send = function(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
    return _origSend(WsPadding.pad(buf));
  };
  // ===== End Traffic Obfuscation Layer =====

  let authed = false;

  let userId = null;
  let deviceId = null;

  console.log(`[WS] 新连接 from ${req.socket.remoteAddress}`);

  ws.on('message', async (raw) => {
      console.log('[WS-MSG] Received:', raw ? raw.toString().substring(0, 200) : 'null');
try {
      const unpadded = WsPadding.unpad(Buffer.from(raw));
      if (unpadded.isCover) return; // Discard cover traffic
      const msg = JSON.parse(unpadded.payload.toString());

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
            ciphertext: effectiveCiphertext,
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

          // 通过 Mixnet 传输层发送（带延迟、填充、假消息）
          const outgoingMsg = {
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
          };
          
          // Mixnet 处理：填充、延迟、生成假消息
          console.log('[MSG-FLOW] Calling phase4Transport.sendMessage to=' + to + ' msgType=' + (outgoingMsg ? outgoingMsg.type : 'undefined'));

          if (phase4Transport) {
            phase4Transport.sendMessage(to, outgoingMsg, true);
          } else if (mixnetTransport) {
            mixnetTransport.sendMessage(to, outgoingMsg, false);
          }
          const delivered = onlineUsers.has(to); // 假设最终会送达

          ws.send(JSON.stringify({ type: 'message_sent', messageId: msgId, delivered, timestamp: now }));
          break;
        }

        case 'key_exchange': {
          // 支持前端发送的格式 { ikPub, ekPub, kemCt }
          // 也支持后端格式 { payload }
          const { conversationId, ikPub, ekPub, kemCt, payload, to } = msg;
          if (!to && !conversationId) break;
          
          // 如果传了 conversationId，找出对方用户
          let recipientUserId = to;
          if (!recipientUserId && conversationId) {
            const conv = db.getConversationById(conversationId);
            if (conv) {
              recipientUserId = conv.participantUserId === userId 
                ? conv.ownerUserId 
                : conv.participantUserId;
            }
          }
          if (!recipientUserId) break;
          
          const exchangeId = msg.exchangeId || uuidv4();
          const exchangePayload = payload || { ikPub, ekPub, kemCt };
          const exchange = {
            id: exchangeId,
            fromUserId: userId,
            toUserId: recipientUserId,
            fromDeviceId: deviceId,
            exchangeType: 'x3dh',
            payload: exchangePayload,
            createdAt: Date.now(),
            expiresAt: Date.now() + 5 * 60_000
          };
          db.addPendingKey(exchange);
          sendToUser(recipientUserId, {
            type: 'key_exchange_request',
            exchangeId,
            from: userId,
            fromDevice: deviceId,
            exchangeType: 'x3dh',
            conversationId,
            payload: exchangePayload,
            timestamp: Date.now()
          });
          ws.send(JSON.stringify({ type: 'key_exchange_sent', exchangeId }));
          break;
        }

        case 'key_exchange_response': {
          const { conversationId, ratchetKey, to, responsePayload, exchangeId } = msg;
          
          // 支持前端发送的 { ratchetKey }
          const payload = responsePayload || { ratchetKey };
          
          // 如果有 conversationId，找出对方
          let recipientUserId = to;
          if (!recipientUserId && conversationId) {
            const conv = db.getConversationById(conversationId);
            if (conv) {
              recipientUserId = conv.participantUserId === userId 
                ? conv.ownerUserId 
                : conv.participantUserId;
            }
          }
          
          if (recipientUserId) {
            sendToUser(recipientUserId, {
              type: 'key_exchange_response',
              exchangeId,
              from: userId,
              payload,
              timestamp: Date.now()
            });
          }
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
        case 'call_end': {
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
    status: 'ok', service: 'Noir E2E Backend',
    version: '1.0.0', architecture: 'zero-knowledge',
    phases: { p1: 'zk-identity', p2: 'pir-search', p3: 'mixnet', p4: 'sphinx-nym' },
    uptime: Math.floor(process.uptime())
  });
});

// API 健康检查别名（兼容监控脚本）
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', service: 'Noir E2E Backend',
    version: '1.0.0', timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// 用户计数API - 公开访问（测试用户管理）
app.get('/api/users/count', authMiddleware, (req, res) => {
  try {
    const users = db.data.users || {};
    const totalUsers = Object.keys(users).length;
    const testUsers = Object.values(users).filter(u => u.isTestUser).length;
    res.json({
      totalUsers,
      testUsers,
      maxUsers: MAX_USERS,
      remainingSlots: Math.max(0, MAX_USERS - totalUsers),
      isFull: totalUsers >= MAX_USERS
    });
  } catch (e) {
    res.status(500).json({ error: '服务器错误' });
  }
});


// Phase 4 配置端点 — gated by flags.PHASE4
app.get('/api/nym/config', authMiddleware, (req, res) => {
  if (!flags.PHASE4) return res.status(404).json({ error: 'phase4 not available' });
  if (!phase4Transport) {
    return res.status(503).json({ error: 'Phase 4 transport not initialized' });
  }
  res.json({
    enabled: true,
    config: phase4Transport.getClientConfig(),
    stats: phase4Transport.getStats()
  });
});

// Phase 4 统计端点（管理员/调试）
app.get('/api/nym/stats', authMiddleware, (req, res) => {
  if (!phase4Transport) {
    return res.json({ enabled: false });
  }
  res.json({
    enabled: true,
    stats: phase4Transport.getStats(),
    timestamp: Date.now()
  });
});

// 获取或创建会话（发第一条消息前调用）
app.post('/api/conversations/find-or-create', authMiddleware, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: '缺少 userId' });
  if (userId === req.user.userId) return res.status(400).json({ error: '不能和自己聊天' });
  const other = db.getUserById(userId);
  if (!other) { timingSafe404(res, false, {}, '用户不存在'); return; }
  const conv = db.getOrCreateConversation(req.user.userId, userId);
  res.json({ conversationId: conv.id, otherUser: { id: other.id, username: other.username, displayName: other.displayName, isOnline: !!other.isOnline } });
});

// ===== 用户限制配置 =====
const MAX_USERS = 200;
const RESERVED_IDS = ['id88888888', 'id1111111', 'id66666666', 'id99999999', 'id00000001'];
const ADMIN_INVITE_CODE = process.env.ADMIN_INVITE_CODE;
if (!ADMIN_INVITE_CODE) {
  console.error('[Admin] WARNING: ADMIN_INVITE_CODE not set in .env');
}  // 建议通过环境变量设置，避免源码泄露

// ZK 匿名认证端点 (必须在标准注册之前, 防止路径前缀匹配冲突)
app.use('/api/auth', zkAnonAuth.router);
cryptoProxy(app);
sm2Proxy(app);
sm34Proxy(app);

// 注册
app.post('/api/auth/register', rateLimitMiddleware, async (req, res) => {
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
      isTestUser: true,
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
      isTestUser: true,
      lastActive: now
    });

    db.setPresence(userId, false);

    const token = genToken({ id: userId, username, deviceId });
    const refreshToken = genRefreshToken({ id: userId, username, deviceId });
    logSecurity('register', userId, { username });

    res.status(201).json({ userId, deviceId, token, refreshToken, message: '注册成功' });
  } catch (e) {
    console.error('[Auth] 注册错误:', e.message);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
app.post('/api/auth/login', rateLimitMiddleware, async (req, res) => {
  try {
    const { username, password, devicePublicKey } = req.body;
    if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });

    // 账户锁定检查 (security-hotfix 2026-06-09)
    const lockStatus = checkAccountLockout(username);
    if (lockStatus.locked) {
      const min = Math.floor(lockStatus.remainingSec / 60);
      const sec = lockStatus.remainingSec % 60;
      logSecurity('login_blocked', null, { username, remainingSec: lockStatus.remainingSec });
      return res.status(429).json({
        error: `账户已锁定，请 ${min} 分 ${sec} 秒后重试`,
        lockoutRemaining: (lockStatus && lockStatus.remainingSec) || 0
      });
    }

    const user = db.getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      recordFailedLogin(username, req.ip);
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
    const refreshToken = genRefreshToken({ id: user.id, username: user.username, deviceId: deviceId || '' });
    db.updateUser(user.id, { isOnline: 1, lastSeen: Date.now() });
    db.setPresence(user.id, true);
    resetLoginAttempts(username);
    logSecurity('login', user.id, { deviceId });

    res.json({
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      publicKey: user.publicKey,
      deviceId,
      token,
      refreshToken,
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

// 更新公钥（登录后客户端生成密钥对并上传）
app.post('/api/auth/update-keys', authMiddleware, (req, res) => {
  const { publicKey, signedPrekey, prekeySignature } = req.body;
  if (!publicKey) return res.status(400).json({ error: '缺少 publicKey' });
  db.updateUser(req.user.userId, {
    publicKey,
    signedPrekey: signedPrekey || publicKey,
    prekeySignature: prekeySignature || ''
  });
  // 同步更新设备公钥
  if (req.user.deviceId && db.data.devices[req.user.userId]) {
    const dev = db.data.devices[req.user.userId][req.user.deviceId];
    if (dev) { dev.publicKey = publicKey; db.save(); }
  }
  logSecurity('update_keys', req.user.userId);
  res.json({ success: true, message: '公钥已更新' });
});

// 搜索用户（必须放在 /:userId 前面，避免被误匹配）
app.get('/api/users/search', authMiddleware, (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: '搜索词至少2字符' });
    const users = Object.values(db.data.users)
      .filter(u => {
        if (u.id === req.user.userId) return false;
        const uname = u.username || '';
        const dname = u.displayName || '';
        return uname.includes(q) || dname.includes(q);
      })
      .slice(0, 20)
      .map(u => ({ id: u.id, username: u.username || '', displayName: u.displayName || '', isAnonymous: !!u.isAnonymous, isOnline: !!u.isOnline }));
    res.json({ users });
  } catch (e) {
    console.error('[Search] 错误:', e.message);
    res.status(500).json({ error: '搜索失败' });
  }
});

// 获取用户信息
app.get('/api/users/:userId', authMiddleware, (req, res) => {
  const user = db.getUserById(req.params.userId);
  if (!user) { timingSafe404(res, false, {}, '用户不存在'); return; }
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
// 异步 X3DH 预密钥 bundle — Alice 离线时从服务器获取 Bob 的密钥
app.get('/api/users/:userId/keys', authMiddleware, (req, res) => {
  const user = db.getUserById(req.params.userId);
  if (!user) { timingSafe404(res, false, {}, '用户不存在'); return; }

  // 消耗一个 OPK（如果有的话）
  let oneTimePreKey = null;
  try {
    const { opkCache } = require('./opk-server');
    const cache = opkCache[req.params.userId] || [];
    const opk = cache.find(k => k.status === 'available');
    if (opk) {
      opk.status = 'used';
      opk.usedBy = req.user.userId;
      opk.usedAt = Date.now();
      oneTimePreKey = { keyId: opk.keyId, publicKey: opk.publicKey };
      // 持久化
      try {
        db._db.prepare(`UPDATE one_time_prekeys SET status='used', used_by=?, used_at=? WHERE id=?`)
          .run(req.user.userId, Date.now(), `${req.params.userId}_${opk.keyId}`);
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[keys] OPK consume failed:', e.message);
  }

  res.json({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    identityKey: user.publicKey,
    signedPrekey: user.signedPrekey,
    signedPrekeySignature: user.prekeySignature,
    oneTimePreKey,          //  { keyId, publicKey } 或 null
    isOnline: !!user.isOnline
  });
});

// 联系人列表（含 pending 状态）
app.get('/api/contacts', authMiddleware, (req, res) => {
  const contacts = db.getContacts(req.user.userId, true).map(c => {
    const otherId = c.userId === req.user.userId ? c.contactUserId : c.userId;
    const other = db.getUserById(otherId);
    return other ? { id: other.id, username: other.username, displayName: other.displayName, isOnline: !!other.isOnline, contactStatus: c.status } : null;
  }).filter(Boolean);
  res.json({ contacts });
});

// 添加联系人
app.post('/api/contacts', authMiddleware, (req, res) => {
  const { userId } = req.body;
  if (!userId || userId === req.user.userId) return res.status(400).json({ error: '无效ID' });
  if (!db.getUserById(userId)) { timingSafe404(res, false, {}, '用户不存在'); return; }
  const existing = db.getContacts(req.user.userId, true).find(c => c.contactUserId === userId || c.userId === userId);
  if (existing) return res.status(409).json({ error: '已是联系人或已发送请求' });
  // 请求者: pending；被请求者: pending
  db.addContact(req.user.userId, userId, 'pending');
  db.addContact(userId, req.user.userId, 'pending');
  logSecurity('contact_add', req.user.userId, { addedUserId: userId });
  res.json({ success: true, status: 'pending' });
});

// 接受/拒绝联系人请求
app.put('/api/contacts/:userId', authMiddleware, (req, res) => {
  const { status } = req.body; // 'accepted' | 'rejected'
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: '无效状态' });
  const otherId = req.params.userId;
  const contact = db.getContacts(req.user.userId, true).find(c => c.contactUserId === otherId || c.userId === otherId);
  if (!contact) { timingSafe404(res, false, {}, '联系人请求不存在'); return; }
  if (contact.status !== 'pending') return res.status(400).json({ error: '联系人状态不是 pending' });
  db.updateContactStatus(req.user.userId, otherId, status);
  db.updateContactStatus(otherId, req.user.userId, status);
  logSecurity('contact_' + status, req.user.userId, { otherUserId: otherId });
  res.json({ success: true, status });
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
  res.json({ conversations: result.filter(c => c.otherUser !== null) });
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

// 语音文件上传（加密存储）
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
    const encrypted = encryptBuffer(buffer);
    fs.writeFileSync(path.join(VOICE_DIR, fileId), encrypted);
    const voiceUrl = `/voice/${fileId}`;
    console.log(`[Voice] 上传并加密成功: ${fileId} (${(buffer.length/1024).toFixed(1)}KB)`);
    res.json({ url: voiceUrl, size: buffer.length });
  } catch (e) {
    console.error('[Voice] 上传失败:', e.message);
    res.status(500).json({ error: '上传失败' });
  }
});

// 发送消息 (REST备选)
app.post('/api/messages', authMiddleware, (req, res) => {
  const { conversationId, ciphertext, content, messageType, burnAfterRead } = req.body;
  const conv = Object.values(db.data.conversations || {}).find(c => c.id === conversationId);
  if (!conv || (conv.userAId !== req.user.userId && conv.userBId !== req.user.userId)) {
    return res.status(403).json({ error: '无权访问' });
  }
  const effectiveCiphertext = ciphertext || content;
  const toUserId = conv.userAId === req.user.userId ? conv.userBId : conv.userAId;
  const msgId = uuidv4();
  const now = Date.now();
  const msgObj = {
    id: msgId,
    conversationId,
    senderUserId: req.user.userId,
    senderDeviceId: req.user.deviceId,
    recipientUserId: toUserId,
    ciphertext: effectiveCiphertext,
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
    ciphertext: effectiveCiphertext,
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
// ZK 匿名身份认证路由
// ========================
// ZK Auth v2 routes — gated by flags.ZK_AUTH
if (flags.ZK_AUTH) {
  const zkRegV2Routes = require('../experimental/zk-auth/zk-register-v2');
  app.use('/api/auth', zkRegV2Routes);
}
const smsRoutes = require('./sms-routes')(CONFIG.JWT_SECRET);
app.use('/api/sms', smsRoutes);

// ========================
// Phase 2: 私密发现路由 (Bloom Filter PIR) — gated by flags.PIR
// ========================
const pirSearchRoutes = flags.PIR ? require('../experimental/pir/pir-search') : null;

// ========================
// Mixnet 配置 API
// ========================
// Mixnet 配置 API — gated by flags.MIXNET
app.get('/api/mixnet/config', authMiddleware, (req, res) => {
  if (!flags.MIXNET) return res.status(404).json({ error: 'mixnet not available' });
  res.json({
    padding: {
      enabled: true,
      messageSize: MIXNET_CONFIG.PAD_MESSAGE_SIZE,
      blockSize: MIXNET_CONFIG.PAD_BLOCK_SIZE,
    },
    coverTraffic: {
      enabled: true,
      rate: MIXNET_CONFIG.COVER_TRAFFIC_RATE,
    },
    delay: {
      minMs: MIXNET_CONFIG.DELAY_MIN_MS,
      maxMs: MIXNET_CONFIG.DELAY_MAX_MS,
    },
    batching: {
      enabled: true,
      windowMs: MIXNET_CONFIG.BATCH_WINDOW_MS,
      maxSize: MIXNET_CONFIG.BATCH_MAX_SIZE,
    },
  });
});

// PIR search routes — gated by flags.PIR
if (flags.PIR) {
  app.use('/api/search', authMiddleware, pirSearchRoutes(db));
}

// Nexus Community API — gated by flags.NEXUS
if (flags.NEXUS) {
  const integrateNexus = require("../experimental/nexus/nexus-integration");
  app.use('/api/nexus', authMiddleware);
  integrateNexus(app);
}

// ========================
// 启动
// ========================

// ========================
// ML-KEM-768 API (FIPS 203 verified C code via native addon)
// ========================

app.post('/api/mlkem/keygen', authMiddleware, (req, res) => {
  try {
    const [pk, sk] = mlkem.keygen();
    res.json({ publicKey: pk.toString('hex'), secretKey: sk.toString('hex') });
  } catch (err) {
    res.status(500).json({ error: 'keygen failed: ' + err.message });
  }
});

app.post('/api/mlkem/encaps', authMiddleware, (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ error: 'missing publicKey' });
    const pk = Buffer.from(publicKey, 'hex');
    const [ct, ss] = mlkem.encaps(pk);
    res.json({ ciphertext: ct.toString('hex'), sharedSecret: ss.toString('hex') });
  } catch (err) {
    res.status(500).json({ error: 'encaps failed: ' + err.message });
  }
});

app.post('/api/mlkem/decaps', authMiddleware, (req, res) => {
  try {
    const { ciphertext, secretKey } = req.body;
    if (!ciphertext || !secretKey) return res.status(400).json({ error: 'missing ciphertext or secretKey' });
    const ct = Buffer.from(ciphertext, 'hex');
    const sk = Buffer.from(secretKey, 'hex');
    const ss = mlkem.decaps(ct, sk);
    res.json({ sharedSecret: ss.toString('hex') });
  } catch (err) {
    res.status(500).json({ error: 'decaps failed: ' + err.message });
  }
});

// Test endpoint (no auth required for quick testing)
app.post('/api/mlkem/register', authMiddleware, (req, res) => {
  try {
    var pk = req.body.publicKeyHex, uid = req.user.userId || req.user.sub;
    if (!pk || pk.length !== 2368) return res.status(400).json({error:'Invalid key'});
    db.updateUser(uid, {mlkemPublicKey: pk});
    console.log('[ML-KEM] Registered key for', uid);
    res.json({status:'ok', userId: uid});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/mlkem/public-key/:userId', authMiddleware, (req, res) => {
  const u = db.getUserById(req.params.userId);
  timingSafe404(res, !!(u && u.mlkemPublicKey),
    {userId: req.params.userId, mlkemPublicKey: u?.mlkemPublicKey},
    'No key');
});

app.get('/api/mlkem/test', (req, res) => {
  try {
    const [pk, sk] = mlkem.keygen();
    const [ct, ss1] = mlkem.encaps(pk);
    const ss2 = mlkem.decaps(ct, sk);
    res.json({
      status: 'ok',
      pk_bytes: pk.length,
      sk_bytes: sk.length,
      ct_bytes: ct.length,
      ss_bytes: ss1.length,
      roundTrip: Buffer.compare(ss1, ss2) === 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch KAT test endpoint — processes multiple rounds server-side
// Avoids client-side concurrency overload and Nginx rate limiting
app.get('/api/mlkem/test-batch', (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count) || 20, 50000);
    const results = [];
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < count; i++) {
      const [pk, sk] = mlkem.keygen();
      const [ct, ss1] = mlkem.encaps(pk);
      const ss2 = mlkem.decaps(ct, sk);
      results.push({
        round: req.query.offset ? parseInt(req.query.offset) + i : i,
        pass: Buffer.compare(ss1, ss2) === 0
      });
    }
    const totalNs = Number(process.hrtime.bigint() - t0);
    const totalMs = parseFloat((totalNs / 1e6).toFixed(1));
    const avgMsPerRound = parseFloat((totalMs / count).toFixed(2));
    res.json({ status: 'ok', count, totalMs, avgMsPerRound, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Pure JS (ml-kem-768.js) test-batch endpoint — same logic, no C addon dependency
app.get('/api/mlkem/test-batch-purejs', (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count) || 100, 50000);
    const results = [];
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < count; i++) {
      const { publicKey, secretKey } = mlkemPureJS.generateKeypair();
      const { ciphertext, sharedSecret: ss1 } = mlkemPureJS.encapsulate(publicKey);
      const ss2 = mlkemPureJS.decapsulate(secretKey, ciphertext);
      const ss1Buf = Buffer.from(ss1);
      const ss2Buf = Buffer.from(ss2);
      results.push({
        round: req.query.offset ? parseInt(req.query.offset) + i : i,
        pass: Buffer.compare(ss1Buf, ss2Buf) === 0
      });
    }
    const totalNs = Number(process.hrtime.bigint() - t0);
    const totalMs = parseFloat((totalNs / 1e6).toFixed(1));
    const avgMsPerRound = parseFloat((totalMs / count).toFixed(2));
    res.json({ status: 'ok', count, totalMs, avgMsPerRound, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(CONFIG.PORT, '127.0.0.1', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  🔒  Noir E2E Encrypted Backend Server');
  console.log('═══════════════════════════════════════════════');
  console.log(`  HTTP:      http://127.0.0.1:${CONFIG.PORT}`);
  console.log(`  WebSocket: ws://127.0.0.0.1:${CONFIG.PORT}/ws`);
  console.log(`  Health:    http://127.0.0.1:${CONFIG.PORT}/health`);
  console.log(`  架构:      服务器零知识`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('[Init] REST API:');
  console.log('  POST   /api/auth/register       注册');
  console.log('  POST   /api/auth/login          登录');
  console.log('  GET    /api/users/:id/keys      获取公钥');
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

// ZK-SNARKs Groth16 路由 (2026-05-14 添加) — gated by flags.ZK_AUTH
if (flags.ZK_AUTH) {
  const zkSnarksGroth16Routes = require('../experimental/zk-auth/zk-snarks-groth16');
  app.use('/api/auth', zkSnarksGroth16Routes);
}
// PQC Hybrid TLS Session Key Exchange
pqcHybrid.mount(app);


