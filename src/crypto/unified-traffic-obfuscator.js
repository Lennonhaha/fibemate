/**
 * Unified Traffic Obfuscation — Server Side
 * 
 * 组合三层防护:
 *   Layer 1 (Padding):  ws-padding.js — 所有 WS 消息随机块大小填充
 *   Layer 2 (Poisson):  traffic-shaping.js — Poisson 过程虚拟流量生成
 *   Layer 3 (Mixnet):   mixnet-transport.js — 批量+延迟+假消息深度混淆
 * 
 * 为每个活跃 WebSocket 连接提供透明包装
 */

const { WsPadding } = require('./ws-padding');
const { TrafficShaper } = require('./traffic-shaping');
const { MixnetTransport } = require('../../experimental/mixnet/mixnet-transport');

class UnifiedTrafficObfuscator {
  constructor(db, onlineUsers, sendToUserFn) {
    this.db = db;
    this.onlineUsers = onlineUsers;
    this.sendToUser = sendToUserFn;

    // Layer 1: Padding (stateless, works per-message)
    this.paddingEnabled = true;

    // Layer 2: Poisson traffic shaper
    this.shaper = new TrafficShaper();
    
    // Layer 3: Mixnet transport
    this.mixnet = new MixnetTransport(db, onlineUsers, sendToUserFn);

    this.stats = {
      messagesPadded: 0,
      messagesShaped: 0,
      coverGenerated: 0,
      messagesDropped: 0
    };
  }

  /**
   * Start all obfuscation layers
   */
  start() {
    // Layer 2: Poisson cover traffic → sends through mixnet
    this.shaper.enable((coverMsg) => {
      this.stats.coverGenerated++;
      // Cover traffic is padded and broadcast to random online users
      const userIds = Array.from(this.onlineUsers.keys());
      if (userIds.length > 0) {
        const target = userIds[Math.floor(Math.random() * userIds.length)];
        const padded = WsPadding.pad(coverMsg.data, { isCover: true });
        try {
          this.sendToUser(target, padded);
        } catch (e) { /* ignore delivery errors for cover traffic */ }
      }
    });
    console.log('[UnifiedObfuscator] Started (padding + Poisson + mixnet)');
  }

  stop() {
    this.shaper.disable();
    this.mixnet.stop();
    console.log('[UnifiedObfuscator] Stopped');
  }

  /**
   * Send message through full obfuscation pipeline
   * 
   * Pipeline: raw → WsPadding → TrafficShaper (delay/rate-limit) → Mixnet (batch/delay)
   * 
   * @param {string} fromUserId
   * @param {string} toUserId  
   * @param {Buffer|string|object} message - Raw message
   * @param {object} opts
   * @param {boolean} opts.skipMixnet - Skip mixnet layer for urgent messages
   * @param {boolean} opts.skipShaping - Skip Poisson shaping (use immediate send)
   */
  send(fromUserId, toUserId, message, opts = {}) {
    const raw = Buffer.isBuffer(message) 
      ? message 
      : Buffer.from(typeof message === 'object' ? JSON.stringify(message) : String(message), 'utf8');

    // Layer 1: Padding (always applied)
    const padded = this.paddingEnabled ? WsPadding.pad(raw) : raw;
    this.stats.messagesPadded++;

    // Build message object for mixnet
    const msgObj = {
      from: fromUserId,
      to: toUserId,
      ciphertext: padded.toString('base64'),
      type: 'message',
      createdAt: Date.now()
    };

    if (opts.skipShaping) {
      // Urgent: skip Poisson, go direct to mixnet
      this.mixnet.sendMessage(toUserId, msgObj, false);
      return { shaped: false, padded: true };
    }

    // Layer 2: Poisson rate-limiting + random delay
    const result = this.shaper.processOutgoing(fromUserId, msgObj, (shaped) => {
      // After Poisson delay, pass to mixnet
      this.mixnet.sendMessage(toUserId, shaped, true);
    });

    if (!result.allowed) {
      this.stats.messagesDropped++;
    } else {
      this.stats.messagesShaped++;
    }

    return { 
      shaped: result.allowed, 
      padded: true, 
      delay: result.delay || 0,
      reason: result.reason 
    };
  }

  /**
   * Send urgent message (skip Poisson, only padding + mixnet)
   */
  sendUrgent(fromUserId, toUserId, message) {
    return this.send(fromUserId, toUserId, message, { skipShaping: true, skipMixnet: true });
  }

  /**
   * Process incoming WebSocket message — remove padding
   * @param {Buffer} rawData - Raw WebSocket frame data
   * @returns {{ payload: Buffer, isCover: boolean }}
   */
  processIncoming(rawData) {
    const buf = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
    return WsPadding.unpad(buf);
  }

  getStats() {
    return {
      ...this.stats,
      shaper: this.shaper.getStats(),
      paddingEnabled: this.paddingEnabled
    };
  }
}

module.exports = { UnifiedTrafficObfuscator };
