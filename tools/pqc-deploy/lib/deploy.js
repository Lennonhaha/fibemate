'use strict';
// PQC 部署验证 CLI 核心 — 复用 server/pqc-detector.js 的探测引擎
// 设计文档: docs/product-designs/11-pqc-deployment-verification.md
const fs = require('fs');
const path = require('path');
const { probe, probeMany, formatReport } = require('../../../server/pqc-detector');

// 迁移建议映射：探测弱点 → 迁移动作
const MIGRATION_RULES = [
  { test: r => r.tlsVersion !== 'TLSv1.3', advice: '升级到 TLS 1.3（PQC 混合 KEM 的前置条件）' },
  { test: r => r.keyExchange && !/mlkem|kem|pqc/i.test(r.keyExchange.name || ''), advice: '启用 X25519MLKEM768（IANA #4588）混合密钥交换' },
  { test: r => r.cert && r.cert.publicKey.type === 'RSA' && r.cert.publicKey.bits < 2048, advice: '更换 ≥2048 位证书，或迁移到 ML-DSA 证书' },
  { test: r => r.cert && r.cert.publicKey.type === 'RSA', advice: '规划证书迁移到 ML-DSA-44（PQC 签名）' },
];

// 持久化结果（JSON 落盘，支持横向/纵向对比）
function persist(results, outDir) {
  const dir = path.resolve(outDir || '.');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `pqc-probe-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2), 'utf8');
  return file;
}

// 迁移建议生成
function addMigrationAdvice(results) {
  for (const r of results) {
    r.migration = MIGRATION_RULES.filter(rule => rule.test(r)).map(rule => rule.advice);
  }
  return results;
}

// 清单文件解析（host:port 每行一个，支持 # 注释）
function parseManifest(text) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
}

module.exports = { probe, probeMany, formatReport, persist, addMigrationAdvice, parseManifest, MIGRATION_RULES };
