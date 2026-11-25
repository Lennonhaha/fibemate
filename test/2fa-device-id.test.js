#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * 2FA login carries device identity (#707).
 *
 * The first factor registers a device, but before this change the second
 * factor signed its own tokens with deviceId:'' — so every account that
 * enabled 2FA silently lost device-scoped read receipts: its id never reached
 * readBy and isRead never flipped. Enrolment was temporarily refused while
 * that hole was open; this suite is the exit condition of that hold.
 *
 * Proven here, against a real HTTP server and a real SQLite file:
 *   1. enrolment works again (enable / confirm-enable / status)
 *   2. a 2FA login returns the device id in the body and inside both tokens
 *   3. a device owned by another account is rejected (E_DEVICE_OWNED)
 *   4. a malformed device id is rejected (E_DEVICE_ID)
 *   5. end to end: a 2FA token acks a message, and readBy on disk holds the
 *      real device id
 *
 * Run: node --test test/2fa-device-id.test.js
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const { hotp } = require('../src/lib/totp');
const { WsPadding } = require('../src/crypto/ws-padding');

const PASSWORD = 'correct horse battery';
let base = '';
let port = 0;
let dataDir = '';
const sockets = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function call(method, route, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  return { status: res.status, json, text };
}

let seq = 0;
async function register(prefix) {
  seq += 1;
  const username = `${prefix}_${Date.now().toString(36)}_${seq}`;
  const res = await call('POST', '/api/auth/register', {
    body: { username, password: PASSWORD, publicKey: `pk-${username}` },
  });
  assert.equal(res.status, 201, res.text);
  return { username, userId: res.json.userId, deviceId: res.json.deviceId, token: res.json.token };
}

function tokenPayload(token) {
  const part = token.split('.')[1];
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function totpCode(secret) {
  return hotp(secret, Math.floor(Date.now() / 1000 / 30), 6);
}

function dbRow(messageId) {
  const db = new Database(path.join(dataDir, 'fibemate.db'), { readonly: true });
  try {
    const r = db.prepare('SELECT raw_json FROM messages WHERE id = ?').get(messageId);
    return r ? JSON.parse(r.raw_json) : null;
  } finally {
    db.close();
  }
}

/** Connect, auth, and collect every decoded server frame into an inbox. */
function openWs(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`);
    ws.binaryType = 'arraybuffer';
    const inbox = [];
    const waiters = [];

    function deliver(obj) {
      for (let i = 0; i < waiters.length; i += 1) {
        if (waiters[i].pred(obj)) {
          const w = waiters.splice(i, 1)[0];
          clearTimeout(w.timer);
          w.resolve(obj);
          return;
        }
      }
      inbox.push(obj);
    }

    ws.on('message', (data) => {
      let obj;
      try {
        const u = WsPadding.unpad(new Uint8Array(data));
        if (u.isCover || u.malformed) return;
        obj = JSON.parse(new TextDecoder().decode(u.payload));
      } catch (_) { return; }
      deliver(obj);
    });

    const handle = {
      ws,
      send: (obj) => ws.send(JSON.stringify(obj)),
      next(pred, timeoutMs = 5000) {
        const hit = inbox.findIndex(pred);
        if (hit >= 0) return Promise.resolve(inbox.splice(hit, 1)[0]);
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            const i = waiters.findIndex((w) => w.resolve === res);
            if (i >= 0) waiters.splice(i, 1);
            rej(new Error('timeout waiting for ws frame; inbox=' + JSON.stringify(inbox.map((m) => m.type))));
          }, timeoutMs);
          waiters.push({ pred, resolve: res, timer });
        });
      },
      close: () => { try { ws.close(); } catch (_) {} },
    };

    ws.on('open', async () => {
      try {
        handle.send({ type: 'auth', token });
        await handle.next((m) => m.type === 'auth_ok' || m.type === 'auth_failed');
        resolve(handle);
      } catch (e) { reject(e); }
    });
    ws.on('error', reject);
    sockets.push(handle);
  });
}

/** Enrol 2FA on an account and return the secret, so tests can compute codes. */
async function enrol(account) {
  const enable = await call('POST', '/api/auth/2fa/enable', { token: account.token, body: {} });
  assert.equal(enable.status, 200, enable.text);
  assert.ok(enable.json.secret, 'enable must return a secret');
  assert.match(enable.json.uri, /^otpauth:\/\/totp\//);

  const confirm = await call('POST', '/api/auth/2fa/confirm-enable', {
    token: account.token,
    body: { code: totpCode(enable.json.secret) },
  });
  assert.equal(confirm.status, 200, confirm.text);

  const status = await call('GET', '/api/auth/2fa/status', { token: account.token });
  assert.equal(status.status, 200, status.text);
  assert.equal(status.json.enabled, true);

  return enable.json.secret;
}

/** First factor + second factor, returning the tokens and deviceId. */
async function login2fa(account, secret, deviceId) {
  const first = await call('POST', '/api/auth/login', {
    body: { username: account.username, password: PASSWORD, deviceId },
  });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.json.twoFARequired, true, first.text);

  const second = await call('POST', '/api/auth/2fa/verify-login', {
    body: { ticket: first.json.ticket, code: totpCode(secret) },
  });
  return second;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-2fa-device-'));
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  process.env.PORT = String(port);
  process.env.FIBEMATE_DATA_DIR = dataDir;
  process.env.FIBEMATE_EXPERIMENTAL = '0';
  process.env.JWT_SECRET = '2fa-device-id-secret-0123456789abcdef0123456789';
  process.env.NODE_ENV = 'test';
  require('../src/index.js');
  const up = await waitForServer(`${base}/health`);
  if (!up) throw new Error('server did not become ready');
});

after(() => {
  for (const s of sockets) s.close();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* WAL handle */ }
  setTimeout(() => process.exit(0), 300);
});

test('enrolment is available again', async () => {
  const account = await register('tfa_enrol');
  await enrol(account);
});

test('a 2FA login returns the device on the response and in both tokens', async () => {
  const account = await register('tfa_claim');
  const secret = await enrol(account);

  const res = await login2fa(account, secret, account.deviceId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.deviceId, account.deviceId, 'response must name the device');

  const access = tokenPayload(res.json.token);
  assert.equal(access.deviceId, account.deviceId, 'access token must carry the device id');
  assert.equal(access.userId, account.userId);

  const refresh = tokenPayload(res.json.refreshToken);
  assert.equal(refresh.deviceId, account.deviceId, 'refresh token must carry the device id');
  assert.equal(refresh.type, 'refresh');
});

test('the second factor keeps the device registered by the first factor', async () => {
  const account = await register('tfa_ticket');
  const secret = await enrol(account);

  // No deviceId on the second call at all: the ticket must supply it.
  const first = await call('POST', '/api/auth/login', {
    body: { username: account.username, password: PASSWORD, deviceId: account.deviceId },
  });
  assert.equal(first.json.twoFARequired, true);
  const second = await call('POST', '/api/auth/2fa/verify-login', {
    body: { ticket: first.json.ticket, code: totpCode(secret) },
  });
  assert.equal(second.status, 200, second.text);
  assert.equal(second.json.deviceId, account.deviceId);
  assert.equal(tokenPayload(second.json.token).deviceId, account.deviceId);
});

test("another account's device is rejected at the second factor", async () => {
  const victim = await register('tfa_owned_a');
  const attacker = await register('tfa_owned_b');
  const secret = await enrol(attacker);

  const first = await call('POST', '/api/auth/login', {
    body: { username: attacker.username, password: PASSWORD, deviceId: attacker.deviceId },
  });
  const second = await call('POST', '/api/auth/2fa/verify-login', {
    body: { ticket: first.json.ticket, code: totpCode(secret), deviceId: victim.deviceId },
  });
  assert.equal(second.status, 400, second.text);
  assert.equal(second.json.code, 'E_DEVICE_OWNED');
});

test('a malformed device id is rejected at the second factor', async () => {
  const account = await register('tfa_bad_id');
  const secret = await enrol(account);

  const first = await call('POST', '/api/auth/login', {
    body: { username: account.username, password: PASSWORD, deviceId: account.deviceId },
  });
  const second = await call('POST', '/api/auth/2fa/verify-login', {
    body: { ticket: first.json.ticket, code: totpCode(secret), deviceId: 'not a uuid' },
  });
  assert.equal(second.status, 400, second.text);
  assert.equal(second.json.code, 'E_DEVICE_ID');
});

test('a 2FA token can acknowledge a message and readBy holds the device id', async () => {
  const reader = await register('tfa_ack_a');
  const sender = await register('tfa_ack_b');
  const secret = await enrol(reader);

  const login = await login2fa(reader, secret, reader.deviceId);
  assert.equal(login.status, 200, login.text);

  const wsSender = await openWs(sender.token);
  const messageId = 'tfa-ack-' + Date.now().toString(36);
  wsSender.send({ type: 'message', to: reader.userId, ciphertext: 'ct-2fa', messageId });
  await wsSender.next((m) => m.type === 'message_sent' && m.messageId === messageId);

  const wsReader = await openWs(login.json.token);
  const batch = await wsReader.next((m) => m.type === 'offline_messages');
  assert.ok(
    batch.messages.some((m) => m.id === messageId),
    'the 2FA session must be able to receive the message'
  );

  wsReader.send({ type: 'read_receipt', messageId });

  const receipt = await wsSender.next((m) => m.type === 'read_receipt' && m.messageId === messageId);
  assert.deepEqual(receipt.readBy, [reader.deviceId], 'readBy must name the 2FA device');

  const row = dbRow(messageId);
  assert.deepEqual(row.readBy, [reader.deviceId], 'the ack must be on disk');
  assert.equal(row.isRead, true, 'single active device, so the message is fully read');
  assert.ok(row.readAt, 'readAt must be stamped');
});
