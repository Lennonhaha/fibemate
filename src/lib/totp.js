// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE TOTP — Time-based One-Time Password (RFC 6238)
 *
 * Zero external dependencies. Uses only node:crypto.
 *
 * API:
 *   generateSecret()           → base32 string (32 chars, 160 bits)
 *   totpUri(secret, account, issuer) → otpauth:// URI
 *   verify(secret, code, opts) → boolean
 *   generateRecoveryCodes(n)   → string[]
 */

const crypto = require('crypto');

// ── Base32 (RFC 4648) ──
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP = {};
for (let i = 0; i < BASE32_CHARS.length; i++) BASE32_LOOKUP[BASE32_CHARS[i]] = i;

function base32Encode(buffer) {
  let bits = 0, value = 0, output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str) {
  let bits = 0, value = 0;
  const bytes = [];
  for (const c of str.toUpperCase()) {
    if (!(c in BASE32_LOOKUP)) continue;
    value = (value << 5) | BASE32_LOOKUP[c];
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ── HOTP / TOTP (RFC 4226 / RFC 6238) ──

/**
 * Generate a TOTP code for the given secret and counter.
 * @param {string} secret - Base32-encoded secret
 * @param {number} counter - Time step counter
 * @param {number} digits - Code length (default 6)
 * @returns {string} - Zero-padded numeric code
 */
function hotp(secret, counter, digits = 6) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // counter as 8-byte big-endian
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = binary % Math.pow(10, digits);
  return String(code).padStart(digits, '0');
}

// ── Public API ──

/**
 * Generate a random TOTP secret (160 bits / 32 base32 chars).
 * @returns {string} Base32-encoded secret
 */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Build an otpauth:// URI for QR code generation.
 * @param {string} secret - Base32 secret
 * @param {string} accountName - User account name (e.g. username)
 * @param {string} issuer - Issuer name (e.g. "FIBEMATE")
 * @returns {string} otpauth:// URI
 */
function totpUri(secret, accountName, issuer = 'FIBEMATE') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Verify a TOTP code against the secret.
 * Uses timingSafeEqual to prevent timing attacks.
 *
 * @param {string} secret - Base32 secret
 * @param {string} code - 6-digit code from user
 * @param {object} opts - { window: 1, step: 30 }
 * @returns {boolean}
 */
function verify(secret, code, opts = {}) {
  const window = opts.window ?? 1;
  const step = opts.step ?? 30;

  if (!secret || !code || code.length !== 6) return false;

  const counter = Math.floor(Date.now() / 1000 / step);

  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, counter + i);
    if (expected.length === code.length) {
      const a = Buffer.from(expected);
      const b = Buffer.from(code);
      if (crypto.timingSafeEqual(a, b)) return true;
    }
  }
  return false;
}

/**
 * Generate one-time recovery codes.
 * @param {number} count - Number of codes (default 10)
 * @param {number} length - Code length in hex chars (default 8)
 * @returns {string[]} Array of recovery codes
 */
function generateRecoveryCodes(count = 10, length = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(Math.ceil(length / 2));
    codes.push(bytes.toString('hex').slice(0, length).toUpperCase());
  }
  return codes;
}

module.exports = { generateSecret, totpUri, verify, generateRecoveryCodes, hotp, base32Encode, base32Decode };
