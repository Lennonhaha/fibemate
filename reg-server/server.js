// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Registration Backend + IANA #4590 E2E Key Exchange
 * Node.js + ws (WebSocket) + in-memory storage
 * 
 * Base Protocol:
 *   register, upload-opk, fetch-opk, send, poll, whoami, lookup
 * 
 * IANA #4590 E2E Extension:
 *   e2e-init, e2e-respond, e2e-poll, e2e-msg, e2e-fetch
 */
'use strict';

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const PORT = parseInt(process.argv[2], 10) || 3080;

// In-memory stores
const users = new Map();      // userId => { username, identityKey }
const usernameMap = new Map(); // username => userId
const opks = new Map();       // userId => Set of opk strings
const inbox = new Map();      // userId => [{ from, ciphertext, timestamp }]

// IANA #4590 E2E stores
const e2ePendingInits = new Map();   // targetUserId => [{ initiatorId, keyShare, timestamp }]
const e2ePendingResps = new Map();   // targetUserId => [{ responderId, keyShare, mlkemCt, timestamp }]
const e2eMsgQueues = new Map();      // targetUserId => [{ from, payload, timestamp }]

function uid() { return crypto.randomBytes(8).toString('hex'); }
function send(ws, data) { ws.send(JSON.stringify(data)); }
function error(ws, text) { send(ws, { ok: false, error: text }); }

function handle(ws, msg) {
  try {
    const { type, ...rest } = JSON.parse(msg.toString());

    switch (type) {

      // ---- Base Protocol ----
      case 'register': {
        const { username, identityKey } = rest;
        if (!username || !identityKey) return error(ws, 'username and identityKey required');
        if (usernameMap.has(username)) return error(ws, 'username taken');
        const id = uid();
        users.set(id, { username, identityKey });
        usernameMap.set(username, id);
        inbox.set(id, []);
        opks.set(id, new Set());
        e2ePendingInits.set(id, []);
        e2ePendingResps.set(id, []);
        e2eMsgQueues.set(id, []);
        console.log(`[REG] ${username} => ${id}`);
        return send(ws, { ok: true, userId: id });
      }

      case 'upload-opk': {
        const { userId, opks: keyList } = rest;
        if (!userId || !keyList) return error(ws, 'userId and opks required');
        if (!users.has(userId)) return error(ws, 'unknown userId');
        const store = opks.get(userId);
        let added = 0;
        for (const k of keyList) {
          if (!store.has(k)) { store.add(k); added++; }
        }
        console.log(`[OPK] +${added} keys for ${userId} (pool: ${store.size})`);
        return send(ws, { ok: true, count: added });
      }

      case 'fetch-opk': {
        const { userId } = rest;
        if (!userId) return error(ws, 'userId required');
        if (!users.has(userId)) return error(ws, 'unknown userId');
        const store = opks.get(userId);
        if (store.size === 0) return error(ws, 'no OPK available');
        const key = [...store][0];
        store.delete(key);
        console.log(`[OPK] fetched for ${userId}, remaining: ${store.size}`);
        return send(ws, { ok: true, opk: key });
      }

      // ---- IANA #4590 E2E Handshake ----

      /**
       * Alice 发送 key_share 给 Bob（发起 E2E 握手）
       * 输入: { from, to, keyShare }
       * 输出: { ok: true, handshakeId }
       */
      case 'e2e-init': {
        const { from, to, keyShare } = rest;
        if (!from || !to || !keyShare) return error(ws, 'from, to, keyShare required');
        if (!users.has(from)) return error(ws, 'sender not found');
        if (!users.has(to)) return error(ws, 'recipient not found');
        const hsid = uid();
        const initMsg = { handshakeId: hsid, initiatorId: from, keyShare, timestamp: Date.now() };
        const q = e2ePendingInits.get(to) || [];
        q.push(initMsg);
        e2ePendingInits.set(to, q);
        console.log(`[E2E-Init] ${from} → ${to}: hs=${hsid} keyShare=${keyShare.length}B`);
        return send(ws, { ok: true, handshakeId: hsid, type: 'e2e-init' });
      }

      /**
       * Bob 轮询是否有 Alice 发起的 E2E 握手请求
       * 输入: { userId }
       * 输出: { type: "e2e-request", handshakeId, initiatorId, keyShare, ... }
       * 或 { type: "e2e-request", ok: false, error: "no pending handshake" }
       */
      case 'e2e-poll': {
        const { userId } = rest;
        if (!userId) return error(ws, 'userId required');

        // 轮询 E2E 握手请求
        const inits = e2ePendingInits.get(userId) || [];
        if (inits.length > 0) {
          const msg = inits.shift();
          console.log(`[E2E-Poll] ${userId}: init from ${msg.initiatorId}, ${e2ePendingInits.get(userId).length} remaining`);
          return send(ws, { ...msg, ok: true, type: 'e2e-request' });
        }

        // 轮询 E2E 握手响应
        const resps = e2ePendingResps.get(userId) || [];
        if (resps.length > 0) {
          const msg = resps.shift();
          console.log(`[E2E-Poll] ${userId}: response from ${msg.responderId}, ${e2ePendingResps.get(userId).length} remaining`);
          return send(ws, { ...msg, ok: true, type: 'e2e-response' });
        }

        return error(ws, 'no pending e2e handshake');
      }

      /**
       * Bob 响应 Alice 的 E2E 握手请求
       * 输入: { from, to, keyShare, mlkemCt }
       * 输出: { ok: true, type: "e2e-respond" }
       */
      case 'e2e-respond': {
        const { from, to, keyShare, mlkemCt } = rest;
        if (!from || !to || !keyShare || !mlkemCt) return error(ws, 'from, to, keyShare, mlkemCt required');
        if (!users.has(from)) return error(ws, 'responder not found');
        if (!users.has(to)) return error(ws, 'initiator not found');
        const respMsg = { responderId: from, keyShare, mlkemCt, timestamp: Date.now() };
        const q = e2ePendingResps.get(to) || [];
        q.push(respMsg);
        e2ePendingResps.set(to, q);
        console.log(`[E2E-Respond] ${from} → ${to}: keyShare=${keyShare.length}B mlkemCt=${mlkemCt.length}B`);
        return send(ws, { ok: true, type: 'e2e-respond' });
      }

      /**
       * 发送 E2E 加密消息
       * 输入: { from, to, payload }
       * 输出: { ok: true, msgId }
       */
      case 'e2e-msg': {
        const { from, to, payload } = rest;
        if (!from || !to || !payload) return error(ws, 'from, to, payload required');
        if (!users.has(to)) return error(ws, 'recipient not found');
        const msgId = uid();
        const msg = { from, payload, timestamp: Date.now(), msgId };
        const q = e2eMsgQueues.get(to) || [];
        q.push(msg);
        e2eMsgQueues.set(to, q);
        console.log(`[E2E-Msg] ${from} → ${to}: msgId=${msgId} payload=${payload.length}B`);
        return send(ws, { ok: true, msgId, type: 'e2e-msg' });
      }

      /**
       * 获取 E2E 加密消息
       * 输入: { userId }
       * 输出: { type: "e2e-msgs", messages: [...] }
       */
      case 'e2e-fetch': {
        const { userId } = rest;
        if (!userId) return error(ws, 'userId required');
        if (!users.has(userId)) return error(ws, 'unknown userId');
        const msgs = e2eMsgQueues.get(userId) || [];
        const batch = msgs.splice(0);
        console.log(`[E2E-Fetch] ${userId}: ${batch.length} messages`);
        return send(ws, { ok: true, type: 'e2e-msgs', messages: batch });
      }

      // ---- Legacy Protocol ----
      case 'send': {
        const { from, to, ciphertext } = rest;
        if (!from || !to || !ciphertext) return error(ws, 'from, to, ciphertext required');
        if (!users.has(to)) return error(ws, 'recipient not found');
        const msgId = uid();
        inbox.get(to).push({ from, ciphertext, timestamp: Date.now() });
        console.log(`[MSG] ${from} -> ${to}: ${msgId} (${ciphertext.length} chars)`);
        return send(ws, { ok: true, msgId });
      }

      case 'poll': {
        const { userId } = rest;
        if (!userId) return error(ws, 'userId required');
        if (!users.has(userId)) return error(ws, 'unknown userId');
        const msgs = inbox.get(userId).splice(0);
        return send(ws, { ok: true, messages: msgs });
      }

      case 'whoami': {
        const { userId } = rest;
        if (!userId) return error(ws, 'userId required');
        const u = users.get(userId);
        if (!u) return error(ws, 'unknown userId');
        return send(ws, { ok: true, userId, username: u.username });
      }

      case 'lookup': {
        const { username } = rest;
        if (!username) return error(ws, 'username required');
        const id = usernameMap.get(username);
        if (!id) return error(ws, 'user not found');
        const u = users.get(id);
        return send(ws, { ok: true, userId: id, username: u.username, identityKey: u.identityKey });
      }

      default:
        return error(ws, `unknown type: ${type}`);
    }
  } catch (e) {
    console.error('[ERR]', e.message);
    error(ws, `parse error: ${e.message}`);
  }
}

const wss = new WebSocketServer({ port: PORT });
console.log(`FIBEMATE Registration Backend (IANA #4590) — ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws) => {
  console.log('[WS] client connected');
  ws.on('message', (data) => handle(ws, data));
  ws.on('close', () => console.log('[WS] client disconnected'));
  ws.on('error', (e) => console.error('[WS] error:', e.message));
});

// Health check via HTTP
require('http').createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      users: users.size,
      totalOpks: [...opks.values()].reduce((s, v) => s + v.size, 0),
      uptime: process.uptime(),
      iana4590: true
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT + 1, () => console.log(`Health check: http://0.0.0.0:${PORT + 1}/health`));

process.on('SIGINT', () => { console.log('\nShutting down'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
