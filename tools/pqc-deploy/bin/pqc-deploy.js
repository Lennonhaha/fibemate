#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// PQC 部署验证 CLI — 批量探测端点 PQC 就绪度
// 设计文档: docs/product-designs/11-pqc-deployment-verification.md
const { probeMany, formatReport, persist, addMigrationAdvice, parseManifest } = require('../lib/deploy');
const fs = require('fs');

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') flags.file = argv[++i];
    else if (a === '--out' || a === '-o') flags.out = argv[++i];
    else if (a === '--json') flags.json = true;
    else if (a === '--no-persist') flags.noPersist = true;
    else flags._.push(a);
  }
  return flags;
}

function showHelp() {
  console.log(`pqc-deploy — FIBEMATE PQC 部署验证与主动探测

用法:
  pqc-deploy <host:port> [<host:port> ...]  [--json] [--out DIR]
  pqc-deploy --file endpoints.txt            [--json] [--out DIR]

选项:
  --file, -f    端点清单文件（host:port 每行一个，# 注释）
  --out, -o     结果持久化目录（默认 .）
  --json        JSON 输出
  --no-persist  不落盘

说明:
  评分是启发式检查（非审计结论），仅覆盖 TLS 握手算法协商。
  仅探测用户自有端点。请勿对未授权目标使用。
`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags._.length === 0 && !flags.file) { showHelp(); return; }

  let endpoints = flags._;
  if (flags.file) {
    endpoints = parseManifest(fs.readFileSync(flags.file, 'utf8'));
  }

  console.log(`🔍 探测 ${endpoints.length} 个端点...`);
  const results = await probeMany(endpoints);
  addMigrationAdvice(results);

  if (!flags.noPersist) {
    const file = persist(results, flags.out);
    console.log(`💾 结果已持久化: ${file}\n`);
  }

  if (flags.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(formatReport(results));
  console.log('');
  console.log('📋 迁移建议:');
  for (const r of results) {
    if (r.migration && r.migration.length) {
      console.log(`  ${r.endpoint}:`);
      for (const m of r.migration) console.log(`    • ${m}`);
    }
  }
}

main().catch(e => { console.error('错误: ' + e.message); process.exit(1); });
