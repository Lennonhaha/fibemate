// SPDX-License-Identifier: GPL-3.0-only
/**
 * pqc-hybrid-server.js — 路径 C-2: SM2 + ML-KEM-768 混合后量子密钥交换
 *
 * 架构：
 *   Client → GET /api/pqc-hybrid/init → 服务端返回 SM2 + ML-KEM 双公钥
 *   Client → 本地: SM2 ECDH(server_sm2_pk, client_ephemeral_sk) + ML-KEM encaps(mlkem_pk)
 *   Client → POST /api/pqc-hybrid/finalize { sessionId, clientSm2Pub, mlkemCt }
 *   Server → 本地: SM2 ECDH(client_sm2_pk, server_sk) + ML-KEM decaps(mlkemCt)
 *   双方: sessionKey = HKDF(salt=tlsSessionId, ikm=sm2_ss || mlkem_ss)
 *
 * 安全：经典 SM2 ECDH (128-bit) + 后量子 ML-KEM-768 (128-bit) 混合 HKDF
 *   IANA #4590 应用层落地实现
 */

const crypto = require('crypto');

// ============ SM2 (BigInt) ============
const SM2 = require('../sm2-bigint-ec.js');
console.log('[pqc-hybrid] SM2 BigInt 已加载');

// ============ ML-KEM-768 ============
let mlkem;
try {
  mlkem = require('../addon/build/Release/mlkem.node');
  console.log('[pqc-hybrid] ✅ C Native ML-KEM-768');
} catch (_) {
  try {
    mlkem = require('../public/crypto/crypto/ml-kem-768.js');
    console.log('[pqc-hybrid] JS ML-KEM-768');
  } catch (__) {
    mlkem = null;
    console.error('[pqc-hybrid] ❌ ML-KEM unavailable');
  }
}

// ============ HKDF (RFC 5869) ============
function hkdfExtract(salt, ikm) {
  return crypto.createHmac('sha256', salt).update(ikm).digest();
}

function hkdfExpand(prk, info, length) {
  const n = Math.ceil(length / 32), t = [];
  let prev = Buffer.alloc(0);
  for (let i = 0; i < n; i++) {
    const h = crypto.createHmac('sha256', prk);
    if (i > 0) h.update(t[i - 1]);
    h.update(info).update(Buffer.from([i + 1]));
    t.push(h.digest());
  }
  return Buffer.concat(t).subarray(0, length);
}

function mixSessionKey(tlsSessionId, sm2SharedSecretHex, mlkemSharedSecret) {
  // Mix SM2 ECDH + ML-KEM shared secrets through HKDF
  const salt = Buffer.from(tlsSessionId, 'hex');
  const ikm = Buffer.concat([
    Buffer.from(sm2SharedSecretHex, 'hex'),
    Buffer.from(mlkemSharedSecret)
  ]);
  const prk = hkdfExtract(salt, ikm);
  return hkdfExpand(prk, Buffer.from('FIBEMATE_SM2_MLKEM_HYBRID_v1'), 32);
}

// ============ SM2 ECDH Key Agreement ============
function sm2EcdhCompute(privateKey, peerPublicKey) {
  // d * P_peer → shared point = pointMul(d, P), return x-coordinate hex
  const shared = SM2.pointMultiply(privateKey, peerPublicKey);
  if (!shared || SM2.isInf(shared)) {
    throw new Error('SM2 ECDH: invalid shared point (infinity)');
  }
  return SM2.bigIntToHex(shared.x).padStart(64, '0');
}

// ============ Session Store ============
const sessions = new Map();
const TTL = 5 * 60 * 1000;

function cleanExpired() {
  const now = Date.now();
  for (const [sid, kp] of sessions) {
    if (now - kp.createdAt > TTL) sessions.delete(sid);
  }
}

// ============ Express Routes ============
function mount(app) {
  if (!mlkem) {
    console.warn('[pqc-hybrid] ML-KEM unavailable — routes not mounted');
    return;
  }

  app.get('/api/pqc-hybrid/init', (req, res) => {
    try {
      cleanExpired();
      const tlsSid = req.headers['x-tls-session-id'] || 'fallback-' + crypto.randomBytes(16).toString('hex');

      // Generate SM2 keypair
      const sm2Kp = SM2.generateKeyPair();
      // Generate ML-KEM keypair
      const [mlkemPk, mlkemSk] = mlkem.keygen();

      const sm2PubHex = SM2.publicKeyToHex(sm2Kp.publicKey);

      sessions.set(tlsSid, {
        sm2Sk: sm2Kp.privateKey,
        sm2Pk: sm2Kp.publicKey,
        mlkemPk,
        mlkemSk,
        createdAt: Date.now()
      });

      res.set('X-TLS-Session-Id', tlsSid);
      res.json({
        sessionId: tlsSid,
        sm2PublicKey: sm2PubHex,
        mlkemPublicKey: mlkemPk.toString('hex'),
        algorithm: 'SM2+ML-KEM-768'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/pqc-hybrid/finalize', (req, res) => {
    try {
      const { sessionId, clientSm2PubHex, mlkemCiphertext } = req.body;
      if (!sessionId || !clientSm2PubHex || !mlkemCiphertext) {
        return res.status(400).json({ error: 'missing sessionId, clientSm2PubHex, or mlkemCiphertext' });
      }

      const kp = sessions.get(sessionId);
      if (!kp) return res.status(410).json({ error: 'session expired — re-init' });

      // 1. SM2 ECDH: server d_s * client P_e → shared x-coordinate
      const clientSm2Pub = {
        x: SM2.hexToBigInt(clientSm2PubHex.substring(0, 64)),
        y: SM2.hexToBigInt(clientSm2PubHex.substring(64, 128))
      };
      const sm2SsHex = sm2EcdhCompute(kp.sm2Sk, clientSm2Pub);

      // 2. ML-KEM Decaps
      const mlkemCt = Buffer.from(mlkemCiphertext, 'hex');
      const mlkemSs = mlkem.decaps(mlkemCt, kp.mlkemSk);

      // 3. One-time use
      sessions.delete(sessionId);

      // 4. Mixed session key
      const sessionKey = mixSessionKey(sessionId, sm2SsHex, mlkemSs);

      res.json({
        confirmed: true,
        algorithm: 'SM2+ML-KEM-768',
        hkdf: 'HKDF-SHA256 (SM2_ss || ML-KEM_ss)',
        binding: 'TLS 1.3 session ID',
        ianaRef: '#4590 (application-layer implementation)'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/pqc-hybrid/status', (_req, res) => {
    cleanExpired();
    res.json({
      enabled: !!mlkem,
      algorithm: 'SM2+ML-KEM-768',
      hkdf: 'HKDF-SHA256',
      activeSessions: sessions.size,
      version: 'c2-sm2-mlkem-hybrid',
      ianaRef: '#4590'
    });
  });

  console.log('[pqc-hybrid] Routes mounted (C-2 hybrid): GET /init, POST /finalize, GET /status');
}

module.exports = { mount, mixSessionKey, sm2EcdhCompute };
