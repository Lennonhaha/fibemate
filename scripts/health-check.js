#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// scripts/health-check.js 鈥?FIBEMATE 鍏ㄦ爤鍋ュ悍妫€鏌?// Usage: node scripts/health-check.js [--bom] [--git]
const https = require('https');

const BASE = 'https://fibemate.net';
const EXPECTED_BRANCH = 'main';

// 鈹€鈹€鈹€ Paths 鈹€鈹€鈹€
const PATHS = [
  { path: '/', desc: '棣栭〉' },
  { path: '/docs/architecture.html', desc: '绯荤粺鏋舵瀯' },
  { path: '/docs/pqc-readiness.html', desc: 'PQC 灏辩华' },
  { path: '/docs/API.html', desc: 'API 鏂囨。' },
  { path: '/docs/sm2-tvla-analysis.html', desc: 'SM2 TVLA' },
  { path: '/docs/fpga-report.html', desc: 'FPGA 鎶ュ憡' },
  { path: '/security.html', desc: '瀹夊叏浣撶郴缁熶竴椤? },
  { path: '/docs/TECHNICAL-VERIFICATION.md', desc: '璇佹嵁鍦板浘' },
  { path: '/blog.html', desc: '鍗氬' },
  { path: '/login.html', desc: '鐧诲綍' },
];

const CONTENT_CHECKS = [
  { path: '/', mustContain: ['FIBEMATE', 'ML-KEM-768'] },
  { path: '/docs/architecture.html', mustContain: ['绯荤粺鏋舵瀯', 'Path A'] },
  { path: '/docs/pqc-readiness.html', mustContain: ['鎶楅噺瀛?, 'TSR', 'ML-KEM'] },
  { path: '/docs/sm2-tvla-analysis.html', mustContain: ['渚т俊閬?, 'SM2'] },
  { path: '/security.html', mustContain: ['SM2', '鎬ц兘'] },
  { path: '/docs/fpga-report.html', mustContain: ['FPGA', 'NTT'] },
];

// Links that must NOT redirect
const NO_REDIRECT = ['/security.html', '/docs/architecture.html'];

const PASS = []; const FAIL = []; const WARN = [];

function rpt(level, msg) {
  const prefix = { pass: '  鉁?, warn: '  鈿狅笍 ', fail: '  鉂? }[level];
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
  console.log(`馃攳 FIBEMATE Health Check 鈥?${new Date().toISOString()}\n`);

  // 1. Link health
  console.log('鈹佲攣鈹?1锔忊儯 閾炬帴鍙敤鎬?鈹佲攣鈹?);
  for (const { path, desc } of PATHS) {
    const r = await req(new URL(path, BASE).href);
    if (r.status === 200) rpt('pass', `${desc.padEnd(12)} ${path} 鈫?200`);
    else if (r.status >= 300 && r.status < 400) {
      const dest = new URL(path, BASE).href;
      const r2 = await req(dest);
      rpt(r2.status === 200 ? 'warn' : 'fail', `${desc.padEnd(12)} ${path} 鈫?${r.status} 鈫?${r2.status}`);
    } else rpt('fail', `${desc.padEnd(12)} ${path} 鈫?${r.error || r.status}`);
  }

  // 2. Content integrity (Chinese rendering)
  console.log('\n鈹佲攣鈹?2锔忊儯 鍐呭瀹屾暣鎬?鈹佲攣鈹?);
  for (const c of CONTENT_CHECKS) {
    const r = await req(new URL(c.path, BASE).href);
    if (!r.body) { rpt('fail', `${c.path} 鏃犳硶鑾峰彇鍐呭`); continue; }
    const missing = c.mustContain.filter(kw => !r.body.includes(kw));
    // Garbled text markers (UTF-8 replacement character + common mojibake)
    const hasGarbage = /閿熸枻鎷穦锟絳2,}|\\u[0-9a-f]{4}/.test(r.body);
    if (missing.length === 0 && !hasGarbage)
      rpt('pass', `${c.path} 鍐呭瀹屾暣 鏃犱贡鐮乣);
    else {
      if (missing.length) rpt('warn', `${c.path} 缂哄け鍏抽敭璇? ${missing.join(', ')}`);
      if (hasGarbage) rpt('fail', `${c.path} 妫€娴嬪埌涔辩爜!`);
    }
  }

  // 3. Redirect traps
  console.log('\n鈹佲攣鈹?3锔忊儯 閲嶅畾鍚戦櫡闃?鈹佲攣鈹?);
  for (const p of NO_REDIRECT) {
    const r = await req(new URL(p, BASE).href);
    if (r.status === 200) rpt('pass', `${p} 鈫?200 (鏃犻噸瀹氬悜)`);
    else if (r.status >= 300 && r.status < 400)
      rpt('fail', `${p} 鈫?${r.status} (搴旂洿杩炰絾琚噸瀹氬悜!)`);
    else rpt('fail', `${p} 鈫?${r.status || r.error}`);
  }

  // 4. SSL cert
  console.log('\n鈹佲攣鈹?4锔忊儯 SSL 璇佷功 鈹佲攣鈹?);
  try {
    const r = await req('https://fibemate.net/');
    if (r.status === 200) rpt('pass', 'HTTPS 姝ｅ父');
    else rpt('fail', `HTTPS ${r.status}`);
  } catch { rpt('fail', 'HTTPS 涓嶅彲杈?); }

  // Summary
  console.log(`\n${'鈺?.repeat(48)}`);
  console.log(`馃搳 ${PASS.length} pass | ${WARN.length} warn | ${FAIL.length} fail`);
  if (FAIL.length) { console.log('\n鉂?FAIL:'); FAIL.forEach(f => console.log(`  鉂?${f}`)); }
  if (WARN.length) { console.log('\n鈿狅笍  WARN:'); WARN.forEach(w => console.log(`  鈿狅笍  ${w}`)); }

  if (FAIL.length > 0) { console.log('\n鐘舵€? UNHEALTHY 鉂?); process.exit(1); }
  console.log('\n鐘舵€? HEALTHY 鉁?);
  process.exit(0);
}

main();
