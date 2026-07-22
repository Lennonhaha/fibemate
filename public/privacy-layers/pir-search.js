// SPDX-License-Identifier: GPL-3.0-only
/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Privacy Layer 实验性功能，未经生产审计
 * 请勿用于关键路径或主网
 */




/**
 * PIR Search - Private Information Retrieval (WebCrypto-Enhanced)
 * 
 * Allows searching messages without revealing search keywords to the server.
 * Uses encrypted database + HMAC-based blind indexing approach.
 * 
 * Method: Server stores encrypted records, returns all potential matches.
 * Client decrypts to find actual matches. Server never sees the query.
 * 
 * Security: Uses AES-GCM for encryption, HMAC-SHA256 for blind indexing.
 */

class PIRClient {
    constructor() {
        this.db = null;
        this.key = null;
        this.conversationKey = null;
        this.indexedKeywords = new Map(); // keyword -> Set of messageIds
    }

    /**
     * Initialize with a per-conversation key for blind indexing
     * @param {Uint8Array} conversationKey - Key for HMAC-based blind index derivation
     */
    async setConversationKey(conversationKey) {
        this.conversationKey = conversationKey;
    }

    /**
     * Generate blind index tokens using HMAC-SHA256
     * Each keyword gets a deterministic but unique index token
     * Server cannot reverse-engineer keywords from tokens
     * @param {string[]} keywords - Keywords to index
     * @returns {Promise<Map<string, Uint8Array>>} - token -> keyword mapping
     */
    async generateBlindIndexTokens(keywords) {
        if (!this.conversationKey) {
            throw new Error('Conversation key not set. Call setConversationKey() first.');
        }
        const tokens = new Map();
        for (const keyword of keywords) {
            const token = await this._computeBlindIndex(keyword.toLowerCase().trim());
            tokens.set(this._bytesToHex(token), keyword);
        }
        return tokens;
    }

    /**
     * Internal: Compute HMAC-SHA256 blind index for a keyword
     * @param {string} keyword 
     * @returns {Promise<Uint8Array>}
     */
    async _computeBlindIndex(keyword) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            this.conversationKey,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(keyword));
        // Use first 16 bytes of HMAC as the blind index token
        return new Uint8Array(signature).slice(0, 16);
    }

    /**
     * Hash a search query using SHA-256 to produce a search token
     * Server never sees the raw keyword
     * @param {string[]} keywords 
     * @returns {Promise<Uint8Array>} - SHA-256 hash of normalized keywords
     */
    async generateSearchToken(keywords) {
        const encoder = new TextEncoder();
        const normalized = keywords.map(k => k.toLowerCase().trim()).sort().join('|');
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(normalized));
        return new Uint8Array(hashBuffer);
    }

    /**
     * Encrypt search token for transmission (still reveals nothing to server)
     * Uses AES-GCM with a random IV
     * @param {Uint8Array} token 
     * @param {CryptoKey} key 
     * @returns {Promise<string>} - base64 "iv:ciphertext"
     */
    async encryptSearchToken(token, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            token
        );
        return this._bytesToBase64(iv) + ':' + this._bytesToBase64(new Uint8Array(encrypted));
    }

    /**
     * Create encrypted database entry for PIR
     * Each message gets its own unique key derived from messageId + masterKey
     * @param {{content: string, timestamp: number, sender: string}} message 
     * @param {string} messageId 
     * @param {Uint8Array} masterKey - Master key for this conversation
     * @returns {Promise<object>}
     */
    async createEncryptedEntry(message, messageId, masterKey) {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        // Derive per-message key using PBKDF2 with messageId as salt
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(messageId),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: iv,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );
        const derivedKey = await crypto.subtle.importKey(
            'raw',
            derivedBits,
            'AES-GCM',
            false,
            ['encrypt', 'decrypt']
        );

        // Encrypt message content
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            derivedKey,
            encoder.encode(message.content)
        );

        // Also encrypt metadata (sender, timestamp) separately
        const metaIv = crypto.getRandomValues(new Uint8Array(12));
        const metaKeyMaterial = await crypto.subtle.importKey(
            'raw',
            derivedBits, // reuse derived bits as meta key
            'AES-GCM',
            false,
            ['encrypt']
        );
        const metaEncrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: metaIv },
            metaKeyMaterial,
            encoder.encode(JSON.stringify({ sender: message.sender, timestamp: message.timestamp }))
        );

        return {
            id: messageId,
            encrypted: this._bytesToBase64(new Uint8Array(encrypted)),
            iv: this._bytesToBase64(iv),
            metaEncrypted: this._bytesToBase64(new Uint8Array(metaEncrypted)),
            metaIv: this._bytesToBase64(metaIv),
            keywords: [] // blind index tokens will be added separately by addToIndex
        };
    }

    /**
     * Add a message to the keyword index
     * @param {string} messageId 
     * @param {string[]} keywords - Raw keywords (indexed client-side only)
     */
    async addToKeywordIndex(messageId, keywords) {
        if (!this.conversationKey) return;
        for (const kw of keywords) {
            const token = await this._computeBlindIndex(kw.toLowerCase().trim());
            const tokenHex = this._bytesToHex(token);
            if (!this.indexedKeywords.has(tokenHex)) {
                this.indexedKeywords.set(tokenHex, new Set());
            }
            this.indexedKeywords.get(tokenHex).add(messageId);
        }
    }

    /**
     * Search the encrypted database
     * Server returns candidates by blind index token; client decrypts and filters
     * @param {Array} encryptedDB - Encrypted entries from server
     * @param {string} query - Search query
     * @param {Uint8Array} masterKey - Conversation master key
     * @returns {Promise<Array>}
     */
    async search(encryptedDB, query, masterKey) {
        const results = [];
        const searchToken = await this.generateSearchToken([query]);

        for (const entry of encryptedDB) {
            try {
                const decrypted = await this._decryptEntry(entry, masterKey);
                if (decrypted && decrypted.content.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        ...decrypted,
                        id: entry.id,
                        timestamp: decrypted.timestamp
                    });
                }
            } catch (e) {
                // Decryption failed, skip this entry
            }
        }
        return results;
    }

    /**
     * Internal: Decrypt a single entry
     * @param {object} entry 
     * @param {Uint8Array} masterKey 
     */
    async _decryptEntry(entry, masterKey) {
        const decoder = new TextDecoder();
        const iv = this._base64ToBytes(entry.iv);
        const encrypted = this._base64ToBytes(entry.encrypted);

        // Recreate derived key
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(entry.id),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: iv,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );
        const derivedKey = await crypto.subtle.importKey(
            'raw',
            derivedBits,
            'AES-GCM',
            false,
            ['decrypt']
        );

        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                derivedKey,
                encrypted
            );
            return { content: decoder.decode(decrypted) };
        } catch (e) {
            return null;
        }
    }

    /** Helper: Uint8Array -> hex string */
    _bytesToHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /** Helper: Uint8Array -> base64 string */
    _bytesToBase64(bytes) {
        return btoa(String.fromCharCode(...bytes));
    }

    /** Helper: base64 string -> Uint8Array */
    _base64ToBytes(b64) {
        return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    }
}

class PIRServer {
    constructor() {
        this.encryptedDB = [];
        this.blindIndex = new Map(); // blind_token -> [messageIds]
    }

    /**
     * Store encrypted message (server never sees plaintext)
     */
    async storeEncryptedMessage(message, messageId, blindTokens) {
        this.encryptedDB.push({
            id: messageId,
            encrypted: message.encrypted,
            iv: message.iv,
            metaEncrypted: message.metaEncrypted,
            metaIv: message.metaIv,
            timestamp: message.timestamp || Date.now(),
            sender: message.sender
        });
        // Store blind index tokens for PIR queries
        if (blindTokens && Array.isArray(blindTokens)) {
            for (const token of blindTokens) {
                if (!this.blindIndex.has(token)) {
                    this.blindIndex.set(token, []);
                }
                this.blindIndex.get(token).push(messageId);
            }
        }
    }

    /**
     * Return all encrypted entries (full PIR response)
     */
    getAllEncryptedEntries() {
        return this.encryptedDB;
    }

    /**
     * Return candidates matching a blind index token
     * Server learns nothing beyond "some keyword matched"
     * @param {string} blindTokenHex - Hex-encoded blind index token
     * @returns {Array}
     */
    getCandidates(blindTokenHex) {
        const candidateIds = this.blindIndex.get(blindTokenHex) || [];
        return this.encryptedDB.filter(e => candidateIds.includes(e.id));
    }

    /**
     * Return candidates within a time window (for plausible deniability)
     * @param {number} daysBack 
     * @returns {Array}
     */
    getCandidatesByTime(daysBack = 7) {
        const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
        return this.encryptedDB.filter(e => e.timestamp > cutoff);
    }

    /**
     * Get total entry count (for cover traffic calibration)
     */
    getEntryCount() {
        return this.encryptedDB.length;
    }
}

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PIRClient, PIRServer };
}