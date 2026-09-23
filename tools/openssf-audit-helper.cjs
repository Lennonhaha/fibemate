#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * tools/openssf-audit-helper.cjs — OpenSSF Best Practices 自查清单导出
 *
 * 用途：对照 OpenSSF 最佳实践徽章（Best Practices Badge）标准，
 *       扫描当前仓库并生成自查清单（Markdown / JSON），辅助 Silver/Gold 申报。
 *       只读扫描，不修改任何文件。
 *
 * 用法:
 *   node tools/openssf-audit-helper.cjs                    # 输出 Markdown 自查报告
 *   node tools/openssf-audit-helper.cjs --json             # 输出 JSON（CI 友好）
 *   node tools/openssf-audit-helper.cjs --root <dir>       # 指定仓库根
 *   node tools/openssf-audit-helper.cjs --criteria <id>    # 只看某一准则
 *
 * 检测项（基于 OpenSSF Best Practices 关键指标，静态启发式）:
 *   1. 许可证存在性（LICENSE / COPYING）
 *   2. 安全策略（SECURITY.md）
 *   3. 行为准则（CODE_OF_CONDUCT.md）
 *   4. 贡献指南（CONTRIBUTING.md）
 *   5. CI 流水线（.github/workflows）
 *   6. 漏洞披露（VULNERABILITY-DISCLOSURE.md / SECURITY.md 内 policy）
 *   7. 依赖清单（package-lock.json / go.mod / Cargo.lock 等）
 *   8. 版本控制历史（git 提交数）
 *   9. 加密实现安全（是否使用标准库而非自研哈希）
 *  10. 测试覆盖（test/ 目录存在性）
 *
 * 说明：本工具为「静态启发式自查」，结果用于快速定位申报缺口，
 *       不替代 OpenSSF 官方 badgeapp 的完整评分。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ════════════════════════════
// 命令行解析
// ════════════════════════════
const args = process.argv.slice(2);
let root = '.';
let jsonOut = false;
let criteriaFilter = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root') { root = args[++i]; continue; }
  if (args[i] === '--json') { jsonOut = true; continue; }
  if (args[i] === '--criteria') { criteriaFilter = args[++i]; continue; }
}

const rootAbs = path.resolve(root);
function has(f) { return fs.existsSync(path.join(rootAbs, f)); }

// ════════════════════════════
// 检测逻辑
// ════════════════════════════
function checkGitCommits() {
  try {
    const n = execFileSync('git', ['-C', rootAbs, 'rev-list', '--count', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return parseInt(n, 10) || 0;
  } catch { return 0; }
}

function checkLicense() {
  if (has('LICENSE') || has('COPYING')) {
    const raw = fs.readFileSync(path.join(rootAbs, has('LICENSE') ? 'LICENSE' : 'COPYING'), 'utf8');
    if (/GPL|MIT|Apache|BSD|MPL|ISC/i.test(raw.slice(0, 500))) return { pass: true, note: raw.match(/GPL|MIT|Apache|BSD|MPL|ISC/i)[0] };
    return { pass: true, note: 'LICENSE 存在（未识别常见许可证名）' };
  }
  return { pass: false, note: '缺少 LICENSE/COPYING' };
}

function checkSecurityPolicy() {
  if (!has('SECURITY.md')) return { pass: false, note: '缺少 SECURITY.md' };
  const raw = fs.readFileSync(path.join(rootAbs, 'SECURITY.md'), 'utf8');
  const hasContact = /(mailto:|@|security@|报告|漏洞|vulnerability|report|contact|policy)/i.test(raw);
  return { pass: hasContact, note: hasContact ? 'SECURITY.md 存在且含披露指引' : 'SECURITY.md 存在但缺少披露联系方式' };
}

function checkDependencyLock() {
  const locks = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
    'go.sum', 'Cargo.lock', 'Gemfile.lock', 'Pipfile.lock', 'poetry.lock'];
  const found = locks.filter(f => has(f));
  return { pass: found.length > 0, note: found.length ? `依赖锁文件: ${found.join(', ')}` : '缺少依赖锁文件' };
}

function checkCI() {
  if (!has('.github/workflows')) return { pass: false, note: '无 .github/workflows' };
  try {
    const files = fs.readdirSync(path.join(rootAbs, '.github/workflows')).filter(f => /\.(yml|yaml)$/.test(f));
    return { pass: files.length > 0, note: files.length ? `${files.length} 个 workflow: ${files.join(', ')}` : 'workflows 目录为空' };
  } catch { return { pass: false, note: '无法读取 .github/workflows' }; }
}

function checkSelfRolledCrypto() {
  // 启发式：扫描 src/packages 是否有自研 hash/加密实现（高风险信号）
  const scanDirs = ['src', 'packages', 'lib'].filter(d => has(d));
  const risky = [];
  for (const d of scanDirs) {
    const full = path.join(rootAbs, d);
    if (!fs.statSync(full).isDirectory()) continue;
    walk(full, (file) => {
      if (!/\.(js|ts|c|h|py|rs|go)$/.test(file)) return;
      const raw = fs.readFileSync(file, 'utf8');
      // 自研核心密码原语信号：只认函数/类定义，不认变量赋值（排除 const mlkem = ... 这类）
      if (/\b(function\s+|class\s+|const\s+[\w$]+\s*=\s*function\s*|const\s+[\w$]+\s*=\s*\([^)]*\)\s*=>\s*)(sha256|sha3|aes|rijndael|kem|kyber|mlkem|slhdsa|sphincs)\s*\(/.test(raw) &&
          !/@noble|node:crypto|require\(['"]crypto['"]\)|from ['"]crypto['"]/.test(raw)) {
        risky.push(path.relative(rootAbs, file));
      }
    });
  }
  return { pass: risky.length === 0, note: risky.length ? `疑似自研密码原语: ${risky.join(', ')}` : '未检测到自研哈希/对称密码主循环（用标准库）' };
}

function walk(dir, cb) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, cb);
    else cb(p);
  }
}

// ════════════════════════════
// 汇总
// ════════════════════════════
const gitCommits = checkGitCommits();
const results = [
  { id: 'license', title: '许可证', ...checkLicense() },
  { id: 'security-policy', title: '安全策略', ...checkSecurityPolicy() },
  { id: 'code-of-conduct', title: '行为准则', pass: has('CODE_OF_CONDUCT.md'), note: has('CODE_OF_CONDUCT.md') ? '存在' : '缺少' },
  { id: 'contributing', title: '贡献指南', pass: has('CONTRIBUTING.md'), note: has('CONTRIBUTING.md') ? '存在' : '缺少' },
  { id: 'ci', title: 'CI 流水线', ...checkCI() },
  { id: 'vuln-disclosure', title: '漏洞披露', pass: has('VULNERABILITY-DISCLOSURE.md') || has('SECURITY.md'), note: has('VULNERABILITY-DISCLOSURE.md') ? 'VULNERABILITY-DISCLOSURE.md 存在' : (has('SECURITY.md') ? '依赖 SECURITY.md' : '缺少') },
  { id: 'dependency-lock', title: '依赖清单', ...checkDependencyLock() },
  { id: 'git-history', title: '版本历史', pass: gitCommits >= 10, note: `${gitCommits} 个提交` },
  { id: 'crypto-hygiene', title: '加密实现卫生', ...checkSelfRolledCrypto() },
  { id: 'tests', title: '测试覆盖', pass: has('test') || has('tests'), note: has('test') ? 'test/ 目录存在' : (has('tests') ? 'tests/ 目录存在' : '缺少 test 目录') },
];

const filtered = criteriaFilter ? results.filter(r => r.id === criteriaFilter) : results;
const passed = filtered.filter(r => r.pass).length;

if (jsonOut) {
  console.log(JSON.stringify({ root: rootAbs, passed, total: filtered.length, criteria: filtered.map(r => ({ id: r.id, title: r.title, pass: r.pass, note: r.note })) }, null, 2));
} else {
  console.log(`# OpenSSF 自查报告\n\n仓库: ${rootAbs}\n通过: ${passed}/${filtered.length}\n`);
  for (const r of filtered) {
    console.log(`- [${r.pass ? '✅' : '❌'}] **${r.title}** — ${r.note}`);
  }
  const fails = filtered.filter(r => !r.pass).map(r => r.title);
  if (fails.length) console.log(`\n待补缺口: ${fails.join('、')}`);
}

process.exit(filtered.every(r => r.pass) ? 0 : 1);
