#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * test/smoke-backend.js — 后端启动冒烟测试
 *
 * 目的：捕获「语法正确、测试全绿、但模块加载即崩」类回归。
 *
 * 背景（2026-09-18 事故）：
 *   PR #95 给 /api/auth/verify 路由加了 rateLimitMiddleware，但其 const 声明在 38 行之后
 *   → 模块加载时命中 TDZ，抛 ReferenceError，进程无法启动。
 *   而 npm test 全部 suite 都不 require src/index.js，node --check 只验语法不验 TDZ，
 *   lint 只扫 packages/pqc-kem/src/ 与 test/，均未捕获 → 生产 restart 后 errored。
 *
 * 本测试真的加载 src/index.js，捕获 ReferenceError / TypeError 等加载期异常。
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

// 用高位端口 + 1.5s 后主动退出，避免占用生产端口、避免常驻。
const script = `
  process.env.PORT = process.env.SMOKE_PORT || '34567';
  try {
    require('./src/index.js');
  } catch (e) {
    console.error('LOAD_FAILED:', e.constructor.name, '|', e.message);
    process.exit(42);
  }
  // 加载成功 —— 证明 TDZ / 顶层初始化异常不存在。
  setTimeout(() => { console.log('LOAD_OK'); process.exit(0); }, 1200);
`;

const r = spawnSync(process.execPath, ['-e', script], {
  cwd: root,
  encoding: 'utf8',
  timeout: 25000,
  env: { ...process.env, SMOKE_PORT: '34567' },
});

const out = (r.stdout || '') + (r.stderr || '');
const failed = r.status !== 0 || !/LOAD_OK/.test(out);

if (failed) {
  console.error('❌ backend smoke: FAIL (exit', r.status, ')');
  console.error('--- output ---');
  console.error(out.slice(0, 2000));
  process.exit(1);
}

console.log('✅ backend smoke: PASS (src/index.js loads without TDZ/init errors)');
process.exit(0);
