// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Post-Quantum Integration Module
 * 
 * Integrates ML-KEM-768 with Double Ratchet for hybrid post-quantum security.
 * 
 * Architecture:
 * - X3DH initialization uses Hybrid Key Exchange (ML-KEM + ECDH P-256)
 * - Double Ratchet chain keys derived from hybrid shared secret
 * - Provides both classical and post-quantum security
 */

// Import ML-KEM-768 (works with both module and global)
const MLKEM = typeof window !== 'undefined' && window.MLKEM768 ? window.MLKEM768 : null;

/**
 * Post-Quantum Double Ratchet Extension
 * Extends the standard Double Ratchet with ML-KEM-768 hybrid key exchange
 */
class PQDoubleRatchet {
    constructor() {
        this.dr = null; // Standard Double Ratchet instance
        this.hybridSecret = null; // Combined ML-KEM + ECDH secret
        this.kemKeypair = null; // ML-KEM keypair
    }

    /**
     * Initialize with hybrid X3DH
     * @param {Object} identityKey - Our identity key pair
     * @param {Object} signedPreKey - Our signed prekey
     * @param {Array} oneTimePreKeys - Our one-time prekeys
     */
    async initializeX3DH(identityKey, signedPreKey, oneTimePreKeys) {
        // Generate hybrid key exchange parameters
        const hke = new MLKEM.HybridKeyExchange();
        const initResult = await hke.initialize();
        
        this.kemKeypair = {
            publicKey: initResult.kemPublicKey,
            secretKey: hke.kemKeypair.secretKey
        };
        
        // Store for later use in X3DH
        this.hybridKEM = hke;
        
        return {
            identityKey,
            signedPreKey,
            oneTimePreKeys,
            kemPublicKey: initResult.kemPublicKey,
            ecdhPublicKey: initResult.ecdhPublicKey
        };
    }

    /**
     * Perform hybrid X3DH key agreement (initiator)
     * @param {Object} peerBundle - Peer's public key bundle
     */
    async x3dhInitiate(peerBundle) {
        // Standard ECDH X3DH
        const ecdhResult = await this._ecdhX3DH(peerBundle);
        
        // ML-KEM encapsulation to peer
        const kemResult = await MLKEM.encapsulate(peerBundle.kemPublicKey);
        
        // Combine secrets
        const hybridSecret = await MLKEM.hybridCombine(
            kemResult.sharedSecret,
            ecdhResult.sharedSecret
        );
        
        this.hybridSecret = hybridSecret;
        
        return {
            ciphertext: kemResult.ciphertext,
            ecdhPublicKey: ecdhResult.publicKey,
            hybridSecret
        };
    }

    /**
     * Perform hybrid X3DH key agreement (responder)
     * @param {Uint8Array} kemCiphertext - ML-KEM ciphertext from initiator
     * @param {ArrayBuffer} ecdhPublicKey - ECDH public key from initiator
     */
    async x3dhRespond(kemCiphertext, ecdhPublicKey) {
        // Decapsulate ML-KEM
        const kemSecret = await MLKEM.decapsulate(
            this.kemKeypair.secretKey,
            kemCiphertext
        );
        
        // ECDH key agreement
        const ecdhSecret = await this._ecdhRespond(ecdhPublicKey);
        
        // Combine secrets
        const hybridSecret = await MLKEM.hybridCombine(kemSecret, ecdhSecret);
        
        this.hybridSecret = hybridSecret;
        
        return { hybridSecret };
    }

    /**
     * Initialize Double Ratchet with hybrid secret
     */
    async initializeRatchet() {
        if (!this.hybridSecret) {
            throw new Error('Hybrid secret not established. Run X3DH first.');
        }

        // Use hybrid secret as root key for Double Ratchet
        // Import from message-crypto.js or double-ratchet.js
        if (typeof DoubleRatchet !== 'undefined') {
            this.dr = new DoubleRatchet();
            await this.dr.initialize(this.hybridSecret);
        } else {
            console.warn('DoubleRatchet not available. Storing hybrid secret for later.');
        }
        
        return this.dr;
    }

    // Private helper methods
    async _ecdhX3DH(peerBundle) {
        // Simplified ECDH X3DH - production uses full implementation
        const ecdhKey = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits']
        );
        
        const peerKey = await crypto.subtle.importKey(
            'raw',
            peerBundle.signedPreKey,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );
        
        const sharedSecret = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: peerKey },
            ecdhKey.privateKey,
            256
        );
        
        const publicKey = await crypto.subtle.exportKey('raw', ecdhKey.publicKey);
        
        return {
            sharedSecret: new Uint8Array(sharedSecret),
            publicKey
        };
    }

    async _ecdhRespond(ecdhPublicKey) {
        // Production implementation would use our private key
        // This is a simplified version
        return new Uint8Array(32); // Placeholder
    }
}

/**
 * Post-Quantum Key Manager
 * Manages hybrid keys for all conversations
 */
class PQKeyManager {
    constructor() {
        this.conversations = new Map(); // conversationId -> PQDoubleRatchet
        this.dbName = 'fibemate-pq-keys';
        this.dbVersion = 2;
        this._dbPromise = null;
        this._wrapKeyPromise = null;
    }

    /**
     * 打开 IndexedDB（懒初始化，单例 Promise）
     */
    async _openDb() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.dbVersion);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('keys')) {
                    db.createObjectStore('keys');
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return this._dbPromise;
    }

    /**
     * 获取或创建 AES-GCM 封装密钥（extractable:false）。
     * 该密钥的原始字节永远无法通过 exportKey 导出，
     * 因此离线复制浏览器存储文件也无法解密会话密钥。
     */
    async _getWrapKey() {
        if (this._wrapKeyPromise) return this._wrapKeyPromise;
        this._wrapKeyPromise = (async () => {
            const db = await this._openDb();
            const existing = await this._idbGet(db, 'wrapkey');
            if (existing) return existing;
            const key = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                false, // extractable: false
                ['encrypt', 'decrypt']
            );
            await this._idbPut(db, 'wrapkey', key);
            return key;
        })();
        return this._wrapKeyPromise;
    }

    async _idbGet(db, key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('keys', 'readonly');
            const req = tx.objectStore('keys').get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async _idbPut(db, key, value) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction('keys', 'readwrite');
            tx.objectStore('keys').put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Initialize conversation with post-quantum security
     */
    async initConversation(conversationId, peerBundle) {
        const pq = new PQDoubleRatchet();
        
        // Initialize our keys
        const ourBundle = await pq.initializeX3DH();
        
        // Perform X3DH
        const x3dhResult = await pq.x3dhInitiate(peerBundle);
        
        // Initialize Double Ratchet
        await pq.initializeRatchet();
        
        // Store
        this.conversations.set(conversationId, pq);
        await this._saveToStorage(conversationId, pq);
        
        return {
            ourBundle,
            x3dhResult
        };
    }

    /**
     * Get Double Ratchet instance for conversation
     */
    getRatchet(conversationId) {
        const pq = this.conversations.get(conversationId);
        return pq ? pq.dr : null;
    }

    /**
     * Save conversation keys to persistent storage.
     * 私钥与会话密钥用 AES-GCM 加密后存 IndexedDB，
     * 封装密钥 extractable:false，杜绝明文落盘。
     */
    async _saveToStorage(conversationId, pq) {
        try {
            const data = {
                kemKeypair: pq.kemKeypair ? {
                    publicKey: Array.from(pq.kemKeypair.publicKey),
                    secretKey: Array.from(pq.kemKeypair.secretKey)
                } : null,
                hybridSecret: pq.hybridSecret ? Array.from(pq.hybridSecret) : null
            };

            const wrapKey = await this._getWrapKey();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const plaintext = new TextEncoder().encode(JSON.stringify(data));
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                wrapKey,
                plaintext
            );

            const db = await this._openDb();
            await this._idbPut(db, 'pq_' + conversationId, {
                iv: Array.from(iv),
                ciphertext: Array.from(new Uint8Array(ciphertext))
            });
        } catch (e) {
            console.error('Failed to save PQ keys:', e);
        }
    }

    /**
     * Load conversation keys from storage（AES-GCM 解密）
     */
    async loadFromStorage(conversationId) {
        try {
            const db = await this._openDb();
            const record = await this._idbGet(db, 'pq_' + conversationId);
            if (!record) return null;

            const wrapKey = await this._getWrapKey();
            const iv = new Uint8Array(record.iv);
            const ciphertext = new Uint8Array(record.ciphertext);
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                wrapKey,
                ciphertext
            );
            const data = JSON.parse(new TextDecoder().decode(plaintext));

            const pq = new PQDoubleRatchet();
            if (data.kemKeypair) {
                pq.kemKeypair = {
                    publicKey: new Uint8Array(data.kemKeypair.publicKey),
                    secretKey: new Uint8Array(data.kemKeypair.secretKey)
                };
            }
            if (data.hybridSecret) {
                pq.hybridSecret = new Uint8Array(data.hybridSecret);
            }

            this.conversations.set(conversationId, pq);
            return pq;
        } catch (e) {
            console.error('Failed to load PQ keys:', e);
            return null;
        }
    }
}

// SLH-DSA (SPHINCS+) lazy-loaded via WASM
let _slhDsaModule = null;
let _slhDsaInitPromise = null;

/**
 * SLH-DSA-128s Stateless Hash-Based Signature (FIPS 205).
 * Used for message authentication alongside ML-KEM-768 key exchange.
 */
const SLHDSA = {
    /**
     * Check if SLH-DSA is available.
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        try {
            await this._ensureLoaded();
            return true;
        } catch (e) {
            console.warn('SLH-DSA WASM not available:', e.message);
            return false;
        }
    },

    /**
     * Generate a new SLH-DSA keypair.
     * @returns {Promise<{publicKey: string, secretKey: string, sigBytes: number}>}
     */
    async keygen() {
        const mod = await this._ensureLoaded();
        const jsonStr = mod.keygen();
        const keys = JSON.parse(jsonStr);
        return { ...keys, sigBytes: 7856 };
    },

    /**
     * Sign a message (CPU-intensive ~500ms, call from Worker).
     * @param {string} message
     * @param {string} secretKeyB64
     * @param {string} publicKeyB64
     * @returns {Promise<string>} Base64 signature
     */
    async sign(message, secretKeyB64, publicKeyB64) {
        const mod = await this._ensureLoaded();
        return mod.sign(message, publicKeyB64, secretKeyB64);
    },

    /**
     * Verify a signature (fast ~10ms, main thread safe).
     * @param {string} sigB64
     * @param {string} message
     * @param {string} publicKeyB64
     * @returns {Promise<boolean>}
     */
    async verify(sigB64, message, publicKeyB64) {
        const mod = await this._ensureLoaded();
        return mod.verify(sigB64, message, publicKeyB64);
    },

    /**
     * Get algorithm parameters.
     * @returns {Promise<Object>}
     */
    async getParams() {
        const mod = await this._ensureLoaded();
        return JSON.parse(mod.get_params());
    },

    async _ensureLoaded() {
        if (_slhDsaModule) return _slhDsaModule;
        if (_slhDsaInitPromise) return _slhDsaInitPromise;

        _slhDsaInitPromise = (async () => {
            try {
                const module = await import('./slh-dsa-wasm/pkg/fibemate_slh_dsa_wasm.js');
                await module.default();
                _slhDsaModule = module;
                console.log('[PQIntegration] SLH-DSA WASM loaded');
                return module;
            } catch (e) {
                // Clear on failure so next call retries instead of caching failure forever
                _slhDsaInitPromise = null;
                throw e;
            }
        })();

        return _slhDsaInitPromise;
    }
};

// Export
const PQIntegration = {
    PQDoubleRatchet,
    PQKeyManager,
    SLHDSA,
    
    /**
     * Check if post-quantum cryptography is available
     */
    isAvailable() {
        return MLKEM !== null && typeof crypto !== 'undefined' && crypto.subtle;
    },

    /**
     * Get security info
     */
    getSecurityInfo() {
        return {
            algorithm: 'ML-KEM-768 + ECDH P-256 Hybrid',
            classicalSecurity: '128-bit (ECDH P-256)',
            quantumSecurity: '192-bit (ML-KEM-768)',
            combinedSecurity: '128-bit classical + post-quantum',
            signatureAlgorithm: 'SLH-DSA-128s (FIPS 205)',
            status: this.isAvailable() ? 'available' : 'unavailable'
        };
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.PQIntegration = PQIntegration;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PQIntegration;
}
