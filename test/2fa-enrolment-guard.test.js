#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * 2FA enrolment guard.
 *
 * v3.3.14 shipped an Enable 2FA button that works, and a login flow that
 * cannot support it: /api/auth/2fa/verify-login issues tokens with
 * deviceId:'' , so every account that enables 2FA silently loses read
 * receipts (its id never reaches readBy, isRead never flips). The guard
 * refuses enrolment so a stranger cannot walk into that state.
 *
 * This suite proves the HTTP behaviour, not a mock of it:
 *   1. enable -> 403 E_2FA_DEVICE_IDENTITY_PENDING, and no secret leaks
 *   2. the refusal wrote nothing: the user row still has no twoFASecret
 *   3. confirm-enable -> 403 as well, so a pending secret cannot be forced
 *   4. status still answers 200 (the guard is not a blanket 2FA outage)
 *   5. disable still answers 400 "not enabled" (same: scoped, not blanket)
 *
 * Run: node --test test/2fa-enrolment-guard.test.js
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

let base = '';
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

const PASSWORD = 'correct horse battery';

function userRow(userId) {
  const db = new Database(path.join(dataDir, 'fibemate.db'), { readonly: true });
  try {
    const r = db.prepare('SELECT raw_json FROM users WHERE id = ?').get(userId);
    return r ? JSON.parse(r.raw_json) : null;
  } finally {
    db.close();
  }
}

let account = null;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-2fa-guard-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  process.env.PORT = String(port);
  process.env.FIBEMATE_DATA_DIR = dataDir;
  process.env.FIBEMATE_EXPERIMENTAL = '0';
  process.env.JWT_SECRET = '2fa-enrolment-guard-secret-0123456789abcdef0123456789';
  process.env.NODE_ENV = 'test';
  require('../src/index.js');
  const up = await waitForServer(`${base}/health`);
  if (!up) throw new Error('server did not become ready');

  const username = 'twfa_guard_' + Date.now().toString(36);
  const reg = await call('POST', '/api/auth/register', {
    body: { username, password: PASSWORD, publicKey: `pk-${username}` },
  });
  assert.equal(reg.status, 201, reg.text);
  account = { username, userId: reg.json.userId, token: reg.json.token };
});

after(() => {
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* WAL handle */ }
  setTimeout(() => process.exit(0), 300);
});

test('enable is refused with 403 and the reason names device identity', async () => {
  const res = await call('POST', '/api/auth/2fa/enable', { token: account.token, body: {} });
  assert.equal(res.status, 403, res.text);
  assert.equal(res.json.code, 'E_2FA_DEVICE_IDENTITY_PENDING');
  assert.match(res.json.error, /device identity/i);
  assert.equal(res.json.secret, undefined, 'no TOTP secret may leak through the refusal');
  assert.equal(res.json.uri, undefined, 'no otpauth URI may leak through the refusal');
});

test('the refusal wrote nothing: no secret, still not enabled', () => {
  const row = userRow(account.userId);
  assert.ok(row, 'user row must exist');
  assert.equal(row.twoFASecret, undefined, 'guard runs before generateSecret is stored');
  assert.ok(!row.twoFAEnabled, 'enrolment must not flip the flag');
});

test('confirm-enable is refused too, so a pending secret cannot be forced', async () => {
  const res = await call('POST', '/api/auth/2fa/confirm-enable', {
    token: account.token,
    body: { code: '123456' },
  });
  assert.equal(res.status, 403, res.text);
  assert.equal(res.json.code, 'E_2FA_DEVICE_IDENTITY_PENDING');
});

test('status still answers 200: the guard is not a blanket 2FA outage', async () => {
  const res = await call('GET', '/api/auth/2fa/status', { token: account.token });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.enabled, false);
});

test('disable still answers its own 400: the guard is scoped to enrolment', async () => {
  const res = await call('POST', '/api/auth/2fa/disable', {
    token: account.token,
    body: { code: '123456' },
  });
  assert.equal(res.status, 400, res.text);
  assert.match(res.json.error, /2FA/);
});
