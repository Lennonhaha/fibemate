/**
 * A2A Protocol Smoke Test — v1.0
 * Tests the 4-endpoint A2A protocol locally.
 *
 * SPDX-License-Identifier: GPL-3.0-only
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const { generateKeypair, decapsulate } = require('../packages/pqc-kem/src/ml-kem-768.js');

// Helper: Uint8Array → base64 (Node.js native Uint8Array doesn't support .toString('base64'))
function toB64(arr) { return Buffer.from(arr).toString('base64'); }

let server, baseUrl;

async function setup() {
  const app = express();
  const { router } = require('../api/a2a/a2a-core');
  app.use('/a2a', router);
  return new Promise(resolve => { server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); }); });
}
function teardown() { server?.close(); }

async function fetchJson(path, opts = {}) {
  const res = await fetch(baseUrl + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return res.json();
}

let ok = 0, fail = 0;

async function test(name, fn) {
  try { await fn(); ok++; console.log(`  ✅ ${name}`); } catch (e) { fail++; console.log(`  ❌ ${name}: ${e.message}`); }
}

(async () => {
  console.log('A2A Smoke Test\n');
  await setup();

  await test('GET /a2a/health → version + nodeId', async () => {
    const r = await fetchJson('/a2a/health');
    if (r.version !== '1.0') throw new Error(`version: ${r.version}`);
    if (!r.nodeId || r.nodeId.length !== 16) throw new Error(`nodeId: ${r.nodeId}`);
    if (typeof r.peers !== 'number') throw new Error('peers not number');
  });

  await test('POST /a2a/handshake with valid ML-KEM-768 pk', async () => {
    const kp = generateKeypair();
    const r = await fetchJson('/a2a/handshake', {
      method: 'POST',
      body: JSON.stringify({ publicKey: toB64(kp.publicKey) }),
    });
    if (!r.sessionId) throw new Error('no sessionId');
    if (!r.encapsCiphertext) throw new Error('no encapsCiphertext');
    if (!r.nodePublicKey) throw new Error('no nodePublicKey');
    if (r.version !== '1.0') throw new Error(`version: ${r.version}`);
  });

  await test('POST /a2a/handshake rejects invalid key', async () => {
    const r = await fetchJson('/a2a/handshake', {
      method: 'POST',
      body: JSON.stringify({ publicKey: 'deadbeef' }),
    });
    if (!r.error) throw new Error('expected error');
  });

  await test('POST /a2a/message roundtrip (echo "hello")', async () => {
    const kp = generateKeypair();

    // Handshake
    const hs = await fetchJson('/a2a/handshake', {
      method: 'POST',
      body: JSON.stringify({ publicKey: toB64(kp.publicKey) }),
    });
    if (!hs.sessionId) throw new Error('handshake failed');

    // Decapsulate server's ciphertext to get shared secret
    const ss = decapsulate(kp.secretKey, Buffer.from(hs.encapsCiphertext, 'base64'));
    const ssBuf = Buffer.from(ss);

    // Encrypt "hello" with AES-256-GCM using session key
    const key = crypto.createHash('sha256').update(Buffer.concat([ssBuf, Buffer.from('a2a-encrypt')])).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ctBody = Buffer.concat([cipher.update('hello'), cipher.final()]);
    const ct = Buffer.concat([iv, cipher.getAuthTag(), ctBody]).toString('base64');

    const r = await fetchJson('/a2a/message', {
      method: 'POST',
      body: JSON.stringify({ sessionId: hs.sessionId, ciphertext: ct, type: 'echo' }),
    });
    if (r.status !== 'ok') throw new Error(`status: ${r.status}`);
    if (r.response !== 'hello') throw new Error(`response: ${r.response}`);
  });

  await test('POST /a2a/message rejects unknown session', async () => {
    const r = await fetchJson('/a2a/message', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'nonexistent', ciphertext: 'xxx' }),
    });
    if (!r.error) throw new Error('expected error');
  });

  await test('GET /a2a/peers returns list', async () => {
    const r = await fetchJson('/a2a/peers');
    if (!Array.isArray(r.peers)) throw new Error('peers not array');
    if (typeof r.count !== 'number') throw new Error('count not number');
  });

  await test('GET /a2a/peers reflects handshake peer', async () => {
    const kp = generateKeypair();
    await fetchJson('/a2a/handshake', {
      method: 'POST',
      body: JSON.stringify({ publicKey: toB64(kp.publicKey), peerId: 'alice' }),
    });
    const r = await fetchJson('/a2a/peers');
    const alice = r.peers.find(p => p.peerId === 'alice');
    if (!alice) throw new Error('alice not found');
    if (!alice.active) throw new Error('alice not active');
  });

  teardown();
  console.log(`\n${ok}/7 PASS`);
  process.exit(fail > 0 ? 1 : 0);
})();
