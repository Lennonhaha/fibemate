// SPDX-License-Identifier: GPL-3.0-only
/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Privacy Layer 实验性功能，未经生产审计
 * 请勿用于关键路径或主网
 */




/**
 * Mixnet Router - Mix Network Routing
 * 
 * Provides anonymity by routing messages through multiple relays.
 * Each relay only knows the previous hop and next hop, not the sender/receiver.
 * 
 * Design: Mix cascade (0 -> mix1 -> mix2 -> mix3 -> destination)
 * Each mix node shuffles and delays messages to break timing correlation.
 */

class MixnetClient {
    constructor() {
        this.mixNodes = [];
        this.mixPublicKeys = {};
    }
    
    /**
     * Configure mix network nodes
     * In production, these would be provided by the service or user-selected
     */
    configureMixNodes(nodes) {
        this.mixNodes = nodes;
        // In real implementation, fetch public keys for each node
        // Here we assume pre-configured or fetched securely
    }
    
    /**
     * Create layered encrypted message (onion routing)
     * Each layer can only be peeled by its corresponding mix node
     * 
     * Message structure:
     * {
     *   payload: encrypted_data,
     *   nextDestination: next_hop_address,
     *   mixId: intended_mix_node_id
     * }
     */
    async createOnionMessage(plaintext, destination) {
        if (this.mixNodes.length === 0) {
            throw new Error('No mix nodes configured');
        }
        
        // Build onion from outermost to innermost
        let currentPayload = plaintext;
        const layers = [];
        
        // Each mix node gets: { payload, nextDestination, mixId }
        for (let i = this.mixNodes.length - 1; i >= 0; i--) {
            const mixNode = this.mixNodes[i];
            const nextDestination = i === this.mixNodes.length - 1 
                ? destination 
                : this.mixNodes[i + 1].address;
            
            // Encrypt layer with mix node's public key
            const layer = await this.encryptLayer({
                payload: currentPayload,
                nextDestination: nextDestination,
                mixId: mixNode.id,
                layerIndex: i
            }, mixNode.publicKey);
            
            layers.unshift({
                encrypted: layer,
                mixId: mixNode.id,
                address: mixNode.address
            });
            
            currentPayload = layer;
        }
        
        // First hop knows where to send initially
        return {
            layers: layers,
            firstHop: layers[0].address,
            totalLayers: layers.length,
            timestamp: Date.now()
        };
    }
    
    /**
     * Encrypt a single layer for a mix node
     * 
     * Uses hybrid encryption: ECDH key exchange to derive shared secret,
     * then AES-GCM for symmetric encryption.
     * 
     * @param {Object} data - The data to encrypt for this layer
     * @param {Object} publicKey - Mix node's public key (should be ECDH P-256 or X25519)
     * @returns {Promise<Object>} Encrypted layer with ephemeral public key
     */
    async encryptLayer(data, publicKey) {
        const encoder = new TextEncoder();
        const plaintext = JSON.stringify(data);
        
        // Validate publicKey
        if (!publicKey) {
            throw new Error('[Mixnet] Mix node public key is required for layer encryption');
        }
        
        try {
            // Generate ephemeral keypair for ECDH
            const ephemeralKeyPair = await crypto.subtle.generateKey(
                { name: 'ECDH', namedCurve: 'P-256' },
                true,
                ['deriveKey']
            );
            
            // Export ephemeral public key (to include in the layer)
            const ephemeralPublicKeyRaw = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);
            const ephemeralPublicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(ephemeralPublicKeyRaw));
            
            // Get mix node's public key
            let mixPublicKey;
            if (typeof publicKey === 'string') {
                // Assume base64-encoded raw public key
                const publicKeyBytes = Uint8Array.from(atob(publicKey), c => c.charCodeAt(0));
                mixPublicKey = await crypto.subtle.importKey(
                    'raw',
                    publicKeyBytes,
                    { name: 'ECDH', namedCurve: 'P-256' },
                    false,
                    []
                );
            } else if (publicKey instanceof CryptoKey) {
                mixPublicKey = publicKey;
            } else {
                throw new Error('[Mixnet] Invalid public key format');
            }
            
            // Perform ECDH to derive shared secret
            const sharedSecret = await crypto.subtle.deriveKey(
                { name: 'ECDH', public: mixPublicKey },
                ephemeralKeyPair.privateKey,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt']
            );
            
            // Generate random IV
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            // Encrypt the layer data with derived key
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                sharedSecret,
                encoder.encode(plaintext)
            );
            
            // Return encrypted layer with ephemeral public key (for mix node to derive same secret)
            // IMPORTANT: The ephemeral public key is included so the mix node can compute the same shared secret
            // The mix node's private key + ephemeral public key = same shared secret
            return {
                encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
                iv: btoa(String.fromCharCode(...iv)),
                ephemeralPublicKey: ephemeralPublicKeyBase64  // Mix node needs this for ECDH
            };
        } catch (error) {
            console.error('[Mixnet] Layer encryption failed:', error.message);
            throw new Error('Mixnet layer encryption failed: ' + error.message);
        }
    }
    
    /**
     * Send message through mix network
     */
    async sendThroughMix(plaintext, destination) {
        const onionMessage = await this.createOnionMessage(plaintext, destination);
        
        // Send to first mix node (it will forward to next)
        // In real implementation, this would be an HTTP/WebSocket call
        return {
            success: true,
            onion: onionMessage,
            messageId: crypto.randomUUID()
        };
    }
    
    /**
     * Parse received mixnet message
     */
    parseMixnetMessage(encryptedPayload) {
        // Peeling happens on client side for received messages
        try {
            const layers = encryptedPayload.layers || [];
            const decrypted = [];
            
            for (const layer of layers) {
                try {
                    const decoded = JSON.parse(atob(layer.encrypted));
                    decrypted.push(decoded);
                } catch (e) {
                    // Layer parsing failed
                }
            }
            
            return decrypted;
        } catch (e) {
            throw new Error('Failed to parse mixnet message: ' + e.message);
        }
    }
}

/**
 * Mix Node - Server-side component
 * Each mix node:
 * 1. Receives encrypted message
 * 2. Decrypts its layer
 * 3. Adds to mix batch
 * 4. Shuffles batch
 * 5. forwards to next node or destination
 */
class MixNode {
    constructor(config) {
        this.id = config.id;
        this.privateKey = config.privateKey;
        this.nextHop = config.nextHop;
        this.batchSize = config.batchSize || 10;
        this.mixBatch = [];
        this.lastFlush = Date.now();
    }
    
    /**
     * Receive and queue message
     */
    async receiveMessage(encryptedLayer) {
        // Decrypt this layer
        const decrypted = await this.decryptLayer(encryptedLayer);
        
        // Add to mix batch
        this.mixBatch.push({
            data: decrypted,
            receivedAt: Date.now()
        });
        
        // Check if batch is ready to flush
        if (this.mixBatch.length >= this.batchSize) {
            return this.flushBatch();
        }
        
        return { status: 'queued', queueSize: this.mixBatch.length };
    }
    
    /**
     * Decrypt one layer using mix node's private key
     * 
     * Performs ECDH with the ephemeral public key to derive the shared secret,
     * then decrypts with AES-GCM.
     * 
     * @param {Object} encryptedLayer - The encrypted layer with ephemeral public key
     * @returns {Promise<Object>} Decrypted layer data
     */
    async decryptLayer(encryptedLayer) {
        try {
            // Parse the encrypted layer
            const iv = Uint8Array.from(atob(encryptedLayer.iv), c => c.charCodeAt(0));
            const encrypted = Uint8Array.from(atob(encryptedLayer.encrypted), c => c.charCodeAt(0));
            const ephemeralPublicKeyBase64 = encryptedLayer.ephemeralPublicKey;
            
            if (!ephemeralPublicKeyBase64) {
                throw new Error('[MixNode] Missing ephemeral public key in encrypted layer');
            }
            
            // Import ephemeral public key
            const ephemeralPublicKeyBytes = Uint8Array.from(atob(ephemeralPublicKeyBase64), c => c.charCodeAt(0));
            const ephemeralPublicKey = await crypto.subtle.importKey(
                'raw',
                ephemeralPublicKeyBytes,
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                []
            );
            
            // Derive the same shared secret using mix node's private key
            if (!this.privateKey) {
                throw new Error('[MixNode] Private key not configured');
            }
            
            let mixPrivateKey;
            if (typeof this.privateKey === 'string') {
                // Assume base64-encoded raw private key (PKCS8)
                const privateKeyBytes = Uint8Array.from(atob(this.privateKey), c => c.charCodeAt(0));
                mixPrivateKey = await crypto.subtle.importKey(
                    'pkcs8',
                    privateKeyBytes,
                    { name: 'ECDH', namedCurve: 'P-256' },
                    false,
                    ['deriveKey']
                );
            } else if (this.privateKey instanceof CryptoKey) {
                mixPrivateKey = this.privateKey;
            } else {
                throw new Error('[MixNode] Invalid private key format');
            }
            
            // Perform ECDH: mixPrivateKey + ephemeralPublicKey = shared secret
            const sharedSecret = await crypto.subtle.deriveKey(
                { name: 'ECDH', public: ephemeralPublicKey },
                mixPrivateKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );
            
            // Decrypt the layer with the derived key
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                sharedSecret,
                encrypted
            );
            
            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(decrypted));
        } catch (error) {
            console.error('[MixNode] Layer decryption failed:', error.message);
            throw new Error('MixNode layer decryption failed: ' + error.message);
        }
    }
    
    /**
     * Flush batch: shuffle and forward
     */
    async flushBatch() {
        // Shuffle the batch (Fisher-Yates)
        for (let i = this.mixBatch.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.mixBatch[i], this.mixBatch[j]] = [this.mixBatch[j], this.mixBatch[i]];
        }
        
        // Forward each message
        const forwarded = [];
        for (const msg of this.mixBatch) {
            const nextData = msg.data;
            if (nextData.nextDestination) {
                // Forward to next hop
                forwarded.push({
                    destination: nextData.nextDestination,
                    payload: nextData.payload,
                    mixId: nextData.mixId
                });
            }
            // If no nextDestination, this is final destination
        }
        
        this.mixBatch = [];
        this.lastFlush = Date.now();
        
        return { forwarded, count: forwarded.length };
    }
    
    /**
     * Get mix node status
     */
    getStatus() {
        return {
            id: this.id,
            queueSize: this.mixBatch.length,
            lastFlush: this.lastFlush,
            batchSize: this.batchSize
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MixnetClient, MixNode };
}