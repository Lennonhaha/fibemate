#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * test/ws-read-receipt.test.js — end-to-end proof for the read_receipt path.
 *
 * The unit suite (test/db-readby.test.js) proves markMessageReadByDevice writes.
 * This suite proves the WebSocket handler actually calls it: a real server is
 * booted against a throwaway FIBEMATE_DATA_DIR, two accounts talk over real
 * sockets, and the result is read back from the SQLite file (not from any
 * in-process cache).
 *
 * What it pins:
 *   1. { type:'read_receipt', messageId }      — current client contract
 *   2. { type:'read_receipt', messageIds:[…] } — legacy client contract
 *   3. junk ids are ignored instead of killing the socket
 *   4. after an ack, the message no longer shows up in offline replay
 *
 * Run: node --test test/ws-read-receipt.test.js
 */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const { WsPadding } = require('../src/crypto/ws-padding');

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

async function api(method, route, body = null) {
  const hasBody = body !== null;
  const res = await fetch(base + route, {
    method,
    headers: hasBody ? { 'content-type': 'application/json' } : {},
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  return { status: res.status, json, text };
}

let seq = 0;
function uniqueName(prefix) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function register(prefix) {
  const username = uniqueName(prefix);
  const res = await api('POST', '/api/auth/register', {
    username, password: 'correct horse battery', publicKey: `pk-${username}`,
  });
  assert.equal(res.status, 201, res.text);
  return { username, userId: res.json.userId, deviceId: res.json.deviceId, token: res.json.token };
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
      /** Wait for a frame matching pred; also scans the backlog. */
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

function dbRow(messageId) {
  const db = new Database(path.join(dataDir, 'fibemate.db'), { readonly: true });
  try {
    const r = db.prepare('SELECT raw_json FROM messages WHERE id = ?').get(messageId);
    return r ? JSON.parse(r.raw_json) : null;
  } finally {
    db.close();
  }
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-ws-ack-'));
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  process.env.PORT = String(port);
  process.env.FIBEMATE_DATA_DIR = dataDir;
  process.env.FIBEMATE_EXPERIMENTAL = '0';
  process.env.JWT_SECRET = 'integration-test-secret-0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  require('../src/index.js');
  const up = await waitForServer(`${base}/health`);
  if (!up) throw new Error('server did not become ready');
});

after(() => {
  for (const s of sockets) s.close();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* WAL handle still open */ }
  setTimeout(() => process.exit(0), 300);
});

test('read_receipt {messageId} persists and stops offline replay', async () => {
  const a = await register('wsack_a');
  const b = await register('wsack_b');

  const wa = await openWs(a.token);
  const messageId = 'e2e-ack-' + Date.now().toString(36);
  wa.send({ type: 'message', to: b.userId, ciphertext: 'ct-e2e', messageId });
  const sent = await wa.next((m) => m.type === 'message_sent' && m.messageId === messageId);
  assert.equal(sent.messageId, messageId);

  // B connects for the first time: the message must be in the offline batch.
  const wb = await openWs(b.token);
  const batch = await wb.next((m) => m.type === 'offline_messages');
  assert.ok(
    batch.messages.some((m) => m.id === messageId),
    'precondition: unacked message must be replayed to the recipient'
  );

  wb.send({ type: 'read_receipt', messageId });

  const receipt = await wa.next((m) => m.type === 'read_receipt' && m.messageId === messageId);
  assert.deepEqual(receipt.messageIds, [messageId], 'legacy clients read .messageIds');
  assert.ok(Array.isArray(receipt.readBy), 'readBy must be the persisted array, not a userId string');
  assert.deepEqual(receipt.readBy, [b.deviceId]);

  const row = dbRow(messageId);
  assert.deepEqual(row.readBy, [b.deviceId], 'the ack must be on disk, keyed by device id');
  assert.equal(row.isRead, true, 'recipient has a single active device, so it is fully read');

  // A second connection from the same device must not replay it again.
  const wb2 = await openWs(b.token);
  await new Promise((r) => setTimeout(r, 400));
  let replay = null;
  try {
    replay = await wb2.next((m) => m.type === 'offline_messages', 400);
  } catch (_) { replay = null; }
  assert.ok(
    !replay || !replay.messages.some((m) => m.id === messageId),
    'acked message must not be replayed again'
  );
});

test('legacy {messageIds:[…]} payload still persists every id', async () => {
  const a = await register('wsack_c');
  const b = await register('wsack_d');

  const wa = await openWs(a.token);
  const ids = ['e2e-legacy-1', 'e2e-legacy-2'].map((p) => p + '-' + Date.now().toString(36));
  for (const id of ids) {
    wa.send({ type: 'message', to: b.userId, ciphertext: 'ct-legacy', messageId: id });
    await wa.next((m) => m.type === 'message_sent' && m.messageId === id);
  }

  const wb = await openWs(b.token);
  await wb.next((m) => m.type === 'offline_messages');
  wb.send({ type: 'read_receipt', messageIds: ids });

  for (const id of ids) {
    const receipt = await wa.next((m) => m.type === 'read_receipt' && m.messageId === id);
    assert.deepEqual(receipt.messageIds, [id]);
    assert.deepEqual(dbRow(id).readBy, [b.deviceId]);
  }
});

test('junk ids are ignored and the socket stays usable', async () => {
  const a = await register('wsack_e');
  const b = await register('wsack_f');

  const wa = await openWs(a.token);
  const messageId = 'e2e-junk-' + Date.now().toString(36);
  wa.send({ type: 'message', to: b.userId, ciphertext: 'ct-junk', messageId });
  await wa.next((m) => m.type === 'message_sent' && m.messageId === messageId);

  const wb = await openWs(b.token);
  await wb.next((m) => m.type === 'offline_messages');
  // Mixed payload: junk first, then the real id. Old code would have thrown on
  // a non-string bind and dropped the whole frame.
  wb.send({ type: 'read_receipt', messageIds: [null, 42, { id: 'x' }, messageId] });

  const receipt = await wa.next((m) => m.type === 'read_receipt' && m.messageId === messageId);
  assert.deepEqual(receipt.messageIds, [messageId]);

  wb.send({ type: 'ping' });
  const pong = await wb.next((m) => m.type === 'pong');
  assert.ok(pong, 'socket must survive junk ids');
});
