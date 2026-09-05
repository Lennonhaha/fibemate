// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// tsr-verify 单元测试（纯逻辑，不依赖 openssl）
const assert = require('assert');
const { checkSequenceGaps } = require('../lib/check');
const { extractImprint, extractStatus, detectAuthority } = require('../lib/verify');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' → ' + e.message); }
}

console.log('check.checkSequenceGaps:');
t('连续无 gap', () => {
  const results = [{ file: 'lg-001' }, { file: 'lg-002' }, { file: 'lg-003' }];
  const r = checkSequenceGaps(results);
  assert.deepStrictEqual(r.gaps, []);
  assert.strictEqual(r.min, 1);
  assert.strictEqual(r.max, 3);
});
t('中间缺号', () => {
  const results = [{ file: 'lg-001' }, { file: 'lg-003' }];
  const r = checkSequenceGaps(results);
  assert.deepStrictEqual(r.gaps, [2]);
});
t('文件名带日期不误判为序号', () => {
  const results = [{ file: 'lg-101-phase0-20260805' }, { file: 'lg-102' }];
  const r = checkSequenceGaps(results);
  // 101 → 102 连续，20260805 不应被当作序号
  assert.deepStrictEqual(r.gaps, []);
  assert.strictEqual(r.max, 102);
});
t('大 gap 防爆（不展开 2000 万）', () => {
  const results = [{ file: 'lg-001' }, { file: 'lg-99999' }];
  const r = checkSequenceGaps(results);
  assert.strictEqual(r.gaps.length, 1);  // 只记一个区间标记，不展开
  assert.ok(r.gaps[0] < 0);  // 负数 = 区间断裂标记
});
t('无数字文件被忽略', () => {
  const results = [{ file: 'sm2-frontend-verification' }, { file: 'lg-001' }];
  const r = checkSequenceGaps(results);
  assert.strictEqual(r.min, 1);
});

console.log('verify.extractImprint:');
const sampleReply = `Status: Granted
TST Info:
  Message data:
    0000 - a4 78 e7 dc 78 84 f1 1d-2d 09 10 c9 3e b8 67 56   .x..x...-...>.gV
    0010 - 36 aa 49 1b 22 10 e7 f6-6a 79 69 74 17 9e b0 96   6.I."...jyit....
Serial number: 0x06480C51
`;
t('提取 imprint 十六进制', () => {
  const imp = extractImprint(sampleReply);
  assert.strictEqual(imp, 'a478e7dc7884f11d2d0910c93eb8675636aa491b2210e7f66a796974179eb096');
});
t('提取 Status', () => {
  assert.strictEqual(extractStatus(sampleReply), 'Granted');
});

console.log('verify.detectAuthority:');
t('0xd 开头 → DigiCert', () => {
  assert.strictEqual(detectAuthority('0xD1234567'), 'DigiCert');
});
t('0x0 开头 → FreeTSA', () => {
  assert.strictEqual(detectAuthority('0x06480C51'), 'FreeTSA');
});

console.log('');
console.log(`结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
