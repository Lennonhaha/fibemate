/**
 * WebSocket Message Padding Layer — TLS 1.3 流量随机填充
 * 
 * 目标: 所有 WebSocket 消息统一大小，消除流量指纹
 * 策略:
 *   1. 随机块大小 (256B, 512B, 1KB, 2KB, 4KB)
 *   2. 填充用加密随机字节 (不可区分于密文)
 *   3. 对上层完全透明
 *   4. 服务端 & 客户端共用同一模块
 * 
 * 格式: [1B flags][2B originalLen][N-byte payload][M-byte random padding]
 *   flags: bit0=compressed, bit1=cover_traffic, bits2-7=RESERVED
 */

const crypto = require('crypto');

const BLOCK_SIZES = [256, 512, 1024, 2048, 4096];
const MIN_BLOCK = 256;
const MAX_BLOCK = 4096;

// Weight distribution: prefer smaller sizes to reduce bandwidth waste
const BLOCK_WEIGHTS = [0.35, 0.30, 0.20, 0.10, 0.05]; // cumulative → 256:35%, 512:30%, etc.

function weightedRandomBlock() {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < BLOCK_WEIGHTS.length; i++) {
    acc += BLOCK_WEIGHTS[i];
    if (r <= acc) return BLOCK_SIZES[i];
  }
  return MAX_BLOCK;
}

class WsPadding {
  /**
   * Pad a WebSocket message to a random block size
   * @param {Buffer|string} payload - Original message
   * @param {object} opts
   * @param {boolean} opts.isCover - Mark as cover traffic
   * @returns {Buffer} Padded message ready for wire
   */
  static pad(payload, opts = {}) {
    const raw = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    const originalLen = raw.length;

    // Pick target block size — round up to next BLOCK_SIZES boundary
    let targetSize = weightedRandomBlock();
    // If message is larger than the chosen block, pick next size up
    const headerSize = 3; // 1B flags + 2B originalLen
    while (targetSize < originalLen + headerSize && targetSize < MAX_BLOCK) {
      const idx = BLOCK_SIZES.indexOf(targetSize);
      targetSize = BLOCK_SIZES[Math.min(idx + 1, BLOCK_SIZES.length - 1)];
    }

    // Build flags byte
    let flags = 0x00;
    if (opts.isCover) flags |= 0x02; // bit1 = cover traffic

    // Header: [1B flags][2B originalLen (big-endian)]
    const header = Buffer.alloc(headerSize);
    header.writeUInt8(flags, 0);
    header.writeUInt16BE(originalLen, 1);

    // Padding: targetSize - headerSize - originalLen
    const paddingLen = targetSize - headerSize - originalLen;
    const padding = paddingLen > 0 ? crypto.randomBytes(paddingLen) : Buffer.alloc(0);

    return Buffer.concat([header, raw, padding]);
  }

  /**
   * Unpad a WebSocket message
   * @param {Buffer} padded - Padded message
   * @returns {{ payload: Buffer, isCover: boolean, originalLen: number }}
   */
  static unpad(padded) {
    if (padded.length < 3) {
      return { payload: padded, isCover: false, originalLen: padded.length };
    }

    const flags = padded.readUInt8(0);
    const originalLen = padded.readUInt16BE(1);
    const isCover = !!(flags & 0x02);
    const payload = padded.subarray(3, 3 + originalLen);

    return { payload, isCover, originalLen };
  }

  /**
   * Generate a cover traffic message (fake message, discarded by receiver)
   * @returns {Buffer} Padded cover message
   */
  static generateCover() {
    // Cover messages are random bytes of variable size
    const fakeSize = Math.floor(Math.random() * 128) + 32; // 32-160 bytes fake payload
    const fakePayload = crypto.randomBytes(fakeSize);
    return WsPadding.pad(fakePayload, { isCover: true });
  }
}

module.exports = { WsPadding, BLOCK_SIZES };
