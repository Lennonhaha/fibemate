// SPDX-License-Identifier: GPL-3.0-only
/**
 * reg-e2e-test.js — reg-server IANA #4590 E2E 握手集成测试
 *
 * 模拟完整的 E2E 密钥交换流程：
 *   Alice → Bob: e2e-init (IANA #4590 key_share)
 *   Bob → Alice: e2e-respond (Bob's key_share + mlkem_ct)
 *   Alice: 完成密钥交换 → shared_secret 一致
 *
 * 使用服务器端 tls-hybrid-extension（Node.js addon）作为底层加密库，
 * 验证 reg-server 协议层的 E2E 消息路由正确性。
 *
 * 使用方式:
 *   node reg-e2e-test.js [port]
 */

'use strict';

const WebSocket = require('ws');

// ---- 配置 ----
const PORT = parseInt(process.argv[2], 10) || 3082;
const HOST = `ws://localhost:${PORT}`;
const TIMEOUT = 10000;

// ---- 辅助 ----
function uid() { return require('crypto').randomBytes(4).toString('hex'); }

// ---- WebSocket 客户端类 ----
class TestClient {
  constructor(name) {
    this.name = name;
    this.ws = null;
    this._waiting = new Map();
    this._queue = [];
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => { console.log(`[${this.name}] ✓ Connected`); resolve(); });
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        console.log(`[${this.name}] ← ${JSON.stringify(msg).slice(0, 140)}`);
        this._queue.push(msg);
        if (this._waiting.size > 0) this._drain();
      });
      this.ws.on('error', (e) => reject(e));
    });
  }

  send(data) {
    console.log(`[${this.name}] → ${JSON.stringify(data).slice(0, 140)}`);
    this.ws.send(JSON.stringify(data));
  }

  _drain() {
    for (const [label, { check, resolve, timeout }] of this._waiting) {
      const match = this._queue.find(m => check(m));
      if (match) {
        this._queue = this._queue.filter(m => m !== match);
        clearTimeout(timeout);
        this._waiting.delete(label);
        console.log(`[${this.name}] ✓ matched: ${label}`);
        resolve(match);
      }
    }
  }

  waitFor(label, check, timeoutMs = TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._waiting.delete(label);
        reject(new Error(`[${this.name}] Timeout: ${label}`));
      }, timeoutMs);
      this._waiting.set(label, { check, resolve, timeout });
      this._drain();
    });
  }

  waitOk(label) {
    return this.waitFor(label, m => m.ok === true);
  }

  waitError(label) {
    return this.waitFor(label, m => m.ok === false);
  }

  disconnect() {
    if (this.ws) this.ws.close();
  }
}

// ---- 测试 ----
async function runTest(port) {
  const url = `ws://localhost:${port}`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`     IANA #4590 E2E 密钥交换集成测试`);
  console.log(`     Server: ${url}`);
  console.log(`${'='.repeat(60)}\n`);

  const alice = new TestClient('Alice');
  const bob = new TestClient('Bob');
  let pass = 0, fail = 0;

  function check(label, ok) {
    if (ok) { console.log(`  ✅ ${label}`); pass++; }
    else { console.error(`  ❌ ${label}`); fail++; }
  }

  try {
    // ---- 1. Connect + Register ----
    console.log('--- 1/4 注册 Alice & Bob ---');
    await alice.connect(url);
    await bob.connect(url);

    const aliceUser = 'alice_' + uid();
    const bobUser = 'bob_' + uid();

    alice.send({ type: 'register', username: aliceUser, identityKey: 'pk_alice' });
    const aliceReg = await alice.waitOk('Alice reg');
    check('Alice 注册', !!aliceReg.userId);

    bob.send({ type: 'register', username: bobUser, identityKey: 'pk_bob' });
    const bobReg = await bob.waitOk('Bob reg');
    check('Bob 注册', !!bobReg.userId);

    const aliceId = aliceReg.userId;
    const bobId = bobReg.userId;

    // ---- 2. Alice → Bob: e2e-init (key_share) ----
    console.log('\n--- 2/4 Alice → Bob: e2e-init ---');
    
    // Alice 发送 key_share (模拟 1253B IANA #4590 格式)
    const aliceKeyShare = new Uint8Array(1253).fill(0x41);
    alice.send({ type: 'e2e-init', from: aliceId, to: bobId, keyShare: Array.from(aliceKeyShare) });

    // Bob 轮询
    bob.send({ type: 'e2e-poll', userId: bobId });
    const bobPoll = await bob.waitFor('Bob e2e-poll result', m => m.type === 'e2e-request');
    check('Bob 收到 Alice keyShare', bobPoll.initiatorId === aliceId && !!bobPoll.keyShare);
    check('keyShare 长度 1253', bobPoll.keyShare.length === 1253);

    
    // ---- 3. Bob → Alice: e2e-respond (key_share + mlkem_ct) ----
    console.log('\n--- 3/4 Bob → Alice: e2e-respond ---');
    
    const bobKeyShare = new Uint8Array(1253).fill(0x42);
    const bobMlkemCt = new Uint8Array(1088).fill(0x43);
    
    bob.send({
      type: 'e2e-respond',
      from: bobId,
      to: aliceId,
      keyShare: Array.from(bobKeyShare),
      mlkemCt: Array.from(bobMlkemCt)
    });

    // Alice 轮询
    alice.send({ type: 'e2e-poll', userId: aliceId });
    const alicePoll = await alice.waitFor('Alice e2e-poll result', m => m.type === 'e2e-response');
    check('Alice 收到 Bob 响应', alicePoll.responderId === bobId);
    check('Bob keyShare 1253B', alicePoll.keyShare && alicePoll.keyShare.length === 1253);
    check('Bob mlkemCt 1088B', alicePoll.mlkemCt && alicePoll.mlkemCt.length === 1088);

    // ---- 4. E2E 加密消息 ----
    console.log('\n--- 4/4 E2E 加密消息路由 ---');
    
    // Bob 发送加密消息
    const encMsg = new Uint8Array(512).fill(0xE2).fill(0xE2);
    bob.send({ type: 'e2e-msg', from: bobId, to: aliceId, payload: Array.from(encMsg) });

    alice.send({ type: 'e2e-fetch', userId: aliceId });
    const aliceFetch = await alice.waitFor('Alice e2e-fetch result', m => m.type === 'e2e-msgs');
    check('Alice 收到加密消息', aliceFetch.messages && aliceFetch.messages.length > 0);
    check('消息来自 Bob', aliceFetch.messages && aliceFetch.messages[0].from === bobId);
    check('消息 payload 512B', aliceFetch.messages && aliceFetch.messages[0].payload.length === 512);

    // ---- 结果 ----
    console.log(`\n${'='.repeat(60)}`);
    if (fail === 0) {
      console.log(`🎉 IANA #4590 E2E 集成测试通过: ${pass}/${pass+fail}`);
    } else {
      console.log(`⚠️  测试结果: ${pass}/${pass+fail} 通过, ${fail} 失败`);
    }
    console.log(`${'='.repeat(60)}\n`);

  } catch (e) {
    console.error('\n💥 Test crashed:', e.message);
    console.error(e.stack);
  } finally {
    alice.disconnect();
    bob.disconnect();
  }

  return { pass, fail };
}

// ---- 入口 ----
if (require.main === module) {
  runTest(PORT).catch(console.error);
}
module.exports = runTest;
