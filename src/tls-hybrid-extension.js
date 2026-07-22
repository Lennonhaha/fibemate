// SPDX-License-Identifier: GPL-3.0-only
/**
 * tls-hybrid-extension.js — IANA #4590 SM2-MLKEM768 混合密钥交换扩展
 *
 * 模拟 TLS 1.3 key_share 扩展格式，实现 IANA #4590 协议语义：
 *
 *   IANA #4590 NamedGroup:
 *     key_exchange = SM2_ECDH_share (65B) || ML-KEM-768_public_key (1184B)
 *     shared_secret = HKDF-Extract(salt="", ikm=ECDH_secret || MLKEM_shared_secret)
 *
 * 参考文献:
 *   - draft-yang-tls-hybrid-sm2-mlkem (FIBEMATE)
 *   - draft-ietf-tls-hybrid-design (TLS hybrid key exchange)
 *   - IANA TLS NamedGroup #4590
 *
 * 注意: 此为应用层模拟。实际 TLS 1.3 握手需嵌入 OpenSSL/oqs-provider。
 */

'use strict';

const crypto = require('crypto');

// Debug flag — set to true for handshake tracing
const DEBUG = false;
const DEBUG_PREFIX = '[tls-hybrid]';
// ================================================================
// IANA #4590 常量
// ================================================================

const HYBRID_GROUP_ID = 4590;

// 子密钥类型
const SUB_KEM = {
  SM2: { id: 0, name: 'SM2 ECDH', shareSize: 65 },  // 0x04 || x || y (uncompressed)
  MLKEM768: { id: 1, name: 'ML-KEM-768', shareSize: 1184, ctSize: 1088 },
};
const TOTAL_SHARE_SIZE = SUB_KEM.SM2.shareSize + SUB_KEM.MLKEM768.shareSize;
// 65 + 1184 = 1249 bytes
const SERVER_TOTAL_SHARE_SIZE = SUB_KEM.SM2.shareSize + SUB_KEM.MLKEM768.ctSize;
// 65 + 1088 = 1153 bytes

// ================================================================
// HKDF 辅助 (RFC 5869)
// ================================================================

const HASH_ALGO = 'sha256';

function hkdfExtract(salt, ikm) {
  return crypto.createHmac(HASH_ALGO, salt).update(ikm).digest();
}

function hkdfExpand(prk, info, length) {
  const n = Math.ceil(length / 32);
  const t = [];
  let prev = Buffer.alloc(0);
  for (let i = 0; i < n; i++) {
    const h = crypto.createHmac(HASH_ALGO, prk);
    h.update(prev);
    h.update(info);
    h.update(Buffer.from([i + 1]));
    t.push(h.digest());
    prev = t[i];
  }
  return Buffer.concat(t).subarray(0, length);
}

// ================================================================
// SM2 ECDH (BigInt)
// ================================================================

let SM2;
try {
  SM2 = require('../sm2-bigint-ec.js');
} catch (e) {
  throw new Error(
    'tls-hybrid-extension: sm2-bigint-ec.js 未找到，需配置正确路径'
  );
}

/**
 * 生成 SM2 临时密钥对。
 * @returns {{ privateKey: bigint, publicKey: { x: bigint, y: bigint } }}
 */
function sm2GenerateEphemeral() {
  return SM2.generateKeyPair();
}

/**
 * 将 SM2 公钥序列化为 65 字节未压缩格式 (0x04 || x || y)。
 * @param {{ x: bigint, y: bigint }} pt
 * @returns {Buffer} 65 字节 Buffer
 */
function sm2PublicKeyToBuffer(pt) {
  const xHex = SM2.bigIntToHex(pt.x).padStart(64, '0');
  const yHex = SM2.bigIntToHex(pt.y).padStart(64, '0');
  return Buffer.from('04' + xHex + yHex, 'hex');
}

/**
 * 将 65 字节未压缩公钥解析回 SM2 点对象。
 * @param {Buffer} buf - 65 字节
 * @returns {{ x: bigint, y: bigint }}
 */
function bufferToSm2Point(buf) {
  if (buf.length !== 65 || buf[0] !== 0x04) {
    throw new Error('SM2 public key format: expected 65 bytes with 0x04 prefix');
  }
  return {
    x: SM2.hexToBigInt(buf.subarray(1, 33).toString('hex')),
    y: SM2.hexToBigInt(buf.subarray(33, 65).toString('hex')),
  };
}

/**
 * SM2 ECDH：客户端私钥 × 服务端公钥 → x 坐标。
 * @param {bigint} privateKey - 临时私钥
 * @param {{ x: bigint, y: bigint }} peerPublicKey - 对方公钥
 * @returns {Buffer} 32 字节共享秘密（x 坐标，大端对齐）
 */
function sm2ECDH(privateKey, peerPublicKey) {
  const shared = SM2.pointMultiply(privateKey, peerPublicKey);
  if (!shared || SM2.isInf(shared)) {
    throw new Error('SM2 ECDH: shared point is infinity');
  }
  const xHex = SM2.bigIntToHex(shared.x).padStart(64, '0');
  return Buffer.from(xHex, 'hex');
}

// ================================================================
// ML-KEM-768
// ================================================================

let MLKEM768;
try {
  // 优先原生 addon
  MLKEM768 = require('../addon/build/Release/mlkem.node');
} catch (_) {
  MLKEM768 = null;
}

// 原生 addon 存在性检查（encaps/decaps 必须返回一致的共享秘密）
let useNative = false;
if (MLKEM768 && typeof MLKEM768.encaps === 'function') {
  try {
    // 完整性检查：encaps 与 decaps 必须匹配
    const tKp = MLKEM768.keygen();
    const tEnc = MLKEM768.encaps(tKp[0]);
    const tDec = MLKEM768.decaps(tKp[1], tEnc[0]);
    // 对齐到 Buffer 后比较
    const tEncSS = Buffer.from(tEnc[1]);
    const tDecSS = Buffer.from(tDec);
    if (tEncSS.equals(tDecSS)) {
      useNative = true;
      console.error('[tls-hybrid] ML-KEM-768 原生 addon (integrity verified)');
    } else {
      console.error('[tls-hybrid] ML-KEM-768 原生 addon encaps/decaps 不匹配，使用 JS 实现');
    }
  } catch (e) {
    console.error('[tls-hybrid] ML-KEM-768 原生 addon 验证失败:', e.message);
  }
}

if (!useNative) {
  try {
    MLKEM768 = require('./crypto/ml-kem-768-td.js');
    console.error('[tls-hybrid] ML-KEM-768 JS 实现已加载');
  } catch (_) {
    throw new Error('tls-hybrid-extension: ML-KEM-768 不可用');
  }
}

/**
 * 将 ML-KEM 的 Uint8Array 公钥/密文转为 Buffer。
 * @param {Uint8Array|Buffer} arr
 * @returns {Buffer}
 */
function toBuffer(arr) {
  return arr instanceof Buffer ? arr : Buffer.from(arr);
}

/**
 * 生成 ML-KEM-768 密钥对。
 * @returns {{ publicKey: Buffer, secretKey: Buffer }}
 */
function mlkemGenerate() {
  if (useNative) {
    const kp = MLKEM768.keygen();
    return { publicKey: toBuffer(kp[0]), secretKey: toBuffer(kp[1]) };
  }
  const kp = MLKEM768.generateKeypair();
  return { publicKey: toBuffer(kp.publicKey), secretKey: toBuffer(kp.secretKey) };
}

function mlkemEncapsulate(publicKey) {
  if (useNative) {
    const res = MLKEM768.encaps(publicKey);
    return { ciphertext: toBuffer(res[0]), sharedSecret: toBuffer(res[1]) };
  }
  const res = MLKEM768.encapsulate(publicKey);
  return { ciphertext: toBuffer(res.ciphertext), sharedSecret: toBuffer(res.sharedSecret) };
}

function mlkemDecapsulate(secretKey, ciphertext) {
  if (useNative) {
    return toBuffer(MLKEM768.decaps(secretKey, ciphertext));
  }
  const result = MLKEM768.decapsulate(secretKey, ciphertext);
  return toBuffer(result.sharedSecret !== undefined ? result.sharedSecret : result);
}

// ================================================================
// TLS 1.3 key_share 扩展序列化/反序列化
// ================================================================

/**
 * TLS 1.3 KeyShareEntry:
 *   struct {
 *     NamedGroup group;
 *     opaque key_exchange<1..2^16-1>;
 *   } KeyShareEntry;
 *
 * key_exchange = sm2_ecdh_share (65B) || mlkem_public_key (1184B)
 *   Total: 1249 bytes
 */

/**
 * 生成 ClientHello 的 key_share 扩展数据。
 *
 * @param {Buffer} sm2PublicKeyBuf - SM2 公钥 65 字节
 * @param {Buffer} mlkemPublicKey  - ML-KEM-768 公钥 1184 字节
 * @returns {Buffer} 完整 key_share 扩展 (2B group + 2B len + 1249B data)
 */
function encodeClientKeyShare(sm2PublicKeyBuf, mlkemPublicKey) {
  const sm2Buf = toBuffer(sm2PublicKeyBuf);
  const mlkemBuf = toBuffer(mlkemPublicKey);

  if (sm2Buf.length !== SUB_KEM.SM2.shareSize) {
    throw new Error(
      `SM2 share size mismatch: got ${sm2Buf.length}, expected ${SUB_KEM.SM2.shareSize}`
    );
  }
  if (mlkemBuf.length !== SUB_KEM.MLKEM768.shareSize) {
    throw new Error(
      `ML-KEM share size mismatch: got ${mlkemBuf.length}, expected ${SUB_KEM.MLKEM768.shareSize}`
    );
  }

  // Group (2B, big-endian) + Length (2B, big-endian) + SM2 (65B) + MLKEM (1184B)
  const keyExchange = Buffer.concat([sm2Buf, mlkemBuf]);
  const group = Buffer.alloc(2);
  group.writeUInt16BE(HYBRID_GROUP_ID);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(keyExchange.length);

  return Buffer.concat([group, len, keyExchange]);
  // Total: 2 + 2 + 65 + 1184 = 1253 bytes
}

/**
 * 解析 ServerHello 的 key_share 扩展数据。
 *
 * @param {Buffer} raw - 完整 key_share (2B group + 2B len + key_exchange)
 * @returns {{ group: number, sm2Share: Buffer, mlkemCiphertext: Buffer }}
 */
function decodeServerKeyShare(raw) {
  const buf = toBuffer(raw);
  if (buf.length < 4) {
    throw new Error('key_share: header too short');
  }

  const group = buf.readUInt16BE(0);
  if (group !== HYBRID_GROUP_ID) {
    throw new Error(`key_share: expected group ${HYBRID_GROUP_ID}, got ${group}`);
  }

  const dataLen = buf.readUInt16BE(2);
  const data = buf.subarray(4, 4 + dataLen);

  if (data.length !== SERVER_TOTAL_SHARE_SIZE) {
    throw new Error(
      `key_share: expected ${SERVER_TOTAL_SHARE_SIZE} bytes, got ${data.length}`
    );
  }

  // SM2 ECDH share (65B) is for signature — in ServerHello the key_exchange
  // contains the SM2 ephemeral public key for the server. But in our hybrid,
  // the server response is typically ML-KEM ciphertext (1088B) + SM2 ECDH.
  //
  // IANA hybrid ordering: SM2 first, then MLKEM.
  const sm2Share = data.subarray(0, SUB_KEM.SM2.shareSize);
  const mlkemData = data.subarray(SUB_KEM.SM2.shareSize);

  return { group, sm2Share, mlkemData };
}

// ================================================================
// 高级 API: 完整握手模拟
// ================================================================

/**
 * IANA #4590 混合密钥交换结果。
 * @typedef {Object} HybridKeyExchangeResult
 * @property {Buffer} sharedSecret - 32 字节混合共享秘密
 * @property {Buffer} clientKeyShare  - ClientHello 的 key_share 扩展 (1253B)
 * @property {{ sm2: { sk: bigint, pk: Buffer }, mlkem: { sk: Buffer, pk: Buffer } }} secrets - 用于测试/审计
 */

/**
 * 执行完整的 IANA #4590 混合密钥交换 (Client 侧)。
 * 生成临时 SM2 + ML-KEM-768 密钥对，构造 key_share 扩展。
 *
 * @returns {HybridKeyExchangeResult}
 */
function clientKeyExchange() {
  // 1. SM2 ephemeral
  const sm2Kp = sm2GenerateEphemeral();
  const sm2PkBuf = sm2PublicKeyToBuffer(sm2Kp.publicKey);

  // 2. ML-KEM-768 ephemeral
  const mlkemKp = mlkemGenerate();

  // 3. 编码 key_share
  const clientKeyShare = encodeClientKeyShare(sm2PkBuf, mlkemKp.publicKey);

  return {
    clientKeyShare,
    secrets: {
      sm2: { sk: sm2Kp.privateKey, pk: sm2PkBuf },
      mlkem: { sk: mlkemKp.secretKey, pk: mlkemKp.publicKey },
    },
  };
}

/**
 * 服务端处理 ClientHello key_share，生成本地密钥和 ServerHello 响应。
 *
 * @param {Buffer} clientKeyShareRaw - ClientHello 的 key_share 数据
 * @returns {Object} {{ serverKeyShare: Buffer, sharedSecret: Buffer, sessionId: string }}
 */
function serverProcessClientHello(clientKeyShareRaw) {
  const client = decodeClientKeyShare(clientKeyShareRaw);
  const { sm2Pk, mlkemPk } = client;

  // 服务端 SM2 ephemeral
  const serverSm2Kp = sm2GenerateEphemeral();
  const serverSm2PkBuf = sm2PublicKeyToBuffer(serverSm2Kp.publicKey);

  // SM2 ECDH: server_sk × client_pk
  const sm2Shared = sm2ECDH(serverSm2Kp.privateKey, bufferToSm2Point(sm2Pk));

  // ML-KEM-768 Encaps: server → client
  const mlkemResult = mlkemEncapsulate(mlkemPk);

  // 客户端需要的服务端 key_share (ServerHello)
  // 包含服务端 SM2 公钥 + ML-KEM 密文
  const serverKeyShare = encodeServerKeyShare(serverSm2PkBuf, mlkemResult.ciphertext);

  // 混合共享秘密
  const ikm = Buffer.concat([sm2Shared, mlkemResult.sharedSecret]);
  const sharedSecret = hkdfExtract(Buffer.alloc(0), ikm);

  // (debugging complete — mlkem mismatch was native addon bug, now using JS impl)

  // Session ID
  const sessionId = crypto.randomBytes(16).toString('hex');

  return { serverKeyShare, sharedSecret, sessionId };
}

/**
 * 客户端处理 ServerHello key_share，完成密钥派生。
 *
 * @param {Buffer} serverKeyShareRaw - ServerHello 的 key_share 数据
 * @param {Object} clientSecrets - clientKeyExchange() 返回的 secrets
 * @returns {Buffer} 32 字节共享秘密
 */
function clientProcessServerHello(serverKeyShareRaw, clientSecrets) {
  const server = decodeServerKeyShare(serverKeyShareRaw);

  // SM2 ECDH: client_sk × server_pk (SM2 share in server response)
  const serverSm2Point = bufferToSm2Point(server.sm2Share);
  const sm2Shared = sm2ECDH(clientSecrets.sm2.sk, serverSm2Point);

  // ML-KEM-768 Decaps: client_sk × server_ciphertext
  const mlkemSs = mlkemDecapsulate(clientSecrets.mlkem.sk, server.mlkemData);

  // 混合共享秘密
  const ikm = Buffer.concat([sm2Shared, mlkemSs]);
  const sharedSecret = hkdfExtract(Buffer.alloc(0), ikm);

  // (debugging complete)

  return sharedSecret;
}

/**
 * 解析 ClientHello 的 key_share 数据（含 2B group + 2B len 头）。
 * @param {Buffer} raw
 * @returns {{ sm2Pk: Buffer, mlkemPk: Buffer }}
 */
function decodeClientKeyShare(raw) {
  const buf = toBuffer(raw);
  if (buf.length < 4) {
    throw new Error('ClientHello key_share: header too short');
  }

  const group = buf.readUInt16BE(0);
  if (group !== HYBRID_GROUP_ID) {
    throw new Error(
      `ClientHello key_share: expected group ${HYBRID_GROUP_ID}, got ${group}`
    );
  }

  const dataLen = buf.readUInt16BE(2);
  const data = buf.subarray(4, 4 + dataLen);

  if (data.length !== TOTAL_SHARE_SIZE) {
    throw new Error(
      `ClientHello key_share: expected ${TOTAL_SHARE_SIZE} bytes, ` +
      `got ${data.length}`
    );
  }

  const sm2Pk = data.subarray(0, SUB_KEM.SM2.shareSize);
  const mlkemPk = data.subarray(SUB_KEM.SM2.shareSize);

  return { sm2Pk, mlkemPk };
}

/**
 * 编码 ServerHello 的 key_share 响应。
 * key_exchange = SM2_public_key (65B) || ML-KEM_ciphertext (1088B)
 * Total = 2 + 2 + 65 + 1088 = 1157 bytes
 *
 * @param {Buffer} sm2PublicKeyBuf - 服务端 SM2 临时公钥 (65B)
 * @param {Buffer} mlkemCiphertext - ML-KEM-768 密文 (1088B)
 * @returns {Buffer}
 */
function encodeServerKeyShare(sm2PublicKeyBuf, mlkemCiphertext) {
  const sm2Buf = toBuffer(sm2PublicKeyBuf);
  const ctBuf = toBuffer(mlkemCiphertext);

  if (sm2Buf.length !== SUB_KEM.SM2.shareSize) {
    throw new Error(`Server SM2 share size mismatch: got ${sm2Buf.length}`);
  }
  if (ctBuf.length !== SUB_KEM.MLKEM768.ctSize) {
    throw new Error(
      `Server ML-KEM ciphertext size mismatch: got ${ctBuf.length}, ` +
      `expected ${SUB_KEM.MLKEM768.ctSize}`
    );
  }

  const keyExchange = Buffer.concat([sm2Buf, ctBuf]);
  const group = Buffer.alloc(2);
  group.writeUInt16BE(HYBRID_GROUP_ID);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(keyExchange.length);

  return Buffer.concat([group, len, keyExchange]);
}

// ================================================================
// 导出
// ================================================================

module.exports = {
  // 常量
  HYBRID_GROUP_ID,
  SUB_KEM,
  TOTAL_SHARE_SIZE,
  SERVER_TOTAL_SHARE_SIZE,

  // 编解码
  encodeClientKeyShare,
  decodeClientKeyShare,
  encodeServerKeyShare,
  decodeServerKeyShare,

  // SM2 辅助
  sm2GenerateEphemeral,
  sm2PublicKeyToBuffer,
  bufferToSm2Point,
  sm2ECDH,

  // 高级握手 API
  clientKeyExchange,
  serverProcessClientHello,
  clientProcessServerHello,

  // 内部 (测试用)
  hkdfExtract,
  hkdfExpand,
};
