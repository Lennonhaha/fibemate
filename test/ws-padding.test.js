// SPDX-License-Identifier: GPL-3.0-only
/**
 * ws-padding.js 单元测试 —— 16 位头 / 扩展头(>64KB) / 畸形帧 / 入站帧解码
 *
 * 运行: node --test test/ws-padding.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const { TextEncoder } = require('node:util');

const { WsPadding, BLOCK_SIZES, MAX_SHORT_LEN } = require('../src/crypto/ws-padding.js');

function bytes(n, seed = 7) {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; out[i] = x & 0xff; }
  return out;
}

function eqBytes(a, b) {
  assert.equal(a.length, b.length, 'length mismatch');
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) assert.fail(`byte mismatch at ${i}: ${a[i]} != ${b[i]}`);
  }
}

test('16-bit header: roundtrip for small payloads', () => {
  for (const n of [0, 1, 10, 100, 253, 1000, 4000]) {
    const raw = bytes(n, n + 1);
    const padded = WsPadding.pad(raw);
    const out = WsPadding.unpad(padded);
    assert.equal(out.malformed, false);
    assert.equal(out.isCover, false);
    assert.equal(out.originalLen, n);
    eqBytes(out.payload, raw);
  }
});

test('16-bit header: short payloads are quantised to a block size', () => {
  for (let n = 1; n <= 300; n += 17) {
    const padded = WsPadding.pad(bytes(n, n));
    assert.ok(padded.length <= 4096, `padded length ${padded.length} exceeded MAX_BLOCK`);
    assert.ok(BLOCK_SIZES.includes(padded.length) || padded.length === n + 3,
      `padded length ${padded.length} is neither a block size nor header+payload`);
  }
});

test('boundary: exactly 65535 bytes still uses the 16-bit header', () => {
  const raw = bytes(MAX_SHORT_LEN, 3);
  const padded = WsPadding.pad(raw);
  assert.equal(padded[0] & 0x04, 0, 'extended-length bit must not be set at the boundary');
  const out = WsPadding.unpad(padded);
  assert.equal(out.malformed, false);
  assert.equal(out.originalLen, MAX_SHORT_LEN);
  eqBytes(out.payload, raw);
});

test('boundary: 65536 bytes switches to the extended header', () => {
  const raw = bytes(MAX_SHORT_LEN + 1, 4);
  const padded = WsPadding.pad(raw);
  assert.equal(padded[0] & 0x04, 0x04, 'extended-length bit must be set above 65535');
  assert.equal(padded.length, raw.length + 5, 'extended frames must not be padded');
  assert.equal(padded[1], 0x00);
  assert.equal(padded[2], 0x01); // 65536 = 0x00010000
  assert.equal(padded[3], 0x00);
  assert.equal(padded[4], 0x00);
  const out = WsPadding.unpad(padded);
  assert.equal(out.malformed, false);
  assert.equal(out.originalLen, 65536);
  eqBytes(out.payload, raw);
});

test('extended header: large payloads roundtrip without truncation', () => {
  for (const n of [65537, 100000, 200000, 1024 * 1024]) {
    const raw = bytes(n, 11);
    const padded = WsPadding.pad(raw);
    assert.equal(padded.length, n + 5);
    const out = WsPadding.unpad(padded);
    assert.equal(out.malformed, false);
    assert.equal(out.originalLen, n);
    eqBytes(out.payload, raw);
  }
});

test('cover traffic flag survives padding and unpacking', () => {
  const padded = WsPadding.pad(bytes(50, 5), { isCover: true });
  const out = WsPadding.unpad(padded);
  assert.equal(out.isCover, true);
  assert.equal(out.malformed, false);
  assert.equal(out.originalLen, 50);
});

test('generateCover produces a well-formed cover frame', () => {
  for (let i = 0; i < 20; i++) {
    const out = WsPadding.unpad(WsPadding.generateCover());
    assert.equal(out.isCover, true);
    assert.equal(out.malformed, false);
    assert.ok(out.originalLen >= 32 && out.originalLen <= 159, `cover size ${out.originalLen} out of range`);
  }
});

test('malformed: truncated extended frame is flagged, not silently truncated', () => {
  const bad = new Uint8Array(20);
  bad[0] = 0x04;              // extended length
  bad[3] = 0x03; bad[4] = 0xE8; // claims 1000 bytes
  const out = WsPadding.unpad(bad);
  assert.equal(out.malformed, true);
  assert.equal(out.payload.length, 20, 'malformed frames must return the input unchanged');
  assert.equal(out.originalLen, 20);
});

test('malformed: extended header shorter than 5 bytes is flagged', () => {
  const bad = new Uint8Array([0x04, 0x00, 0x00]);
  const out = WsPadding.unpad(bad);
  assert.equal(out.malformed, true);
});

test('malformed: 16-bit frame claiming more bytes than present is flagged', () => {
  const bad = new Uint8Array(10);
  bad[0] = 0x00;
  bad[1] = 0x10; bad[2] = 0x00; // claims 4096
  const out = WsPadding.unpad(bad);
  assert.equal(out.malformed, true);
  assert.equal(out.payload.length, 10);
});

test('malformed: non-frame input does not throw', () => {
  for (const bad of [new Uint8Array(0), new Uint8Array([1]), new Uint8Array([2, 3])]) {
    const out = WsPadding.unpad(bad);
    assert.equal(out.malformed, true);
  }
});

test('decodeFrame: binary padded frame decodes to the original JSON', () => {
  const json = JSON.stringify({ type: 'message', payload: 'x'.repeat(500) });
  const frame = WsPadding.pad(new TextEncoder().encode(json));
  const out = WsPadding.decodeFrame(frame, true);
  assert.equal(out.skip, undefined);
  assert.equal(out.text, json);
});

test('decodeFrame: text frame (unpadded JSON) is accepted as-is', () => {
  const json = JSON.stringify({ type: 'ping' });
  const out = WsPadding.decodeFrame(new TextEncoder().encode(json), false);
  assert.equal(out.text, json);
});

test('decodeFrame: text frame that is actually padded falls back to unpad', () => {
  const json = JSON.stringify({ type: 'auth', token: 'abc' });
  const frame = WsPadding.pad(new TextEncoder().encode(json));
  // 模拟旧客户端：已填充，但没有置二进制标志
  const out = WsPadding.decodeFrame(frame, false);
  assert.equal(out.text, json);
});

test('decodeFrame: cover traffic is skipped, not parsed', () => {
  const cover = WsPadding.generateCover();
  assert.equal(WsPadding.decodeFrame(cover, true).skip, 'cover');
  assert.equal(WsPadding.decodeFrame(cover, false).skip, 'cover');
});

test('decodeFrame: malformed binary frame is skipped instead of parsed', () => {
  const bad = new Uint8Array([0x00, 0x10, 0x00, 1, 2, 3]); // claims 4096 bytes, has 3
  assert.equal(WsPadding.decodeFrame(bad, true).skip, 'malformed');
});

test('decodeFrame: invalid text that is not a padded frame rethrows the parse error', () => {
  const notJson = new TextEncoder().encode('this is not json at all');
  assert.throws(() => WsPadding.decodeFrame(notJson, false), SyntaxError);
});

test('decodeFrame: extended (large) binary frame decodes correctly', () => {
  const big = 'y'.repeat(70000);
  const json = JSON.stringify({ type: 'blob', data: big });
  const frame = WsPadding.pad(new TextEncoder().encode(json));
  const out = WsPadding.decodeFrame(frame, true);
  assert.equal(out.text.length, json.length);
  assert.equal(out.text, json);
});
