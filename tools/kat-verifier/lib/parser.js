// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// KAT 向量解析器 — 支持多种格式
// 1. JSON 数组（fml-dsa 的 ACVP 导出）：[{tcId, seed, pk, sk, ...}]
// 2. .rsp 文本（NIST ACVP）：count = N / seed = / pk = / sk = / ...
const { hexToBuf } = require('./util');

// 解析 JSON 数组格式
function parseJsonVectors(json) {
  if (!Array.isArray(json)) throw new TypeError('JSON KAT 必须是数组');
  return json.map(v => ({
    id: v.tcId ?? v.count ?? null,
    fields: Object.fromEntries(
      Object.entries(v).map(([k, val]) => [
        k, typeof val === 'string' && /^[0-9a-f]+$/i.test(val) ? hexToBuf(val) : val,
      ])
    ),
  }));
}

// 解析 .rsp 文本格式（NIST ACVP prompt 文件）
function parseRspVectors(text) {
  const vectors = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('count')) {
      if (cur) vectors.push(cur);
      cur = { id: null, fields: {} };
      continue;
    }
    const m = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (key === 'count') { if (cur) cur.id = val; continue; }
    // 十六进制字段（seed/m/ek/dk/c/k/sk/pk/sig/msg/ct/ss 等）
    if (/^[0-9a-f]+$/i.test(val)) val = hexToBuf(val);
    cur.fields[key] = val;
  }
  if (cur) vectors.push(cur);
  return vectors;
}

// 自动探测格式
function parseVectors(input, algorithm) {
  let text = input;
  if (Buffer.isBuffer(input)) text = input.toString('utf8');
  if (typeof text === 'string') {
    const t = text.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      return parseJsonVectors(JSON.parse(t));
    }
    return parseRspVectors(t);
  }
  if (Array.isArray(input)) return parseJsonVectors(input);
  throw new TypeError('无法识别的 KAT 格式: ' + algorithm);
}

module.exports = { parseVectors, parseJsonVectors, parseRspVectors };
