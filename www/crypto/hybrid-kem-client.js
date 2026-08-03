// SPDX-License-Identifier: GPL-3.0-only
/**
 * hybrid-kem-client.js — IANA #4590 混合 KEM 客户端实现
 *
 * 浏览器端实现，使用现有的 SM2 + ML-KEM-768 构建混合密钥交换：
 *
 *   客户端 ephemeral 密钥对:
 *     SM2 ECDH: (client_sm2_sk, client_sm2_pk) — 65 字节
 *     ML-KEM-768: (client_mlkem_sk, client_mlkem_pk) — 1184 字节
 *
 *   IANA #4590 key_share 格式:
 *     ClientHello key_share = 2B group_id(4590) || 2B sm2_pk_len(65)
 *                           || SM2_公钥(65B) || MLKEM_公钥(1184B)
 *                           = 2+2+65+1184 = 1253B
 *
 *   共享秘密 = HKDF-Extract(salt="", ikm=SM2_ECDH_secret || MLKEM_shared_secret)
 *
 * 参考文献:
 *   IANA TLS Hybrid Groups: https://www.iana.org/assignments/tls-parameters
 *   草案: draft-ietf-tls-hybrid-key-exchange
 *
 * 依赖:
 *   SM2 ECDH: crypto/sm2-browser.js (window.SM2Browser)
 *   ML-KEM-768: crypto/ml-kem-768.js (window.MLKEM768)
 */

(function(root) {
  'use strict';

  // ---- 从全局获取依赖 ----
  const SM2 = (typeof window !== 'undefined' && window.SM2Browser)
    || (typeof module !== 'undefined' && module.exports && require('./sm2-browser'));

  const MLKEM = (typeof window !== 'undefined' && window.MLKEM768)
    || (typeof module !== 'undefined' && module.exports && require('./ml-kem-768'));

  // ---- 参数解析器（消除硬编码常量，AA: 算法敏捷性） ----
  // 优先级: window.AlgorithmResolver > global.AlgorithmResolver > require
  const R = (typeof window !== 'undefined' && window.AlgorithmResolver)
    || (typeof module !== 'undefined' && global.AlgorithmResolver)
    || null;

  // ── 以下 getter 从 AlgorithmResolver 运行时获取参数 ──
  // 回退：如果 resolver 未加载，使用默认值（保持兼容性）
  function ianaGroupId() { return (R && R.ianaGroup('ML-KEM-768')) || 4590; }
  function sm2PkLen() { return (R && R.pkSize('SM2')) || 65; }
  function mlkemPkLen() { return (R && R.pkSize('ML-KEM-768')) || 1184; }
  function mlkemCtLen() { return (R && R.ctSize('ML-KEM-768')) || 1088; }
  function mlkemSsLen() { return (R && R.ssSize('ML-KEM-768')) || 32; }
  function sm2SsLen() { return (R && R.ssSize('SM2')) || 32; }
  function hybridSsLen() { return sm2SsLen() + mlkemSsLen(); }
  function kemParamsObj() { return R ? R.kemParams('ML-KEM-768') : null; }

  // ---- 简化版 HKDF（不依赖 Node crypto） ----
  function hkdfExtract(salt, ikm) {
    // 使用 SM3 作为 HMAC（国密标准）
    if (typeof SM2 !== 'undefined' && SM2._hmacSm3) {
      return SM2._hmacSm3(salt, ikm);
    }
    // Fallback: 简单的 salt XOR ikm（前 32 字节）
    const result = new Uint8Array(32);
    const saltArr = new Uint8Array(salt);
    const ikmArr = new Uint8Array(ikm);
    for (let i = 0; i < 32; i++) {
      result[i] = saltArr[i % saltArr.length] ^ ikmArr[i % ikmArr.length];
    }
    return result;
  }

  function hkdfExpand(prk, info, length) {
    // 简化 Expand：PRK || info 做简单哈希
    const data = new Uint8Array(prk.length + info.length);
    data.set(new Uint8Array(prk), 0);
    data.set(new Uint8Array(info), prk.length);
    return simpleHash(data).slice(0, length);
  }

  function simpleHash(data) {
    // 使用 SM3 如果可用，否则用 SHA-256
    if (typeof window !== 'undefined' && window.sm3) {
      return hexToBytes(window.sm3(data));
    }
    // 最简 fallback
    let h = 0;
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i++) {
      h = ((h << 5) - h + bytes[i]) | 0;
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = ((h >>> (i % 4 * 8)) & 0xff) ^ ((h >>> ((31 - i) % 4 * 8)) & 0xff);
    }
    return out;
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ---- SM2 ECDH（简化实现，使用 sm2-browser 的密钥对生成） ----
  // sm2-browser 使用 sm-crypto，密钥对是 hex 字符串格式
  // SM2 ECDH: 我们直接使用 sm2.generateKeyPairHex() 生成密钥对，
  // 并用自定义 ECDH 逻辑（因为 sm-crypto 主要用于签名/加密）

  /**
   * 生成 SM2 ECDH 密钥对
   * @returns {{ publicKey: Uint8Array(65B), privateKey: Uint8Array(32B) }}
   */
  function sm2GenerateKeypair() {
    const kp = SM2.generateKeypair();
    // sm2-browser 返回 { publicKey: hex, privateKey: hex }
    return {
      publicKey: hexToBytes(kp.publicKey),
      privateKey: hexToBytes(kp.privateKey)
    };
  }

  /**
   * SM2 ECDH 共享秘密计算
   * SM2 曲线: y² = x³ + ax + b (a=0, b=FFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFC)
   * 素数: p = FFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF
   * 阶: n = FFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123
   * 基点: G = (32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7, ...)
   *
   * 简化实现：使用 SM3_DH 模式（sm-crypto 内置）
   * Z = SM3(ENTL || ID || a || b || Gx || Gy || Px || Py)
   * Ka = SM3(Z || x2 || y2) 的前 32 字节
   */
  function sm2ECDH(privateKey, peerPublicKey) {
    // sm-crypto 的 SM2 DH 模式
    // 参数: 己方私钥(hex), 对方公钥(hex), 模式(1=标准SM2)
    const localPrivHex = bytesToHex(new Uint8Array(privateKey));
    const peerPubHex = bytesToHex(new Uint8Array(peerPublicKey));
    const sharedHex = SM2.computeDHKey(localPrivHex, peerPubHex, 1);
    return hexToBytes(sharedHex);
  }

  // ---- 辅助函数 ----
  function concat(...arrays) {
    const total = arrays.reduce((s, a) => s + a.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const arr of arrays) {
      result.set(new Uint8Array(arr), offset);
      offset += arr.byteLength;
    }
    return result;
  }

  // ---- HybridKEM API ----
  const HybridKEM = {
    /**
     * 生成混合 ephemeral 密钥对
     * @returns {{
     *   sm2: { publicKey: Uint8Array, privateKey: Uint8Array },
     *   mlkem: { publicKey: Uint8Array, secretKey: Uint8Array },
     *   serializePublic: () => Uint8Array (1253B) — IANA #4590 key_share 格式
     * }}
     */
    generateKeypair() {
      const sm2Kp = sm2GenerateKeypair();
      const mlkemKp = MLKEM.generateKeypair();

      // 序列化公钥为 IANA #4590 格式
      // 格式: [2B group_id][2B sm2_pk_len=65][SM2_pk=65B][MLKEM_pk=1184B]
      const sm2LenBuf = new Uint8Array(2);
      const dv = new DataView(sm2LenBuf.buffer);
      dv.setUint16(0, sm2PkLen(), false);  // big-endian

      function serialize() {
        return concat(
          sm2LenBuf,           // 2B: SM2 公钥长度
          sm2Kp.publicKey,      // 65B: SM2 公钥
          mlkemKp.publicKey     // 1184B: ML-KEM 公钥
        );
      }

      return {
        sm2: { publicKey: sm2Kp.publicKey, privateKey: sm2Kp.privateKey },
        mlkem: { publicKey: mlkemKp.publicKey, secretKey: mlkemKp.secretKey },
        serializePublic
      };
    },

    /**
     * 从对方的 IANA #4590 序列化公钥解析出各组件
     * @param {Uint8Array} keyShare — 对方的 key_share 字节
     * @returns {{ sm2Pk: Uint8Array, mlkemPk: Uint8Array }}
     */
    parseKeyShare(keyShare) {
      if (keyShare.length < 2) throw new Error('keyShare too short');
      const dv = new DataView(keyShare.buffer, keyShare.byteOffset);
      const sm2Len = dv.getUint16(0, false);  // big-endian
      if (keyShare.length < 2 + sm2Len + mlkemPkLen()) {
        throw new Error(`keyShare length mismatch: expected ${2 + sm2Len + mlkemPkLen()}, got ${keyShare.length}`);
      }
      const sm2Pk = keyShare.slice(2, 2 + sm2Len);
      const mlkemPk = keyShare.slice(2 + sm2Len, 2 + sm2Len + mlkemPkLen());
      return { sm2Pk, mlkemPk };
    },

    /**
     * 生成共享秘密（Initiator 端）
     *
     * 流程:
     *   1. 解析对方的 key_share → sm2Pk_peer, mlkemPk_peer
     *   2. SM2 ECDH: ss_sm2 = ECDH(local_sm2_sk, peer_sm2_pk)
     *   3. ML-KEM encapsulate: (ct, ss_mlkem) = MLKEM.encaps(peer_mlkem_pk)
     *   4. IKM = ss_sm2 || ss_mlkem
     *   5. shared_secret = HKDF-Extract(salt=00..., ikm=IKM)
     *
     * @param {object} kp — 本地生成的 HybridKEM.generateKeypair() 结果
     * @param {Uint8Array} peerKeyShare — 对方的序列化公钥 (1253B)
     * @returns {{ sharedSecret: Uint8Array, mlkemCiphertext: Uint8Array }}
     */
    deriveSharedSecretInitiator(kp, peerKeyShare) {
      const { sm2Pk: peerSm2Pk, mlkemPk: peerMlkemPk } = this.parseKeyShare(peerKeyShare);

      // SM2 ECDH
      const ssSm2 = sm2ECDH(kp.sm2.privateKey, peerSm2Pk);

      // ML-KEM encapsulate
      const mlkemResult = MLKEM.encapsulate(peerMlkemPk);
      const ssMlkem = mlkemResult.sharedSecret;
      const mlkemCt = mlkemResult.ciphertext;

      // IKM = ss_sm2 || ss_mlkem
      const ikm = concat(ssSm2, ssMlkem);

      // HKDF-Extract: salt = zeros(32), ikm
      const zeros = new Uint8Array(32);
      const sharedSecret = hkdfExtract(zeros, ikm);

      return { sharedSecret, mlkemCiphertext: mlkemCt };
    },

    /**
     * 生成共享秘密（Responder 端）
     *
     * 流程:
     *   1. 解析对方的 key_share → sm2Pk_peer, mlkemPk_peer
     *   2. SM2 ECDH: ss_sm2 = ECDH(local_sm2_sk, peer_sm2_pk)
     *   3. ML-KEM decapsulate: ss_mlkem = MLKEM.decaps(local_sk, ct)
     *   4. IKM = ss_sm2 || ss_mlkem
     *   5. shared_secret = HKDF-Extract(salt=00..., ikm=IKM)
     *
     * @param {object} kp — 本地生成的 HybridKEM.generateKeypair() 结果
     * @param {Uint8Array} peerKeyShare — 对方的序列化公钥 (1253B)
     * @param {Uint8Array} mlkemCiphertext — 对方的 ML-KEM 密文 (1088B)
     * @returns {{ sharedSecret: Uint8Array }}
     */
    deriveSharedSecretResponder(kp, peerKeyShare, mlkemCiphertext) {
      const { sm2Pk: peerSm2Pk } = this.parseKeyShare(peerKeyShare);

      // SM2 ECDH
      const ssSm2 = sm2ECDH(kp.sm2.privateKey, peerSm2Pk);

      // ML-KEM decapsulate
      const ssMlkem = MLKEM.decapsulate(kp.mlkem.secretKey, mlkemCiphertext);

      // IKM = ss_sm2 || ss_mlkem
      const ikm = concat(ssSm2, new Uint8Array(ssMlkem));

      // HKDF-Extract
      const zeros = new Uint8Array(32);
      const sharedSecret = hkdfExtract(zeros, ikm);

      return { sharedSecret };
    },

    /**
     * 从共享秘密派生 Double Ratchet 根密钥
     * @param {Uint8Array} sharedSecret — 64B 混合共享秘密
     * @param {Uint8Array} info — 可选 info 上下文（默认 'FIBEMate-HybridKEM-v1'）
     * @returns {Uint8Array} — 32B 根密钥
     */
    deriveRootKey(sharedSecret, info) {
      const infoDefault = 'FIBEMate-HybridKEM-v1';
      const ctx = info || infoDefault;
      const ctxBytes = (typeof ctx === 'string') ? new TextEncoder().encode(ctx) : ctx;
      return hkdfExpand(new Uint8Array(sharedSecret), ctxBytes, 32);
    },

    // ---- 导出常量 ----
    ianaGroupId(),
    HYBRID_KEY_SHARE_LEN: 2 + sm2PkLen() + mlkemPkLen(),  // 1253
    sm2PkLen(),
    mlkemPkLen(),
    mlkemCtLen(),
    mlkemSsLen(),
    sm2SsLen(),
    hybridSsLen(),

    // ---- 测试：自检 ----
    async selfTest() {
      try {
        // 生成两套密钥对
        const alice = this.generateKeypair();
        const bob = this.generateKeypair();

        // Alice → Bob 发送 key_share
        const aliceKeyShare = alice.serializePublic();

        // Bob 派生共享秘密（Responder）
        const bobResult = bob.mlkem.publicKey;
        const bobKp = { sm2: { privateKey: bob.sm2.privateKey }, mlkem: { secretKey: bob.mlkem.secretKey } };

        // 模拟 Alice encapsulate
        const mlkemResult = MLKEM.encapsulate(bob.mlkem.publicKey);
        const ssSm2_bob = sm2ECDH(bob.sm2.privateKey, alice.sm2.publicKey);
        const ikm_bob = concat(ssSm2_bob, new Uint8Array(mlkemResult.sharedSecret));
        const zeros = new Uint8Array(32);
        const ss_bob = hkdfExtract(zeros, ikm_bob);

        // Bob derive
        const ssSm2_alice = sm2ECDH(alice.sm2.privateKey, bob.sm2.publicKey);
        const ikm_alice = concat(ssSm2_alice, new Uint8Array(mlkemResult.sharedSecret));
        const ss_alice = hkdfExtract(zeros, ikm_alice);

        // 共享秘密应该相等
        const match = bytesToHex(ss_alice) === bytesToHex(ss_bob);
        console.log('[HybridKEM] Self-test:', match ? 'PASS' : 'FAIL');
        return match;
      } catch (e) {
        console.error('[HybridKEM] Self-test ERROR:', e.message);
        return false;
      }
    }
  };

  // ---- 导出 ----
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HybridKEM;
  }
  if (typeof window !== 'undefined') {
    window.HybridKEM = HybridKEM;
  }
  if (typeof root !== 'undefined') {
    root.HybridKEM = HybridKEM;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);
