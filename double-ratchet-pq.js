// SPDX-License-Identifier: GPL-3.0-only
// ============================================================
// FIBEMATE Hybrid Double Ratchet — Post-Quantum Edition
// ML-KEM-768 (NIST FIPS 203) + P-256 Double Ratchet
// ============================================================
//
// Architecture:
//   Initial handshake: ML-KEM-768 encaps/decaps → hybrid root key
//   Message ratchet:   P-256 ECDH (unchanged, 65B headers)
//   Periodic re-key:   ML-KEM refresh every 100 messages
//
// Requires:
//   - mlkem.node (C native module, KAT-verified)
//   - DoubleRatchet (existing P-256 double ratchet)
//   - Node.js crypto (built-in HKDF/SHA-256)
// ============================================================

'use strict';

const crypto = require('crypto');

// ---- Load ML-KEM native module ----
let mlkem;
try {
  mlkem = require('./addon/build/Release/mlkem.node');
  console.log('[PQ-Ratchet] ML-KEM-768 native module loaded (KAT-verified)');
} catch (e) {
  console.error('[PQ-Ratchet] ML-KEM module not loaded:', e.message);
  mlkem = null;
}

// ---- Load existing DoubleRatchet (P-256) ----
const DoubleRatchet = require('./double-ratchet');

// ---- Constants ----
const PQ_REKEY_INTERVAL = 100;       // Re-key after 100 sent messages
const MLKEM_PK_SIZE = 1184;          // ML-KEM-768 public key
const MLKEM_CT_SIZE = 1088;          // ML-KEM-768 ciphertext
const MLKEM_SS_SIZE = 32;            // Shared secret size
const KEY_LEN = 32;

// ============================================================
//  Node.js HKDF-SHA-256 (synchronous, replaces WebCrypto version)
// ============================================================
function hkdfSync(ikm, salt, info, length = KEY_LEN) {
  const saltBuf = (salt instanceof Uint8Array && salt.length > 0)
    ? Buffer.from(salt)
    : Buffer.alloc(KEY_LEN);

  // Extract
  const prk = crypto.createHmac('sha256', saltBuf)
    .update(Buffer.from(ikm))
    .digest();

  // Expand
  const n = Math.ceil(length / KEY_LEN);
  const okm = [];
  let t = Buffer.alloc(0);
  for (let i = 1; i <= n; i++) {
    const infoBuf = typeof info === 'string'
      ? Buffer.from(info, 'utf8')
      : Buffer.from(info);
    const hmac = crypto.createHmac('sha256', prk);
    hmac.update(t);
    hmac.update(infoBuf);
    hmac.update(Buffer.from([i]));
    t = hmac.digest();
    okm.push(t);
  }
  return Buffer.concat(okm).slice(0, length);
}

function toBytes(buf) {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

// ============================================================
//  ML-KEM-768 Key Management
// ============================================================

/**
 * Generate a new ML-KEM-768 keypair.
 * Returns { publicKey: Buffer(1184), secretKey: Buffer(2400) }
 */
function generatePQKeypair() {
  if (!mlkem) throw new Error('ML-KEM module not available');
  const [pk, sk] = mlkem.keygen();
  return { publicKey: pk, secretKey: sk };
}

/**
 * Encapsulate to a ML-KEM-768 public key.
 * Returns { ciphertext: Buffer(1088), sharedSecret: Buffer(32) }
 */
function encapsulate(pk) {
  if (!mlkem) throw new Error('ML-KEM module not available');
  const [ct, ss] = mlkem.encaps(pk);
  return { ciphertext: ct, sharedSecret: ss };
}

/**
 * Decapsulate an ML-KEM-768 ciphertext.
 * Returns sharedSecret: Buffer(32)
 */
function decapsulate(ct, sk) {
  if (!mlkem) throw new Error('ML-KEM module not available');
  return mlkem.decaps(ct, sk);
}

// ============================================================
//  Hybrid X3DH (ML-KEM-768 + P-256)
// ============================================================

/**
 * HybridX3DH for initiator (Alice).
 *
 * Alice has:
 *   - Bob's ML-KEM-768 public key (raw Buffer, 1184 bytes)
 *   - Bob's P-256 signed pre-key (raw Buffer, 65 bytes)
 *
 * Returns:
 *   - rootKey: Buffer(32) — derived from ML-KEM ss + ECDH ss
 *   - kemCt: Buffer(1088) — ML-KEM ciphertext to send to Bob
 *   - ekPub: Buffer(65) — Alice's P-256 ephemeral public key
 */
async function hybridX3DH_initiator(bobMLKEMPub, bobP256SPK) {
  // Step 1: ML-KEM encapsulate to Bob's public key
  const { ciphertext: kemCt, sharedSecret: pqSS } = encapsulate(bobMLKEMPub);

  // Step 2: P-256 ECDH between Alice's ephemeral key and Bob's SPK
  const ekPair = await DoubleRatchet.generateDH();
  const ekPub = await DoubleRatchet.exportPublicKey(ekPair);

  let ecSS;
  if (bobP256SPK && (bobP256SPK.length >= 32)) {
    const bobSPK = await DoubleRatchet.importPublicKey(toBytes(bobP256SPK));
    ecSS = await DoubleRatchet.dh(ekPair.privateKey, bobSPK);
  } else {
    // If no P-256 pre-key, just use ML-KEM only
    ecSS = new Uint8Array(32);
  }

  // Step 3: Combine both shared secrets via HKDF
  const combined = Buffer.concat([
    Buffer.from(pqSS),
    Buffer.from(ecSS)
  ]);
  const rootKey = hkdfSync(combined, Buffer.alloc(KEY_LEN), 'FIBEMateHybridX3DH');

  return {
    rootKey: rootKey,
    kemCt: kemCt,
    ekPub: Buffer.from(ekPub)
  };
}

/**
 * HybridX3DH for receiver (Bob).
 *
 * Bob has:
 *   - His own ML-KEM-768 secret key (Buffer, 2400 bytes)
 *   - His own P-256 signed pre-key pair (CryptoKeyPair)
 *
 * Receives from Alice:
 *   - kemCt: Buffer(1088) — ML-KEM ciphertext
 *   - ekPub: Buffer(65) — Alice's P-256 ephemeral public key
 *
 * Returns:
 *   - rootKey: Buffer(32)
 *   - ratchetState: for initAsReceiver()
 */
async function hybridX3DH_receiver(myMLKEMSecret, myP256SPKPair, kemCt, ekPub) {
  // Step 1: ML-KEM decapsulate
  const pqSS = decapsulate(kemCt, myMLKEMSecret);

  // Step 2: P-256 ECDH between Alice's ephemeral pub and Bob's SPK
  let ecSS;
  if (ekPub && ekPub.length > 0) {
    const aliceEK = await DoubleRatchet.importPublicKey(toBytes(ekPub));
    ecSS = await DoubleRatchet.dh(myP256SPKPair.privateKey, aliceEK);
  } else {
    ecSS = new Uint8Array(32);
  }

  // Step 3: Combine
  const combined = Buffer.concat([
    Buffer.from(pqSS),
    Buffer.from(ecSS)
  ]);
  const rootKey = hkdfSync(combined, Buffer.alloc(KEY_LEN), 'FIBEMateHybridX3DH');

  // Step 4: Initialize ratchet with Bob's SPK as his self DH
  const state = await DoubleRatchet.initAsReceiver(rootKey, myP256SPKPair);

  return { rootKey: rootKey, state: state };
}

// ============================================================
//  ML-KEM Periodic Re-Key
// ============================================================

/**
 * Initiator side: after PQ_REKEY_INTERVAL messages, trigger re-key.
 * Returns { newPk, newSk } — send newPk to peer.
 */
function rekey_initiate() {
  return generatePQKeypair();
}

/**
 * Responder side: receive peer's new ML-KEM public key, encapsulate, return ct.
 * Returns { ciphertext, sharedSecret }
 */
function rekey_respond(peerPQPubKey) {
  return encapsulate(peerPQPubKey);
}

/**
 * Both sides: after re-key exchange, derive new root key.
 */
function rekey_deriveRoot(currentRootKey, pqSS) {
  const combined = Buffer.concat([
    currentRootKey instanceof Buffer ? currentRootKey : Buffer.from(currentRootKey),
    Buffer.from(pqSS)
  ]);
  return hkdfSync(combined, Buffer.alloc(KEY_LEN), 'FIBEMatePQRefresh');
}

// ============================================================
//  Session Manager
// ============================================================

class PQRatchetSession {
  constructor() {
    this.ratchetState = null;        // DoubleRatchet state
    this.rootKey = null;             // Buffer(32) — current root key
    this.mlkemSecretKey = null;      // Buffer(2400) — our ML-KEM secret
    this.mlkemPublicKey = null;      // Buffer(1184) — our ML-KEM public
    this.peerMLKEMPublicKey = null;  // Buffer(1184) — peer's ML-KEM public
    this.p256KeyPair = null;         // CryptoKeyPair — our P-256 DH key
    this.peerP256PublicKey = null;   // Buffer(65) — peer's P-256 DH pub
    this.sentCountSinceRekey = 0;    // Counter for periodic re-key
    this.conversationId = null;
    this.peerUserId = null;
  }

  /**
   * Initialize as Alice (conversation initiator).
   */
  async initAsAlice(peerMLKEMPub, peerP256Pub) {
    this.peerMLKEMPublicKey = peerMLKEMPub;
    this.peerP256PublicKey = peerP256Pub;

    const result = await hybridX3DH_initiator(peerMLKEMPub, peerP256Pub);
    this.rootKey = result.rootKey;
    this.kemCt = result.kemCt;
    this.ekPub = result.ekPub;

    // Generate our own keys
    const ourPQ = generatePQKeypair();
    this.mlkemSecretKey = ourPQ.secretKey;
    this.mlkemPublicKey = ourPQ.publicKey;

    this.p256KeyPair = await DoubleRatchet.generateDH();

    // Start the P-256 ratchet
    const pubBytes = toBytes(peerP256Pub);
    this.ratchetState = await DoubleRatchet.initAsInitiator(
      toBytes(this.rootKey),
      pubBytes
    );

    // Return what we need to send to Bob
    return {
      type: 'hybrid_x3dh_init',
      kemCt: this.kemCt,
      ekPub: this.ekPub,
      ourPQPubKey: this.mlkemPublicKey,
      ourP256PubKey: Buffer.from(await DoubleRatchet.exportPublicKey(this.p256KeyPair))
    };
  }

  /**
   * Initialize as Bob (conversation receiver).
   */
  async initAsBob(mlkemSK, p256SPKPair, aliceKemCt, aliceEKPub) {
    this.mlkemSecretKey = mlkemSK;
    this.p256KeyPair = p256SPKPair;
    this.mlkemPublicKey = generatePQKeypair().publicKey; // Generate new for ourselves

    const result = await hybridX3DH_receiver(
      mlkemSK, p256SPKPair, aliceKemCt, aliceEKPub
    );
    this.rootKey = result.rootKey;
    this.ratchetState = result.state;

    // Store peer info
    this.peerMLKEMPublicKey = null; // Will be set when Alice shares hers
    this.peerP256PublicKey = aliceEKPub;

    return {
      type: 'hybrid_x3dh_accept',
      rootKeyDerived: true
    };
  }

  /**
   * Encrypt a message using the current ratchet state.
   */
  async encrypt(plaintext) {
    if (!this.ratchetState) throw new Error('Session not initialized');

    const result = await DoubleRatchet.encrypt(this.ratchetState, plaintext);
    // Normalize header for wire transport
    result.header_clean = {
      dh: Array.from(result.header.dh),
      pn: result.header.pn,
      n: result.header.n
    };
    this.sentCountSinceRekey++;

    // Check if re-key is needed
    if (this.sentCountSinceRekey >= PQ_REKEY_INTERVAL) {
      const rekey = rekey_initiate();
      result._pq_rekey = {
        needed: true,
        newPQPubKey: rekey.publicKey
      };
    }

    return result;
  }

  /**
   * Decrypt a message.
   */
  async decrypt(header, ciphertext, iv) {
    if (!this.ratchetState) throw new Error('Session not initialized');
    return await DoubleRatchet.decrypt(this.ratchetState, header, ciphertext, iv);
  }

  /**
   * Handle incoming PQ re-key ciphertext.
   */
  async handleRekeyResponse(peerNewPQPub, rekeyCt) {
    const pqSS = decapsulate(rekeyCt, this.mlkemSecretKey);
    this.rootKey = rekey_deriveRoot(this.rootKey, pqSS);
    this.sentCountSinceRekey = 0;
    this.peerMLKEMPublicKey = peerNewPQPub;
    return { newRootKey: this.rootKey };
  }

  /**
   * Handle outgoing re-key: peer sent us a new pubkey, we encapsulate.
   */
  async handleRekeyRequest(peerPQPub) {
    const { ciphertext, sharedSecret } = rekey_respond(peerPQPub);
    this.rootKey = rekey_deriveRoot(this.rootKey, sharedSecret);
    this.sentCountSinceRekey = 0;
    this.peerMLKEMPublicKey = peerPQPub;
    return ciphertext; // Send this back to peer
  }

  /**
   * Update peer's P-256 DH public key (from ratchet header).
   */
  updatePeerP256Pub(pubBytes) {
    this.peerP256PublicKey = pubBytes;
  }

  /**
   * Serialize session for persistence.
   */
  serialize() {
    const ratchet = this.ratchetState ? DoubleRatchet.exportState(this.ratchetState) : null;
    return JSON.stringify({
      rootKey: this.rootKey ? Buffer.from(this.rootKey).toString('hex') : null,
      mlkemSK: this.mlkemSecretKey ? Buffer.from(this.mlkemSecretKey).toString('hex') : null,
      mlkemPK: this.mlkemPublicKey ? Buffer.from(this.mlkemPublicKey).toString('hex') : null,
      peerMLKEMPK: this.peerMLKEMPublicKey ? Buffer.from(this.peerMLKEMPublicKey).toString('hex') : null,
      peerP256PK: this.peerP256PublicKey ? Buffer.from(this.peerP256PublicKey).toString('hex') : null,
      sentCount: this.sentCountSinceRekey,
      ratchetState: ratchet
    });
  }

  /**
   * Deserialize session from persistence.
   */
  static async deserialize(jsonStr) {
    const data = JSON.parse(jsonStr);
    const sess = new PQRatchetSession();
    sess.rootKey = data.rootKey ? Buffer.from(data.rootKey, 'hex') : null;
    sess.mlkemSecretKey = data.mlkemSK ? Buffer.from(data.mlkemSK, 'hex') : null;
    sess.mlkemPublicKey = data.mlkemPK ? Buffer.from(data.mlkemPK, 'hex') : null;
    sess.peerMLKEMPublicKey = data.peerMLKEMPK ? Buffer.from(data.peerMLKEMPK, 'hex') : null;
    sess.peerP256PublicKey = data.peerP256PK ? Buffer.from(data.peerP256PK, 'hex') : null;
    sess.sentCountSinceRekey = data.sentCount || 0;
    if (data.ratchetState) {
      sess.ratchetState = await DoubleRatchet.importState(data.ratchetState);
    }
    return sess;
  }
}

// ============================================================
//  API
// ============================================================

module.exports = {
  // Core
  PQRatchetSession,
  DoubleRatchet,           // Passthrough for direct P-256 access
  mlkem: mlkem,            // Passthrough for direct ML-KEM access

  // Key management
  generatePQKeypair,
  encapsulate,
  decapsulate,

  // Hybrid X3DH
  hybridX3DH_initiator,
  hybridX3DH_receiver,

  // Re-key
  rekey_initiate,
  rekey_respond,
  rekey_deriveRoot,

  // Utilities
  hkdfSync,
  PQ_REKEY_INTERVAL,
  MLKEM_PK_SIZE,
  MLKEM_CT_SIZE
};
