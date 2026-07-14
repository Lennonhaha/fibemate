/**
 * FIBEMATE Minimal Registration Backend
 * Node.js + ws (WebSocket) + in-memory storage
 * 
 * Protocol (JSON over WebSocket):
 *   { type: "register",     username: string, identityKey: string }  => { ok, userId }
 *   { type: "upload-opk",   userId: string, opks: [...string] }       => { ok, count }
 *   { type: "fetch-opk",    userId: string }                           => { ok, opk }
 *   { type: "send",         from: string, to: string, ciphertext: string } => { ok, msgId }
 *   { type: "poll",         userId: string }                           => { messages: [...] }
 *   { type: "whoami" }                                                  => { userId, username }
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

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function send(ws, data) {
  ws.send(JSON.stringify(data));
}

function error(ws, text) {
  send(ws, { ok: false, error: text });
}

function handle(ws, msg) {
  try {
    const { type, ...rest } = JSON.parse(msg.toString());
    
    switch (type) {
      case 'register': {
        const { username, identityKey } = rest;
        if (!username || !identityKey) return error(ws, 'username and identityKey required');
        if (usernameMap.has(username)) return error(ws, 'username taken');
        const id = uid();
        users.set(id, { username, identityKey });
        usernameMap.set(username, id);
        inbox.set(id, []);
        opks.set(id, new Set());
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
        const key = [...store][0];  // take first
        store.delete(key);          // consume it
        console.log(`[OPK] fetched for ${userId}, remaining: ${store.size}`);
        return send(ws, { ok: true, opk: key });
      }
      
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
        const msgs = inbox.get(userId).splice(0);  // drain inbox
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
        // Find user by username → return userId + identityKey (public key)
        const { username } = rest;
        if (!username) return error(ws, 'username required');
        const uid = usernameMap.get(username);
        if (!uid) return error(ws, 'user not found');
        const u = users.get(uid);
        return send(ws, { ok: true, userId: uid, username: u.username, identityKey: u.identityKey });
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
console.log(`FIBEMATE Registration Backend — ws://0.0.0.0:${PORT}`);

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
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT + 1, () => console.log(`Health check: http://0.0.0.0:${PORT + 1}/health`));

// Graceful shutdown
process.on('SIGINT', () => { console.log('\nShutting down'); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
