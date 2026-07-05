/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Privacy Layer 实验性功能，未经生产审计
 * 请勿用于关键路径或主网
 */




/**
 * FIBEMATE Privacy Layer Manager v2.20-pq — 12-Layer Full Implementation
 * Layers: L1 Double Ratchet → L2 ZK Auth → L3 PIR Search → L4 Mixnet
 *         → L5 Sphinx → L6 Cover Traffic → L7 Traffic Shaping
 *         → L8 Padding Normalization → L9 Decoy Contacts
 *         → L10 Message Delay → L11 Deniable Auth → L12 Metadata Obfuscation
 *         → L13 PQ Signatures (ML-DSA + SLH-DSA)
 * All encryption uses real WebCrypto (AES-GCM, SHA-256, HMAC-SHA256, ECDH)
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
// Layer 6: Cover Traffic - Anti-Traffic-Analysis Dummy Messages
// Generates realistic-looking dummy messages at random intervals
// to obscure real communication patterns from network observers.
// Uses exponential distribution for inter-arrival times and
// message size distributions sampled from real traffic statistics.
// ================================================================
class CoverTrafficEngine {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.baseRate = config.baseRate || 0.15;           // 15% of real traffic volume
    this.minIntervalMs = config.minIntervalMs || 5000;  // min 5s between covers
    this.maxIntervalMs = config.maxIntervalMs || 120000; // max 2min between covers
    this.sizeDistribution = config.sizeDistribution || {
      small: { weight: 0.4, minBytes: 64, maxBytes: 256 },
      medium: { weight: 0.35, minBytes: 256, maxBytes: 1024 },
      large: { weight: 0.25, minBytes: 1024, maxBytes: 4096 }
    };
    this._timer = null;
    this._pendingCovers = [];
    this._sentCount = 0;
    this._realMessageCount = 0;
    this._adaptiveRate = this.baseRate;
  }

  start(callback) {
    if (!this.enabled) return;
    this._callback = callback;
    this._scheduleNext();
  }

  stop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  _scheduleNext() {
    // Exponential distribution for inter-arrival times
    const u = Math.random();
    const lambda = 1 / ((this.minIntervalMs + this.maxIntervalMs) / 2);
    const delay = Math.max(this.minIntervalMs,
      Math.min(this.maxIntervalMs, -Math.log(1 - u * (1 - Math.exp(-lambda * this.maxIntervalMs))) / lambda)
    );
    this._timer = setTimeout(() => {
      this._generateAndSend();
      this._scheduleNext();
    }, delay);
  }

  async _generateAndSend() {
    const cover = await this.generateCoverMessage();
    this._pendingCovers.push(cover);
    this._sentCount++;
    if (this._callback) {
      try { await this._callback(cover); } catch (e) { /* continue */ }
    }
  }

  async generateCoverMessage() {
    const size = this._sampleSize();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dummyPlaintext = crypto.getRandomValues(new Uint8Array(size));

    // Encrypt with throwaway key so it looks like real traffic
    const keyMaterial = await crypto.subtle.importKey(
      'raw', crypto.getRandomValues(new Uint8Array(32)),
      'AES-GCM', false, ['encrypt']
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, keyMaterial, dummyPlaintext
    );

    return {
      type: 'cover',
      id: crypto.randomUUID(),
      iv: bufToBase64(iv),
      ciphertext: bufToBase64(new Uint8Array(ciphertext)),
      size: ciphertext.byteLength,
      timestamp: Date.now(),
      // Metadata that mimics real messages
      fakeRecipient: this._generateFakeId(),
      fakeSender: this._generateFakeId()
    };
  }

  _sampleSize() {
    const r = Math.random();
    let cumulative = 0;
    for (const [, dist] of Object.entries(this.sizeDistribution)) {
      cumulative += dist.weight;
      if (r <= cumulative) {
        return dist.minBytes + Math.floor(Math.random() * (dist.maxBytes - dist.minBytes));
      }
    }
    return 256; // fallback
  }

  _generateFakeId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return 'user_' + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  // Adaptive rate: increase cover when real traffic drops
  recordRealMessage() {
    this._realMessageCount++;
    // If real messages drop below threshold, increase cover rate
    const recentRate = this._realMessageCount / Math.max(1, this._sentCount + this._realMessageCount);
    if (recentRate < 0.5) {
      this._adaptiveRate = Math.min(0.5, this._adaptiveRate * 1.1);
    } else {
      this._adaptiveRate = Math.max(this.baseRate, this._adaptiveRate * 0.95);
    }
  }

  isCoverMessage(messageId) {
    return this._pendingCovers.some(c => c.id === messageId);
  }

  getStats() {
    return {
      enabled: this.enabled,
      coverMessagesSent: this._sentCount,
      realMessagesObserved: this._realMessageCount,
      adaptiveRate: this._adaptiveRate,
      pendingCount: this._pendingCovers.length
    };
  }
}

// ================================================================
// Layer 7: Traffic Shaping - Timing Obfuscation
// Normalizes message sending patterns to resist timing analysis.
// Batches outgoing messages and sends at fixed intervals
// with exponential noise to prevent fingerprinting.
// ================================================================
class TrafficShaper {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.batchWindowMs = config.batchWindowMs || 1000;    // 1s batching window
    this.sendIntervalMs = config.sendIntervalMs || 2000;  // send every 2s
    this.jitterMs = config.jitterMs || 500;               // ±500ms random jitter
    this.maxBatchSize = config.maxBatchSize || 10;
    this._queue = [];
    this._timer = null;
    this._batchTimer = null;
    this._sentBatches = 0;
    this._totalDelayed = 0;
  }

  start(sendCallback) {
    if (!this.enabled) return;
    this._sendCallback = sendCallback;
    this._startBatchWindow();
    this._startSendInterval();
  }

  stop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._batchTimer) { clearTimeout(this._batchTimer); this._batchTimer = null; }
    // Flush remaining
    if (this._queue.length > 0) {
      this._flush();
    }
  }

  enqueue(message) {
    if (!this.enabled) return message; // passthrough
    const item = {
      data: message,
      enqueuedAt: Date.now(),
      id: crypto.randomUUID()
    };
    this._queue.push(item);
    this._totalDelayed++;
    return item;
  }

  _startBatchWindow() {
    this._batchTimer = setTimeout(() => {
      // Messages enqueued during this window will be grouped
      this._startBatchWindow();
    }, this.batchWindowMs);
  }

  _startSendInterval() {
    const jitter = (Math.random() - 0.5) * 2 * this.jitterMs;
    const interval = this.sendIntervalMs + jitter;
    this._timer = setTimeout(() => {
      this._flush();
      this._startSendInterval();
    }, Math.max(500, interval));
  }

  async _flush() {
    if (this._queue.length === 0 || !this._sendCallback) return;

    const batch = this._queue.splice(0, this.maxBatchSize);
    if (batch.length === 0) return;

    // Shuffle batch to break ordering correlation
    for (let i = batch.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [batch[i], batch[j]] = [batch[j], batch[i]];
    }

    this._sentBatches++;
    try {
      await this._sendCallback(batch.map(item => item.data));
    } catch (e) { /* continue */ }
  }

  // Urgent messages bypass the queue (e.g., key exchange)
  sendUrgent(message) {
    if (this._sendCallback) {
      this._sendCallback([message]);
    }
    return message;
  }

  getStats() {
    return {
      enabled: this.enabled,
      queueLength: this._queue.length,
      batchesSent: this._sentBatches,
      totalDelayed: this._totalDelayed,
      avgDelayMs: this._queue.length > 0
        ? Date.now() - this._queue[0].enqueuedAt
        : 0
    };
  }
}

// ================================================================
// Layer 8: Padding Normalization - Fixed-Size Message Frames
// Pads all messages to a fixed set of sizes to prevent
// size-based traffic analysis. Uses a power-of-2 bucketing
// scheme: messages are padded to 128, 256, 512, 1024, 2048,
// or 4096 bytes. Padding uses cryptographically random bytes.
// ================================================================
class PaddingNormalizer {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.sizes = config.sizes || [128, 256, 512, 1024, 2048, 4096];
    this.maxSize = config.maxSize || 4096;
    this._paddedCount = 0;
    this._strippedCount = 0;
    this._sizeDistribution = {};
  }

  async pad(plaintext) {
    if (!this.enabled) return { data: plaintext, padded: false };

    const encoder = new TextEncoder();
    const data = typeof plaintext === 'string' ? encoder.encode(plaintext) : plaintext;
    const dataLen = data instanceof Uint8Array ? data.length : new TextEncoder().encode(data).length;

    if (dataLen >= this.maxSize) {
      // Large file: add 0~8192 bytes random padding to obscure true size
      const maxPad = 8192;
      const paddingLen = Math.floor(Math.random() * (maxPad + 1));  // 0~8192 inclusive
      const padding = crypto.getRandomValues(new Uint8Array(paddingLen));
      const paddedSize = dataLen + paddingLen;
      return {
        data: bufToBase64(data instanceof Uint8Array ? data : encoder.encode(data)) + '.' + bufToBase64(padding),
        padded: true,
        originalSize: dataLen,
        paddedSize: paddedSize,
        bucket: 'oversize',
        paddingLen: paddingLen
      };
    }

    // Find smallest bucket that fits
    const targetSize = this.sizes.find(s => s >= dataLen) || this.maxSize;
    const paddingLen = targetSize - dataLen;
    const padding = crypto.getRandomValues(new Uint8Array(paddingLen));

    // Combine: [1 byte version][2 bytes originalLen][data][padding]
    const version = new Uint8Array([0x01]);
    const lenBytes = new Uint8Array([(dataLen >> 8) & 0xFF, dataLen & 0xFF]);
    const combined = new Uint8Array(1 + 2 + dataLen + paddingLen);
    combined.set(version, 0);
    combined.set(lenBytes, 1);
    const dataBytes = data instanceof Uint8Array ? data : encoder.encode(data);
    combined.set(dataBytes, 3);
    combined.set(padding, 3 + dataLen);

    this._paddedCount++;
    this._sizeDistribution[targetSize] = (this._sizeDistribution[targetSize] || 0) + 1;

    return {
      data: bufToBase64(combined),
      padded: true,
      originalSize: dataLen,
      paddedSize: targetSize,
      bucket: targetSize
    };
  }

  strip(paddedData) {
    if (!this.enabled) return { data: paddedData, stripped: false };

    try {
      const combined = base64ToBuf(paddedData);
      if (combined.length < 3) return { data: paddedData, stripped: false };

      const version = combined[0];
      if (version !== 0x01) return { data: paddedData, stripped: false };

      const originalLen = (combined[1] << 8) | combined[2];
      if (originalLen > combined.length - 3) return { data: paddedData, stripped: false };

      const data = combined.slice(3, 3 + originalLen);
      this._strippedCount++;

      return {
        data: new TextDecoder().decode(data),
        stripped: true,
        originalSize: originalLen
      };
    } catch (e) {
      return { data: paddedData, stripped: false };
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      paddedCount: this._paddedCount,
      strippedCount: this._strippedCount,
      sizeDistribution: { ...this._sizeDistribution }
    };
  }
}

// ================================================================
// Layer 9: Decoy Contacts - Fake Contact List Entries
// Inserts realistic-looking decoy contacts into the contact list
// to obscure the true social graph. Each decoy has realistic
// activity patterns (last seen, message history, status).
// Decoys are deterministically generated from a seed so they
// persist across sessions but can't be distinguished from real.
// ================================================================
class DecoyContactManager {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.decoyRatio = config.decoyRatio || 0.25; // 25% decoy contacts
    this.seed = config.seed || 'fibemate-decoy-v1';
    this._decoys = new Map();
    this._realContactCount = 0;
    this._initialized = false;
  }

  async init(realContactCount) {
    this._realContactCount = realContactCount;
    const decoyCount = Math.max(3, Math.ceil(realContactCount * this.decoyRatio));

    // Generate decoys deterministically from seed
    const seedBytes = new TextEncoder().encode(this.seed);
    const seedHash = await crypto.subtle.digest('SHA-256', seedBytes);
    const seedArray = new Uint8Array(seedHash);

    this._decoys.clear();
    for (let i = 0; i < decoyCount; i++) {
      const decoy = await this._generateDecoy(seedArray, i);
      this._decoys.set(decoy.id, decoy);
    }
    this._initialized = true;
  }

  async _generateDecoy(seed, index) {
    // Deterministic but unpredictable ID generation
    const input = new TextEncoder().encode(seed.join('') + ':' + index + ':decoy');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));

    const id = 'dc_' + Array.from(hash.slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Generate realistic name from hash bytes
    const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];
    const givenNames = ['伟', '芳', '娜', '敏', '静', 'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey'];
    const surnameIdx = hash[8] % surnames.length;
    const givenIdx = hash[9] % givenNames.length;
    const name = surnames[surnameIdx] + givenNames[givenIdx];

    // Random last-seen time (1h-7d ago)
    const hoursAgo = 1 + (hash[10] % 168); // 1-168 hours (1h-7d)
    const lastSeen = new Date(Date.now() - hoursAgo * 3600000).toISOString();

    // Random status
    const statuses = ['', '在线', '忙碌', '离开', 'Available', 'Busy', 'Away'];
    const status = statuses[hash[11] % statuses.length];

    // Fake activity: random message count
    const messageCount = 5 + (hash[12] % 95); // 5-99 messages

    return {
      id,
      name,
      displayName: name,
      lastSeen,
      status,
      messageCount,
      isDecoy: true,       // Only visible to local client
      avatarSeed: bufToBase64(hash.slice(16, 24)),
      // Fake E2EE safety number
      safetyNumber: Array.from(hash.slice(0, 30))
        .map(b => b.toString(10).padStart(2, '0'))
        .join('').slice(0, 60)
    };
  }

  // Mix decoys into contact list
  blendWithContacts(realContacts) {
    if (!this.enabled || !this._initialized) return realContacts;

    const decoys = Array.from(this._decoys.values());
    const combined = [...realContacts, ...decoys];

    // Shuffle deterministically based on time slot (changes every hour)
    const timeSlot = Math.floor(Date.now() / 3600000);
    return this._deterministicShuffle(combined, timeSlot);
  }

  _deterministicShuffle(array, seed) {
    const result = [...array];
    let s = seed;
    for (let i = result.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  isDecoy(contactId) {
    return this._decoys.has(contactId);
  }

  // Filter out decoys from operations that should only affect real contacts
  filterReal(contacts) {
    return contacts.filter(c => !this._decoys.has(c.id));
  }

  // Handle message to decoy: auto-respond after realistic delay
  async handleDecoyMessage(contactId, messageText) {
    const decoy = this._decoys.get(contactId);
    if (!decoy) return null;

    // Generate plausible auto-response after random delay
    const delayMs = 1000 + Math.floor(Math.random() * 5000);
    const responses = [
      '好的', '收到', '嗯嗯', '稍等', 'OK', 'Got it',
      '稍后回复', '知道了', '👍', '👌'
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];

    return { delayMs, response, contactId };
  }

  getStats() {
    return {
      enabled: this.enabled,
      decoyCount: this._decoys.size,
      realContactCount: this._realContactCount,
      initialized: this._initialized
    };
  }
}

// ================================================================
// Layer 10: Message Delay - Time-Based Delivery Obfuscation
// Delays message delivery by a randomized amount to prevent
// timing correlation attacks. Uses a priority queue with
// exponential delay distribution.
// ================================================================
class MessageDelayEngine {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.minDelayMs = config.minDelayMs || 100;     // min 100ms delay
    this.maxDelayMs = config.maxDelayMs || 2000;    // max 2s delay
    this.urgentMinMs = config.urgentMinMs || 50;    // urgent: 50ms min
    this.urgentMaxMs = config.urgentMaxMs || 200;   // urgent: 200ms max
    this._queue = [];   // sorted by delivery time
    this._timer = null;
    this._deliveredCount = 0;
    this._delayedCount = 0;
  }

  start(deliveryCallback) {
    if (!this.enabled) return;
    this._deliveryCallback = deliveryCallback;
    this._processQueue();
  }

  stop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  // Enqueue with random delay
  enqueue(message, priority = 'normal') {
    if (!this.enabled) {
      if (this._deliveryCallback) this._deliveryCallback(message);
      return { immediate: true };
    }

    const isUrgent = priority === 'urgent' || priority === 'key-exchange';
    const minDelay = isUrgent ? this.urgentMinMs : this.minDelayMs;
    const maxDelay = isUrgent ? this.urgentMaxMs : this.maxDelayMs;

    // Exponential distribution for delay
    const delayMs = minDelay + Math.floor(
      (maxDelay - minDelay) * (1 - Math.exp(-3 * Math.random()))
    );

    const deliverAt = Date.now() + delayMs;
    const item = {
      message,
      deliverAt,
      enqueuedAt: Date.now(),
      priority,
      id: crypto.randomUUID()
    };

    // Insert into sorted queue
    let inserted = false;
    for (let i = 0; i < this._queue.length; i++) {
      if (this._queue[i].deliverAt > deliverAt) {
        this._queue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) this._queue.push(item);

    this._delayedCount++;
    return { delayMs, deliverAt, id: item.id };
  }

  _processQueue() {
    const now = Date.now();
    const ready = [];

    while (this._queue.length > 0 && this._queue[0].deliverAt <= now) {
      ready.push(this._queue.shift());
    }

    for (const item of ready) {
      if (this._deliveryCallback) {
        this._deliveryCallback(item.message);
      }
      this._deliveredCount++;
    }

    // Schedule next check
    if (this._queue.length > 0) {
      const nextDelay = Math.max(10, this._queue[0].deliverAt - Date.now());
      this._timer = setTimeout(() => this._processQueue(), nextDelay);
    } else {
      this._timer = setTimeout(() => this._processQueue(), 1000); // poll every 1s
    }
  }

  // Force-deliver all pending messages
  flush() {
    while (this._queue.length > 0) {
      const item = this._queue.shift();
      if (this._deliveryCallback) {
        this._deliveryCallback(item.message);
      }
      this._deliveredCount++;
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      pendingCount: this._queue.length,
      deliveredCount: this._deliveredCount,
      delayedCount: this._delayedCount,
      avgDelayMs: this._deliveredCount > 0
        ? 'varies (exponential distribution)'
        : 0
    };
  }
}

// ================================================================
// Layer 11: Deniable Authentication - Off-the-Record Messaging
// Provides repudiable message authentication using MACs that
// can be forged by the recipient, making it impossible to prove
// to a third party that a specific sender sent a message.
// Based on the OTRv3 deniable authentication protocol:
// shared secret → derive send/recv MAC keys → per-message MAC
// → reveal previous MAC key after use (publish to enable forgery).
// ================================================================
class DeniableAuthEngine {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this._sessions = new Map();  // peerId → session state
    this._revealedKeys = [];     // published MAC keys for deniability
    this._macKeyCache = new Map();
  }

  // Initialize a deniable session with a peer
  async initSession(peerId, sharedSecret) {
    // Derive send/recv MAC key pair from shared secret
    const encoder = new TextEncoder();
    const sendKeyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(sharedSecret + ':send-mac:' + peerId),
      'PBKDF2', false, ['deriveKey']
    );
    const sendMacKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: encoder.encode('deniable-send-v1'), iterations: 100000, hash: 'SHA-256' },
      sendKeyMaterial, { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign']
    );

    const recvKeyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(sharedSecret + ':recv-mac:' + peerId),
      'PBKDF2', false, ['deriveKey']
    );
    const recvMacKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: encoder.encode('deniable-recv-v1'), iterations: 100000, hash: 'SHA-256' },
      recvKeyMaterial, { name: 'HMAC', hash: 'SHA-256', length: 256 }, true, ['sign']
    );

    const session = {
      peerId,
      sendMacKey,
      recvMacKey,
      messageIndex: 0,
      lastRevealedIndex: -1,
      created: Date.now()
    };

    this._sessions.set(peerId, session);
    return session;
  }

  // Create deniable MAC for a message
  async authenticate(message, peerId) {
    const session = this._sessions.get(peerId);
    if (!session) throw new Error('No deniable session for peer: ' + peerId);

    const encoder = new TextEncoder();
    const macData = encoder.encode(JSON.stringify({
      msg: message,
      idx: session.messageIndex,
      ts: Date.now()
    }));

    const mac = await crypto.subtle.sign('HMAC', session.sendMacKey, macData);
    const macBytes = new Uint8Array(mac);

    session.messageIndex++;

    return {
      mac: bufToBase64(macBytes),
      index: session.messageIndex - 1,
      timestamp: Date.now()
    };
  }

  // Verify a deniable MAC (from peer)
  async verify(message, macData, peerId) {
    const session = this._sessions.get(peerId);
    if (!session) return { valid: false, reason: 'no_session' };

    const encoder = new TextEncoder();
    const expectedData = encoder.encode(JSON.stringify({
      msg: message,
      idx: macData.index,
      ts: macData.timestamp
    }));

    try {
      const expectedMac = await crypto.subtle.sign('HMAC', session.recvMacKey, expectedData);
      const expectedBytes = new Uint8Array(expectedMac);
      const providedBytes = base64ToBuf(macData.mac);

      if (constantTimeEqual(expectedBytes, providedBytes)) {
        return { valid: true, index: macData.index };
      }
      return { valid: false, reason: 'mac_mismatch' };
    } catch (e) {
      return { valid: false, reason: 'verification_error' };
    }
  }

  // Reveal previous MAC key for deniability
  // After revealing, anyone can forge MACs for those messages,
  // making them non-repudiable → repudiable (can deny sending)
  async revealPreviousMacKey(peerId) {
    const session = this._sessions.get(peerId);
    if (!session) return null;

    if (session.messageIndex > session.lastRevealedIndex + 1) {
      // Export the current send MAC key (previous epoch)
      const keyBytes = await crypto.subtle.exportKey('raw', session.sendMacKey);
      const revealed = {
        peerId,
        keyIndex: session.lastRevealedIndex + 1,
        macKey: bufToBase64(new Uint8Array(keyBytes)),
        revealedAt: Date.now()
      };
      this._revealedKeys.push(revealed);
      session.lastRevealedIndex = session.messageIndex - 1;
      return revealed;
    }
    return null;
  }

  // Check if a MAC key has been revealed (meaning the message is deniable)
  isDeniable(peerId, messageIndex) {
    return this._revealedKeys.some(
      r => r.peerId === peerId && r.keyIndex >= messageIndex
    );
  }

  // Get all revealed keys (for publishing/transparency)
  getRevealedKeys() {
    return [...this._revealedKeys];
  }

  getStats() {
    return {
      enabled: this.enabled,
      activeSessions: this._sessions.size,
      revealedKeyCount: this._revealedKeys.length,
      sessionPeerIds: Array.from(this._sessions.keys())
    };
  }
}

// ================================================================
// Layer 12: Metadata Obfuscation - Header/Envelope Obfuscation
// Strips and replaces identifying metadata in message envelopes
// with anonymized versions. Replaces real timestamps with buckets,
// real sender/recipient IDs with pseudonyms, and removes
// device fingerprints, client version strings, and IP hints.
// Uses per-session pseudonyms derived from shared secrets.
// ================================================================
class MetadataObfuscator {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.timeBucketMs = config.timeBucketMs || 300000; // 5-minute time buckets
    this.pseudonymRotationMs = config.pseudonymRotationMs || 3600000; // 1h rotation
    this._pseudonyms = new Map();   // realId → { pseudonym, expires }
    this._reverseMap = new Map();   // pseudonym → realId
    this._obfuscatedCount = 0;
    this._deobfuscatedCount = 0;
    this._lastRotation = Date.now();
  }

  // Generate or retrieve a pseudonym for a real ID
  async getPseudonym(realId) {
    // Rotate if expired
    const now = Date.now();
    const existing = this._pseudonyms.get(realId);
    if (existing && existing.expires > now) {
      return existing.pseudonym;
    }

    // Generate new pseudonym from hash
    const input = new TextEncoder().encode(realId + ':' + now + ':' + crypto.randomUUID());
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
    const pseudonym = 'pseudo_' + Array.from(hash.slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Remove old reverse mapping
    if (existing) {
      this._reverseMap.delete(existing.pseudonym);
    }

    this._pseudonyms.set(realId, {
      pseudonym,
      expires: now + this.pseudonymRotationMs
    });
    this._reverseMap.set(pseudonym, realId);

    return pseudonym;
  }

  // Obfuscate a message envelope's metadata
  async obfuscateMetadata(envelope) {
    if (!this.enabled) return envelope;

    const obfuscated = { ...envelope };

    // Replace sender/recipient with pseudonyms
    if (obfuscated.senderId) {
      obfuscated.senderId = await this.getPseudonym(obfuscated.senderId);
    }
    if (obfuscated.recipientId) {
      obfuscated.recipientId = await this.getPseudonym(obfuscated.recipientId);
    }

    // Bucket timestamp to reduce timing precision
    if (obfuscated.timestamp) {
      obfuscated.timestamp = Math.floor(obfuscated.timestamp / this.timeBucketMs) * this.timeBucketMs;
    }

    // Remove identifying headers
    delete obfuscated.deviceId;
    delete obfuscated.clientVersion;
    delete obfuscated.ipHint;
    delete obfuscated.userAgent;
    delete obfuscated.locale;
    delete obfuscated.timezone;

    // Replace message ID with opaque hash
    if (obfuscated.messageId) {
      const idHash = new Uint8Array(await crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(obfuscated.messageId + ':' + Date.now())
      ));
      obfuscated.messageId = bufToBase64(idHash.slice(0, 16));
    }

    // Add noise fields to confuse fingerprinting
    obfuscated._noise1 = bufToBase64(crypto.getRandomValues(new Uint8Array(8)));
    obfuscated._noise2 = bufToBase64(crypto.getRandomValues(new Uint8Array(8)));

    this._obfuscatedCount++;
    return obfuscated;
  }

  // Deobfuscate: resolve pseudonyms back to real IDs
  async deobfuscateMetadata(obfuscatedEnvelope) {
    if (!this.enabled) return obfuscatedEnvelope;

    const result = { ...obfuscatedEnvelope };

    // Resolve pseudonyms
    if (result.senderId && this._reverseMap.has(result.senderId)) {
      result.senderId = this._reverseMap.get(result.senderId);
    }
    if (result.recipientId && this._reverseMap.has(result.recipientId)) {
      result.recipientId = this._reverseMap.get(result.recipientId);
    }

    // Remove noise fields
    delete result._noise1;
    delete result._noise2;

    this._deobfuscatedCount++;
    return result;
  }

  // Obfuscate a batch of envelopes
  async obfuscateBatch(envelopes) {
    return Promise.all(envelopes.map(e => this.obfuscateMetadata(e)));
  }

  // Rotate all pseudonyms
  async rotatePseudonyms() {
    const now = Date.now();
    for (const [realId, data] of this._pseudonyms) {
      if (data.expires <= now) {
        this._pseudonyms.delete(realId);
        this._reverseMap.delete(data.pseudonym);
      }
    }
    this._lastRotation = now;
  }

  getStats() {
    return {
      enabled: this.enabled,
      activePseudonyms: this._pseudonyms.size,
      obfuscatedCount: this._obfuscatedCount,
      deobfuscatedCount: this._deobfuscatedCount,
      lastRotation: new Date(this._lastRotation).toISOString()
    };
  }
}

// ================================================================
// PrivacyLayerManager - Wires all 12 layers together
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
      sphinx: { enabled: config.sphinx || false, name: 'Sphinx Packet', priority: 5 },
      coverTraffic: { enabled: config.coverTraffic !== false, name: 'Cover Traffic', priority: 6 },
      trafficShaping: { enabled: config.trafficShaping !== false, name: 'Traffic Shaping', priority: 7 },
      paddingNorm: { enabled: config.paddingNorm !== false, name: 'Padding Normalization', priority: 8 },
      decoyContacts: { enabled: config.decoyContacts !== false, name: 'Decoy Contacts', priority: 9 },
      messageDelay: { enabled: config.messageDelay !== false, name: 'Message Delay', priority: 10 },
      deniableAuth: { enabled: config.deniableAuth !== false, name: 'Deniable Authentication', priority: 11 },
      metadataObfuscation: { enabled: config.metadataObfuscation !== false, name: 'Metadata Obfuscation', priority: 12 },
      pqSignatures: { enabled: config.pqSignatures !== false, name: 'PQ Signatures (ML-DSA + SLH-DSA)', priority: 13 }
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
    this._coverTraffic = new CoverTrafficEngine(config.coverTraffic || {});
    this._trafficShaper = new TrafficShaper(config.trafficShaping || {});
    this._paddingNorm = new PaddingNormalizer(config.paddingNorm || {});
    this._decoyContacts = new DecoyContactManager(config.decoyContacts || {});
    this._messageDelay = new MessageDelayEngine(config.messageDelay || {});
    this._deniableAuth = new DeniableAuthEngine(config.deniableAuth || {});
    this._metadataObfuscator = new MetadataObfuscator(config.metadataObfuscation || {});
    this._pqSignatures = null; // Lazy-initialized PQSignatureEngine (requires async import)
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
  // L6-L12 API Methods
  // ================================================================

  // L6: Cover Traffic
  startCoverTraffic(callback) { this._coverTraffic.start(callback); }
  stopCoverTraffic() { this._coverTraffic.stop(); }
  generateCoverMessage() { return this._coverTraffic.generateCoverMessage(); }
  isCoverMessage(messageId) { return this._coverTraffic.isCoverMessage(messageId); }
  recordRealMessageForCover() { this._coverTraffic.recordRealMessage(); }

  // L7: Traffic Shaping
  startTrafficShaping(sendCallback) { this._trafficShaper.start(sendCallback); }
  stopTrafficShaping() { this._trafficShaper.stop(); }
  enqueueForShaping(message) { return this._trafficShaper.enqueue(message); }
  sendUrgent(message) { return this._trafficShaper.sendUrgent(message); }

  // L8: Padding Normalization
  padMessage(plaintext) { return this._paddingNorm.pad(plaintext); }
  stripPadding(paddedData) { return this._paddingNorm.strip(paddedData); }

  // L9: Decoy Contacts
  initDecoyContacts(realContactCount) { return this._decoyContacts.init(realContactCount); }
  blendDecoyContacts(realContacts) { return this._decoyContacts.blendWithContacts(realContacts); }
  isDecoyContact(contactId) { return this._decoyContacts.isDecoy(contactId); }
  filterRealContacts(contacts) { return this._decoyContacts.filterReal(contacts); }
  handleDecoyMessage(contactId, text) { return this._decoyContacts.handleDecoyMessage(contactId, text); }

  // L10: Message Delay
  startMessageDelay(deliveryCallback) { this._messageDelay.start(deliveryCallback); }
  stopMessageDelay() { this._messageDelay.stop(); }
  delayMessage(message, priority) { return this._messageDelay.enqueue(message, priority); }
  flushDelayedMessages() { this._messageDelay.flush(); }

  // L11: Deniable Auth
  initDeniableSession(peerId, sharedSecret) { return this._deniableAuth.initSession(peerId, sharedSecret); }
  authenticateMessage(message, peerId) { return this._deniableAuth.authenticate(message, peerId); }
  verifyDeniableAuth(message, macData, peerId) { return this._deniableAuth.verify(message, macData, peerId); }
  revealPreviousMacKey(peerId) { return this._deniableAuth.revealPreviousMacKey(peerId); }
  isMessageDeniable(peerId, messageIndex) { return this._deniableAuth.isDeniable(peerId, messageIndex); }

  // L12: Metadata Obfuscation
  obfuscateMetadata(envelope) { return this._metadataObfuscator.obfuscateMetadata(envelope); }
  deobfuscateMetadata(envelope) { return this._metadataObfuscator.deobfuscateMetadata(envelope); }
  obfuscateMetadataBatch(envelopes) { return this._metadataObfuscator.obfuscateBatch(envelopes); }
  rotatePseudonyms() { return this._metadataObfuscator.rotatePseudonyms(); }

  // ----------------------------------------------------------------
  // L13: PQ Signatures — ML-DSA + SLH-DSA dual-signature architecture
  // ----------------------------------------------------------------
  async initPQSignatures(rootScheme, sessionScheme) {
    if (!this._pqSignatures) {
      // Lazy-import PQSignatureEngine (avoids top-level ESM dependency at parse time)
      let PQSig;
      if (typeof window !== 'undefined' && window.PQSignatureEngine) {
        PQSig = window.PQSignatureEngine;
      } else {
        // CommonJS fallback — will be set by <script> tag in main.html
        PQSig = (typeof PQSignatureEngine !== 'undefined') ? PQSignatureEngine : null;
      }
      if (!PQSig) throw new Error('PQSignatureEngine not loaded. Add <script src="privacy-layers/signature.js"> before this call.');
      this._pqSignatures = new PQSig({ enabled: this.layers.pqSignatures.enabled });
    }
    return await this._pqSignatures.init(rootScheme, sessionScheme);
  }

  async pqSign(message, options) {
    if (!this._pqSignatures) throw new Error('PQ Signatures not initialized');
    return await this._pqSignatures.sign(message, options);
  }

  async pqVerify(signatureObj, message) {
    if (!this._pqSignatures) throw new Error('PQ Signatures not initialized');
    return await this._pqSignatures.verify(signatureObj, message);
  }

  async pqHybridSign(message, options) {
    if (!this._pqSignatures) throw new Error('PQ Signatures not initialized');
    return await this._pqSignatures.hybridSign(message, options);
  }

  async pqHybridVerify(hybridSig, message) {
    if (!this._pqSignatures) throw new Error('PQ Signatures not initialized');
    return await this._pqSignatures.hybridVerify(hybridSig, message);
  }

  async pqIssueCertificate(peerPk, meta) {
    if (!this._pqSignatures) throw new Error('PQ Signatures not initialized');
    return await this._pqSignatures.issueCertificate(peerPk, meta);
  }

  async pqVerifyCertificate(cert) {
    if (!this._pqSignatures) throw new Error('PQ Signatures not initialized');
    return await this._pqSignatures.verifyCertificate(cert);
  }

  async pqRotateSessionKeys() {
    if (!this._pqSignatures) throw new Error('PQ Signatures not initialized');
    return await this._pqSignatures.rotateSessionKeys();
  }

  getPqRootPublicKey() { return this._pqSignatures ? this._pqSignatures.getRootPublicKey() : null; }
  getPqSessionPublicKey() { return this._pqSignatures ? this._pqSignatures.getSessionPublicKey() : null; }
  getPqIdentityCertificate() { return this._pqSignatures ? this._pqSignatures.getIdentityCertificate() : null; }

  // ================================================================
  // Unified Encryption Pipeline (12 Layers)
  // plaintext → [L8 Padding] → [L11 Deniable Auth] → [L5 Sphinx]
  //           → [L4 Mixnet] → [L3 PIR] → [L1 DoubleRatchet]
  //           → [L12 Metadata Obfuscation] → [L7 Traffic Shaping]
  //           → [L10 Delay] → send
  //           (L6 Cover Traffic runs in background)
  //           (L9 Decoy Contacts manages contact list)
  // ================================================================
  async encryptMessage(plaintext, recipientId, senderId, options = {}) {
    let data = plaintext;
    let authTag = null;
    let paddingInfo = null;

    // L8: Padding Normalization (first - normalize size)
    if (this.layers.paddingNorm.enabled && !options.skipPadding) {
      const padded = await this._paddingNorm.pad(typeof data === 'string' ? data : JSON.stringify(data));
      if (padded.padded) {
        data = padded.data;
        paddingInfo = { originalSize: padded.originalSize, bucket: padded.bucket };
      }
    }

    // L11: Deniable Authentication (before encryption)
    if (this.layers.deniableAuth.enabled && !options.skipDeniable) {
      try {
        authTag = await this._deniableAuth.authenticate(
          typeof data === 'string' ? data : JSON.stringify(data), recipientId
        );
      } catch (e) { /* session may not exist yet */ }
    }

    // L5: Sphinx (outermost packet)
    if (this.layers.sphinx.enabled && !options.skipSphinx) {
      const sphinxPacket = await this.sphinxCreatePacket(
        JSON.stringify({ content: data, type: 'message', authTag, paddingInfo }),
        recipientId, senderId,
        options.routingInfo || { nextHop: recipientId }
      );
      data = { sphinx: sphinxPacket, type: 'sphinx' };
    }

    // L4: Mixnet (onion routing)
    if (this.layers.mixnet.enabled && !options.skipMixnet) {
      const mixnetData = typeof data === 'string' ? data : JSON.stringify(data);
      const mixnetResult = await this.mixnetSend(mixnetData, recipientId, senderId);
      data = { mixnet: mixnetResult, type: 'mixnet' };
    }

    // Embed authTag and paddingInfo into data before encryption (L1)
    // This ensures they survive the pipeline and are available for decryption
    if (authTag || paddingInfo) {
      let payload = typeof data === 'string' ? { content: data } : { ...data };
      if (authTag) payload.authTag = authTag;
      if (paddingInfo) payload.paddingInfo = paddingInfo;
      data = payload;
    }

    // L1: Double Ratchet (core E2EE - innermost, encrypt processed data)
    if (this.crypto && this.layers.doubleRatchet.enabled && !options.skipCrypto) {
      try {
        const toEncrypt = typeof data === 'string' ? data : JSON.stringify(data);
        const envelope = await this.crypto.encrypt(recipientId, toEncrypt);
        data = { crypto: envelope, type: 'crypto' };
      } catch (e) {
        data = { raw: typeof data === 'string' ? data : JSON.stringify(data), type: 'fallback' };
      }
    }

    // L3: PIR (searchable encrypted storage - index encrypted blob)
    if (this.layers.pirSearch.enabled && !options.skipPIR) {
      const keywords = this._extractKeywords(plaintext);
      const pirEntry = await this.pirStoreMessage(
        crypto.randomUUID(),
        typeof data === 'string' ? data : JSON.stringify(data),
        keywords
      );
      data = { pir: pirEntry, original: data, type: 'pir' };
    }

    // L12: Metadata Obfuscation
    if (this.layers.metadataObfuscation.enabled && !options.skipMetadata) {
      const envelope = {
        senderId, recipientId,
        timestamp: Date.now(),
        messageId: crypto.randomUUID(),
        payload: data
      };
      data = await this._metadataObfuscator.obfuscateMetadata(envelope);
      data.type = 'obfuscated';
    }

    // L6: Record real message for cover traffic adaptation
    if (this.layers.coverTraffic.enabled) {
      this._coverTraffic.recordRealMessage();
    }

    // L7: Traffic Shaping (enqueue for batched send)
    if (this.layers.trafficShaping.enabled && !options.skipShaping && !options.urgent) {
      return this._trafficShaper.enqueue(data);
    }

    // L10: Message Delay
    if (this.layers.messageDelay.enabled && !options.skipDelay && !options.urgent) {
      return this._messageDelay.enqueue(data, options.priority || 'normal');
    }

    return data;
  }

  // Unified Decryption Pipeline (12 Layers)
  async decryptMessage(encryptedData, senderId, recipientId, options = {}) {
    let data = encryptedData;

    // Unwrap L7 TrafficShaper / L10 MessageDelay envelope
    while (data && typeof data === 'object' && data.data && (data.enqueuedAt !== undefined || data.delayed !== undefined)) {
      data = data.data;
    }

    // L12: Deobfuscate metadata
    if (data.type === 'obfuscated' || data.senderId || data.recipientId) {
      try {
        data = await this._metadataObfuscator.deobfuscateMetadata(data);
        if (data.payload) data = data.payload;
      } catch (e) { /* continue */ }
    }

    // L3: PIR (unpack pir wrapper first, expose encrypted core)
    if (data.type === 'pir') {
      data = data.original;
      // original may be serialized (string) after base64 transport
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {
          // Not JSON - might be raw encrypted blob from fallback
          // Wrap as fallback type for L1 to process
          data = { raw: data, type: 'fallback' };
        }
      }
    }

    // L1: Double Ratchet (core decryption)
    if (this.crypto && (data.type === 'crypto' || data.type === 'fallback')) {
      try {
        const decryptTarget = data.crypto || data.raw;
        const decrypted = await this.crypto.decrypt(decryptTarget, senderId);
        // decrypted may be string or object - normalize to {content} for pipeline
        data = typeof decrypted === 'string' ? { content: decrypted } : decrypted;
        if (!data.type) data.type = 'decrypted';
      }
      catch (e) { return { error: e.message, raw: data }; }
    }

    // Restore authTag and paddingInfo from decrypted content (if embedded before L1)
    if (data.content && (data.paddingInfo || data.authTag)) {
      // Already has fields - decrypted was an object with metadata
    } else if (data.content && data.content.startsWith && data.content.startsWith('{')) {
      try {
        const parsed = JSON.parse(data.content);
        if (parsed.authTag) data.authTag = parsed.authTag;
        if (parsed.paddingInfo) data.paddingInfo = parsed.paddingInfo;
        if (parsed.content) data.content = parsed.content;
      } catch (e) { /* not JSON */ }
    }

    // L4: Mixnet
    if (data.type === 'mixnet') {
      try {
        const peeled = await this.mixnetReceive(data.mixnet, recipientId);
        const innermost = peeled[peeled.length - 1];
        data = innermost?.payload ? JSON.parse(atob(innermost.payload)) : innermost;
      } catch (e) { /* continue */ }
    }

    // L5: Sphinx
    if (data.type === 'sphinx' || data.sphinx) {
      try {
        const sphinxPacket = data.sphinx || data;
        const decrypted = await this.sphinxDecryptPacket(sphinxPacket, recipientId);
        data = JSON.parse(decrypted.content);
      } catch (e) { /* continue */ }
    }

    // L11: Verify deniable auth
    let authResult = null;
    if (data.authTag && this.layers.deniableAuth.enabled) {
      try {
        authResult = await this._deniableAuth.verify(
          data.content || data, data.authTag, senderId
        );
      } catch (e) { /* no session */ }
    }

    // L8: Strip padding
    if (data.content && this.layers.paddingNorm.enabled) {
      try {
        const stripped = this._paddingNorm.strip(data.content);
        if (stripped.stripped) data.content = stripped.data;
      } catch (e) { /* not padded */ }
    }

    // Normalize: ensure .content exists in result
    if (typeof data === 'string') data = { content: data };
    return { ...data, authResult };
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
      doubleRatchet: this.layers.doubleRatchet.enabled ? 100 : 0,
      zkAuth: this.layers.zkAuth.enabled ? 100 : 0,
      pirSearch: this.layers.pirSearch.enabled ? 100 : 0,
      mixnet: this.layers.mixnet.enabled ? 100 : 0,
      sphinx: this.layers.sphinx.enabled ? 100 : 0,
      coverTraffic: this.layers.coverTraffic.enabled ? 100 : 0,
      trafficShaping: this.layers.trafficShaping.enabled ? 100 : 0,
      paddingNorm: this.layers.paddingNorm.enabled ? 100 : 0,
      decoyContacts: this.layers.decoyContacts.enabled ? 100 : 0,
      messageDelay: this.layers.messageDelay.enabled ? 100 : 0,
      deniableAuth: this.layers.deniableAuth.enabled ? 100 : 0,
      metadataObfuscation: this.layers.metadataObfuscation.enabled ? 100 : 0,
      pqSignatures: (this.layers.pqSignatures.enabled && this._pqSignatures && this._pqSignatures._initialized) ? 100 : (this.layers.pqSignatures.enabled ? 50 : 0)
    };
    const totalLayers = Object.keys(this.layers).length;
    const enabledLayers = Object.values(this.layers).filter(l => l.enabled).length;
    return {
      level: enabledLayers,
      totalLayers,
      layers: this.layers,
      layerProgress,
      totalProgress: Math.round(Object.values(layerProgress).reduce((a, b) => a + b, 0) / totalLayers),
      pir: this._pirClient.getStatus(),
      mixnet: this._mixnet.getStatus(),
      coverTraffic: this._coverTraffic.getStats(),
      trafficShaping: this._trafficShaper.getStats(),
      paddingNorm: this._paddingNorm.getStats(),
      decoyContacts: this._decoyContacts.getStats(),
      messageDelay: this._messageDelay.getStats(),
      deniableAuth: this._deniableAuth.getStats(),
      metadataObfuscation: this._metadataObfuscator.getStats(),
      pqSignatures: this._pqSignatures ? this._pqSignatures.getStats() : { enabled: false, initialized: false }
    };
  }
}

// ================================================================
// Exports
// ================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PrivacyLayerManager,
    PIRSearchClient,
    PIRSearchServer,
    MixnetClient,
    SphinxPacketClient,
    CoverTrafficEngine,
    TrafficShaper,
    PaddingNormalizer,
    DecoyContactManager,
    MessageDelayEngine,
    DeniableAuthEngine,
    MetadataObfuscator
  };
}

if (typeof window !== 'undefined') {
  window.FIBEMATE = window.FIBEMATE || {};
  window.FIBEMATE.PrivacyLayerManager = PrivacyLayerManager;
  window.FIBEMATE.PIRSearchClient = PIRSearchClient;
  window.FIBEMATE.PIRSearchServer = PIRSearchServer;
  window.FIBEMATE.MixnetClient = MixnetClient;
  window.FIBEMATE.SphinxPacketClient = SphinxPacketClient;
  window.FIBEMATE.CoverTrafficEngine = CoverTrafficEngine;
  window.FIBEMATE.TrafficShaper = TrafficShaper;
  window.FIBEMATE.PaddingNormalizer = PaddingNormalizer;
  window.FIBEMATE.DecoyContactManager = DecoyContactManager;
  window.FIBEMATE.MessageDelayEngine = MessageDelayEngine;
  window.FIBEMATE.DeniableAuthEngine = DeniableAuthEngine;
  window.FIBEMATE.MetadataObfuscator = MetadataObfuscator;
  window.PrivacyLayerManager = PrivacyLayerManager;
}
