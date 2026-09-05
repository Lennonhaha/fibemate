// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// 常量时间 buffer 比较（侧信道安全）
function bufEq(a, b) {
  const ua = a instanceof Uint8Array ? a : new Uint8Array(a);
  const ub = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

function toBuf(x) {
  if (x instanceof Uint8Array) return x;
  if (Buffer.isBuffer(x)) return new Uint8Array(x);
  if (Array.isArray(x)) return new Uint8Array(x);
  if (typeof x === 'string') return hexToBuf(x);
  throw new TypeError('无法转换为 Uint8Array');
}

function hexToBuf(hex) {
  const s = hex.replace(/\s+/g, '');
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) b[i / 2] = parseInt(s.substring(i, i + 2), 16);
  return b;
}

function bufToHex(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

module.exports = { bufEq, toBuf, hexToBuf, bufToHex };
