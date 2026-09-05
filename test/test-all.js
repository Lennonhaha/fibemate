#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * test/test-all.js — npm test 聚合入口（本地快速全量）
 *
 * 覆盖:
 *   1. Keccak / SHA-3 SHAKE 向量   (test/test-keccak.js)
 *   2. FIPS 140-3 完整性 + KAT 基线 (test/test-fibemate.js, 含 INTEGRITY-MANIFEST 比对)
 *   3. 密码冒烟                     (test/smoke-crypto.js)
 *   4. ML-KEM roundtrip CI          (scripts/ci-mlkem-kat.cjs)
 *
 * 任一失败 → 非零退出码。
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const suites = [
  ['Keccak/SHA-3', ['node', 'test/test-keccak.js']],
  ['FIPS 140-3 integrity + full harness', ['node', 'test/test-fibemate.js']],
  ['Crypto smoke', ['node', 'test/smoke-crypto.js']],
  ['ML-KEM roundtrip CI', ['node', 'scripts/ci-mlkem-kat.cjs']],
];

let failed = 0;
for (const [name, cmd] of suites) {
  process.stdout.write(`\n━━━ ${name} ━━━\n`);
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit', encoding: 'utf8' });
  const ok = r.status === 0;
  process.stdout.write(ok ? `✅ ${name}: PASS\n` : `❌ ${name}: FAIL (exit ${r.status})\n`);
  if (!ok) failed++;
}

process.stdout.write(`\n${failed === 0 ? '🎉 ALL SUITES PASS' : `💥 ${failed} suite(s) FAILED`}\n`);
process.exit(failed === 0 ? 0 : 1);
