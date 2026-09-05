// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// pqc-deploy 单元测试（纯逻辑，不发起真实网络探测）
const assert = require('assert');
const { parseManifest, addMigrationAdvice, MIGRATION_RULES } = require('../lib/deploy');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' → ' + e.message); }
}

console.log('parseManifest:');
t('解析清单（含注释和 URL）', () => {
  const text = `# 我的端点清单
fibemate.net:443
https://example.com:8443
bare.host
`;
  const eps = parseManifest(text);
  assert.deepStrictEqual(eps, ['fibemate.net:443', 'example.com:8443', 'bare.host']);
});
t('空行和纯注释被过滤', () => {
  assert.deepStrictEqual(parseManifest('# 只有注释\n\n'), []);
});

console.log('addMigrationAdvice:');
t('TLS1.2 端点 → 建议升级', () => {
  const results = [{ tlsVersion: 'TLSv1.2', keyExchange: { name: 'X25519' }, cert: { publicKey: { type: 'RSA', bits: 2048 } } }];
  addMigrationAdvice(results);
  assert.ok(results[0].migration.includes('升级到 TLS 1.3（PQC 混合 KEM 的前置条件）'));
});
t('弱 RSA → 建议换证书', () => {
  const results = [{ tlsVersion: 'TLSv1.3', keyExchange: { name: 'X25519MLKEM768' }, cert: { publicKey: { type: 'RSA', bits: 1024 } } }];
  addMigrationAdvice(results);
  assert.ok(results[0].migration.some(m => m.includes('≥2048')));
});
t('全 PQC 端点 → 无建议', () => {
  const results = [{ tlsVersion: 'TLSv1.3', keyExchange: { name: 'X25519MLKEM768' }, cert: { publicKey: { type: 'ML-DSA', bits: 1312 } } }];
  addMigrationAdvice(results);
  assert.deepStrictEqual(results[0].migration, []);
});

console.log('MIGRATION_RULES:');
t('规则表非空', () => {
  assert.ok(MIGRATION_RULES.length >= 3);
});

console.log('');
console.log(`结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
