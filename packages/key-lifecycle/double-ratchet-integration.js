// ============================================================
// FIBEMATE Key Lifecycle × Double Ratchet Integration
// ============================================================
// Wraps PQRatchetSession with KeyLifecycleManager for:
//   - Auto key rotation (time + message count dual trigger)
//   - Key version tagging on every encrypted message
//   - Revocation checking on decrypt
//   - Grace periods for key transitions
//   - Audit trail
// ============================================================

'use strict';

const { KeyLifecycleManager, DEFAULT_CONFIG } = require('./index');
const {
  PQRatchetSession,
  hkdfSync,
  rekey_deriveRoot,
  encapsulate,
  decapsulate
} = require('../../double-ratchet-pq');

// ============================================================
//  KLSession — PQRatchetSession + KeyLifecycleManager
// ============================================================

class KLSession extends PQRatchetSession {
  /**
   * @param {object} klConfig — KeyLifecycleManager config overrides
   */
  constructor(klConfig = {}) {
    super();
    this.kl = new KeyLifecycleManager({
      ...DEFAULT_CONFIG,
      ...klConfig
    });
    this._lastKLRotationCheck = 0;
  }

  // --- Bootstrap ---
  async initAsAlice(peerMLKEMPub, peerP256Pub) {
    const result = await super.initAsAlice(peerMLKEMPub, peerP256Pub);
    // Bootstrap KL with the root key
    this.kl.bootstrap(this.rootKey, 'ML-KEM-768+X3DH');
    return result;
  }

  async initAsBob(mlkemSK, p256SPKPair, aliceKemCt, aliceEKPub) {
    const result = await super.initAsBob(mlkemSK, p256SPKPair, aliceKemCt, aliceEKPub);
    this.kl.bootstrap(this.rootKey, 'ML-KEM-768+X3DH');
    return result;
  }

  // --- Encrypt with KL hooks ---
  async encrypt(plaintext) {
    // Check if KL triggers rotation before encrypting
    const klStatus = this.kl.encryptUsed();
    let pqRekey = null;

    if (klStatus.rotated) {
      // KL triggered an auto-rotation → need PQ rekey
      pqRekey = {
        needed: true,
        klVersion: klStatus.newVersion,
        reason: klStatus.reason
      };
    }

    // Encrypt via parent (PQRatchetSession)
    const result = await super.encrypt(plaintext);

    // Tag message with KL version
    result._kl = {
      version: this.kl.current().version,
      rotated: klStatus.rotated
    };

    // Merge PQ rekey info if needed
    if (pqRekey || result._pq_rekey) {
      const rekeyResult = this._initiateKLRekey();
      result._pq_rekey = {
        ...(result._pq_rekey || {}),
        ...rekeyResult,
        ...(pqRekey || {})
      };
    }

    return result;
  }

  // --- Decrypt with revocation check ---
  async decrypt(header, ciphertext, iv) {
    // Check if the key version used is revoked
    const version = header._kl_version;
    if (version != null && this.kl.isRevoked(version)) {
      throw new Error(`Key version ${version} is revoked`);
    }

    return await super.decrypt(header, ciphertext, iv);
  }

  // --- Handle incoming rekey ---
  async handleRekeyResponse(peerNewPQPub, rekeyCt) {
    const result = await super.handleRekeyResponse(peerNewPQPub, rekeyCt);
    // KL rotate with new root key
    this.kl.rotate(this.rootKey, 'pq_rekey_respond');
    return result;
  }

  async handleRekeyRequest(peerPQPub, reason = 'pq_rekey_request') {
    const ct = await super.handleRekeyRequest(peerPQPub);
    this.kl.rotate(this.rootKey, reason);
    return ct;
  }

  // --- Emergency rotation ---
  emergencyRotate(newRootKey) {
    const result = this.kl.emergencyRotate(newRootKey || this.rootKey);
    this.rootKey = newRootKey || this.rootKey;
    return result;
  }

  // --- Revocation ---
  revokeKey(version, reason = 'manual') {
    return this.kl.revokeKey(version, reason);
  }

  // --- Audit ---
  getAuditReport() {
    return this.kl.auditReport();
  }

  // --- Initiate KL-driven rekey ---
  _initiateKLRekey() {
    // Generate new PQ keypair for rekey
    const rekey = require('../../double-ratchet-pq').generatePQKeypair();
    return {
      newPQPubKey: rekey.publicKey,
      _newPQSecretKey: rekey.secretKey,
      klVersion: this.kl.current().version
    };
  }

  // --- Serialize with KL state ---
  serialize() {
    const base = JSON.parse(super.serialize());
    base.klState = this.kl.exportState();
    return JSON.stringify(base);
  }

  static async deserialize(jsonStr) {
    const data = JSON.parse(jsonStr);
    const sess = new KLSession();

    // Restore parent state
    const parent = await PQRatchetSession.deserialize(JSON.stringify({
      rootKey: data.rootKey,
      mlkemSK: data.mlkemSK,
      mlkemPK: data.mlkemPK,
      peerMLKEMPK: data.peerMLKEMPK,
      peerP256PK: data.peerP256PK,
      sentCount: data.sentCount,
      ratchetState: data.ratchetState
    }));

    Object.assign(sess, parent);

    // Restore KL state
    if (data.klState) {
      // Reconstruct key map from current root key (simplified: single-version restore)
      const km = { [data.klState.currentVersion]: sess.rootKey };
      sess.kl = KeyLifecycleManager.importState(data.klState, (v) => km[v]);
    }

    return sess;
  }
}

// ============================================================
//  Utility: create a KL-wrapped session with common configs
// ============================================================

function createKLSession(config = {}) {
  return new KLSession({
    maxMessagesPerKey: config.maxMessagesPerKey || 100,    // Default: PQ_REKEY_INTERVAL
    rotateIntervalMs: config.rotateIntervalMs || 3600000,  // Default: 1 hour
    gracePeriodMs: config.gracePeriodMs || 300000,         // Default: 5 min grace
    revocationTTLMs: config.revocationTTLMs || 86400000,   // Default: 24h revoked
    ...config
  });
}

module.exports = {
  KLSession,
  createKLSession
};
