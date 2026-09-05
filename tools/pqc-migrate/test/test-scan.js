// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// pqc-migrate 单元测试（零依赖，用 assert）
const assert = require('assert');
const { matchCryptoDep, RULES } = require('../lib/matchers');
const { calcScore, parseNpm, detectManifest } = require('../lib/scan');
const { renderTable } = require('../lib/reporter');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' → ' + e.message); }
}

console.log('matchers.matchCryptoDep:');
t('精确匹配 jsonwebtoken → RSA-2048 HIGH', () => {
  const r = matchCryptoDep('jsonwebtoken');
  assert.strictEqual(r.algorithm, 'RSA-2048');
  assert.strictEqual(r.severity, 'HIGH');
  assert.strictEqual(r.quantumBits, 0);
  assert.strictEqual(r.migration, 'ML-KEM-768 / ML-DSA-44');
});
t('精确匹配 @noble/post-quantum → ML-KEM OK', () => {
  const r = matchCryptoDep('@noble/post-quantum');
  assert.strictEqual(r.algorithm, 'ML-KEM-768');
  assert.strictEqual(r.severity, 'OK');
});
t('大小写不敏感匹配 sm-crypto', () => {
  const r = matchCryptoDep('sm-crypto');
  assert.strictEqual(r.algorithm, 'SM2');
});
t('模糊匹配 crypto-xyz → manual review LOW', () => {
  const r = matchCryptoDep('crypto-xyz');
  assert.strictEqual(r.severity, 'LOW');
  assert.strictEqual(r.note, '包名含密码学关键词，需人工确认');
});
t('无匹配 lodash → null', () => {
  assert.strictEqual(matchCryptoDep('lodash'), null);
});

console.log('scan.calcScore:');
t('无发现 → 100 分', () => {
  assert.strictEqual(calcScore([], 100), 100);
});
t('1 HIGH / 10 deps → 97 分', () => {
  const findings = [{ severity: 'HIGH' }];
  assert.strictEqual(calcScore(findings, 10), 97);
});
t('3 HIGH / 10 deps → 91 分', () => {
  const findings = [{ severity: 'HIGH' }, { severity: 'HIGH' }, { severity: 'HIGH' }];
  assert.strictEqual(calcScore(findings, 10), 91);
});
t('分数下限 0', () => {
  const findings = Array.from({ length: 50 }, () => ({ severity: 'HIGH' }));
  assert.strictEqual(calcScore(findings, 10), 0);
});

console.log('scan.parseNpm (从 lock 文件):');
t('正确解析 package-lock.json 依赖树', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pqc-test-'));
  const lock = {
    name: 'test-app', version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': { name: 'test-app', version: '1.0.0' },
      'node_modules/jsonwebtoken': { version: '9.0.2' },
      'node_modules/lodash': { version: '4.17.21' },
      'node_modules/eslint': { version: '9.0.0', dev: true },
    }
  };
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'test-app' }));
  fs.writeFileSync(path.join(tmp, 'package-lock.json'), JSON.stringify(lock));
  const deps = parseNpm(tmp, { type: 'npm', lock: 'package-lock.json' });
  assert.strictEqual(deps.length, 3);
  const jwt = deps.find(d => d.name === 'jsonwebtoken');
  assert.strictEqual(jwt.type, 'prod');
  const eslint = deps.find(d => d.name === 'eslint');
  assert.strictEqual(eslint.type, 'dev');
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log('reporter.renderTable:');
t('表格含评分行', () => {
  const report = { path: '/x', totalDeps: 3, findings: [], score: 100, timestamp: 'now' };
  const out = renderTable(report, false);
  assert.ok(out.includes('100/100'));
  assert.ok(out.includes('OK'));
});

console.log('');
console.log(`结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
