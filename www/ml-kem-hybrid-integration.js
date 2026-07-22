// SPDX-License-Identifier: GPL-3.0-only
/**
 * FibeMate ML-KEM-768 Hybrid X3DH Integration v2
 * Events: fibemate:pqready, fibemate:session:established, fibemate:session:failed
 */
(function() {
  'use strict';

  var API = window.location.origin + '/api';
  var myPK = null;
  var mySK = null;
  var ready = false;
  var myUid = null;
  var pendingExchanges = {};
  var _sendRaw = null;  // pluggable WS send (set via setSendRaw)

  function _sendOrWarn(data) {
    if (_sendRaw) { _sendRaw(data); return true; }
    if (typeof wsManager !== 'undefined' && wsManager.isConnected()) { wsManager.sendRaw(data); return true; }
    console.warn('[PQ] No send transport available');
    return false;
  }

  // ---- DOM Event dispatch ----
  function fireEvent(name, detail) {
    var event = new CustomEvent('fibemate:' + name, { detail: detail || {} });
    window.dispatchEvent(event);
    console.log('[PQ Event]', 'fibemate:' + name, JSON.stringify(detail || {}).slice(0, 200));
  }

  function getToken() { return localStorage.getItem('fk_token') || ''; }
  function getUid() { return localStorage.getItem('fk_uid') || ''; }

  async function apiPost(path, body) {
    var res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': getToken() ? 'Bearer ' + getToken() : '' },
      body: JSON.stringify(body || {})
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || ('API ' + res.status));
    return data;
  }

  async function apiGet(path) {
    var res = await fetch(API + path, { headers: { 'Authorization': getToken() ? 'Bearer ' + getToken() : '' } });
    if (!res.ok) throw new Error('API ' + res.status);
    return res.json();
  }

  function hexToBuf(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function dhPair() {
    return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  }

  async function dhExportRaw(kp) {
    return bufToHex(await crypto.subtle.exportKey('raw', kp.publicKey));
  }

  async function dhExportPriv(kp) {
    return bufToHex(hexToBuf((await crypto.subtle.exportKey('jwk', kp.privateKey)).d));
  }

  async function dhDerive(privKey, peerPubHex) {
    var peerPub = await crypto.subtle.importKey('raw', hexToBuf(peerPubHex), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return bufToHex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPub }, privKey, 256)));
  }

  // ---- Init ----
  async function init() {
    try {
      myUid = getUid();
      if (!myUid) { console.warn('[PQ] Not logged in'); return false; }
      var kp = await apiPost('/mlkem/keygen');
      if (!kp.publicKey) throw new Error('keygen returned no pk');
      myPK = kp.publicKey;
      mySK = kp.secretKey;
      try { await apiPost('/mlkem/register', { publicKeyHex: myPK }); } catch (e) { console.warn('[PQ] register warn:', e.message); }
      hookWS();
      ready = true;
      console.log('[PQ] ML-KEM-768 initialized. PK:', myPK.slice(0, 16) + '...');
      fireEvent('pqready', { ready: true, userId: myUid });
      return true;
    } catch (e) {
      console.warn('[PQ] init failed:', e.message);
      ready = false;
      fireEvent('pqready', { ready: false, error: e.message });
      return false;
    }
  }

  function isReady() { return ready; }

  function hookWS() {
    if (typeof wsManager !== 'undefined') {
      wsManager.on('key_exchange_request', async function(msg) { await handleIncomingKeyExchange(msg); });
      wsManager.on('key_exchange_response', function(msg) {
        var fn = pendingExchanges[msg.exchangeId]; if (fn) { fn(msg); delete pendingExchanges[msg.exchangeId]; }
      });
      console.log('[PQ] WS handlers hooked (wsManager)');
    } else {
      console.log('[PQ] WS inline dispatch mode (call handleIncoming/resolvePending from ws.onmessage)');
    }
  }

  async function handleIncomingKeyExchange(msg) {
    try {
      var ikPub = msg.payload && msg.payload.ikPub;
      var ekPub = msg.payload && msg.payload.ekPub;
      var kemCt = msg.payload && msg.payload.kemCt;
      if (!kemCt) return;
      var dec = await apiPost('/mlkem/decaps', { ciphertext: kemCt, secretKey: mySK });
      var ourDh = await dhPair();
      var ourDhPub = await dhExportRaw(ourDh);
      _sendOrWarn(JSON.stringify({ type: 'key_exchange_response', to: msg.from, exchangeId: msg.exchangeId, ratchetKey: ourDhPub }));
      if (typeof MessageCryptoV2 !== 'undefined' && MessageCryptoV2.receivePQSession) {
        await MessageCryptoV2.receivePQSession(msg.from, { ikPub: ikPub, ekPub: ekPub, pqSharedSecret: dec.sharedSecret, ourDh: { publicKey: ourDhPub, privateKey: await dhExportPriv(ourDh) } });
        fireEvent('session:established', { peerId: msg.from, type: 'pq_x3dh', direction: 'incoming', timestamp: Date.now() });
      }
      dispatchE2EEUpdate('pq_x3dh', msg.from);
    } catch (e) {
      console.error('[PQ] handleIncoming failed:', e.message);
      fireEvent('session:failed', { peerId: msg.from, reason: e.message });
    }
  }

  async function startHybridSession(peerId) {
    if (!ready) return { success: false, status: 'failed', reason: 'not_ready' };
    try {
      var pkResp;
      try { pkResp = await apiGet('/mlkem/public-key/' + peerId); } catch (e) {
        fireEvent('session:established', { peerId: peerId, type: 'x3dh', fallback: true, timestamp: Date.now() });
        return { success: false, status: 'x3dh_fallback', reason: 'peer_no_pq' };
      }
      var peerPK = pkResp.mlkemPublicKey || pkResp.publicKey;
      if (!peerPK || peerPK.length < 100) return { success: false, status: 'x3dh_fallback', reason: 'peer_pk_invalid' };
      var enc = await apiPost('/mlkem/encaps', { publicKey: peerPK });
      var ik = await dhPair(), ek = await dhPair();
      var ikPub = await dhExportRaw(ik), ekPub = await dhExportRaw(ek);
      var exchangeId = 'pq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      _sendOrWarn(JSON.stringify({ type: 'key_exchange', to: peerId, exchangeId: exchangeId, ikPub: ikPub, ekPub: ekPub, kemCt: enc.ciphertext }));
      var response = await new Promise(function(resolve, reject) {
        pendingExchanges[exchangeId] = resolve;
        setTimeout(function() { delete pendingExchanges[exchangeId]; reject(new Error('timeout')); }, 10000);
      });
      var peerRatchetKey = response.ratchetKey || (response.payload && response.payload.ratchetKey);
      if (!peerRatchetKey) throw new Error('no ratchetKey');
      var dhSS = await dhDerive(ek, peerRatchetKey);
      if (MessageCryptoV2 && MessageCryptoV2.initiatePQSession) {
        await MessageCryptoV2.initiatePQSession(peerId, { ikPub: ikPub, ekPub: ekPub, pqSharedSecret: enc.sharedSecret, peerDhPub: peerRatchetKey, dhOutput: dhSS });
        fireEvent('session:established', { peerId: peerId, type: 'pq_x3dh', direction: 'outgoing', timestamp: Date.now() });
      }
      dispatchE2EEUpdate('pq_x3dh', peerId);
      return { success: true, status: 'pq_x3dh' };
    } catch (e) {
      console.error('[PQ] startHybrid failed:', e.message);
      fireEvent('session:failed', { peerId: peerId, reason: e.message });
      dispatchE2EEUpdate('unknown', peerId);
      return { success: false, status: 'failed', reason: e.message };
    }
  }

  function dispatchE2EEUpdate(status, peerId) {
    if (window._e2eeInstance) { window._e2eeInstance.setStatus(status); window._e2eeInstance.setPeer(peerId); }
  }

  window.MLKEMHybridIntegration = {
    init: init, isReady: isReady, startHybridSession: startHybridSession,
    handleIncomingKeyExchange: handleIncomingKeyExchange,
    resolvePendingExchange: function(id, msg) {
      var fn = pendingExchanges[id];
      if (fn) { fn(msg); delete pendingExchanges[id]; return true; }
      return false;
    },
    setSendRaw: function(fn) { _sendRaw = fn; },
    getMLKEMPublicKey: function() { return myPK; }
  };
  console.log('[PQ] MLKEMHybridIntegration loaded (v3)');
})();
