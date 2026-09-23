#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * tools/pqc-compat-check.cjs — ML-KEM 序列化兼容性检测器
 *
 * 用途：检测 ML-KEM 各实现（JS / C native / WASM / Rust）产物的序列化漂移，
 *       即「同一逻辑密钥在跨实现/跨版本下的字节级表示是否一致」。
 *       防止因编码约定（BGR/hex/base64/无填充）差异导致的互操作故障。
 *
 * 用法:
 *   node tools/pqc-compat-check.cjs check <fileA> <fileB>      # 比较两个产物文件
 *   node tools/pqc-compat-check.cjs check --hex <hexA> <hexB>  # 直接比较 hex
 *   node tools/pqc-compat-check.cjs sizes                      # 打印标准密钥尺寸参考表
 *
 * 检测项:
 *   - 字节长度是否命中 FIPS 203 标准尺寸
 *   - 编码格式（hex / base64 / base64url / raw）
 *   - 字节级是否一致（归一化后）
 *
 * 退出码:
 *   0 — 兼容（字节一致）
 *   1 — 不兼容（长度/内容漂移）
 */
'use strict';

const fs = require('fs');
const path = require('path');

// FIPS 203 ML-KEM 标准尺寸（字节）
const MLKEM_SIZES = {
  'ML-KEM-512':  { pk: 800,  sk: 1632, ct: 768,  ss: 32 },
  'ML-KEM-768':  { pk: 1184, sk: 2400, ct: 1088, ss: 32 },
  'ML-KEM-1024': { pk: 1568, sk: 3168, ct: 1568, ss: 32 },
};

// ════════════════════════════
// 命令行解析
// ════════════════════════════
const args = process.argv.slice(2);
const cmd = args[0];

function usage() {
  console.log(`用法:
  node tools/pqc-compat-check.cjs check <fileA> <fileB>
  node tools/pqc-compat-check.cjs check --hex <hexA> <hexB>
  node tools/pqc-compat-check.cjs sizes`);
}

// ════════════════════════════
// 编码探测
// ════════════════════════════
function detectFormat(s) {
  const t = s.trim();
  if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0) return 'hex';
  if (/^[A-Za-z0-9+/]+=*$/.test(t) && t.length % 4 === 0) return 'base64';
  if (/^[A-Za-z0-9_-]+$/.test(t)) return 'base64url';
  return 'raw';
}

function toBytes(s, format) {
  if (format === 'hex') return Buffer.from(s, 'hex');
  if (format === 'base64') return Buffer.from(s, 'base64');
  if (format === 'base64url') return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return Buffer.from(s, 'utf8');
}

function classifySize(n) {
  const hits = [];
  for (const [name, dims] of Object.entries(MLKEM_SIZES)) {
    for (const [field, size] of Object.entries(dims)) {
      if (n === size) hits.push(`${name} ${field}`);
    }
  }
  return hits;
}

// ════════════════════════════
// 主流程
// ════════════════════════════
function main() {
  if (cmd === 'sizes') {
    console.log('ML-KEM 标准尺寸参考（字节，FIPS 203）:\n');
    for (const [name, dims] of Object.entries(MLKEM_SIZES)) {
      console.log(`  ${name}:  pk=${dims.pk}  sk=${dims.sk}  ct=${dims.ct}  ss=${dims.ss}`);
    }
    process.exit(0);
  }

  if (cmd !== 'check' || args.length < 3) { usage(); process.exit(1); }

  let aRaw, bRaw, aLabel, bLabel;
  if (args[1] === '--hex') {
    aRaw = args[2]; bRaw = args[3];
    aLabel = 'hexA'; bLabel = 'hexB';
  } else {
    const fa = path.resolve(args[1]), fb = path.resolve(args[2]);
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) {
      console.error('❌ 输入文件不存在');
      process.exit(1);
    }
    aRaw = fs.readFileSync(fa, 'utf8'); bRaw = fs.readFileSync(fb, 'utf8');
    aLabel = path.basename(fa); bLabel = path.basename(fb);
  }

  const fa = detectFormat(aRaw), fb = detectFormat(bRaw);
  const aBytes = toBytes(aRaw, fa), bBytes = toBytes(bRaw, fb);

  console.log(`比较 ${aLabel} vs ${bLabel}\n`);
  console.log(`  A: ${aBytes.length} 字节 (${fa})  命中标准: ${classifySize(aBytes.length).join(', ') || '无'}`);
  console.log(`  B: ${bBytes.length} 字节 (${fb})  命中标准: ${classifySize(bBytes.length).join(', ') || '无'}`);

  const sameLen = aBytes.length === bBytes.length;
  const sameBytes = sameLen && aBytes.equals(bBytes);

  if (sameBytes) {
    console.log('\n✅ 兼容：归一化后字节一致');
    process.exit(0);
  } else if (sameLen) {
    // 找出第一个差异字节
    let diffAt = -1;
    for (let i = 0; i < aBytes.length; i++) {
      if (aBytes[i] !== bBytes[i]) { diffAt = i; break; }
    }
    console.log(`\n❌ 不兼容：长度相同但内容漂移，首个差异在字节 ${diffAt}`);
    process.exit(1);
  } else {
    console.log(`\n❌ 不兼容：长度漂移（${aBytes.length} vs ${bBytes.length}）`);
    process.exit(1);
  }
}

main();
