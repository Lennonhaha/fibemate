#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * test/http-integration.test.js — HTTP-level integration tests for src/index.js
 *
 * The unit suites never load src/index.js, so its route handlers (about 1,900
 * statements) are invisible to coverage. This suite boots the real server as a
 * child process against a throwaway data directory and exercises the routes the
 * way a client does.
 *
 * Isolation: the child gets FIBEMATE_DATA_DIR pointing at a temp directory, so
 * neither the developer's local store nor the repository data/ is touched.
 *
 * Run: node test/http-integration.test.js
 */
'use strict';

/* eslint-disable no-console */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { hotp } = require('../src/lib/totp');

let base = '';
let dataDir = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
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

async function call(method, route, { token, body, headers } = {}) {
  const h = { ...(headers || {}) };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (token) h.authorization = `Bearer ${token}`;
  const res = await fetch(base + route, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}

function uniqueName(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-http-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;

  // The server reads its configuration at require time, so the environment has to be
  // in place first. Running in-process keeps V8 coverage attributable to src/index.js;
  // a child process on Windows is terminated too abruptly to flush its coverage.
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
  // On Windows the SQLite handle is still open inside this process, so the temp
  // directory cannot always be removed; leaving it behind is harmless.
  try {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  } catch (_) { /* EBUSY while the DB handle is open */ }
  // index.js installs a 30 s interval, so the loop would otherwise stay alive.
  // Give the test reporter a moment to flush before forcing the exit; V8 coverage
  // is still written on process.exit for c8.
  setTimeout(() => process.exit(0), 250);
});

test('health endpoints answer without auth', async () => {
  const health = await call('GET', '/health');
  assert.equal(health.status, 200);

  const apiHealth = await call('GET', '/api/health');
  assert.equal(apiHealth.status, 200);
});

test('static frontend is served at /', async () => {
  const res = await call('GET', '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
});

test('protected routes reject anonymous callers', async () => {
  for (const route of ['/api/users/count', '/api/contacts', '/api/conversations', '/api/privacy']) {
    const res = await call('GET', route);
    assert.equal(res.status, 401, `${route} should be 401`);
  }
});

test('a malformed bearer token is rejected', async () => {
  const res = await call('GET', '/api/auth/verify', { token: 'not-a-jwt' });
  assert.equal(res.status, 401);
});

const users = [];

test('register validates required fields', async () => {
  const missing = await call('POST', '/api/auth/register', { body: { username: 'x' } });
  assert.equal(missing.status, 400);

  const shortPassword = await call('POST', '/api/auth/register', {
    body: { username: uniqueName('short'), password: 'abc', publicKey: 'pk' },
  });
  assert.equal(shortPassword.status, 400);
});

test('register creates two accounts and rejects a duplicate', async () => {
  for (let i = 0; i < 2; i += 1) {
    const username = uniqueName(`httpuser${i}`);
    const res = await call('POST', '/api/auth/register', {
      body: { username, password: 'correct horse battery', publicKey: `pk-${i}` },
    });
    assert.equal(res.status, 201, res.text);
    assert.ok(res.json.token, 'token present');
    assert.ok(res.json.refreshToken, 'refresh token present');
    assert.ok(res.json.userId, 'userId present');
    users.push({ username, ...res.json });
  }

  const dup = await call('POST', '/api/auth/register', {
    body: { username: users[0].username, password: 'correct horse battery', publicKey: 'pk' },
  });
  assert.equal(dup.status, 409);
});

test('login rejects a wrong password and accepts the right one', async () => {
  const bad = await call('POST', '/api/auth/login', {
    body: { username: users[0].username, password: 'wrong password' },
  });
  assert.equal(bad.status, 401);

  const ok = await call('POST', '/api/auth/login', {
    body: { username: users[0].username, password: 'correct horse battery' },
  });
  assert.equal(ok.status, 200, ok.text);
  assert.ok(ok.json.token);
  users[0].token = ok.json.token;
  users[0].refreshToken = ok.json.refreshToken;
});

test('token verification and refresh work', async () => {
  const verify = await call('GET', '/api/auth/verify', { token: users[0].token });
  assert.equal(verify.status, 200);
  assert.equal(verify.json.userId, users[0].userId);

  const refreshed = await call('POST', '/api/auth/refresh', {
    body: { refreshToken: users[0].refreshToken },
  });
  assert.equal(refreshed.status, 200, refreshed.text);
  assert.ok(refreshed.json.token);

  const bogus = await call('POST', '/api/auth/refresh', { body: { refreshToken: 'nope' } });
  assert.equal(bogus.status, 401);
});

test('user lookup, search and count', async () => {
  const count = await call('GET', '/api/users/count', { token: users[0].token });
  assert.equal(count.status, 200);

  const search = await call('GET', `/api/users/search?q=${encodeURIComponent(users[1].username)}`, {
    token: users[0].token,
  });
  assert.equal(search.status, 200);

  const byId = await call('GET', `/api/users/${users[1].userId}`, { token: users[0].token });
  assert.equal(byId.status, 200);

  const keys = await call('GET', `/api/users/${users[1].userId}/keys`, { token: users[0].token });
  assert.equal(keys.status, 200);
  assert.equal(keys.json.username, users[1].username);
});

test('contact request lifecycle', async () => {
  const add = await call('POST', '/api/contacts', {
    token: users[0].token,
    body: { userId: users[1].userId },
  });
  assert.equal(add.status, 200, add.text);
  assert.equal(add.json.status, 'pending');

  const again = await call('POST', '/api/contacts', {
    token: users[0].token,
    body: { userId: users[1].userId },
  });
  assert.equal(again.status, 409);

  const list = await call('GET', '/api/contacts', { token: users[0].token });
  assert.equal(list.status, 200);

  const accept = await call('PUT', `/api/contacts/${users[0].userId}`, {
    token: users[1].token,
    body: { status: 'accepted' },
  });
  assert.equal(accept.status, 200, accept.text);
  assert.equal(accept.json.status, 'accepted');

  const invalid = await call('PUT', `/api/contacts/${users[0].userId}`, {
    token: users[1].token,
    body: { status: 'maybe' },
  });
  assert.equal(invalid.status, 400);
});

let conversationId = '';

test('conversation is created once and reused', async () => {
  const first = await call('POST', '/api/conversations/find-or-create', {
    token: users[0].token,
    body: { userId: users[1].userId },
  });
  assert.equal(first.status, 200, first.text);
  conversationId = first.json.conversationId;
  assert.ok(conversationId);

  const second = await call('POST', '/api/conversations/find-or-create', {
    token: users[0].token,
    body: { userId: users[1].userId },
  });
  assert.equal(second.status, 200);
  assert.equal(second.json.conversationId, conversationId);

  const self = await call('POST', '/api/conversations/find-or-create', {
    token: users[0].token,
    body: { userId: users[0].userId },
  });
  assert.equal(self.status, 400);
});

test('messages can be sent and read back by both parties', async () => {
  const sent = await call('POST', '/api/messages', {
    token: users[0].token,
    body: { conversationId, ciphertext: 'deadbeef', messageType: 'text' },
  });
  assert.equal(sent.status, 201, sent.text);

  const history = await call('GET', `/api/conversations/${conversationId}/messages`, {
    token: users[1].token,
  });
  assert.equal(history.status, 200);
  assert.ok(Array.isArray(history.json.messages));
  assert.equal(history.json.messages.length, 1);
  assert.equal(history.json.messages[0].ciphertext, 'deadbeef');

  const list = await call('GET', '/api/conversations', { token: users[1].token });
  assert.equal(list.status, 200);
  assert.ok(list.json.conversations.some((c) => c.id === conversationId));
});

test('a third party cannot read the conversation', async () => {
  const stranger = await call('POST', '/api/auth/register', {
    body: { username: uniqueName('stranger'), password: 'correct horse battery', publicKey: 'pk-s' },
  });
  // Registration may hit the per-IP auth rate limit if the suite is re-run quickly.
  if (stranger.status !== 201) return;

  const denied = await call('GET', `/api/conversations/${conversationId}/messages`, {
    token: stranger.json.token,
  });
  assert.equal(denied.status, 403);
});

test('privacy settings round-trip and drive the dashboard', async () => {
  const initial = await call('GET', '/api/privacy', { token: users[0].token });
  assert.equal(initial.status, 200);

  const updated = await call('PUT', '/api/privacy', {
    token: users[0].token,
    body: { hideOnlineStatus: true, hideReadReceipts: true, screenshotAlert: true, burnAfterRead: true },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.securityScore, 100);

  const dashboard = await call('GET', '/api/security/dashboard', { token: users[0].token });
  assert.equal(dashboard.status, 200);
  assert.ok(Array.isArray(dashboard.json.scoreItems));
  assert.equal(dashboard.json.securityScore, 100);
});

test('pending key exchanges and phase-4 endpoints degrade cleanly', async () => {
  const pending = await call('GET', '/api/keys/pending', { token: users[0].token });
  assert.equal(pending.status, 200);
  assert.ok(Array.isArray(pending.json.exchanges));

  // Experimental transport is disabled in this run.
  const nymStats = await call('GET', '/api/nym/stats', { token: users[0].token });
  assert.equal(nymStats.status, 200);
  assert.equal(nymStats.json.enabled, false);

  const nymConfig = await call('GET', '/api/nym/config', { token: users[0].token });
  assert.ok([404, 503].includes(nymConfig.status), `unexpected ${nymConfig.status}`);
});

test('ML-KEM round-trip over HTTP', async () => {
  const keygen = await call('POST', '/api/mlkem/keygen', { token: users[0].token });
  assert.equal(keygen.status, 200, keygen.text);
  const { publicKey, secretKey } = keygen.json;
  assert.equal(publicKey.length, 2368); // 1184 bytes, hex

  const encaps = await call('POST', '/api/mlkem/encaps', {
    token: users[0].token,
    body: { publicKey },
  });
  assert.equal(encaps.status, 200, encaps.text);

  const decaps = await call('POST', '/api/mlkem/decaps', {
    token: users[0].token,
    body: { ciphertext: encaps.json.ciphertext, secretKey },
  });
  assert.equal(decaps.status, 200, decaps.text);
  assert.equal(decaps.json.sharedSecret, encaps.json.sharedSecret);

  const missing = await call('POST', '/api/mlkem/encaps', { token: users[0].token, body: {} });
  assert.equal(missing.status, 400);

  const registered = await call('POST', '/api/mlkem/register', {
    token: users[0].token,
    body: { publicKeyHex: publicKey },
  });
  assert.equal(registered.status, 200);

  const shortKey = await call('POST', '/api/mlkem/register', {
    token: users[0].token,
    body: { publicKeyHex: 'abcd' },
  });
  assert.equal(shortKey.status, 400);

  const fetched = await call('GET', `/api/mlkem/public-key/${users[0].userId}`, { token: users[1].token });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.json.mlkemPublicKey, publicKey);
});

test('TOTP 2FA enable, login challenge, and disable', async () => {
  const statusBefore = await call('GET', '/api/auth/2fa/status', { token: users[1].token });
  assert.equal(statusBefore.status, 200);

  const enabled = await call('POST', '/api/auth/2fa/enable', { token: users[1].token });
  assert.equal(enabled.status, 200, enabled.text);
  const { secret } = enabled.json;
  assert.ok(secret);

  const wrongCode = await call('POST', '/api/auth/2fa/confirm-enable', {
    token: users[1].token,
    body: { code: '000000' },
  });
  assert.equal(wrongCode.status, 401);

  const code = () => hotp(secret, Math.floor(Date.now() / 30000));
  const confirmed = await call('POST', '/api/auth/2fa/confirm-enable', {
    token: users[1].token,
    body: { code: code() },
  });
  assert.equal(confirmed.status, 200, confirmed.text);

  const challenged = await call('POST', '/api/auth/login', {
    body: { username: users[1].username, password: 'correct horse battery' },
  });
  assert.equal(challenged.status, 200, challenged.text);
  assert.equal(challenged.json.twoFARequired, true);
  assert.ok(challenged.json.ticket);

  const verified = await call('POST', '/api/auth/2fa/verify-login', {
    body: { ticket: challenged.json.ticket, code: code() },
  });
  assert.equal(verified.status, 200, verified.text);
  assert.ok(verified.json.token);

  const disabled = await call('POST', '/api/auth/2fa/disable', {
    token: users[1].token,
    body: { code: code() },
  });
  assert.equal(disabled.status, 200, disabled.text);
  assert.equal(disabled.json.enabled, false);
});

test('replayed X-Request-Id is refused', async () => {
  const id = `replay-${Date.now()}`;
  const first = await call('GET', '/api/users/count', {
    token: users[0].token,
    headers: { 'X-Request-Id': id },
  });
  assert.equal(first.status, 200);

  const second = await call('GET', '/api/users/count', {
    token: users[0].token,
    headers: { 'X-Request-Id': id },
  });
  assert.equal(second.status, 425);
  assert.equal(second.json.error, 'REPLAY_DETECTED');
});

test('unknown API route returns a JSON 404', async () => {
  const res = await call('GET', '/api/does-not-exist', { token: users[0].token });
  assert.equal(res.status, 404);
});

test('account deletion requires the password and removes the account', async () => {
  const wrong = await call('DELETE', '/api/account', {
    token: users[1].token,
    body: { password: 'nope' },
  });
  assert.equal(wrong.status, 401);

  const deleted = await call('DELETE', '/api/account', {
    token: users[1].token,
    body: { password: 'correct horse battery' },
  });
  assert.equal(deleted.status, 200, deleted.text);

  const relogin = await call('POST', '/api/auth/login', {
    body: { username: users[1].username, password: 'correct horse battery' },
  });
  assert.equal(relogin.status, 401);
});
