#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * Login-level device identity proof.
 *
 * The unit suite proves the DB methods; this suite proves the HTTP handler:
 *   1. a client-supplied UUID is registered on first login (no publicKey needed)
 *   2. the same id from another account is rejected with E_DEVICE_OWNED
 *   3. a malformed id is rejected with E_DEVICE_ID
 *   4. an absent id keeps the old behaviour (deviceId '')
 *   5. a device silent for 30+ days is deactivated on the next login
 *
 * Run: node --test test/device-login.test.js
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

let base = '';
let port = 0;
let dataDir = '';

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

const PASSWORD = 'correct horse battery';

async function register(prefix) {
  const username = uniqueName(prefix);
  const res = await api('POST', '/api/auth/register', {
    username, password: PASSWORD, publicKey: `pk-${username}`,
  });
  assert.equal(res.status, 201, res.text);
  return { username, userId: res.json.userId, deviceId: res.json.deviceId, token: res.json.token };
}

function deviceRow(deviceId) {
  const db = new Database(path.join(dataDir, 'fibemate.db'), { readonly: true });
  try {
    const r = db.prepare('SELECT raw_json FROM devices WHERE id = ?').get(deviceId);
    return r ? JSON.parse(r.raw_json) : null;
  } finally {
    db.close();
  }
}

function ageDevice(deviceId, lastActive) {
  const db = new Database(path.join(dataDir, 'fibemate.db'), { timeout: 5000 });
  try {
    const r = db.prepare('SELECT raw_json FROM devices WHERE id = ?').get(deviceId);
    assert.ok(r, 'device must exist before ageing it');
    const d = JSON.parse(r.raw_json);
    d.lastActive = lastActive;
    db.prepare('UPDATE devices SET raw_json = ? WHERE id = ?').run(JSON.stringify(d), deviceId);
  } finally {
    db.close();
  }
}

const DEV_NEW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEV_OWN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DEV_STALE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEV_FMT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-device-login-'));
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  process.env.PORT = String(port);
  process.env.FIBEMATE_DATA_DIR = dataDir;
  process.env.FIBEMATE_EXPERIMENTAL = '0';
  process.env.JWT_SECRET = 'device-login-test-secret-0123456789abcdef0123456789abcdef';
  process.env.NODE_ENV = 'test';
  require('../src/index.js');
  const up = await waitForServer(`${base}/health`);
  if (!up) throw new Error('server did not become ready');
});

after(() => {
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* WAL handle */ }
  setTimeout(() => process.exit(0), 300);
});

test('client deviceId is registered on login without a publicKey', async () => {
  const a = await register('devlogin_a');
  const res = await api('POST', '/api/auth/login', {
    username: a.username, password: PASSWORD, deviceId: DEV_NEW,
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.deviceId, DEV_NEW);
  const row = deviceRow(DEV_NEW);
  assert.ok(row, 'device row must exist after login');
  assert.equal(row.userId, a.userId);
  assert.equal(row.isActive, true);
  assert.equal(row.publicKey, null, 'no publicKey supplied: field stays null, row still exists');
});

test('uppercase deviceId is normalised to lowercase', async () => {
  const a = await register('devlogin_up');
  const res = await api('POST', '/api/auth/login', {
    username: a.username, password: PASSWORD, deviceId: DEV_FMT.toUpperCase(),
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.deviceId, DEV_FMT);
  assert.equal(deviceRow(DEV_FMT.toUpperCase()), null);
  assert.equal(deviceRow(DEV_FMT).userId, a.userId);
});

test('another account cannot claim the same deviceId', async () => {
  const a = await register('devlogin_owner');
  const b = await register('devlogin_thief');
  const first = await api('POST', '/api/auth/login', {
    username: a.username, password: PASSWORD, deviceId: DEV_OWN,
  });
  assert.equal(first.status, 200, first.text);

  const stolen = await api('POST', '/api/auth/login', {
    username: b.username, password: PASSWORD, deviceId: DEV_OWN,
  });
  assert.equal(stolen.status, 400, stolen.text);
  assert.equal(stolen.json.code, 'E_DEVICE_OWNED');
  assert.equal(deviceRow(DEV_OWN).userId, a.userId);
});

test('malformed deviceId is rejected', async () => {
  const a = await register('devlogin_bad');
  const res = await api('POST', '/api/auth/login', {
    username: a.username, password: PASSWORD, deviceId: 'not-a-uuid',
  });
  assert.equal(res.status, 400, res.text);
  assert.equal(res.json.code, 'E_DEVICE_ID');
});

test('absent deviceId keeps the old behaviour', async () => {
  const a = await register('devlogin_none');
  const res = await api('POST', '/api/auth/login', {
    username: a.username, password: PASSWORD,
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.deviceId, '');
});

test('a device silent for 30+ days is deactivated on next login', async () => {
  const a = await register('devlogin_stale');
  const old = Date.now() - (31 * 24 * 60 * 60 * 1000);
  ageDevice(a.deviceId, old);
  assert.equal(deviceRow(a.deviceId).isActive, true, 'precondition: still active before login');

  const res = await api('POST', '/api/auth/login', {
    username: a.username, password: PASSWORD, deviceId: DEV_STALE,
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(deviceRow(a.deviceId).isActive, false, 'stale device must not block isRead');
  assert.equal(deviceRow(DEV_STALE).isActive, true);
});
