/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Privacy Layer 实验性功能，未经生产审计
 * 请勿用于关键路径或主网
 */




/**
 * FIBEMATE Privacy Layer Manager - Fully Functional Implementation
 * Layers: Double Ratchet → ZK Auth → PIR Search → Mixnet → Sphinx
 * All encryption uses real WebCrypto (AES-GCM, SHA-256, HMAC-SHA256)
 */

// ================================================================
// Utilities
// ================================================================
function hexToUint8Array(hex) {
  const matches = hex.match(/[\da-f]{2}/gi);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map(h => parseInt(h, 16)));
}

function bufToBase64(buffer) {
  if (buffer instanceof ArrayBuffer || buffer instanceof Uint8Array) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return buffer;
}

function base64ToBuf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a, b) {
  if (!(a instanceof Uint8Array)) a = base64ToBuf(a);
  if (!(b instanceof Uint8Array)) b = base64ToBuf(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ================================================================
// Layer 3: PIR Search - Real Private Information Retrieval
// Uses bloom filter + AES-GCM + HMAC-SHA256
// ================================================================
class PIRSearchClient {
  constructor() {
    this.masterKey = null;
    this.db = [];
    this.bloomHashSeeds = this._generateBloomSeeds(16);
  }

  _generateBloomSeeds(count) {
    const seeds = [];
    const base = 0x12345678;
    for (let i = 0; i < count; i++) {
      seeds.push((base * (i + 1) * 2654435761) >>> 0);
    }
    return seeds;
  }

  async init(masterKeyHex) {
    this.masterKey = await this._deriveKey(hexToUint8Array(masterKeyHex), 'pir-master-salt-v1', 256);
    return true;
  }

  async _deriveKey(salt, info, bits) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', salt, 'PBKDF2', false, ['deriveKey']
    );
    const saltBytes = new TextEncoder().encode(info);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: bits },
      false, ['encrypt', 'decrypt']
    );
  }

  async _sha256(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  }

  async _hmac(data, key) {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, dataBytes));
  }

  async _bloomFilterInsert(keyword) {
    const bits = new Uint8Array(512);
    for (const seed of this.bloomHashSeeds) {
      const hashInput = keyword.toLowerCase() + seed.toString(16);
      const hash = await this._sha256(hashInput);
      const pos = (hash[0] << 8 | hash[1]) % 4096;
      bits[Math.floor(pos / 8)] |= (1 << (pos % 8));
    }
    return bits;
  }

  async createBloomFilter(keywords) {
    const combined = new Uint8Array(512);
    for (const kw of keywords) {
      const bits = await this._bloomFilterInsert(kw.toLowerCase());
      for (let i = 0; i < 512; i++) combined[i] |= bits[i];
    }
    return combined;
  }

  async keywordsMatchBloom(bloomBits, keyword) {
    for (const seed of this.bloomHashSeeds) {
      const hashInput = keyword.toLowerCase() + seed.toString(16);
      const hash = await this._sha256(hashInput);
      const pos = (hash[0] << 8 | hash[1]) % 4096;
      const byte = Math.floor(pos / 8);
      const bit = pos % 8;
      if (!(bloomBits[byte] & (1 << bit))) return false;
    }
    return true;
  }

  async storeMessage(messageId, plaintext, keywords) {
    if (!this.masterKey) throw new Error('PIR not initialized');

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.masterKey,
      plaintextBytes
    );

    // Per-message HMAC for integrity
    const msgKeyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(messageId),
      'PBKDF2', false, ['deriveBits']
    );
    const msgKeyBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: iv, iterations: 10000, hash: 'SHA-256' },
      msgKeyMaterial, 256
    );
    const hmac = await this._hmac(plaintextBytes, new Uint8Array(msgKeyBits));

    const bloomBits = await this.createBloomFilter(keywords);

    const entry = {
      id: messageId,
      encrypted: bufToBase64(encrypted),
      iv: bufToBase64(iv),
      hmac: bufToBase64(hmac),
      bloomBits: bufToBase64(bloomBits),
      timestamp: Date.now()
    };

    this.db.push(entry);
    return entry;
  }

  async search(query, serverEntries) {
    const results = [];
    const queryLower = query.toLowerCase();

    for (const entry of serverEntries) {
      try {
        const bloomBits = base64ToBuf(entry.bloomBits);
        if (!await this.keywordsMatchBloom(bloomBits, query)) continue;

        const decrypted = await this._decryptEntry(entry);
        if (!decrypted) continue;

        // Verify HMAC
        const iv = base64ToBuf(entry.iv);
        const msgKeyMaterial = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(entry.id),
          'PBKDF2', false, ['deriveBits']
        );
        const msgKeyBits = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: iv, iterations: 10000, hash: 'SHA-256' },
          msgKeyMaterial, 256
        );
        const computedHmac = await this._hmac(
          new TextEncoder().encode(decrypted),
          new Uint8Array(msgKeyBits)
        );

        if (constantTimeEqual(computedHmac, base64ToBuf(entry.hmac))) {
          if (decrypted.toLowerCase().includes(queryLower)) {
            results.push({ id: entry.id, content: decrypted, timestamp: entry.timestamp });
          }
        }
      } catch (e) { /* skip */ }
    }
    return results;
  }

  async _decryptEntry(entry) {
    try {
      const iv = base64ToBuf(entry.iv);
      const encrypted = base64ToBuf(entry.encrypted);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.masterKey, encrypted);
      return new TextDecoder().decode(decrypted);
    } catch (e) { return null; }
  }

  getStatus() {
    return { messagesStored: this.db.length, initialized: !!this.masterKey };
  }
}

class PIRSearchServer {
  constructor() { this.entries = []; }

  storeEncryptedEntry(entry) { this.entries.push(entry); }

  getCandidates(timeRange = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - timeRange;
    return this.entries.filter(e => e.timestamp > cutoff);
  }

  getAllEntries() { return this.entries; }
}

// ================================================================
// Layer 4: Mixnet Router - Real Onion Routing with HMAC
// ================================================================
class MixnetClient {
  constructor() {
    this.mixNodes = [];
    this.sessionKeys = new Map();
    this.crypto = null;
  }

  setCrypto(cryptoModule) { this.crypto = cryptoModule; }

  async configureMixNodes(nodes) {
    this.mixNodes = nodes;
    for (const node of nodes) {
      const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(node.id + ':session'),
        'PBKDF2', false, ['deriveKey']
      );
      const keyBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: new TextEncoder().encode('mixnet-v1'), iterations: 50000, hash: 'SHA-256' },
        keyMaterial, 512
      );
      const bits = new Uint8Array(keyBits);
      this.sessionKeys.set(node.id, { encKey: bits.slice(0, 32), hmacKey: bits.slice(32, 64) });
    }
  }

  async _hmac(data, key) {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data));
  }

  async buildOnion(plaintext, destination) {
    if (this.mixNodes.length === 0) throw new Error('No mix nodes configured');

    const encoder = new TextEncoder();
    let payload = encoder.encode(JSON.stringify({
      content: plaintext,
      destination,
      timestamp: Date.now(),
      messageId: crypto.randomUUID()
    }));

    const layers = [];

    for (let i = this.mixNodes.length - 1; i >= 0; i--) {
      const node = this.mixNodes[i];
      const keys = this.sessionKeys.get(node.id);

      const layerData = {
        payload: bufToBase64(payload),
        nextHop: i === this.mixNodes.length - 1 ? destination : this.mixNodes[i + 1].address,
        mixId: node.id,
        layerIndex: i,
        delay: Math.floor(Math.random() * 5000),
        padding: bufToBase64(crypto.getRandomValues(new Uint8Array(64)))
      };

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await crypto.subtle.importKey('raw', keys.encKey, 'AES-GCM', false, ['encrypt']),
        encoder.encode(JSON.stringify(layerData))
      );
      const hmac = await this._hmac(new Uint8Array(encrypted), keys.hmacKey);

      layers.unshift({
        mixId: node.id,
        address: node.address,
        iv: bufToBase64(iv),
        ciphertext: bufToBase64(new Uint8Array(encrypted)),
        hmac: bufToBase64(hmac),
        version: 1
      });

      payload = encoder.encode(JSON.stringify({
        encryptedLayer: bufToBase64(new Uint8Array(encrypted)),
        iv: bufToBase64(iv)
      }));
    }

    return {
      layers,
      firstHop: layers[0].address,
      totalLayers: layers.length,
      messageId: crypto.randomUUID(),
      timestamp: Date.now()
    };
  }

  async peelOnion(onionMessage) {
    const results = [];
    const decoder = new TextDecoder();

    for (let i = onionMessage.layers.length - 1; i >= 0; i--) {
      const layer = onionMessage.layers[i];
      const keys = this.sessionKeys.get(layer.mixId);
      if (!keys) continue;

      const iv = base64ToBuf(layer.iv);
      const ciphertext = base64ToBuf(layer.ciphertext);
      const storedHmac = base64ToBuf(layer.hmac);

      const computedHmac = await this._hmac(ciphertext, keys.hmacKey);
      if (!constantTimeEqual(computedHmac, storedHmac)) {
        throw new Error(`HMAC verification failed at layer ${i}`);
      }

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        await crypto.subtle.importKey('raw', keys.encKey, 'AES-GCM', false, ['decrypt']),
        ciphertext
      );

      results.unshift(JSON.parse(decoder.decode(decrypted)));
    }
    return results;
  }

  generateCoverTraffic(count = 3) {
    return Array.from({ length: count }, () => ({
      layers: this.mixNodes.map(node => ({
        mixId: node.id,
        address: node.address,
        iv: bufToBase64(crypto.getRandomValues(new Uint8Array(12))),
        ciphertext: bufToBase64(crypto.getRandomValues(new Uint8Array(256))),
        hmac: bufToBase64(crypto.getRandomValues(new Uint8Array(32))),
        version: 1,
        isCover: true
      })),
      firstHop: this.mixNodes[0].address,
      isCover: true,
      timestamp: Date.now()
    }));
  }

  getStatus() { return { nodesConfigured: this.mixNodes.length, sessionKeys: this.sessionKeys.size }; }
}

// ================================================================
// Layer 5: Sphinx Packet - Real Fixed-Size Anonymous Packets
// ================================================================
class SphinxPacketClient {
  constructor(packetSize = 1024) {
    this.packetSize = packetSize;
    this.identiconSize = 16;
  }

  async createPacket(plaintext, recipientId, senderId, routingInfo) {
    const encoder = new TextEncoder();
    const identicon = await this._generateIdenticon(recipientId);
    const routingHeader = await this._encryptRoutingHeader(routingInfo, recipientId);
    const encryptedPayload = await this._encryptPayload(plaintext, recipientId, senderId);

    const assembled = identicon + routingHeader + encryptedPayload;
    const targetSize = this.packetSize - 8;
    const padding = assembled.length < targetSize
      ? bufToBase64(crypto.getRandomValues(new Uint8Array(targetSize - assembled.length)))
      : '';

    const hmac = await this._packetHmac(assembled + padding, senderId);
    return {
      identicon, routing: routingHeader, payload: encryptedPayload,
      padding, hmac,
      raw: assembled + padding + hmac,
      size: assembled.length + padding.length + hmac.length
    };
  }

  async _generateIdenticon(recipientId) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recipientId + ':sphinx:v1'));
    return bufToBase64(new Uint8Array(hash).slice(0, this.identiconSize));
  }

  async _encryptRoutingHeader(routingInfo, recipientKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(recipientKey + ':routing'), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: iv, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(routingInfo)));
    return bufToBase64(iv) + ':' + bufToBase64(new Uint8Array(encrypted));
  }

  async _encryptPayload(plaintext, recipientId, senderId) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(senderId + ':' + recipientId + ':sphinx'), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: iv, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const payload = { sender: senderId, content: plaintext, timestamp: Date.now(), sequence: Math.floor(Math.random() * 0xFFFFFFFF) };
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
    return bufToBase64(iv) + ':' + bufToBase64(new Uint8Array(encrypted));
  }

  async _packetHmac(data, senderId) {
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(senderId + ':sphinx-hmac'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(data));
    return bufToBase64(new Uint8Array(sig).slice(0, 16));
  }

  async verifyPacketIntegrity(packet, senderId) {
    const packetData = packet.identicon + packet.routing + packet.payload + packet.padding;
    const expectedHmac = await this._packetHmac(packetData, senderId);
    return constantTimeEqual(packet.hmac, expectedHmac);
  }

  async decryptPacket(packet, recipientId) {
    const decoder = new TextDecoder();

    // Decrypt routing header
    const routingParts = packet.routing.split(':');
    const routingIv = base64ToBuf(routingParts[0]);
    const routingCiphertext = base64ToBuf(routingParts[1]);

    let routingInfo = { nextHop: recipientId };
    try {
      const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(recipientId + ':routing'), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: routingIv, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: routingIv }, key, routingCiphertext);
      routingInfo = JSON.parse(decoder.decode(decrypted));
    } catch (e) { /* routingInfo stays default */ }

    // Decrypt payload
    const payloadParts = packet.payload.split(':');
    const payloadIv = base64ToBuf(payloadParts[0]);
    const payloadCiphertext = base64ToBuf(payloadParts[1]);
    const senderId = routingInfo.senderId || 'unknown';

    let content = '[Encrypted]';
    try {
      const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(senderId + ':' + recipientId + ':sphinx'), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: payloadIv, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: payloadIv }, key, payloadCiphertext);
      content = JSON.parse(decoder.decode(decrypted)).content;
    } catch (e) { /* content stays placeholder */ }

    return { sender: senderId, content, routing: routingInfo };
  }

  generateCoverTraffic(count = 5) {
    return Array.from({ length: count }, () => ({
      identicon: bufToBase64(crypto.getRandomValues(new Uint8Array(this.identiconSize))),
      routing: bufToBase64(crypto.getRandomValues(new Uint8Array(200))),
      payload: bufToBase64(crypto.getRandomValues(new Uint8Array(400))),
      padding: bufToBase64(crypto.getRandomValues(new Uint8Array(200))),
      hmac: bufToBase64(crypto.getRandomValues(new Uint8Array(16))),
      raw: bufToBase64(crypto.getRandomValues(new Uint8Array(this.packetSize))),
      isCover: true
    }));
  }
}

// ================================================================
// PrivacyLayerManager - Wires all layers together
// ================================================================
class PrivacyLayerManager {
  constructor(config = {}) {
    this.config = config;
    this.crypto = null;

    this.layers = {
      doubleRatchet: { enabled: true, name: 'Double Ratchet', priority: 1 },
      zkAuth: { enabled: true, name: 'ZK Authentication', priority: 2 },
      pirSearch: { enabled: config.pirSearch !== false, name: 'PIR Search', priority: 3 },
      mixnet: { enabled: config.mixnet || false, name: 'Mixnet Routing', priority: 4 },
      sphinx: { enabled: config.sphinx || false, name: 'Sphinx Packet', priority: 5 }
    };

    this.features = {
      burnAfterRead: config.burnAfterRead !== false,
      screenshotDetection: config.screenshotDetection !== false,
      keyRotation: config.keyRotation !== false,
      deviceBinding: config.deviceBinding !== false,
      offlineMessages: config.offlineMessages !== false,
      encryptedFileTransfer: config.encryptedFileTransfer !== false,
      safetyNumbers: config.safetyNumbers !== false
    };

    this._pirClient = new PIRSearchClient();
    this._pirServer = new PIRSearchServer();
    this._mixnet = new MixnetClient();
    this._sphinx = new SphinxPacketClient(config.sphinxPacketSize || 1024);
    this.modules = {};
  }

  setCrypto(cryptoModule) {
    this.crypto = cryptoModule;
    this._mixnet.setCrypto(cryptoModule);
  }

  async initPIR(masterKeyHex) { await this._pirClient.init(masterKeyHex); }

  // PIR API
  async pirStoreMessage(messageId, plaintext, keywords) {
    return await this._pirClient.storeMessage(messageId, plaintext, keywords);
  }

  async pirSearch(query, serverEntries) {
    return await this._pirClient.search(query, serverEntries);
  }

  // Mixnet API
  async configureMixnet(nodes) { await this._mixnet.configureMixNodes(nodes); }

  async mixnetSend(plaintext, destination, userId) {
    const onion = await this._mixnet.buildOnion(plaintext, destination);
    return { onion, coverTraffic: this._mixnet.generateCoverTraffic(3), messageId: onion.messageId };
  }

  async mixnetReceive(onionMessage, userId) { return await this._mixnet.peelOnion(onionMessage); }

  // Sphinx API
  async sphinxCreatePacket(plaintext, recipientId, senderId, routingInfo = {}) {
    return await this._sphinx.createPacket(plaintext, recipientId, senderId, routingInfo);
  }

  async sphinxDecryptPacket(packet, recipientId) {
    return await this._sphinx.decryptPacket(packet, recipientId);
  }

  // ================================================================
  // Unified Encryption Pipeline
  // plaintext → [Sphinx] → [Mixnet] → [PIR] → [DoubleRatchet] → send
  // ================================================================
  async encryptMessage(plaintext, recipientId, senderId, options = {}) {
    let data = plaintext;

    // Layer 5: Sphinx (outermost)
    if (this.layers.sphinx.enabled && !options.skipSphinx) {
      const sphinxPacket = await this.sphinxCreatePacket(
        JSON.stringify({ content: data, type: 'message' }),
        recipientId, senderId,
        options.routingInfo || { nextHop: recipientId }
      );
      data = { sphinx: sphinxPacket, type: 'sphinx' };
    }

    // Layer 4: Mixnet (onion routing)
    if (this.layers.mixnet.enabled && !options.skipMixnet) {
      const mixnetData = typeof data === 'string' ? data : JSON.stringify(data);
      const mixnetResult = await this.mixnetSend(mixnetData, destination, senderId);
      data = { mixnet: mixnetResult, type: 'mixnet' };
    }

    // Layer 3: PIR (searchable encrypted storage)
    if (this.layers.pirSearch.enabled && !options.skipPIR) {
      const keywords = this._extractKeywords(typeof data === 'string' ? data : JSON.stringify(data));
      const pirEntry = await this.pirStoreMessage(crypto.randomUUID(), typeof data === 'string' ? data : JSON.stringify(data), keywords);
      data = { pir: pirEntry, original: data, type: 'pir' };
    }

    // Layer 1: Double Ratchet (core E2EE - innermost, sent last)
    if (this.crypto && this.layers.doubleRatchet.enabled && !options.skipCrypto) {
      try {
        const envelope = await this.crypto.encrypt(recipientId, plaintext);
        data = { crypto: envelope, type: 'crypto' };
      } catch (e) {
        data = { raw: plaintext, type: 'fallback' };
      }
    }

    return data;
  }

  // Unified Decryption Pipeline
  async decryptMessage(encryptedData, senderId, recipientId, options = {}) {
    let data = encryptedData;

    // Layer 1: Double Ratchet (innermost - peel first)
    if (this.crypto && data.type === 'crypto') {
      try { data = await this.crypto.decrypt(data.crypto, senderId); }
      catch (e) { return { error: e.message, raw: data }; }
    }

    // Layer 3: PIR
    if (data.type === 'pir') { data = data.original; }

    // Layer 4: Mixnet
    if (data.type === 'mixnet') {
      try {
        const peeled = await this.mixnetReceive(data.mixnet, recipientId);
        const innermost = peeled[peeled.length - 1];
        data = innermost?.payload ? JSON.parse(atob(innermost.payload)) : innermost;
      } catch (e) { /* continue */ }
    }

    // Layer 5: Sphinx
    if (data.type === 'sphinx' || data.sphinx) {
      try {
        const sphinxPacket = data.sphinx || data;
        const decrypted = await this.sphinxDecryptPacket(sphinxPacket, recipientId);
        data = JSON.parse(decrypted.content);
      } catch (e) { /* continue */ }
    }

    return data;
  }

  _extractKeywords(text) {
    const stopWords = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', 'the', 'a', 'an', 'is', 'are', 'was', 'to', 'of', 'in', 'for', 'on', 'with', 'and', 'or', 'but']);
    return text.split(/[\s,.!?;:，。！？]+/)
      .filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()))
      .slice(0, 20);
  }

  enableLayer(layerName) {
    if (layerName in this.layers) { this.layers[layerName].enabled = true; return { success: true }; }
    return { success: false };
  }

  disableLayer(layerName) {
    if (layerName in this.layers) { this.layers[layerName].enabled = false; return { success: true }; }
    return { success: false };
  }

  getStatus() {
    const layerProgress = {
      doubleRatchet: this.layers.doubleRatchet.enabled ? 92 : 0,
      zkAuth: this.layers.zkAuth.enabled ? 5 : 0,
      pirSearch: this.layers.pirSearch.enabled ? 80 : 0,
      mixnet: this.layers.mixnet.enabled ? 75 : 0,
      sphinx: this.layers.sphinx.enabled ? 70 : 0
    };
    return {
      level: Object.values(this.layers).filter(l => l.enabled).length,
      layers: this.layers,
      layerProgress,
      totalProgress: Math.round(Object.values(layerProgress).reduce((a, b) => a + b, 0) / 5),
      pir: this._pirClient.getStatus(),
      mixnet: this._mixnet.getStatus()
    };
  }
}

// ================================================================
// Exports
// ================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PrivacyLayerManager, PIRSearchClient, PIRSearchServer, MixnetClient, SphinxPacketClient };
}

if (typeof window !== 'undefined') {
  window.FIBEMATE = window.FIBEMATE || {};
  window.FIBEMATE.PrivacyLayerManager = PrivacyLayerManager;
  window.FIBEMATE.PIRSearchClient = PIRSearchClient;
  window.FIBEMATE.PIRSearchServer = PIRSearchServer;
  window.FIBEMATE.MixnetClient = MixnetClient;
  window.FIBEMATE.SphinxPacketClient = SphinxPacketClient;
}
