#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';

const { scan } = require('../lib/scan');
const { renderTable, renderHtml } = require('../lib/reporter');

// 手写 argv 解析（零依赖）
function parseFlags(argv) {
  const flags = { output: 'table', threshold: 50, ignoreDev: false, color: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output' || a === '-o') flags.output = argv[++i];
    else if (a === '--json') { flags.output = 'json'; }
    else if (a === '--threshold' || a === '-t') flags.threshold = parseInt(argv[++i], 10);
    else if (a === '--ignore-dev') flags.ignoreDev = true;
    else if (a === '--no-color') flags.color = false;
    else if (a === '--help' || a === '-h') flags.help = true;
  }
  return flags;
}

function showHelp() {
  console.log(`PQC Migration Scanner — 量子脆弱组件扫描

用法:
  pqc-migrate scan [path]    扫描指定目录（默认 .）
  pqc-migrate report [path]  输出缓存报告
  pqc-migrate ci [path]      CI 模式（exit 0=安全, 1=有风险）
  pqc-migrate init           生成 .pqc-migrate.yml

选项:
  --output json|html|table   输出格式（默认 table）
  --json                     等同于 --output json
  --threshold 0-100          风险阈值（默认 50）
  --ignore-dev               忽略 devDependencies
  --no-color                 禁用颜色输出
  --help                     显示帮助`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) { showHelp(); return; }

  const cmd = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest);
  if (flags.help) { showHelp(); return; }

  // 分离 path 与 flags
  const target = rest.find(a => !a.startsWith('-')) || '.';

  (async () => {
    if (cmd === 'init') {
      const fs = require('fs');
      const yml = '# pqc-migrate 配置\nthreshold: 50\nignore_dev: false\noutput: table\n';
      fs.writeFileSync('.pqc-migrate.yml', yml);
      console.log('✅ 已生成 .pqc-migrate.yml');
      return;
    }

    if (cmd === 'report') {
      const fs = require('fs');
      const cachePath = require('path').join(target, '.pqc-migrate-cache.json');
      if (!fs.existsSync(cachePath)) {
        console.error('No cached report found. Run `pqc-migrate scan` first.');
        process.exit(2);
      }
      const report = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (flags.output === 'json') console.log(JSON.stringify(report, null, 2));
      else if (flags.output === 'html') console.log(renderHtml(report));
      else console.log(renderTable(report, flags.color));
      return;
    }

    if (cmd === 'scan' || cmd === 'ci') {
      const report = await scan(target, flags);

      if (cmd === 'ci') {
        const highCount = report.findings.filter(f => f.severity === 'HIGH').length;
        if (highCount > 0 && report.score < flags.threshold) {
          console.error(`❌ PQC check FAILED: ${highCount} HIGH-risk deps, score ${report.score}/${flags.threshold}`);
          process.exit(1);
        }
        console.log(`✅ PQC check PASSED: score ${report.score}`);
        process.exit(0);
      }

      if (flags.output === 'json') console.log(JSON.stringify(report, null, 2));
      else if (flags.output === 'html') console.log(renderHtml(report));
      else console.log(renderTable(report, flags.color));
      return;
    }

    showHelp();
  })().catch(e => {
    console.error('✗ ' + e.message);
    process.exit(e.exitCode || 3);
  });
}

main();
