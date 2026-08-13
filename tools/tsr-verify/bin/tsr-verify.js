#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { verifyTsr, hasOpenssl } = require('../lib/verify');
const { check, checkManifest } = require('../lib/check');
const { renderSummaryTable, renderInfo } = require('../lib/reporter');

function parseFlags(argv) {
  const flags = { verbose: false, json: false, strict: false };
  for (const a of argv) {
    if (a === '--verbose' || a === '-v') flags.verbose = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--strict') flags.strict = true;
    else if (a === '--help' || a === '-h') flags.help = true;
  }
  return flags;
}

function showHelp() {
  console.log(`TSR Evidence Chain Verifier — RFC 3161 时间戳存证验证

用法:
  tsr-verify check <path>        验证目录下所有 .tsr（或单个文件）
  tsr-verify info <file.tsr>     显示单个 TSR 详细信息
  tsr-verify manifest <manifest> 根据 timestamp-manifest.json 批量验证
  tsr-verify chain <path>        验证 TSR 序列连续性

选项:
  --verbose   输出详细验证过程
  --json      输出 JSON 格式
  --strict    严格模式（任何失败 exit 1）
  --help      显示帮助`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) { showHelp(); return; }

  const cmd = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest);

  if (flags.help || !['check', 'info', 'manifest', 'chain'].includes(cmd)) {
    showHelp();
    return;
  }

  // 分离 path 与 flags
  const target = rest.find(a => !a.startsWith('-')) || '.';

  try {
    if (!hasOpenssl()) {
      console.error('✗ openssl not found. Install: apt install openssl / brew install openssl');
      process.exit(2);
    }

    if (cmd === 'info') {
      const r = verifyTsr(target);
      if (flags.json) console.log(JSON.stringify(r, null, 2));
      else console.log(renderInfo(r));
      if (flags.strict && !r.valid) process.exit(1);
      return;
    }

    if (cmd === 'manifest') {
      const summary = checkManifest(target);
      if (flags.json) console.log(JSON.stringify(summary, null, 2));
      else console.log(renderSummaryTable(summary, flags));
      if (flags.strict && summary.invalid > 0) process.exit(1);
      return;
    }

    // check / chain 都用批量验证
    const summary = check(target);

    if (cmd === 'chain') {
      const chain = summary.chain;
      if (!chain) { console.error('无法从文件名提取序列号'); process.exit(3); }
      if (chain.gaps.length === 0) {
        console.log(`🔗 Chain continuity: ✅ NO GAPS (${chain.min} ~ ${chain.max} consecutive)`);
      } else {
        console.log(`🔗 Chain continuity: ❌ GAPS at: ${chain.gaps.join(', ')}`);
        if (flags.strict) process.exit(1);
      }
      if (flags.json) console.log(JSON.stringify(chain));
      return;
    }

    if (flags.verbose) {
      for (const r of summary.details) {
        console.log(`  ${r.valid ? '✅' : '❌'} ${r.file}${r.reason ? ' → ' + r.reason : ''}`);
      }
      console.log('');
    }

    if (flags.json) console.log(JSON.stringify(summary, null, 2));
    else console.log(renderSummaryTable(summary, flags));

    if (flags.strict && summary.invalid > 0) process.exit(1);
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(3);
  }
}

main();
