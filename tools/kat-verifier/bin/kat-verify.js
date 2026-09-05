#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// kat-verify CLI
const { KatVerifier } = require('../lib/kat-verifier');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`kat-verify — FIBEMATE KAT 验证器

用法:
  kat-verify <algorithm> <katDir> [--json]

示例:
  kat-verify ML-DSA-44 packages/fml-dsa/kat-vectors
  kat-verify ML-KEM-768 packages/pqc-kem/test/kat --json

说明:
  本 CLI 只验证「向量文件可解析 + 结构完整」。要跑算法一致性，
  需在代码中实例化 KatVerifier 并传入实现函数（见 lib/kat-verifier.js）。
`);
  process.exit(0);
}

const algorithm = args[0];
const katDir = path.resolve(args[1] || '.');
const asJson = args.includes('--json');

try {
  const v = new KatVerifier(algorithm, katDir).loadFromFiles();
  const summary = {
    algorithm,
    total: v.vectors.length,
    passed: 0,
    failed: 0,
    details: [],
  };
  // 结构完整性检查：每个向量至少有一个已知字段
  const KNOWN = ['seed', 'pk', 'sk', 'ek', 'dk', 'ct', 'k', 'sig', 'msg', 'm', 'c', 'ss'];
  for (const vec of v.vectors) {
    const has = KNOWN.some(k => vec.fields[k] !== undefined);
    if (has) summary.passed++;
    else { summary.failed++; summary.details.push({ id: vec.id ?? vec.sourceFile, stages: { parse: { passed: false, error: '无已知字段' } } }); }
  }
  console.log(v.format(summary, asJson ? 'json' : 'default'));
  process.exit(summary.failed > 0 ? 1 : 0);
} catch (e) {
  console.error('错误: ' + e.message);
  process.exit(2);
}
