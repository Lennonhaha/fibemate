// SPDX-License-Identifier: GPL-3.0-only
#!/usr/bin/env node
/**
 * test-tls-hybrid-extension.js — IANA #4590 TLS 混合扩展单元测试
 *
 * 测试覆盖：
 *   1. SM2 公钥序列化/反序列化 roundtrip
 *   2. ClientHello key_share 编码/解码
 *   3. ServerHello key_share 编码/解码
 *   4. 完整握手 roundtrip (key derivation match)
 *   5. 格式错误测试 (错误 group ID, 错误长度)
 *   6. 多实例共享秘密独立性
 */

'use strict';

const path = require('path');
const crypto = require('crypto');

// 加载待测模块（从 /opt/fibemate-full 根目录运行）
const HybridExt = require('./src/tls-hybrid-extension');
const SM2 = require('./sm2-bigint-ec.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertBufEqual(a, b, label) {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (!bufA.equals(bufB)) {
    const trunc = (b) => b.length > 48 ? b.subarray(0, 48).toString('hex') + '...' : b.toString('hex');
    throw new Error(`${label || 'buffer'} mismatch:\n  got:      ${trunc(bufA)}\n  expected: ${trunc(bufB)}`);
  }
}

// ================================================================
// Test suite
// ================================================================

console.log('\n=== 1. SM2 序列化/反序列化 roundtrip ===');

test('SM2 生成密钥对并序列化为 65 字节', () => {
  const kp = SM2.generateKeyPair();
  const buf = HybridExt.sm2PublicKeyToBuffer(kp.publicKey);
  assert(buf.length === 65, `expected 65B, got ${buf.length}B`);
  assert(buf[0] === 0x04, 'expected 0x04 prefix');
  // x and y should be 32 bytes each
  assert(buf.subarray(1, 33).length === 32, 'x coord 32B');
  assert(buf.subarray(33, 65).length === 32, 'y coord 32B');
});

test('SM2 65 字节 ↔ 点对象 roundtrip', () => {
  const kp1 = SM2.generateKeyPair();
  const buf = HybridExt.sm2PublicKeyToBuffer(kp1.publicKey);
  const pt2 = HybridExt.bufferToSm2Point(buf);
  assert(pt2.x === kp1.publicKey.x, 'x match');
  assert(pt2.y === kp1.publicKey.y, 'y match');
});

test('SM2 ECDH 求值 (32 字节输出)', () => {
  const alice = SM2.generateKeyPair();
  const bob = SM2.generateKeyPair();
  const aliceSS = HybridExt.sm2ECDH(alice.privateKey, bob.publicKey);
  const bobSS = HybridExt.sm2ECDH(bob.privateKey, alice.publicKey);
  assert(aliceSS.length === 32, `alice SS: 32B, got ${aliceSS.length}B`);
  assertBufEqual(aliceSS, bobSS, 'ECDH shared secret');
});

// ================================================================
console.log('\n=== 2. ClientHello key_share 编码/解码 ===');

test('ClientHello key_share 编码 (GROUP + LEN + SM2 + MLKEM)', () => {
  const result = HybridExt.clientKeyExchange();
  const raw = result.clientKeyShare;
  assert(raw.length === 2 + 2 + 65 + 1184,
    `expected 1253 bytes, got ${raw.length}`);
  assert(raw.readUInt16BE(0) === 4590, 'group ID = 4590');
  assert(raw.readUInt16BE(2) === 1249, 'data length = 1249');
});

test('ClientHello key_share 编解码 roundtrip', () => {
  // 手动构造已知数据
  const sm2Kp = SM2.generateKeyPair();
  const sm2Buf = HybridExt.sm2PublicKeyToBuffer(sm2Kp.publicKey);
  const mlkemBuf = Buffer.alloc(1184);
  // 验证 MLKEM 生成
  // We'll use the full clientKeyExchange for a real test
  const result = HybridExt.clientKeyExchange();
  const decoded = HybridExt.decodeClientKeyShare(result.clientKeyShare);
  assert(decoded.sm2Pk.length === 65, 'decoded SM2 pk = 65B');
  assert(decoded.mlkemPk.length === 1184, 'decoded MLKEM pk = 1184B');
  assertBufEqual(decoded.sm2Pk, result.secrets.sm2.pk, 'SM2 pk roundtrip');
  assertBufEqual(decoded.mlkemPk, result.secrets.mlkem.pk, 'MLKEM pk roundtrip');
});

// ================================================================
console.log('\n=== 3. ServerHello key_share 编码/解码 ===');

test('ServerHello key_share 编码 (SM2 65B + MLKEM CT 1088B)', () => {
  const sm2Kp = SM2.generateKeyPair();
  const sm2Buf = HybridExt.sm2PublicKeyToBuffer(sm2Kp.publicKey);
  const ctBuf = Buffer.alloc(1088); // placeholder ct
  const raw = HybridExt.encodeServerKeyShare(sm2Buf, ctBuf);
  assert(raw.length === 2 + 2 + 65 + 1088,
    `expected 1157 bytes, got ${raw.length}`);
  assert(raw.readUInt16BE(0) === 4590, 'group = 4590');
});

test('ServerHello key_share 解码 roundtrip', () => {
  const sm2Kp = SM2.generateKeyPair();
  const sm2Buf = HybridExt.sm2PublicKeyToBuffer(sm2Kp.publicKey);
  const ctBuf = Buffer.alloc(1088);
  crypto.randomFillSync(ctBuf);
  const raw = HybridExt.encodeServerKeyShare(sm2Buf, ctBuf);
  const decoded = HybridExt.decodeServerKeyShare(raw);
  assert(decoded.group === 4590);
  assertBufEqual(decoded.sm2Share, sm2Buf, 'SM2 share roundtrip');
  assertBufEqual(decoded.mlkemData, ctBuf, 'MLKEM ct roundtrip');
});

// ================================================================
console.log('\n=== 4. 完整握手边对边 roundtrip ===');

test('完整 IANA #4590 握手 — 客户端/服务端共享秘密一致', () => {
  // Client: 生成 key_share
  const clientResult = HybridExt.clientKeyExchange();

  // Server: 处理 ClientHello
  const serverResult = HybridExt.serverProcessClientHello(clientResult.clientKeyShare);

  // Client: 处理 ServerHello
  const clientSS = HybridExt.clientProcessServerHello(
    serverResult.serverKeyShare,
    clientResult.secrets
  );

  assert(serverResult.sharedSecret.length === 32, 'server SS = 32B');
  assert(clientSS.length === 32, 'client SS = 32B');
  assertBufEqual(clientSS, serverResult.sharedSecret, 'handshake shared secret');
  assert(serverResult.sessionId.length === 32, 'sessionId hex = 32 chars');
});

test('两次独立握手产生不同共享秘密', () => {
  const c1 = HybridExt.clientKeyExchange();
  const s1 = HybridExt.serverProcessClientHello(c1.clientKeyShare);
  const ss1 = HybridExt.clientProcessServerHello(s1.serverKeyShare, c1.secrets);

  const c2 = HybridExt.clientKeyExchange();
  const s2 = HybridExt.serverProcessClientHello(c2.clientKeyShare);
  const ss2 = HybridExt.clientProcessServerHello(s2.serverKeyShare, c2.secrets);

  assert(!ss1.equals(ss2), 'independent handshakes → different SS');
});

test('会话 ID 唯一性', () => {
  const c1 = HybridExt.clientKeyExchange();
  const s1 = HybridExt.serverProcessClientHello(c1.clientKeyShare);
  const c2 = HybridExt.clientKeyExchange();
  const s2 = HybridExt.serverProcessClientHello(c2.clientKeyShare);
  assert(s1.sessionId !== s2.sessionId, 'session ID unique');
});

// ================================================================
console.log('\n=== 5. 格式错误测试 ===');

test('decodeClientKeyShare: 拒绝错误 group ID', () => {
  const raw = Buffer.alloc(10);
  raw.writeUInt16BE(4589); // wrong group
  try {
    HybridExt.decodeClientKeyShare(raw);
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('expected group 4590'), `correct error: ${e.message}`);
  }
});

test('decodeClientKeyShare: 拒绝过短数据', () => {
  try {
    HybridExt.decodeClientKeyShare(Buffer.from([0, 0]));
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('too short'), `got error: ${e.message}`);
  }
});

test('encodeClientKeyShare: 拒绝错误的 SM2 公钥长度', () => {
  const sm2Kp = SM2.generateKeyPair();
  const badBuf = Buffer.alloc(64); // wrong size
  const mlkemBuf = Buffer.alloc(1184);
  try {
    HybridExt.encodeClientKeyShare(badBuf, mlkemBuf);
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('SM2 share size'), `got error: ${e.message}`);
  }
});

test('encodeClientKeyShare: 拒绝错误的 MLKEM 公钥长度', () => {
  const sm2Kp = SM2.generateKeyPair();
  const sm2Buf = HybridExt.sm2PublicKeyToBuffer(sm2Kp.publicKey);
  const badBuf = Buffer.alloc(1000); // wrong size
  try {
    HybridExt.encodeClientKeyShare(sm2Buf, badBuf);
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('ML-KEM share size'), `got error: ${e.message}`);
  }
});

test('bufferToSm2Point: 拒绝非 0x04 前缀', () => {
  const bad = Buffer.alloc(65); // all zeros, prefix 0x00
  try {
    HybridExt.bufferToSm2Point(bad);
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('0x04 prefix'), `got error: ${e.message}`);
  }
});

test('bufferToSm2Point: 拒绝错误长度', () => {
  try {
    HybridExt.bufferToSm2Point(Buffer.alloc(10));
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('65 bytes'), `got error: ${e.message}`);
  }
});

// ================================================================
console.log('\n=== 6. HKDF 单元测试 ===');

test('HKDF Extract-Expand 一致性', () => {
  const ikm = Buffer.from('test ikm for hybrid extension');
  const salt = Buffer.alloc(0);
  const info = Buffer.from('FIBEMATE_TLS_HYBRID_TEST_v1');
  const prk = HybridExt.hkdfExtract(salt, ikm);
  const okm = HybridExt.hkdfExpand(prk, info, 32);
  assert(okm.length === 32, 'OKM = 32B');
  // Verify deterministic
  const prk2 = HybridExt.hkdfExtract(salt, ikm);
  assertBufEqual(prk, prk2, 'deterministic PRK');
  const okm2 = HybridExt.hkdfExpand(prk2, info, 32);
  assertBufEqual(okm, okm2, 'deterministic OKM');
});

test('HKDF: 不同 info → 不同 OKM', () => {
  const ikm = Buffer.from('test');
  const salt = Buffer.alloc(0);
  const prk = HybridExt.hkdfExtract(salt, ikm);
  const okm1 = HybridExt.hkdfExpand(prk, Buffer.from('info1'), 32);
  const okm2 = HybridExt.hkdfExpand(prk, Buffer.from('info2'), 32);
  assert(!okm1.equals(okm2), 'different info → different OKM');
});

// ================================================================
// 结果汇总
// ================================================================
console.log(`\n${'='.repeat(50)}`);
const total = passed + failed;
console.log(`Passed: ${passed}/${total}  |  Failed: ${failed}/${total}`);
if (failed > 0) {
  console.error(`❌ Some tests FAILED`);
  process.exit(1);
} else {
  console.log(`✅ All tests PASSED`);
}
