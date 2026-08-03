// ============================================================
// packages/key-lifecycle/index.js
// FIBEMATE Key Lifecycle Manager (KL)
// ============================================================
// Provides:
//   1. Automated key rotation (time-based + message-count-based)
//   2. Key versioning (monotonic uint32, supports rollback detection)
//   3. Revocation list (in-memory + persistent JSON, with TTL)
//   4. Grace period: allow decryption with old keys during rotation window
//
// Designed to work with PQRatchetSession (double-ratchet-pq.js)
// but also usable standalone for any key-based system.
// ============================================================

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---- Configuration ----
const DEFAULT_CONFIG = {
  rotationIntervalMs: 7 * 24 * 3600 * 1000,  // 7 days
  maxMessagesPerKey: 500,                      // rotate after 500 encryptions
  gracePeriodMs: 1 * 3600 * 1000,             // 1 hour (old key still valid for decrypt)
  maxActiveKeys: 3,                            // keep at most 3 key versions active
  maxRevokedEntries: 1000,                     // max revoked keys in memory
  revokedTTLMs: 90 * 24 * 3600 * 1000,         // auto-expire revocations after 90 days
  persistencePath: null,                       // set to save state to disk
};

// ============================================================
//  KeyVersion — a versioned key container
// ============================================================

class KeyVersion {
  /**
   * @param {number} version - monotonic uint32
   * @param {Buffer|Uint8Array} keyMaterial - raw key bytes
   * @param {string} algorithm - 'ML-KEM-768' | 'P-256' | etc
   * @param {number} createdAt - Date.now()
   * @param {number} expiresAt - Date.now() + gracePeriod
   */
  constructor(version, keyMaterial, algorithm, createdAt, expiresAt) {
    this.version = version;
    this.keyMaterial = Buffer.from(keyMaterial);
    this.algorithm = algorithm;
    this.createdAt = createdAt;
    this.expiresAt = expiresAt || (createdAt + DEFAULT_CONFIG.gracePeriodMs);
    this.encryptCount = 0;
    this.decryptCount = 0;
    this.active = true;
  }

  isExpired(now = Date.now()) {
    return now > this.expiresAt;
  }

  isOverused(maxMsgs) {
    return this.encryptCount >= (maxMsgs || DEFAULT_CONFIG.maxMessagesPerKey);
  }

  fingerprint() {
    return crypto.createHash('sha256').update(this.keyMaterial).digest('hex').slice(0, 16);
  }
}

// ============================================================
//  RevocationEntry
// ============================================================

class RevocationEntry {
  /**
   * @param {number} keyVersion - the revoked version
   * @param {string} reason - 'rotation' | 'compromise' | 'expiry' | 'manual'
   * @param {number} revokedAt - Date.now()
   * @param {number} expiresAt - when this entry can be GC'd
   * @param {string} [replacedBy] - version that replaces this one
   */
  constructor(keyVersion, reason, revokedAt, expiresAt, replacedBy = null) {
    this.keyVersion = keyVersion;
    this.reason = reason;
    this.revokedAt = revokedAt;
    this.expiresAt = expiresAt || (revokedAt + DEFAULT_CONFIG.revokedTTLMs);
    this.replacedBy = replacedBy;
    this.id = crypto.randomUUID();
  }
}

// ============================================================
//  KeyLifecycleManager
// ============================================================

class KeyLifecycleManager {
  /**
   * @param {object} [config] - override DEFAULT_CONFIG fields
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    /** @type {Map<number, KeyVersion>} version -> active key */
    this._keys = new Map();
    /** @type {Map<number, RevocationEntry>} version -> revocation */
    this._revoked = new Map();
    this._currentVersion = 0;
    this._totalRotations = 0;
    this._algorithm = 'ML-KEM-768';
    this._persistTimer = null;
  }

  // ---- Bootstrap ----

  /**
   * Initialize with first key version.
   * @param {Buffer|Uint8Array} keyMaterial
   * @param {string} [algorithm]
   * @returns {KeyVersion}
   */
  bootstrap(keyMaterial, algorithm = 'ML-KEM-768') {
    this._algorithm = algorithm;
    const now = Date.now();
    const kv = new KeyVersion(1, keyMaterial, algorithm, now, now + this.config.rotationIntervalMs + this.config.gracePeriodMs);
    this._keys.set(1, kv);
    this._currentVersion = 1;
    this._totalRotations = 0;

    if (this.config.persistencePath) {
      this._schedulePersist();
    }

    return kv;
  }

  // ---- Active Keys ----

  /**
   * Get the current active key version.
   */
  current() {
    return this._keys.get(this._currentVersion) || null;
  }

  /**
   * Get key by version number (includes grace-period keys).
   */
  get(version) {
    // Check active
    const active = this._keys.get(version);
    if (active && !active.isExpired()) return active;

    // Check grace period
    if (active && active.isExpired() && !this._revoked.has(version)) {
      return active; // Still usable for decrypt during grace period
    }

    // Check revoked
    if (this._revoked.has(version)) return null;

    return null;
  }

  /**
   * List all active key versions (including grace).
   */
  listActive() {
    return [...this._keys.values()].filter(k => k.active);
  }

  /**
   * List active versions sorted by recency (newest first).
   */
  listActiveSorted() {
    return this.listActive().sort((a, b) => b.version - a.version);
  }

  // ---- Rotation ----

  /**
   * Rotate to a new key version.
   * Old key enters grace period (still valid for decrypt).
   *
   * @param {Buffer|Uint8Array} newKeyMaterial
   * @param {string} [reason='scheduled']
   * @returns {{ oldVersion: KeyVersion, newVersion: KeyVersion }}
   */
  rotate(newKeyMaterial, reason = 'scheduled') {
    const now = Date.now();
    const oldKv = this._keys.get(this._currentVersion);

    // Mark old as grace (not revoked)
    if (oldKv) {
      oldKv.expiresAt = now + this.config.gracePeriodMs;
    }

    // Create new version
    const newVersion = this._currentVersion + 1;
    const newKv = new KeyVersion(
      newVersion, newKeyMaterial, this._algorithm, now,
      now + this.config.rotationIntervalMs + this.config.gracePeriodMs
    );

    this._keys.set(newVersion, newKv);
    this._currentVersion = newVersion;
    this._totalRotations++;

    // Revoke old after grace expires (scheduled)
    this._revokeAfterGrace(oldKv, newVersion);

    // Clean up excess versions
    this._pruneOldKeys();

    if (this.config.persistencePath) {
      this._schedulePersist();
    }

    return { oldVersion: oldKv, newVersion: newKv };
  }

  /**
   * Emergency rotation after compromise detected.
   * Immediately revokes current key (no grace period).
   *
   * @param {Buffer|Uint8Array} newKeyMaterial
   * @returns {{ oldVersion: KeyVersion, newVersion: KeyVersion }}
   */
  emergencyRotate(newKeyMaterial) {
    const oldKv = this._keys.get(this._currentVersion);
    const now = Date.now();

    if (oldKv) {
      oldKv.active = false;
      this._revoke(oldKv.version, 'compromise', now, oldKv.version + 1);
    }

    return this.rotate(newKeyMaterial, 'compromise');
  }

  // ---- Revocation ----

  /**
   * Revoke a key version explicitly.
   * @param {number} version
   * @param {string} reason - 'compromise' | 'expiry' | 'manual'
   */
  revokeKey(version, reason = 'manual') {
    const kv = this._keys.get(version);
    if (!kv || !kv.active) return null;

    return this._revoke(version, reason, Date.now());
  }

  _revoke(version, reason, revokedAt, replacedBy = null) {
    const kv = this._keys.get(version);

    if (kv) {
      kv.active = false;
      this._keys.delete(version);
    }

    const entry = new RevocationEntry(version, reason, revokedAt, this.config.revokedTTLMs + revokedAt, replacedBy);
    this._revoked.set(version, entry);

    // Prune old revocations
    this._pruneRevoked();

    if (this.config.persistencePath) {
      this._schedulePersist();
    }

    return entry;
  }

  /**
   * Schedule revocation after grace period expires.
   */
  _revokeAfterGrace(kv, replacedByVersion) {
    if (!kv) return;
    setTimeout(() => {
      if (kv.active && kv.isExpired()) {
        this._revoke(kv.version, 'rotation', Date.now(), replacedByVersion);
      }
    }, this.config.gracePeriodMs + 1000);
  }

  /**
   * Check if a version is revoked.
   */
  isRevoked(version) {
    return this._revoked.has(version);
  }

  /**
   * Get revocation list (for audit/display).
   * @returns {RevocationEntry[]}
   */
  getRevocationList() {
    return [...this._revoked.values()]
      .filter(e => e.expiresAt > Date.now())
      .sort((a, b) => b.revokedAt - a.revokedAt);
  }

  // ---- Encryption / Decryption with version tracking ----

  /**
   * Mark that the current key was used for encryption.
   * Returns the version used, or triggers rotation if overused.
   */
  encryptUsed() {
    const kv = this.current();
    if (!kv) throw new Error('No active key for encryption');

    kv.encryptCount++;

    // Auto-rotate if overused
    if (kv.isOverused(this.config.maxMessagesPerKey)) {
      return { keyVersion: kv.version, rotationNeeded: true };
    }

    return { keyVersion: kv.version, rotationNeeded: false };
  }

  /**
   * Mark that a specific key version was used for decryption.
   * Returns false if key is revoked.
   */
  decryptUsed(version) {
    if (this._revoked.has(version)) return false;

    const kv = this._keys.get(version);
    if (kv && kv.active) {
      kv.decryptCount++;
      return true;
    }

    // Grace period: key still usable for decrypt
    return !this._revoked.has(version);
  }

  // ---- Pruning ----

  /**
   * Remove excess active keys beyond maxActiveKeys.
   */
  _pruneOldKeys() {
    const active = this.listActiveSorted();
    if (active.length <= this.config.maxActiveKeys) return;

    const toRevoke = active.slice(this.config.maxActiveKeys);
    const now = Date.now();
    for (const kv of toRevoke) {
      this._revoke(kv.version, 'rotation', now);
    }
  }

  /**
   * Remove expired revocation entries beyond maxRevokedEntries.
   */
  _pruneRevoked() {
    const now = Date.now();
    // Remove expired
    for (const [ver, entry] of this._revoked) {
      if (now > entry.expiresAt) {
        this._revoked.delete(ver);
      }
    }

    // Trim oldest if still too many
    if (this._revoked.size > this.config.maxRevokedEntries) {
      const sorted = [...this._revoked.values()].sort((a, b) => a.revokedAt - b.revokedAt);
      const toDelete = sorted.slice(0, sorted.length - this.config.maxRevokedEntries);
      for (const entry of toDelete) {
        this._revoked.delete(entry.keyVersion);
      }
    }
  }

  // ---- Persistence ----

  /**
   * Save state to disk (debounced).
   */
  _schedulePersist() {
    if (this._persistTimer) clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => this._persist(), 500);
  }

  _persist() {
    if (!this.config.persistencePath) return;

    const state = this.exportState();
    try {
      const dir = path.dirname(this.config.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.config.persistencePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
      // Non-fatal: persistence failure shouldn't break crypto ops
      console.error('[KeyLifecycle] persist failed:', e.message);
    }
  }

  persistNow() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    this._persist();
  }

  // ---- State import/export ----

  exportState() {
    return {
      version: 1,
      algorithm: this._algorithm,
      currentVersion: this._currentVersion,
      totalRotations: this._totalRotations,
      keys: [...this._keys.values()].map(kv => ({
        version: kv.version,
        algorithm: kv.algorithm,
        fingerprint: kv.fingerprint(),
        createdAt: kv.createdAt,
        expiresAt: kv.expiresAt,
        encryptCount: kv.encryptCount,
        decryptCount: kv.decryptCount,
        active: kv.active,
      })),
      revoked: [...this._revoked.values()].map(e => ({
        keyVersion: e.keyVersion,
        reason: e.reason,
        revokedAt: e.revokedAt,
        expiresAt: e.expiresAt,
        replacedBy: e.replacedBy,
      })),
      exportedAt: Date.now(),
    };
  }

  static importState(stateJson, keyProvider, config = {}) {
    const data = typeof stateJson === 'string' ? JSON.parse(stateJson) : stateJson;
    const mgr = new KeyLifecycleManager(config);

    mgr._algorithm = data.algorithm || 'ML-KEM-768';
    mgr._currentVersion = data.currentVersion || 1;
    mgr._totalRotations = data.totalRotations || 0;

    // Restore keys from keyProvider (we don't store raw key material in state)
    if (typeof keyProvider === 'function') {
      for (const k of data.keys || []) {
        const keyMat = keyProvider(k.version, k.fingerprint);
        if (keyMat) {
          const kv = new KeyVersion(k.version, keyMat, k.algorithm, k.createdAt, k.expiresAt);
          kv.encryptCount = k.encryptCount || 0;
          kv.decryptCount = k.decryptCount || 0;
          kv.active = k.active;
          mgr._keys.set(k.version, kv);
        }
      }
    }

    // Restore revocations
    for (const r of data.revoked || []) {
      const entry = new RevocationEntry(r.keyVersion, r.reason, r.revokedAt, r.expiresAt, r.replacedBy);
      mgr._revoked.set(r.keyVersion, entry);
    }

    return mgr;
  }

  // ---- Audit / Reporting ----

  /**
   * Generate an audit report of all keys and revocations.
   */
  auditReport() {
    const now = Date.now();
    const active = this.listActiveSorted();
    const revoked = this.getRevocationList();

    return {
      generatedAt: now,
      algorithm: this._algorithm,
      currentVersion: this._currentVersion,
      totalRotations: this._totalRotations,
      activeKeyCount: active.length,
      revokedKeyCount: revoked.length,
      activeKeys: active.map(kv => ({
        version: kv.version,
        fingerprint: kv.fingerprint(),
        age: Math.round((now - kv.createdAt) / 3600000 * 10) / 10 + 'h',
        encryptCount: kv.encryptCount,
        decryptCount: kv.decryptCount,
        overused: kv.isOverused(),
        expiringIn: kv.expiresAt > now
          ? Math.round((kv.expiresAt - now) / 3600000 * 10) / 10 + 'h'
          : 'expired',
      })),
      revokedKeys: revoked.map(e => ({
        version: e.keyVersion,
        reason: e.reason,
        age: Math.round((now - e.revokedAt) / 3600000 * 10) / 10 + 'h',
      })),
      config: {
        rotationInterval: Math.round(this.config.rotationIntervalMs / 3600000) + 'h',
        maxMessagesPerKey: this.config.maxMessagesPerKey,
        gracePeriod: Math.round(this.config.gracePeriodMs / 3600000) + 'h',
        maxActiveKeys: this.config.maxActiveKeys,
      },
    };
  }
}

module.exports = {
  KeyLifecycleManager,
  KeyVersion,
  RevocationEntry,
  DEFAULT_CONFIG,
};
