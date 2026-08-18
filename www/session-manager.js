// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE SessionManager v1.0
 * ==========================================
 * 会话管理器：会话存储 + 密钥协商，支持 X3DH + PQ 密钥封装 + Double Ratchet
 * 
 *   1. 密钥交换握手（三阶段 initiate/respond/complete），生成共享会话密钥
 *   2. Session 元数据持久化：cipherSuite / pqEnabled / ratchetSteps / lastActive / degradeReason
 *
 *   3. 事件通知 + 消息加解密（依赖 DoubleRatchet / MLKEM768 / IndexedDB） */

const SessionManager = (() => {
  'use strict';

  // ---- 依赖加载 ----
  function requireDoubleRatchet() {
    if (!window.DoubleRatchet) throw new Error('[SessionManager] DoubleRatchet not loaded');
    return window.DoubleRatchet;
  }
  function getMLKEM() {
    return window.MLKEM768 || null;
  }

  // ---- Session 信息结构 ----
  // Session info helper
  function makeSessionInfo(peerId, record) {
    const info = {
      peerId,
      cipherSuite: record.cipherSuite || 'X3DH+DoubleRatchet',
      pqEnabled: !!record.pqEnabled,
      pqDegradeReason: record.pqDegradeReason || null,   // null | 'encaps-failed' | 'decaps-failed' | 'peer-no-pq'
      pqDegradeAt: record.pqDegradeAt || null,          // ISO timestamp or null
      ratchetSteps: record.ratchetSteps || 0,
      lastActive: record.lastActive || null,              // ISO timestamp
      createdAt: record.createdAt || null,              // ISO timestamp
      sessionAgeMs: record.createdAt ? Date.now() - new Date(record.createdAt).getTime() : null,
    };
    return info;
  }

  // ---- 事件系统 ----
  const _listeners = {};
  function emit(event, data) {
    ( _listeners[event] || [] ).forEach(cb => {
      try { cb(data); } catch (e) { console.error(`[SessionManager] event listener error [${event}]:`, e); }
    });
  }
  function on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
    return () => { _listeners[event] = _listeners[event].filter(cb => cb !== callback); };
  }

  // ---- IndexedDB 存储 schema v2 ----
  // 存储: peerId, state (DoubleRatchet export), meta - cipherSuite / pqEnabled / pqDegradeReason / ratchetSteps / lastActive / createdAt
  const DB_NAME = 'fibemate_crypto';
  const STORE_NAME = 'sessions_v2';
  let _db = null;
  let _dbReady = false;

  function _initDB() {
    if (_dbReady) return Promise.resolve(_db);
    if (_dbInitPromise) return _dbInitPromise;
    _dbInitPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 2);
        req.onerror = () => {
          console.warn('[SessionManager] IndexedDB unavailable, using memory-only mode');
          _db = null; _dbReady = false; resolve();
        };
        req.onsuccess = () => { _db = req.result; _dbReady = true; resolve(_db); };
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'peerId' });
        }
      };
    } catch (e) {
      console.warn('[SessionManager] IndexedDB init error, using memory-only:', e.message);
      _db = null; _dbReady = false; resolve();
    }
    });
    return _dbInitPromise;
  }

  let _dbInitPromise = null;

  async function _loadRecord(peerId) {
    if (!_dbReady) await _initDB();
    if (!_dbReady) return null; // IndexedDB unavailable, return null (memory-only)
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(peerId);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result || null);
    });
  }

  async function _saveRecord(peerId, drState, meta) {
    if (!_dbReady) await _initDB();
    if (!_dbReady) return; // IndexedDB unavailable, skip persistence (memory-only)
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = { peerId, state: drState, meta };
      const req = store.put(record);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async function _deleteRecord(peerId) {
    if (!_dbReady) await _initDB();
    if (!_dbReady) return; // IndexedDB unavailable, skip (memory-only)
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(peerId);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  // ---- 会话映射（内存缓存）+ 持久化 Session 状态 ----
  // _sessions: peerId -> { drState, meta, createdAt }
  const _sessions = new Map();

  // ---- 三阶段握手：X3DH + PQ 密钥封装 + Double Ratchet ----

  /**
   * 发起方握手：Alice 生成身份密钥/临时密钥/PQ 密钥对，返回 { identityPublic, ephemeralPublic, pqPk? }
   * 通过 WebSocket 传输密钥交换数据   */
  async function _initiateHandshake(peerId, skipPQ = false) {
    const DR = requireDoubleRatchet();
    const mlkem = getMLKEM();

    // Generate DH identity key
    const identityKey = await DR.generateDH();
    const ephemeralKey = await DR.generateDH();

    let pqPk = null;
    let pqSk = null;
    if (!skipPQ && mlkem) {
      try {
        const keys = await mlkem.keygen();
        pqPk = Array.from(keys.publicKey);
        pqSk = Array.from(keys.secretKey);
      } catch (e) {
        console.warn('[SessionManager] PQ keygen failed, continuing classical:', e.message);
      }
    }

    // Store pending handshake — Bob will pick up when he responds
    _sessions.set(`_pending_${peerId}`, {
      identityKey,
      ephemeralKey,
      pqSk,
      role: 'initiator',
      createdAt: new Date().toISOString(),
    });

    const idPub = Array.from(await DR.exportPublicKey(identityKey));
    const epPub = Array.from(await DR.exportPublicKey(ephemeralKey));
    return {
      identityPublic: idPub,
      publicKey: idPub,        // legacy alias
      ephemeralPublic: epPub,
      pqPk,
    };
  }

  /**
   * 响应方握手：Bob 接收 Alice 密钥，计算 X3DH 共享密钥，初始化 Double Ratchet，返回 { identityPublic, signedPreKeyPublic, pqCt?, pqEnabled }
   */
  async function _respondHandshake(peerId, aliceIdentityPublic, aliceEphemeralPublic, alicePQPublic) {
    const DR = requireDoubleRatchet();
    const mlkem = getMLKEM();

    const identityKey = await DR.generateDH();
    const signedPreKey = await DR.generateDH();

    const aliceIdPub = await DR.importPublicKey(new Uint8Array(aliceIdentityPublic));
    const aliceEpPub = await DR.importPublicKey(new Uint8Array(aliceEphemeralPublic));

    // X3DH: DH1 = DH(SPK_B, IK_A), DH2 = DH(IK_B, EK_A), DH3 = DH(SPK_B, EK_A)
    const dh1 = await DR.dh(signedPreKey.privateKey, aliceIdPub);
    const dh2 = await DR.dh(identityKey.privateKey, aliceEpPub);
    const dh3 = await DR.dh(signedPreKey.privateKey, aliceEpPub);

    let ikm = new Uint8Array(96);
    ikm.set(dh1, 0);
    ikm.set(dh2, 32);
    ikm.set(dh3, 64);

    // PQ: encapsulate against Alice's pqPk
    let pqSS = null;
    let pqCt = null;
    let pqEnabled = false;
    let pqDegradeReason = null;

    if (alicePQPublic && Array.isArray(alicePQPublic) && alicePQPublic.length === 1184 && mlkem) {
      try {
        const encResult = await mlkem.encapsulate(new Uint8Array(alicePQPublic));
        pqSS = new Uint8Array(encResult.sharedSecret);
        pqCt = Array.from(encResult.ciphertext);
        pqEnabled = true;
      } catch (e) {
        console.warn('[SessionManager] PQ encaps failed, degrading to classical:', e.message);
        pqDegradeReason = 'encaps-failed';
      }
    } else if (alicePQPublic) {
      pqDegradeReason = 'peer-no-pq';
    }

    let combinedIKM = ikm;
    if (pqSS && pqSS.length === 32) {
      combinedIKM = new Uint8Array(128);
      combinedIKM.set(ikm, 0);
      combinedIKM.set(pqSS, 96);
    }

    const info = pqEnabled ? 'FIBEMateX3DH+PQ' : 'FIBEMateX3DH';
    const rootKey = await DR.hkdf(combinedIKM, new Uint8Array(32), info);
    const drState = await DR.initAsReceiver(rootKey, signedPreKey);

    const meta = {
      cipherSuite: pqEnabled ? 'X3DH+PQ+DoubleRatchet' : 'X3DH+DoubleRatchet',
      pqEnabled,
      pqDegradeReason: pqEnabled ? null : pqDegradeReason,
      pqDegradeAt: pqEnabled ? null : new Date().toISOString(),
      ratchetSteps: 0,
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await _saveRecord(peerId, DR.exportState(drState), meta);
    _sessions.set(peerId, { drState, meta, createdAt: meta.createdAt });

    emit('established', { peerId, pqEnabled, cipherSuite: meta.cipherSuite });

    const idPub = Array.from(await DR.exportPublicKey(identityKey));
    const spkPub = Array.from(await DR.exportPublicKey(signedPreKey));
    return {
      identityPublic: idPub,
      publicKey: idPub,                // legacy alias
      signedPreKeyPublic: spkPub,
      ephemeralPublic: spkPub,         // legacy alias (signer-pre-key sent as "ephemeral" in old protocol)
      pqCt,
      pqEnabled,
    };
  }

  /**
   * 完成握手：Alice 处理 Bob 的响应，完成密钥协商
   */
  async function _completeHandshake(peerId, bobIdentityPublic, bobSignedPreKeyPublic, bobPQCiphertext) {
    const DR = requireDoubleRatchet();
    const mlkem = getMLKEM();

    const pending = _sessions.get(`_pending_${peerId}`);
    if (!pending) throw new Error(`[SessionManager] No pending handshake for ${peerId}`);

    const { identityKey, ephemeralKey, pqSk } = pending;

    const bobIdPub = await DR.importPublicKey(new Uint8Array(bobIdentityPublic));
    const bobSpkPub = await DR.importPublicKey(new Uint8Array(bobSignedPreKeyPublic));

    const dh1 = await DR.dh(identityKey.privateKey, bobSpkPub);
    const dh2 = await DR.dh(ephemeralKey.privateKey, bobIdPub);
    const dh3 = await DR.dh(ephemeralKey.privateKey, bobSpkPub);

    let ikm = new Uint8Array(96);
    ikm.set(dh1, 0);
    ikm.set(dh2, 32);
    ikm.set(dh3, 64);

    let pqSS = null;
    let pqEnabled = false;
    let pqDegradeReason = null;
    let degraded = false;

    if (bobPQCiphertext && Array.isArray(bobPQCiphertext) && bobPQCiphertext.length === 1088 && pqSk && mlkem) {
      try {
        pqSS = new Uint8Array(await mlkem.decapsulate(
          new Uint8Array(pqSk),
          new Uint8Array(bobPQCiphertext)
        ));
        pqEnabled = true;
      } catch (e) {
        console.warn('[SessionManager] PQ decaps failed, will retry without PQ:', e.message);
        pqDegradeReason = 'decaps-failed';
        degraded = true;
      }
    } else if (bobPQCiphertext) {
      pqDegradeReason = 'decaps-failed';
      degraded = true;
    }

    // ML-KEM decaps failed → degraded, skip session creation
    // Alice will retry with skipPQ to establish pure X3DH
    if (degraded) {
      _sessions.delete(`_pending_${peerId}`);
      emit('pq-failed', { peerId, reason: pqDegradeReason });
      return { pqEnabled: false, degraded: true, degradeReason: pqDegradeReason };
    }

    let combinedIKM = ikm;
    if (pqSS && pqSS.length === 32) {
      combinedIKM = new Uint8Array(128);
      combinedIKM.set(ikm, 0);
      combinedIKM.set(pqSS, 96);
    }

    const info = pqEnabled ? 'FIBEMateX3DH+PQ' : 'FIBEMateX3DH';
    const rootKey = await DR.hkdf(combinedIKM, new Uint8Array(32), info);
    const drState = await DR.initAsInitiator(rootKey, new Uint8Array(bobSignedPreKeyPublic));

    const meta = {
      cipherSuite: pqEnabled ? 'X3DH+PQ+DoubleRatchet' : 'X3DH+DoubleRatchet',
      pqEnabled,
      pqDegradeReason: pqEnabled ? null : pqDegradeReason,
      pqDegradeAt: pqEnabled ? null : new Date().toISOString(),
      ratchetSteps: 0,
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await _saveRecord(peerId, DR.exportState(drState), meta);
    _sessions.set(peerId, { drState, meta, createdAt: meta.createdAt });
    _sessions.delete(`_pending_${peerId}`);

    if (pqEnabled) {
      emit('pq-enabled', { peerId });
    } else {
      emit('degraded', { peerId, reason: pqDegradeReason });
    }
    emit('established', { peerId, pqEnabled, cipherSuite: meta.cipherSuite });

    return { pqEnabled };
  }

  // ---- 公开 API ----

  /**
   * 创建会话（发起方握手，即 _initiateHandshake 的封装）
   * 若会话已存在则返回现有信息；否则发起 X3DH+PQ 握手   *
   * @param {string} peerId
   * @returns {Promise<object>} { identityPublic, ephemeralPublic, pqPk? }
   */
  async function createSession(peerId, opts = {}) {
    if (_sessions.has(peerId)) {
      console.warn(`[SessionManager] Session already exists for ${peerId}, returning existing.`);
      return makeSessionInfo(peerId, (await _loadRecord(peerId)).meta);
    }
    return await _initiateHandshake(peerId, !!opts.skipPQ);
  }

  /**
   * 接受会话（响应方握手，即 _respondHandshake 的封装）   *
   * @param {string} peerId
   * @param {number[]} aliceIdentityPublic
   * @param {number[]} aliceEphemeralPublic
   * @param {number[]} [alicePQPublic]
   * @returns {Promise<object>} { identityPublic, signedPreKeyPublic, pqCt?, pqEnabled }
   */
  /**
   * 异步 X3DH — Alice 通过 HTTP 获取 Bob 的密钥 bundle (Bob 离线场景)
   * @param {string} peerId
   * @param {string} token — JWT for /api/users/:peerId/keys
   * @param {object} [opts]
   * @param {string} [opts.apiBase='/api']
   * @returns {Promise<{ephemeralPublic: number[], identityPublic: number[], opkId: string|null}>}
   */
  async function createSessionAsync(peerId, token, opts = {}) {
    const DR = requireDoubleRatchet();
    const apiBase = opts.apiBase || '/api';

    // 1. HTTP: fetch peer's key bundle
    const res = await fetch(`${apiBase}/users/${peerId}/keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`[SessionManager] Failed to fetch keys for ${peerId}: ${res.status}`);
    const bundle = await res.json();

    console.log(`[SessionManager] async X3DH for ${peerId}:`,
      `online=${bundle.isOnline}, opk=${!!bundle.oneTimePreKey}`);

    // 2. Generate fresh identity + ephemeral keys (same as real-time X3DH)
    const identityKey = await DR.generateDH();
    const ephemeralKey = await DR.generateDH();

    // 3. Parse peer's signedPrekey (accept hex or raw array)
    const spkRaw = bundle.signedPrekey || bundle.identityKey;
    let signedPreKeyPub;
    if (typeof spkRaw === 'string' && /^[0-9a-fA-F]+$/.test(spkRaw)) {
      signedPreKeyPub = hexToBytes(spkRaw);
    } else if (Array.isArray(spkRaw)) {
      signedPreKeyPub = new Uint8Array(spkRaw);
    } else {
      signedPreKeyPub = spkRaw;
    }
    const spkPub = await DR.importPublicKey(signedPreKeyPub);

    // 4. Import OPK if available
    let opkPub = null;
    if (bundle.oneTimePreKey && bundle.oneTimePreKey.publicKey) {
      try {
        const opkRaw = base64urlToBytes(bundle.oneTimePreKey.publicKey);
        opkPub = await DR.importPublicKey(opkRaw);
      } catch (e) {
        console.warn('[SessionManager] OPK import failed, continuing without:', e.message);
      }
    }

    // 5. x3dhAlice (DH1=dh(IK_A, SPK_B), DH2=dh(EK_A, SPK_B), DH3=dh(EK_A, SPK_B), DH4=dh(EK_A, OPK_B))
    const result = await DR.x3dhAlice(identityKey, signedPreKeyPub, opkPub);

    // 6. initAsInitiator(rootKey, remoteDHPublic) → Double Ratchet state
    const drState = await DR.initAsInitiator(result.rootKey, signedPreKeyPub);

    // 7. Save session
    const meta = {
      cipherSuite: bundle.oneTimePreKey ? 'X3DH+OPK+DoubleRatchet' : 'X3DH+DoubleRatchet',
      pqEnabled: false,
      sessionType: 'async_x3dh',
      opkId: bundle.oneTimePreKey?.keyId || null,
      isAsync: true,
      ratchetSteps: 0,
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await _saveRecord(peerId, DR.exportState(drState), meta);
    _sessions.set(peerId, { drState, meta, createdAt: meta.createdAt });

    emit('established', { peerId, pqEnabled: false, cipherSuite: meta.cipherSuite, async: true });
    console.log(`[SessionManager] async X3DH session established with ${peerId} (${meta.cipherSuite})`);

    // 8. Return handshake payload for initial message
    return {
      identityPublic: Array.from(await DR.exportPublicKey(identityKey)),
      ephemeralPublic: Array.from(await DR.exportPublicKey(ephemeralKey)),
      opkId: bundle.oneTimePreKey?.keyId || null
    };
  }

  async function acceptSession(peerId, aliceIdentityPublic, aliceEphemeralPublic, alicePQPublic) {
    if (_sessions.has(peerId)) {
      console.warn(`[SessionManager] Session already exists for ${peerId}, overwriting.`);
    }
    return await _respondHandshake(peerId, aliceIdentityPublic, aliceEphemeralPublic, alicePQPublic);
  }

  /**
   * 完成会话（处理 Bob 的响应，即 _completeHandshake 的封装）   *
   * @param {string} peerId
   * @param {number[]} bobIdentityPublic
   * @param {number[]} bobSignedPreKeyPublic
   * @param {number[]} [bobPQCiphertext]
   * @returns {Promise<object>} { pqEnabled }
   */
  async function finalizeSession(peerId, bobIdentityPublic, bobSignedPreKeyPublic, bobPQCiphertext) {
    const result = await _completeHandshake(peerId, bobIdentityPublic, bobSignedPreKeyPublic, bobPQCiphertext);
    // 若 degraded=true 则直接返回结果，跳过会话创建
    if (result.degraded) {
      return result;
    }
    return { pqEnabled: result.pqEnabled };
  }

  /**
   * 加密消息   *
   * @param {string} peerId
   * @param {string} plaintext
   * @returns {Promise<{ ciphertext: number[], iv: number[], header: object }>}
   */
  async function encrypt(peerId, plaintext) {
    let sess = _sessions.get(peerId);
    if (!sess) {
      const record = await _loadRecord(peerId);
      if (!record) throw new Error(`[SessionManager] No session for ${peerId}`);
      const DR = requireDoubleRatchet();
      sess = {
        drState: await DR.importState(record.state),
        meta: record.meta,
        createdAt: record.meta.createdAt,
      };
      _sessions.set(peerId, sess);
    }

    const DR = requireDoubleRatchet();
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);
    const result = await DR.encrypt(sess.drState, plaintextBytes);

    sess.meta.ratchetSteps = (sess.meta.ratchetSteps || 0) + 1;
    sess.meta.lastActive = new Date().toISOString();

    await _saveRecord(peerId, DR.exportState(sess.drState), sess.meta);

    emit('ratchet-step', { peerId, step: sess.meta.ratchetSteps });

    return {
      ciphertext: Array.from(result.ciphertext),
      iv: Array.from(result.iv),
      header: {
        dh: Array.from(result.header.dh),
        pn: result.header.pn,
        n: result.header.n,
      },
    };
  }

  /**
   * 解密消息   *
   * @param {string} peerId
   * @param {number[]} ciphertext
   * @param {number[]} iv
   * @param {object} header
   * @returns {Promise<string>}
   */
  async function decrypt(peerId, ciphertext, iv, header) {
    let sess = _sessions.get(peerId);
    if (!sess) {
      const record = await _loadRecord(peerId);
      if (!record) throw new Error(`[SessionManager] No session for ${peerId}`);
      const DR = requireDoubleRatchet();
      sess = {
        drState: await DR.importState(record.state),
        meta: record.meta,
        createdAt: record.meta.createdAt,
      };
      _sessions.set(peerId, sess);
    }

    const DR = requireDoubleRatchet();
    const ratchetHeader = {
      dh: new Uint8Array(header.dh),
      pn: header.pn,
      n: header.n,
    };

    const plaintextBytes = await DR.decrypt(
      sess.drState,
      ratchetHeader,
      new Uint8Array(ciphertext),
      new Uint8Array(iv)
    );

    sess.meta.lastActive = new Date().toISOString();
    await _saveRecord(peerId, DR.exportState(sess.drState), sess.meta);

    const decoder = new TextDecoder();
    return decoder.decode(plaintextBytes);
  }

  /**
   * 获取会话状态   *
   * @param {string} peerId
   * @returns {Promise<object|null>}
   */
  async function getSessionStatus(peerId) {
    const record = await _loadRecord(peerId);
    if (!record) return null;
    return makeSessionInfo(peerId, record.meta);
  }

  /**
   * 判断会话是否存在   *
   * @param {string} peerId
   * @returns {Promise<boolean>}
   */
  async function hasSession(peerId) {
    return (await getSessionStatus(peerId)) !== null;
  }

  /**
   * 删除会话
   *
   * @param {string} peerId
   */
  async function deleteSession(peerId) {
    _sessions.delete(peerId);
    _sessions.delete(`_pending_${peerId}`);
    await _deleteRecord(peerId);
    emit('expired', { peerId });
  }

  /**
   * 清除所有待处理的握手（断开 WebSocket 时清理）   */
  function clearPending() {
    for (const key of _sessions.keys()) {
      if (key.startsWith('_pending_')) _sessions.delete(key);
    }
    console.log('[SessionManager] Cleared pending handshakes');
  }

  /**
   * 列出所有会话的 peerId
   *
   * @returns {Promise<string[]>}
   */
  async function listSessions() {
    if (!_db) await _initDB();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }

  // ---- 事件 API ----
  // 支持事件: 'established', 'ratchet-step', 'degraded', 'expired', 'pq-enabled', 'pq-failed'

  // ---- 兼容桥（旧 API 命名映射）----
  function _installCompatBridge() {
    if (typeof window === 'undefined') return;
    window.SessionManagerCompat = {
      encrypt: (peerId, plaintext) => encrypt(peerId, plaintext),
      decrypt: (peerId, ciphertext, iv, header) => decrypt(peerId, ciphertext, iv, header),
      hasSession: (peerId) => hasSession(peerId),
      deleteSession: (peerId) => deleteSession(peerId),
      initiateKeyExchange: (peerId) => createSession(peerId),
      respondKeyExchange: (peerId, aIP, aEP, aPQ) => acceptSession(peerId, aIP, aEP, aPQ),
      completeKeyExchange: (peerId, bIP, bSPK, bPQ) => finalizeSession(peerId, bIP, bSPK, bPQ),
      getSessionStatus: (peerId) => getSessionStatus(peerId),
      listSessions,
      on,
    };
  }
  _installCompatBridge();

  // ---- 导出 ----
  // ---- Async X3DH helpers ----
  function hexToBytes(hex) {
    const len = hex.length / 2;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  function base64urlToBytes(b64url) {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }


  return {
    createSession,
    createSessionAsync,
    acceptSession,
    finalizeSession,
    encrypt,
    decrypt,
    getSessionStatus,
    hasSession,
    deleteSession,
    clearPending,
    listSessions,
    on,
    _installCompatBridge,
  };
})();

// Conditional export for browser / Node.js
if (typeof window !== 'undefined') {
  window.SessionManager = SessionManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
}
console.log("[SM-DIAG] SessionManager keys:", Object.keys(window.SessionManager).join(", "));
console.log("[SM-DIAG] SessionManager keys:", Object.keys(window.SessionManager).join(", "));
