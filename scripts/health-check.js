#!/usr/bin/env node
// scripts/health-check.js — FIBEMATE 全栈健康检查
// Usage: node scripts/health-check.js [--bom] [--git]
const https = require('https');

const BASE = 'https://fibemate.net';
const EXPECTED_BRANCH = 'main';

// ─── Paths ───
const PATHS = [
  { path: '/', desc: '首页' },
  { path: '/docs/architecture.html', desc: '系统架构' },
  { path: '/docs/pqc-readiness.html', desc: 'PQC 就绪' },
  { path: '/docs/API.html', desc: 'API 文档' },
  { path: '/docs/sm2-tvla-analysis.html', desc: 'SM2 TVLA' },
  { path: '/docs/fpga-report.html', desc: 'FPGA 报告' },
  { path: '/security.html', desc: '安全体系统一页' },
  { path: '/docs/TECHNICAL-VERIFICATION.md', desc: '证据地图' },
  { path: '/blog.html', desc: '博客' },
  { path: '/login.html', desc: '登录' },
];

const CONTENT_CHECKS = [
  { path: '/', mustContain: ['FIBEMATE', 'ML-KEM-768'] },
  { path: '/docs/architecture.html', mustContain: ['系统架构', 'Path A'] },
  { path: '/docs/pqc-readiness.html', mustContain: ['抗量子', 'TSR', 'ML-KEM'] },
  { path: '/docs/sm2-tvla-analysis.html', mustContain: ['侧信道', 'SM2'] },
  { path: '/security.html', mustContain: ['SM2', '性能'] },
  { path: '/docs/fpga-report.html', mustContain: ['FPGA', 'NTT'] },
];

// Links that must NOT redirect
const NO_REDIRECT = ['/security.html', '/docs/architecture.html'];

const PASS = []; const FAIL = []; const WARN = [];

function rpt(level, msg) {
  const prefix = { pass: '  ✅', warn: '  ⚠️ ', fail: '  ❌' }[level];
  console.log(`${prefix} ${msg}`);
  ({ pass: PASS, warn: WARN, fail: FAIL }[level]).push(msg);
}

function req(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const fn = u.protocol === 'https:' ? https : require('http');
    const r = fn.get(url, { timeout: 10000 }, (res) => {
      let body = ''; res.on('data', (c) => { body += c; if (body.length > 500000) res.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, redirect: null, body }));
    });
    r.on('error', (e) => resolve({ status: 0, error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'Timeout' }); });
  });
}

async function main() {
  console.log(`🔍 FIBEMATE Health Check — ${new Date().toISOString()}\n`);

  // 1. Link health
  console.log('━━━ 1️⃣ 链接可用性 ━━━');
  for (const { path, desc } of PATHS) {
    const r = await req(new URL(path, BASE).href);
    if (r.status === 200) rpt('pass', `${desc.padEnd(12)} ${path} → 200`);
    else if (r.status >= 300 && r.status < 400) {
      const dest = new URL(path, BASE).href;
      const r2 = await req(dest);
      rpt(r2.status === 200 ? 'warn' : 'fail', `${desc.padEnd(12)} ${path} → ${r.status} → ${r2.status}`);
    } else rpt('fail', `${desc.padEnd(12)} ${path} → ${r.error || r.status}`);
  }

  // 2. Content integrity (Chinese rendering)
  console.log('\n━━━ 2️⃣ 内容完整性 ━━━');
  for (const c of CONTENT_CHECKS) {
    const r = await req(new URL(c.path, BASE).href);
    if (!r.body) { rpt('fail', `${c.path} 无法获取内容`); continue; }
    const missing = c.mustContain.filter(kw => !r.body.includes(kw));
    // Garbled text markers (UTF-8 replacement character + common mojibake)
    const hasGarbage = /锟斤拷|�{2,}|\\u[0-9a-f]{4}/.test(r.body);
    if (missing.length === 0 && !hasGarbage)
      rpt('pass', `${c.path} 内容完整 无乱码`);
    else {
      if (missing.length) rpt('warn', `${c.path} 缺失关键词: ${missing.join(', ')}`);
      if (hasGarbage) rpt('fail', `${c.path} 检测到乱码!`);
    }
  }

  // 3. Redirect traps
  console.log('\n━━━ 3️⃣ 重定向陷阱 ━━━');
  for (const p of NO_REDIRECT) {
    const r = await req(new URL(p, BASE).href);
    if (r.status === 200) rpt('pass', `${p} → 200 (无重定向)`);
    else if (r.status >= 300 && r.status < 400)
      rpt('fail', `${p} → ${r.status} (应直连但被重定向!)`);
    else rpt('fail', `${p} → ${r.status || r.error}`);
  }

  // 4. SSL cert
  console.log('\n━━━ 4️⃣ SSL 证书 ━━━');
  try {
    const r = await req('https://fibemate.net/');
    if (r.status === 200) rpt('pass', 'HTTPS 正常');
    else rpt('fail', `HTTPS ${r.status}`);
  } catch { rpt('fail', 'HTTPS 不可达'); }

  // Summary
  console.log(`\n${'═'.repeat(48)}`);
  console.log(`📊 ${PASS.length} pass | ${WARN.length} warn | ${FAIL.length} fail`);
  if (FAIL.length) { console.log('\n❌ FAIL:'); FAIL.forEach(f => console.log(`  ❌ ${f}`)); }
  if (WARN.length) { console.log('\n⚠️  WARN:'); WARN.forEach(w => console.log(`  ⚠️  ${w}`)); }

  if (FAIL.length > 0) { console.log('\n状态: UNHEALTHY ❌'); process.exit(1); }
  console.log('\n状态: HEALTHY ✅');
  process.exit(0);
}

main();
