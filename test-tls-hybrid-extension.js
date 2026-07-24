#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * test-tls-hybrid-extension.js 鈥?IANA #4590 TLS 娣峰悎鎵╁睍鍗曞厓娴嬭瘯
 *
 * 娴嬭瘯瑕嗙洊锛? *   1. SM2 鍏挜搴忓垪鍖?鍙嶅簭鍒楀寲 roundtrip
 *   2. ClientHello key_share 缂栫爜/瑙ｇ爜
 *   3. ServerHello key_share 缂栫爜/瑙ｇ爜
 *   4. 瀹屾暣鎻℃墜 roundtrip (key derivation match)
 *   5. 鏍煎紡閿欒娴嬭瘯 (閿欒 group ID, 閿欒闀垮害)
 *   6. 澶氬疄渚嬪叡浜瀵嗙嫭绔嬫€? */

'use strict';

const path = require('path');
const crypto = require('crypto');

// 鍔犺浇寰呮祴妯″潡锛堜粠 /opt/fibemate-full 鏍圭洰褰曡繍琛岋級
const HybridExt = require('./src/tls-hybrid-extension');
const SM2 = require('./sm2-bigint-ec.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  鉁?${name}`);
  } catch (e) {
    failed++;
    console.log(`  鉂?${name}: ${e.message}`);
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

console.log('\n=== 1. SM2 搴忓垪鍖?鍙嶅簭鍒楀寲 roundtrip ===');

test('SM2 鐢熸垚瀵嗛挜瀵瑰苟搴忓垪鍖栦负 65 瀛楄妭', () => {
  const kp = SM2.generateKeyPair();
  const buf = HybridExt.sm2PublicKeyToBuffer(kp.publicKey);
  assert(buf.length === 65, `expected 65B, got ${buf.length}B`);
  assert(buf[0] === 0x04, 'expected 0x04 prefix');
  // x and y should be 32 bytes each
  assert(buf.subarray(1, 33).length === 32, 'x coord 32B');
  assert(buf.subarray(33, 65).length === 32, 'y coord 32B');
});

test('SM2 65 瀛楄妭 鈫?鐐瑰璞?roundtrip', () => {
  const kp1 = SM2.generateKeyPair();
  const buf = HybridExt.sm2PublicKeyToBuffer(kp1.publicKey);
  const pt2 = HybridExt.bufferToSm2Point(buf);
  assert(pt2.x === kp1.publicKey.x, 'x match');
  assert(pt2.y === kp1.publicKey.y, 'y match');
});

test('SM2 ECDH 姹傚€?(32 瀛楄妭杈撳嚭)', () => {
  const alice = SM2.generateKeyPair();
  const bob = SM2.generateKeyPair();
  const aliceSS = HybridExt.sm2ECDH(alice.privateKey, bob.publicKey);
  const bobSS = HybridExt.sm2ECDH(bob.privateKey, alice.publicKey);
  assert(aliceSS.length === 32, `alice SS: 32B, got ${aliceSS.length}B`);
  assertBufEqual(aliceSS, bobSS, 'ECDH shared secret');
});

// ================================================================
console.log('\n=== 2. ClientHello key_share 缂栫爜/瑙ｇ爜 ===');

test('ClientHello key_share 缂栫爜 (GROUP + LEN + SM2 + MLKEM)', () => {
  const result = HybridExt.clientKeyExchange();
  const raw = result.clientKeyShare;
  assert(raw.length === 2 + 2 + 65 + 1184,
    `expected 1253 bytes, got ${raw.length}`);
  assert(raw.readUInt16BE(0) === 4590, 'group ID = 4590');
  assert(raw.readUInt16BE(2) === 1249, 'data length = 1249');
});

test('ClientHello key_share 缂栬В鐮?roundtrip', () => {
  // 鎵嬪姩鏋勯€犲凡鐭ユ暟鎹?  const sm2Kp = SM2.generateKeyPair();
  const sm2Buf = HybridExt.sm2PublicKeyToBuffer(sm2Kp.publicKey);
  const mlkemBuf = Buffer.alloc(1184);
  // 楠岃瘉 MLKEM 鐢熸垚
  // We'll use the full clientKeyExchange for a real test
  const result = HybridExt.clientKeyExchange();
  const decoded = HybridExt.decodeClientKeyShare(result.clientKeyShare);
  assert(decoded.sm2Pk.length === 65, 'decoded SM2 pk = 65B');
  assert(decoded.mlkemPk.length === 1184, 'decoded MLKEM pk = 1184B');
  assertBufEqual(decoded.sm2Pk, result.secrets.sm2.pk, 'SM2 pk roundtrip');
  assertBufEqual(decoded.mlkemPk, result.secrets.mlkem.pk, 'MLKEM pk roundtrip');
});

// ================================================================
console.log('\n=== 3. ServerHello key_share 缂栫爜/瑙ｇ爜 ===');

test('ServerHello key_share 缂栫爜 (SM2 65B + MLKEM CT 1088B)', () => {
  const sm2Kp = SM2.generateKeyPair();
  const sm2Buf = HybridExt.sm2PublicKeyToBuffer(sm2Kp.publicKey);
  const ctBuf = Buffer.alloc(1088); // placeholder ct
  const raw = HybridExt.encodeServerKeyShare(sm2Buf, ctBuf);
  assert(raw.length === 2 + 2 + 65 + 1088,
    `expected 1157 bytes, got ${raw.length}`);
  assert(raw.readUInt16BE(0) === 4590, 'group = 4590');
});

test('ServerHello key_share 瑙ｇ爜 roundtrip', () => {
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
console.log('\n=== 4. 瀹屾暣鎻℃墜杈瑰杈?roundtrip ===');

test('瀹屾暣 IANA #4590 鎻℃墜 鈥?瀹㈡埛绔?鏈嶅姟绔叡浜瀵嗕竴鑷?, () => {
  // Client: 鐢熸垚 key_share
  const clientResult = HybridExt.clientKeyExchange();

  // Server: 澶勭悊 ClientHello
  const serverResult = HybridExt.serverProcessClientHello(clientResult.clientKeyShare);

  // Client: 澶勭悊 ServerHello
  const clientSS = HybridExt.clientProcessServerHello(
    serverResult.serverKeyShare,
    clientResult.secrets
  );

  assert(serverResult.sharedSecret.length === 32, 'server SS = 32B');
  assert(clientSS.length === 32, 'client SS = 32B');
  assertBufEqual(clientSS, serverResult.sharedSecret, 'handshake shared secret');
  assert(serverResult.sessionId.length === 32, 'sessionId hex = 32 chars');
});

test('涓ゆ鐙珛鎻℃墜浜х敓涓嶅悓鍏变韩绉樺瘑', () => {
  const c1 = HybridExt.clientKeyExchange();
  const s1 = HybridExt.serverProcessClientHello(c1.clientKeyShare);
  const ss1 = HybridExt.clientProcessServerHello(s1.serverKeyShare, c1.secrets);

  const c2 = HybridExt.clientKeyExchange();
  const s2 = HybridExt.serverProcessClientHello(c2.clientKeyShare);
  const ss2 = HybridExt.clientProcessServerHello(s2.serverKeyShare, c2.secrets);

  assert(!ss1.equals(ss2), 'independent handshakes 鈫?different SS');
});

test('浼氳瘽 ID 鍞竴鎬?, () => {
  const c1 = HybridExt.clientKeyExchange();
  const s1 = HybridExt.serverProcessClientHello(c1.clientKeyShare);
  const c2 = HybridExt.clientKeyExchange();
  const s2 = HybridExt.serverProcessClientHello(c2.clientKeyShare);
  assert(s1.sessionId !== s2.sessionId, 'session ID unique');
});

// ================================================================
console.log('\n=== 5. 鏍煎紡閿欒娴嬭瘯 ===');

test('decodeClientKeyShare: 鎷掔粷閿欒 group ID', () => {
  const raw = Buffer.alloc(10);
  raw.writeUInt16BE(4589); // wrong group
  try {
    HybridExt.decodeClientKeyShare(raw);
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('expected group 4590'), `correct error: ${e.message}`);
  }
});

test('decodeClientKeyShare: 鎷掔粷杩囩煭鏁版嵁', () => {
  try {
    HybridExt.decodeClientKeyShare(Buffer.from([0, 0]));
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('too short'), `got error: ${e.message}`);
  }
});

test('encodeClientKeyShare: 鎷掔粷閿欒鐨?SM2 鍏挜闀垮害', () => {
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

test('encodeClientKeyShare: 鎷掔粷閿欒鐨?MLKEM 鍏挜闀垮害', () => {
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

test('bufferToSm2Point: 鎷掔粷闈?0x04 鍓嶇紑', () => {
  const bad = Buffer.alloc(65); // all zeros, prefix 0x00
  try {
    HybridExt.bufferToSm2Point(bad);
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('0x04 prefix'), `got error: ${e.message}`);
  }
});

test('bufferToSm2Point: 鎷掔粷閿欒闀垮害', () => {
  try {
    HybridExt.bufferToSm2Point(Buffer.alloc(10));
    assert(false, 'expected error');
  } catch (e) {
    assert(e.message.includes('65 bytes'), `got error: ${e.message}`);
  }
});

// ================================================================
console.log('\n=== 6. HKDF 鍗曞厓娴嬭瘯 ===');

test('HKDF Extract-Expand 涓€鑷存€?, () => {
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

test('HKDF: 涓嶅悓 info 鈫?涓嶅悓 OKM', () => {
  const ikm = Buffer.from('test');
  const salt = Buffer.alloc(0);
  const prk = HybridExt.hkdfExtract(salt, ikm);
  const okm1 = HybridExt.hkdfExpand(prk, Buffer.from('info1'), 32);
  const okm2 = HybridExt.hkdfExpand(prk, Buffer.from('info2'), 32);
  assert(!okm1.equals(okm2), 'different info 鈫?different OKM');
});

// ================================================================
// 缁撴灉姹囨€?// ================================================================
console.log(`\n${'='.repeat(50)}`);
const total = passed + failed;
console.log(`Passed: ${passed}/${total}  |  Failed: ${failed}/${total}`);
if (failed > 0) {
  console.error(`鉂?Some tests FAILED`);
  process.exit(1);
} else {
  console.log(`鉁?All tests PASSED`);
}
