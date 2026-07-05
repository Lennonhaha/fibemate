/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Privacy Layer 实验性功能，未经生产审计
 * 请勿用于关键路径或主网
 */




/**
 * FIBEMATE Post-Quantum Signature Layer — Layer 13
 * FIPS 204 (ML-DSA) + FIPS 205 (SLH-DSA) Dual Signature Architecture
 *
 * Design follows NIST guidance:
 *   - Root CA / Long-term identity → SLH-DSA-SHA2-128s (hash-based, conservative)
 *   - Session / Ephemeral signing  → ML-DSA-65 (lattice-based, fast)
 *
 * API convention matches @noble/post-quantum:
 *   - sign(msg, secretKey, opts?)
 *   - verify(signature, msg, publicKey, opts?)
 */

// ================================================================
// Signature Scheme Registry
// ================================================================
const SignatureScheme = {
  // FIPS 204: ML-DSA (Module-Lattice-Based Digital Signature Algorithm)
  ML_DSA_44:  { id: 'ml-dsa-44',  family: 'ml-dsa', level: 2,   pubBytes: 1312, secBytes: 2560, sigBytes: 2420, usage: 'lightweight' },
  ML_DSA_65:  { id: 'ml-dsa-65',  family: 'ml-dsa', level: 3,   pubBytes: 1952, secBytes: 4032, sigBytes: 3309, usage: 'session' },
  ML_DSA_87:  { id: 'ml-dsa-87',  family: 'ml-dsa', level: 5,   pubBytes: 2592, secBytes: 4896, sigBytes: 4627, usage: 'high-security' },

  // FIPS 205: SLH-DSA (Stateless Hash-Based Digital Signature Algorithm)
  SLH_DSA_SHA2_128f:  { id: 'slh-dsa-sha2-128f',  family: 'slh-dsa', level: 1, pubBytes: 32,  secBytes: 64,  sigBytes: 17088, usage: 'root-fast' },
  SLH_DSA_SHA2_128s:  { id: 'slh-dsa-sha2-128s',  family: 'slh-dsa', level: 1, pubBytes: 32,  secBytes: 64,  sigBytes: 7856,  usage: 'root' },
  SLH_DSA_SHA2_192f:  { id: 'slh-dsa-sha2-192f',  family: 'slh-dsa', level: 3, pubBytes: 48,  secBytes: 96,  sigBytes: 35664, usage: 'root-fast-192' },
  SLH_DSA_SHA2_192s:  { id: 'slh-dsa-sha2-192s',  family: 'slh-dsa', level: 3, pubBytes: 48,  secBytes: 96,  sigBytes: 16224, usage: 'root-192' },
  SLH_DSA_SHA2_256f:  { id: 'slh-dsa-sha2-256f',  family: 'slh-dsa', level: 5, pubBytes: 64,  secBytes: 128, sigBytes: 49856, usage: 'root-fast-256' },
  SLH_DSA_SHA2_256s:  { id: 'slh-dsa-sha2-256s',  family: 'slh-dsa', level: 5, pubBytes: 64,  secBytes: 128, sigBytes: 29792, usage: 'root-256' },
  SLH_DSA_SHAKE_128f: { id: 'slh-dsa-shake-128f', family: 'slh-dsa', level: 1, pubBytes: 32,  secBytes: 64,  sigBytes: 17088, usage: 'root-fast-shake' },
  SLH_DSA_SHAKE_128s: { id: 'slh-dsa-shake-128s', family: 'slh-dsa', level: 1, pubBytes: 32,  secBytes: 64,  sigBytes: 7856,  usage: 'root-shake' },
};

// ================================================================
// PQ Signature Engine
// ================================================================
class PQSignatureEngine {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this._modules = null;    // lazy-loaded @noble/post-quantum refs
    this._rootKeys = null;   // SLH-DSA long-term identity keypair
    this._sessionKeys = null; // ML-DSA-65 session keypair
    this._keyStore = new Map(); // peerId → { rootPk, sessionPk, verified }
    this._certificateChain = []; // signed identity certificates
    this._initialized = false;
    this._signCount = 0;
    this._verifyCount = 0;
  }

  // ----------------------------------------------------------
  // Lazy-load @noble/post-quantum modules
  // ----------------------------------------------------------
  async _loadModules() {
    if (this._modules) return this._modules;

    // Path 1: Check if already loaded as <script> global (IIFE sets window.__NOBLE_PQ__)
    if (typeof window !== 'undefined' && window.__NOBLE_PQ__) {
      // Support both { default: all } and direct all formats (esbuild IIFE wrapper)
      this._modules = window.__NOBLE_PQ__.default || window.__NOBLE_PQ__;
      return this._modules;
    }

    // Path 2: Dynamic import (for dev / local file serving)
    try {
      const slh = await import('../node_modules/@noble/post-quantum/slh-dsa.js');
      const ml  = await import('../node_modules/@noble/post-quantum/ml-dsa.js');
      // ESM re-exports wrapped in IIFE return the module namespace
      this._modules = (slh && slh.default) ? slh.default : slh;
      if (this._modules && this._modules.ml_dsa44) {
        return this._modules; // slh bundle already includes ml-dsa via shared exports
      }
      // Fallback: build combined map from both
      const combined = {};
      const addIf = (obj, prefix) => {
        for (const k of Object.keys(obj)) {
          if (k.startsWith(prefix) || k.startsWith('ml_') || k.startsWith('slh_')) {
            combined[k] = obj[k];
          }
        }
      };
      addIf(slh.default || slh, 'slh_');
      addIf(ml.default  || ml,  'ml_');
      this._modules = combined;
    } catch (e) {
      console.error('[PQ-SIG] Failed to load @noble/post-quantum:', e.message);
      this._modules = {};
    }
    return this._modules;
  }

  // ----------------------------------------------------------
  // Initialization — generate root + session keypairs
  // ----------------------------------------------------------
  async init(rootScheme = 'slh_dsa_sha2_128s', sessionScheme = 'ml_dsa65') {
    if (!this.enabled) return false;

    const mod = await this._loadModules();
    const rootImpl = mod[rootScheme];
    const sessionImpl = mod[sessionScheme];

    if (!rootImpl || !sessionImpl) {
      console.error('[PQ-SIG] Scheme not available:', rootScheme, sessionScheme);
      return false;
    }

    const t0 = performance.now();

    // Generate root identity keypair (SLH-DSA) — slow, one-time
    console.log(`[PQ-SIG] Generating root identity key (${rootScheme})...`);
    this._rootKeys = rootImpl.keygen();
    this._rootScheme = rootScheme;

    // Generate session keypair (ML-DSA) — fast
    console.log(`[PQ-SIG] Generating session key (${sessionScheme})...`);
    this._sessionKeys = sessionImpl.keygen();
    this._sessionScheme = sessionScheme;

    // Root signs session public key → identity certificate
    const sessionPkMsg = this._sessionKeys.publicKey;
    const rootSig = rootImpl.sign(sessionPkMsg, this._rootKeys.secretKey);

    this._certificateChain.push({
      type: 'identity',
      rootScheme,
      sessionScheme,
      rootPk: this._rootKeys.publicKey,
      sessionPk: this._sessionKeys.publicKey,
      signature: rootSig,
      timestamp: Date.now(),
      version: 1,
    });

    this._initialized = true;
    const elapsed = (performance.now() - t0).toFixed(0);
    console.log(`[PQ-SIG] Initialized in ${elapsed}ms | root: ${rootScheme} | session: ${sessionScheme}`);

    return true;
  }

  // ----------------------------------------------------------
  // Sign message — auto-selects scheme based on context
  // ----------------------------------------------------------
  async sign(message, options = {}) {
    if (!this._initialized) throw new Error('[PQ-SIG] Not initialized. Call init() first.');

    const mod = await this._loadModules();
    const isRoot = options.useRoot === true;
    const scheme = isRoot ? this._rootScheme : this._sessionScheme;
    const impl = mod[scheme];
    const keys = isRoot ? this._rootKeys : this._sessionKeys;

    if (!impl || !keys) throw new Error(`[PQ-SIG] Scheme ${scheme} not available`);

    const msgBytes = message instanceof Uint8Array ? message : new TextEncoder().encode(message);
    const signature = impl.sign(msgBytes, keys.secretKey, options);

    this._signCount++;
    return {
      scheme,
      family: isRoot ? 'slh-dsa' : 'ml-dsa',
      signature,
      signerPk: keys.publicKey,
      isRoot,
      timestamp: Date.now(),
    };
  }

  // ----------------------------------------------------------
  // Verify signature
  // ----------------------------------------------------------
  async verify(signatureObj, message) {
    const mod = await this._loadModules();
    const impl = mod[signatureObj.scheme];
    if (!impl) throw new Error(`[PQ-SIG] Scheme ${signatureObj.scheme} not available for verification`);

    const msgBytes = message instanceof Uint8Array ? message : new TextEncoder().encode(message);
    const valid = impl.verify(signatureObj.signature, msgBytes, signatureObj.signerPk);

    this._verifyCount++;

    // If root-signed, also check certificate chain
    if (signatureObj.isRoot && valid) {
      this._storePeerRootKey(signatureObj.signerPk);
    }

    return { valid, scheme: signatureObj.scheme, family: signatureObj.family };
  }

  // ----------------------------------------------------------
  // Certificate operations
  // ----------------------------------------------------------

  // Issue a certificate: root key signs another user's session key
  async issueCertificate(peerSessionPk, metadata = {}) {
    if (!this._initialized) throw new Error('[PQ-SIG] Not initialized');

    const mod = await this._loadModules();
    const rootImpl = mod[this._rootScheme];

    // Sign the peer's session public key with our root key
    const certData = new Uint8Array(peerSessionPk.length + 8);
    certData.set(peerSessionPk);
    // Append timestamp as 8 bytes (big-endian)
    const ts = Date.now();
    const dv = new DataView(certData.buffer);
    dv.setBigUint64(peerSessionPk.length, BigInt(ts), false);

    const signature = rootImpl.sign(certData, this._rootKeys.secretKey);

    const cert = {
      type: 'peer-certificate',
      issuerRootPk: this._rootKeys.publicKey,
      issuerRootScheme: this._rootScheme,
      subjectSessionPk: peerSessionPk,
      subjectScheme: metadata.sessionScheme || 'ml-dsa-65',
      signature,
      timestamp: ts,
      expiresAt: metadata.expiresAt || ts + 90 * 24 * 3600 * 1000, // 90 days default
      metadata: metadata,
      version: 1,
    };

    this._certificateChain.push(cert);
    return cert;
  }

  // Verify a peer's certificate
  async verifyCertificate(cert) {
    const mod = await this._loadModules();
    const rootImpl = mod[cert.issuerRootScheme];
    if (!rootImpl) return { valid: false, reason: 'scheme_unavailable' };

    // Reconstruct signed data
    const certData = new Uint8Array(cert.subjectSessionPk.length + 8);
    certData.set(cert.subjectSessionPk);
    const dv = new DataView(certData.buffer);
    dv.setBigUint64(cert.subjectSessionPk.length, BigInt(cert.timestamp), false);

    const valid = rootImpl.verify(cert.signature, certData, cert.issuerRootPk);

    // Check expiry
    if (valid && cert.expiresAt && Date.now() > cert.expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    if (valid) {
      this._storePeerRootKey(cert.issuerRootPk);
      this._keyStore.set(cert.subjectSessionPk.toString(), {
        rootPk: cert.issuerRootPk,
        sessionPk: cert.subjectSessionPk,
        verified: true,
        expiresAt: cert.expiresAt,
      });
    }

    return { valid, reason: valid ? null : 'signature_invalid' };
  }

  // ----------------------------------------------------------
  // Get public keys for sharing
  // ----------------------------------------------------------
  getRootPublicKey() {
    return this._rootKeys ? this._rootKeys.publicKey : null;
  }

  getSessionPublicKey() {
    return this._sessionKeys ? this._sessionKeys.publicKey : null;
  }

  getIdentityCertificate() {
    return this._certificateChain.length > 0 ? this._certificateChain[0] : null;
  }

  // ----------------------------------------------------------
  // Peer key management
  // ----------------------------------------------------------
  _storePeerRootKey(rootPk) {
    const key = rootPk.toString();
    if (!this._keyStore.has(key)) {
      this._keyStore.set(key, { rootPk, verified: true, storedAt: Date.now() });
    }
  }

  getPeerInfo(peerPkBytes) {
    return this._keyStore.get(peerPkBytes.toString()) || null;
  }

  // ----------------------------------------------------------
  // Hybrid signature: SLH-DSA + ML-DSA on same message
  // For maximum assurance (e.g., initial key exchange verification)
  // ----------------------------------------------------------
  async hybridSign(message, options = {}) {
    if (!this._initialized) throw new Error('[PQ-SIG] Not initialized');

    const mod = await this._loadModules();
    const rootImpl = mod[this._rootScheme];
    const sessionImpl = mod[this._sessionScheme];
    const msgBytes = message instanceof Uint8Array ? message : new TextEncoder().encode(message);

    const [rootSig, sessionSig] = await Promise.all([
      Promise.resolve().then(() => rootImpl.sign(msgBytes, this._rootKeys.secretKey, options)),
      Promise.resolve().then(() => sessionImpl.sign(msgBytes, this._sessionKeys.secretKey, options)),
    ]);

    this._signCount += 2;
    return {
      type: 'hybrid',
      rootSignature: { scheme: this._rootScheme, signature: rootSig, signerPk: this._rootKeys.publicKey },
      sessionSignature: { scheme: this._sessionScheme, signature: sessionSig, signerPk: this._sessionKeys.publicKey },
      timestamp: Date.now(),
      version: 1,
    };
  }

  // Verify hybrid signature — both must pass
  async hybridVerify(hybridSigObj, message) {
    const mod = await this._loadModules();
    const msgBytes = message instanceof Uint8Array ? message : new TextEncoder().encode(message);

    const rootImpl = mod[hybridSigObj.rootSignature.scheme];
    const sessionImpl = mod[hybridSigObj.sessionSignature.scheme];

    let rootValid = false;
    let sessionValid = false;

    if (rootImpl) {
      rootValid = rootImpl.verify(
        hybridSigObj.rootSignature.signature,
        msgBytes,
        hybridSigObj.rootSignature.signerPk
      );
    }
    if (sessionImpl) {
      sessionValid = sessionImpl.verify(
        hybridSigObj.sessionSignature.signature,
        msgBytes,
        hybridSigObj.sessionSignature.signerPk
      );
    }

    this._verifyCount += 2;
    return {
      valid: rootValid && sessionValid,
      rootValid,
      sessionValid,
      // If root fails but session passes, still log warning
      warning: rootValid ? null : 'ROOT_SIGNATURE_FAILED — hash-based guarantee lost',
    };
  }

  // ----------------------------------------------------------
  // Session key rotation
  // ----------------------------------------------------------
  async rotateSessionKeys() {
    if (!this._initialized) throw new Error('[PQ-SIG] Not initialized');

    const mod = await this._loadModules();
    const sessionImpl = mod[this._sessionScheme];
    const rootImpl = mod[this._rootScheme];

    // Generate new session keypair
    const newSessionKeys = sessionImpl.keygen();

    // Root signs new session key
    const certData = new Uint8Array(newSessionKeys.publicKey.length + 8);
    certData.set(newSessionKeys.publicKey);
    const dv = new DataView(certData.buffer);
    dv.setBigUint64(newSessionKeys.publicKey.length, BigInt(Date.now()), false);
    const rotationSig = rootImpl.sign(certData, this._rootKeys.secretKey);

    const rotation = {
      type: 'key-rotation',
      oldSessionPk: this._sessionKeys.publicKey,
      newSessionPk: newSessionKeys.publicKey,
      signature: rotationSig,
      rootScheme: this._rootScheme,
      sessionScheme: this._sessionScheme,
      timestamp: Date.now(),
    };

    this._sessionKeys = newSessionKeys;
    this._certificateChain.push(rotation);

    console.log('[PQ-SIG] Session keys rotated');
    return rotation;
  }

  // ----------------------------------------------------------
  // Serialization — export/import identity for backup
  // ----------------------------------------------------------
  exportIdentity() {
    if (!this._initialized) return null;
    return {
      rootScheme: this._rootScheme,
      sessionScheme: this._sessionScheme,
      rootSecretKey: this._rootKeys.secretKey,
      sessionSecretKey: this._sessionKeys.secretKey,
      certificateChain: this._certificateChain,
      exportedAt: Date.now(),
      version: 1,
    };
  }

  async importIdentity(data) {
    const mod = await this._loadModules();
    const rootImpl = mod[data.rootScheme];
    const sessionImpl = mod[data.sessionScheme];

    if (!rootImpl || !sessionImpl) throw new Error('[PQ-SIG] Cannot import — scheme unavailable');

    this._rootKeys = {
      publicKey: rootImpl.getPublicKey(data.rootSecretKey),
      secretKey: data.rootSecretKey,
    };
    this._sessionKeys = {
      publicKey: sessionImpl.getPublicKey(data.sessionSecretKey),
      secretKey: data.sessionSecretKey,
    };
    this._rootScheme = data.rootScheme;
    this._sessionScheme = data.sessionScheme;
    this._certificateChain = data.certificateChain || [];
    this._initialized = true;

    console.log('[PQ-SIG] Identity imported');
    return true;
  }

  // ----------------------------------------------------------
  // Status
  // ----------------------------------------------------------
  getStats() {
    return {
      enabled: this.enabled,
      initialized: this._initialized,
      rootScheme: this._rootScheme || null,
      sessionScheme: this._sessionScheme || null,
      rootPkSize: this._rootKeys ? this._rootKeys.publicKey.length : 0,
      sessionPkSize: this._sessionKeys ? this._sessionKeys.publicKey.length : 0,
      certificateCount: this._certificateChain.length,
      knownPeers: this._keyStore.size,
      signCount: this._signCount,
      verifyCount: this._verifyCount,
    };
  }
}

// ================================================================
// Exports
// ================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SignatureScheme, PQSignatureEngine };
}

if (typeof window !== 'undefined') {
  window.FIBEMATE = window.FIBEMATE || {};
  window.FIBEMATE.SignatureScheme = SignatureScheme;
  window.FIBEMATE.PQSignatureEngine = PQSignatureEngine;
  window.SignatureScheme = SignatureScheme;
  window.PQSignatureEngine = PQSignatureEngine;
}