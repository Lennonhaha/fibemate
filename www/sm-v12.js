// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE SessionManager v1.0
 * ==========================================
 * 缂備胶鍠嶇粩瀛樺濮樺磭妯堢紒鐙呯磿閹﹦浠?闁?閻忓繋娴囬ˉ?X3DH + PQ 婵烇絽鍢查幃搴ㄥ箵閳╁啫顤?+ Double Ratchet
 * 
 * 閻犱焦宕橀鎼佸储閻斿嘲鐏熼柨? *   1. 閻犲鍟伴弫銈夊棘鐟欏嫭锟ラ梻鍥ｅ亾闁活厹鍎垫禍楣冨箵閳╁啫顤佺紓浣告婵☆參鏁嶉崸鏄籭tiate/respond/complete 闁告劕鎳橀崕鎾嚊椤忓嫬袟閻庣懓鏈崹姘舵晬? *   2. Session 閻庣數顢婇挅鍕箹閸濆嫮鏁ㄩ悗鐟版湰閺嗭綁宕楅崘褌绻嗛柟顓у灲缁辨獑ipherSuite / pqEnabled / ratchetSteps / lastActive / degradeReason闁? *   3. 濞存粌顑勫▎銏°仚閸楃偛袟闁?established' | 'ratchet-step' | 'degraded' | 'expired' | 'pq-enabled' | 'pq-failed'
 *   4. 闁告碍鍨甸幃妤呭礂閻撳寒鍟囬柨娑欑煯缁楀鎯嶉弶鎴炵稁闁绘粎澧楀﹢?MessageCrypto API
 *
 * 濞撴碍绻嗙粋鍡涙晬? *   - window.DoubleRatchet闁挎稑鐗嗘慨鐐存姜?double-ratchet.js闁? *   - window.MLKEM768闁挎稑鐗嗚ぐ鏌ユ焻婢舵稓绀夐柛鏃傚Ь濞?kyber_nt_v3.js闁? *   - IndexedDB闁挎稑鐗撻埀顒佷亢缁?MessageCrypto.initDB 闁告帗绻傞～鎰板礌閺嶇數绀? */

const SessionManager = (() => {
  'use strict';

  // ---- 濞撴碍绻嗙粋鍡椢涢埀顒勫蓟?----
  function requireDoubleRatchet() {
    if (!window.DoubleRatchet) throw new Error('[SessionManager] DoubleRatchet not loaded');
    return window.DoubleRatchet;
  }
  function getMLKEM() {
    return window.MLKEM768 || null;
  }

  // ---- Session 闁稿繐鍟╂穱濠囧箒椤栨凹鍤犻悹?----
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

  // ---- 濞存粌顑勫▎銏㈠寲閼姐倗鍩?----
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

  // ---- IndexedDB 闁归晲妞掔粻娆撳礌?schema v2 ----
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

  // ---- 闁告劕鎳庨悺銊х磽閹惧磭鎽?+ 閺夆晜鍔橀、鎴﹀籍?Session 閻庣數顢婇挅?----
  // _sessions: peerId 闁?{ drState, meta, createdAt }
  const _sessions = new Map();

  // ---- 闁哄秶顭堢缓楣冩晬濮?DH + PQ 婵烇絽鍢查幃搴ㄥ箵閳╁啫顤侀柨娑樼墕閸炴挳鏌堥…鎺旂 ----

  /**
   * 闁告瑦鍨奸幑锝嗙閻氬绀凙lice闁挎稑顦弲鍫曟晬濮橆剙绲洪悹褔鏀辫ぐ娆撳箥鐎ｅ墎绀夐弶鈺傛煥濞?{ identityPublic, ephemeralPublic, pqPk? }
   * 濞?WebSocket 婵炴垵鐗婃导鍛磼閸曨噮妫呭ù锝堟硶閺?   */
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
   * 闁告繂绉寸花鏌ュ棘閻у摜绀凚ob闁挎稑顦弲鍫曟晬濮橆厽鏆柛?Alice 闁汇劌瀚ぐ娆撳箥鐎ｎ収鍤炴慨鐟板亰缁辨繄鎷嬮敍鍕毈 shared secret闁挎稑鑻悾顒勫箣?Double Ratchet 闁告帗绻傞～鎰板礌?   * 閺夆晜鏌ㄥú?{ identityPublic, publicKey, signedPreKeyPublic, ephemeralPublic, pqCt?, pqEnabled }
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
   * 闁告瑦鍨奸幑锝嗙閻氬绀凙lice闁挎稑顦弲鍫曟晬濮橆厽鏆柛?Bob 闁汇劌瀚幖閿嬫償閺冩挾绀夐悗鐟版湰閸ㄦ岸骞撻埄鍐杹
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

  // ---- 闁稿浚鍓欓崣?API ----

  /**
   * 闁告帗绋戠紓?闁告瑦鍨奸幑锝嗗濮樺磭妯堥柨娑樼墕瑜板倻鎸ч摎鍌涚溄濞撴皜宥囩
   * 闁告劕鎳橀崕瀵糕偓鐟版湰閸?X3DH+PQ 闁圭儵鍓濇晶婊堝矗閸屾稒娈堕柣銏㈠枑閸?   * 閺夆晜鏌ㄥú鏍箵閳╁啫顤佹繛鎴濈墛娴煎懐鎷归悢缁樼グ闁挎稑鐬奸弫杈╂嫬閸愵亝鏆忛柡鍌氱秺閳ь剚淇虹换?WebSocket 闁告瑦鍨块埀?   *
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
   * 闁规亽鍎辫ぐ鍫ュ箵閳╁啫顤侀柨娑樼墕閹奸攱鎯旈弮鈧弻鐔哥瑹瑜濈槐?   * 閻犲鍟伴弫銈夊棘鐟欏嫭鏆柛?WebSocket 闁圭儵鍓濇晶婊冣槈閸喍绱栭柛姘唉閻ㄧ喖鎮介妸锔诲妰闁告垼濮ら弳?   *
   * @param {string} peerId
   * @param {number[]} aliceIdentityPublic
   * @param {number[]} aliceEphemeralPublic
   * @param {number[]} [alicePQPublic]
   * @returns {Promise<object>} { identityPublic, signedPreKeyPublic, pqCt?, pqEnabled }
   */
  async function acceptSession(peerId, aliceIdentityPublic, aliceEphemeralPublic, alicePQPublic) {
    if (_sessions.has(peerId)) {
      console.warn(`[SessionManager] Session already exists for ${peerId}, overwriting.`);
    }
    return await _respondHandshake(peerId, aliceIdentityPublic, aliceEphemeralPublic, alicePQPublic);
  }

  /**
   * 閻庣懓鏈崹姘濮樺磭妯堢€点倛娅ｉ悵娑㈡晬閸繂绲洪悹褑娓瑰Ч澶嬬瑹瑜濈槐婵嬪绩鐠哄搫鐓?Bob 闁告繂绉寸花鏌ュ触鎼搭垳绀?   *
   * @param {string} peerId
   * @param {number[]} bobIdentityPublic
   * @param {number[]} bobSignedPreKeyPublic
   * @param {number[]} [bobPQCiphertext]
   * @returns {Promise<object>} { pqEnabled }
   */
  async function finalizeSession(peerId, bobIdentityPublic, bobSignedPreKeyPublic, bobPQCiphertext) {
    const result = await _completeHandshake(peerId, bobIdentityPublic, bobSignedPreKeyPublic, bobPQCiphertext);
    // 濠碘€冲€归悘?degraded=true闁挎稑鐬煎ú鍧楀箳閵夆斁鍋撹箛搴ｇ倞闁挎稑濂旂粭澶愬礆濞戞绱?session
    if (result.degraded) {
      return result;
    }
    return { pqEnabled: result.pqEnabled };
  }

  /**
   * 闁告梻濮撮惁鎴濃槈閸喍绱?   *
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
   * 閻熸瑱绲介惁鎴濃槈閸喍绱?   *
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
   * 闁兼儳鍢茶ぐ鍥ㄥ濮樺磭妯堥柣妯垮煐閳ь兛绀侀幓鈺呮偂?   *
   * @param {string} peerId
   * @returns {Promise<object|null>}
   */
  async function getSessionStatus(peerId) {
    const record = await _loadRecord(peerId);
    if (!record) return null;
    return makeSessionInfo(peerId, record.meta);
  }

  /**
   * 婵☆偀鍋撻柡灞诲劙缁辨壆鎷犲┑鍥ㄐ﹂柛姘剧畱閻°劑宕?   *
   * @param {string} peerId
   * @returns {Promise<boolean>}
   */
  async function hasSession(peerId) {
    return (await getSessionStatus(peerId)) !== null;
  }

  /**
   * 闁告帞濞€濞呭孩瀵煎宕囨▓
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
   * 婵炴挸鎳樺▍搴ㄥ箥閳ь剟寮垫径濠勭濠㈣泛瀚幃濠囨儍閸曨剙缍戦柟闈涱儜缁辨┒ebSocket 闁哄偆鍘鹃崵搴ㄥ籍閹壆娈堕柣銏╃厜缁?   */
  function clearPending() {
    for (const key of _sessions.keys()) {
      if (key.startsWith('_pending_')) _sessions.delete(key);
    }
    console.log('[SessionManager] Cleared pending handshakes');
  }

  /**
   * 闁告帗顨呴崵顓㈠箥閳ь剟寮垫径澶岀獥閻?peerId
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

  // ---- 濞存粌顑勫▎?API ----
  // 闁衡偓椤栨稑鐦柣?events: 'established', 'ratchet-step', 'degraded', 'expired', 'pq-enabled', 'pq-failed'

  // ---- 闁告碍鍨甸幃妤呭礂閻撳寒鍟囨俊妞煎劜鐢挳鏁嶉崼婊呯憹闁煎浜滄慨鈺冩啺閸℃瑦纾伴柨娑樼灱閺佽鲸娼绘担鐩掆晠鎳樺顓熸嫳闁哄嫭鍎崇槐锛勬嫬閸愵亝鏆忛柨?---
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

  // ---- 閻庣數鍘ч崵?----
  return {
    createSession,
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
