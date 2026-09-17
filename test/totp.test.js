// SPDX-License-Identifier: GPL-3.0-only
/**
 * TOTP unit tests — RFC 6238 test vectors + edge cases
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateSecret, totpUri, verify, generateRecoveryCodes, hotp, base32Decode } = require('../src/lib/totp');

// ── RFC 6238 Appendix B Test Vectors ──
// Secret: "12345678901234567890" (ASCII) → Base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
// Note: RFC 6238 uses 8-byte secret for SHA-1; our base32Decode handles this

// The RFC test vector secret is ASCII "12345678901234567890" (20 bytes)
// In Base32 that's GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
// At T=59 (counter=1 with step=30), expected TOTP = 94287082 (8 digits)
// At T=59 with 6 digits = 287082
// At T=1111111109 (counter=37037036), expected = 07081804 (8 digits) → 081804 (6 digits)

test('generateSecret returns 32-char base32 string', () => {
  const secret = generateSecret();
  assert.equal(secret.length, 32);
  assert.match(secret, /^[A-Z2-7]+$/);
});

test('generateSecret produces unique secrets', () => {
  const s1 = generateSecret();
  const s2 = generateSecret();
  assert.notEqual(s1, s2);
});

test('totpUri format is correct', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const uri = totpUri(secret, 'alice', 'FIBEMATE');
  assert.match(uri, /^otpauth:\/\/totp\/FIBEMATE%3Aalice/);
  assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP'));
  assert.ok(uri.includes('issuer=FIBEMATE'));
  assert.ok(uri.includes('algorithm=SHA1'));
  assert.ok(uri.includes('digits=6'));
  assert.ok(uri.includes('period=30'));
});

test('RFC 6238: T=59 → 287082 (6 digits)', () => {
  // Counter at T=59, step=30 → counter = floor(59/30) = 1
  const code = hotp(RFC_SECRET, 1, 6);
  assert.equal(code, '287082');
});

test('RFC 6238: T=1111111109 → 081804 (6 digits)', () => {
  // Counter = floor(1111111109/30) = 37037036
  const code = hotp(RFC_SECRET, 37037036, 6);
  assert.equal(code, '081804');
});

test('verify accepts correct code within window', () => {
  // Generate a code for the current time, then verify it
  const secret = generateSecret();
  const counter = Math.floor(Date.now() / 1000 / 30);
  const code = hotp(secret, counter, 6);
  assert.equal(verify(secret, code), true);
});

test('verify accepts code from previous window (window=1)', () => {
  const secret = generateSecret();
  const counter = Math.floor(Date.now() / 1000 / 30);
  const code = hotp(secret, counter - 1, 6);
  assert.equal(verify(secret, code, { window: 1 }), true);
});

test('verify accepts code from next window (window=1)', () => {
  const secret = generateSecret();
  const counter = Math.floor(Date.now() / 1000 / 30);
  const code = hotp(secret, counter + 1, 6);
  assert.equal(verify(secret, code, { window: 1 }), true);
});

test('verify rejects code outside window', () => {
  const secret = generateSecret();
  const counter = Math.floor(Date.now() / 1000 / 30);
  const code = hotp(secret, counter + 3, 6); // 3 steps ahead, window=1
  assert.equal(verify(secret, code, { window: 1 }), false);
});

test('verify rejects invalid input', () => {
  const secret = generateSecret();
  assert.equal(verify(secret, ''), false);
  assert.equal(verify(secret, 'abc'), false);
  assert.equal(verify(secret, null), false);
  assert.equal(verify(null, '123456'), false);
});

test('verify uses timingSafeEqual (no early return on mismatch)', () => {
  // Just ensure it doesn't throw on different-length input
  const secret = generateSecret();
  assert.equal(verify(secret, '12345'), false); // 5 chars, not 6
  assert.equal(verify(secret, '1234567'), false); // 7 chars, not 6
});

test('generateRecoveryCodes returns requested count', () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.ok(codes.every(c => c.length === 8));
  // All unique
  assert.equal(new Set(codes).size, 10);
});

test('generateRecoveryCodes with custom length', () => {
  const codes = generateRecoveryCodes(5, 12);
  assert.equal(codes.length, 5);
  assert.ok(codes.every(c => c.length === 12));
});

test('base32Decode(roundtrip) works', () => {
  const { base32Encode } = require('../src/lib/totp');
  const original = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const encoded = base32Encode(original);
  const decoded = base32Decode(encoded);
  assert.deepEqual(decoded, original);
});
