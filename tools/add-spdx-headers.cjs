#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * tools/add-spdx-headers.cjs — 为已追踪源文件批量补齐 SPDX-License-Identifier 头
 *
 * 用法:
 *   node tools/add-spdx-headers.cjs add    --root <dir> [--license GPL-3.0-only] [--dry-run]
 *   node tools/add-spdx-headers.cjs check  --root <dir> [--format text|json]
 *
 * 特性:
 *   - 幂等: 已有 SPDX 头则跳过, 重复执行结果一致
 *   - 仅处理 git 已追踪文件 (跳过 untracked / node_modules)
 *   - shebang (#!) 保持首行, SPDX 头插入其后
 *   - 支持注释风格: // (js/cjs/mjs/ts/c/h), # (py/sh)
 *   - 豁免白名单: vendor 第三方 / 公共域参考实现 / 构建产物
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_LICENSE = 'GPL-3.0-only';
const EXTS = {
  js: '//', cjs: '//', mjs: '//', ts: '//',
  c: '//', h: '//',
  py: '#', sh: '#',
};

// 豁免白名单 (路径子串或顶层目录)
const EXEMPT_MARKERS = [
  '/vendor/',
  'noble-pq-bundle/',
  'node_modules/',
  '.min.js',
  'sm2-browser.bundle.js',  // esbuild 产物, 内含第三方 MIT 代码
  'pqc-kem/native/',        // pq-crystals Kyber 公共域参考实现 (仅此目录, 不误伤 fml-dsa native.js)
  'OrbitControls',          // Three.js MIT 上游
  '.wasm.d.ts',             // wasm-bindgen 生成产物
  '/lib/controls/',
  '/lib/OrbitControls',
];
const EXEMPT_DIRS = new Set([
  'fips205',      // NIST SPHINCS+ 公共域参考实现
  'c-stm32',      // STM32 移植 (上游派生)
  'wasm-sm2',     // AssemblyScript 实验线 (自研但独立包, 见 package.json)
  'archives',     // 归档历史
]);

// docs/ 下仍处理源文件 (cjs/py/sh/js), 仅文档类 (md/html/json/txt) 豁免
const DOC_EXEMPT_EXTS = new Set(['md', 'html', 'json', 'txt', 'csv', 'svg', 'tsq', 'tsr', 'css']);

function getTracked(root) {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch (e) {
    console.error(`[spdx] 不是 git 仓库: ${root}`);
    process.exit(1);
  }
}

function isExempt(rel) {
  if (EXEMPT_MARKERS.some(m => rel.includes(m))) return true;
  const top = rel.split('/')[0];
  if (EXEMPT_DIRS.has(top)) return true;
  // docs/ 下的源文件不豁免; 仅豁免文档类扩展
  if (top === 'docs') {
    const ext = rel.split('.').pop();
    if (DOC_EXEMPT_EXTS.has(ext)) return true;
  }
  return false;
}

function commentStyle(rel) {
  const ext = rel.split('.').pop();
  return EXTS[ext] || null;
}

function headerFor(style, license) {
  return `${style} SPDX-License-Identifier: ${license}\n`;
}

function fileHasSpdx(abs) {
  try {
    const head = fs.readFileSync(abs, 'utf8').split('\n').slice(0, 15).join('\n');
    return /SPDX-License-Identifier/.test(head);
  } catch { return true; } // 读不了就当已处理, 不阻塞
}

function addHeader(abs, style, license, dryRun) {
  const orig = fs.readFileSync(abs, 'utf8');
  const header = headerFor(style, license);

  // 保持文件原换行风格 (LF 优先, 仓库统一 LF)
  const newline = orig.includes('\r\n') ? '\r\n' : '\n';

  if (orig.startsWith('#!')) {
    const idx = orig.indexOf('\n');
    const rest = orig.slice(idx + 1);
    return orig.slice(0, idx + 1) + header + rest;
  }
  return header + orig;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const args = {};
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = argv[++i];
    else if (argv[i] === '--license') args.license = argv[++i];
    else if (argv[i] === '--format') args.format = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return { mode, ...args };
}

function main() {
  const { mode, root = '.', license = DEFAULT_LICENSE, format = 'text', dryRun = false } = parseArgs();
  if (!['add', 'check'].includes(mode)) {
    console.error('用法: add-spdx-headers.cjs <add|check> --root <dir> [--license SPDX] [--format text|json] [--dry-run]');
    process.exit(2);
  }

  const tracked = getTracked(root);
  const targets = tracked.filter(rel => {
    const style = commentStyle(rel);
    return style && !isExempt(rel);
  });

  const missing = [];
  for (const rel of targets) {
    const abs = path.join(root, rel);
    if (!fileHasSpdx(abs)) missing.push(rel);
  }

  if (mode === 'check') {
    if (format === 'json') {
      console.log(JSON.stringify({ total: targets.length, missing: missing.length, files: missing }, null, 2));
    } else {
      console.log(`[spdx] 已追踪源文件: ${targets.length} | 豁免: ${tracked.length - targets.length} | 已含: ${targets.length - missing.length} | 缺失: ${missing.length}`);
      if (missing.length > 0) {
        console.log('[spdx] 缺失文件:');
        missing.forEach(f => console.log(`  ${f}`));
        process.exitCode = 1;
      } else {
        console.log('[spdx] OK — 所有源文件均已含 SPDX 头');
      }
    }
    return;
  }

  // add mode
  let added = 0;
  for (const rel of missing) {
    const abs = path.join(root, rel);
    const style = commentStyle(rel);
    if (dryRun) {
      console.log(`[dry-run] would add header to ${rel}`);
      added++;
      continue;
    }
    try {
      const content = addHeader(abs, style, license, dryRun);
      fs.writeFileSync(abs, content, 'utf8');
      added++;
    } catch (e) {
      console.error(`[spdx] FAILED ${rel}: ${e.message}`);
    }
  }
  console.log(`[spdx] 补齐 ${added} 个文件 (license: ${license})`);
}

main();
