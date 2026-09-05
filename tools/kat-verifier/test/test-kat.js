// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// kat-verifier 单元测试
const assert = require('assert');
const { parseJsonVectors, parseRspVectors } = require('../lib/parser');
const { KatVerifier } = require('../lib/kat-verifier');
const { bufEq, hexToBuf, bufToHex, toBuf } = require('../lib/util');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' → ' + e.message); }
}

console.log('parser.parseJsonVectors:');
t('解析 JSON 数组，十六进制转 buffer', () => {
  const v = parseJsonVectors([{ tcId: 1, seed: 'deadbeef', pk: '00ff' }]);
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].id, 1);
  assert.ok(v[0].fields.seed instanceof Uint8Array);
  assert.strictEqual(bufToHex(v[0].fields.seed), 'deadbeef');
});
t('非十六进制字符串保持原样', () => {
  const v = parseJsonVectors([{ tcId: 1, note: 'hello' }]);
  assert.strictEqual(v[0].fields.note, 'hello');
});

console.log('parser.parseRspVectors:');
t('解析 .rsp 文本', () => {
  const text = `# comment
count = 0
seed = deadbeef
m = c0ffee
k = 00

count = 1
seed = aabbcc
`;
  const v = parseRspVectors(text);
  assert.strictEqual(v.length, 2);
  assert.strictEqual(bufToHex(v[0].fields.seed), 'deadbeef');
  assert.strictEqual(bufToHex(v[1].fields.seed), 'aabbcc');
});

console.log('util.bufEq:');
t('相等 buffer', () => {
  assert.ok(bufEq(hexToBuf('deadbeef'), hexToBuf('deadbeef')));
});
t('不等 buffer', () => {
  assert.ok(!bufEq(hexToBuf('deadbeef'), hexToBuf('deadbeef00')));
  assert.ok(!bufEq(hexToBuf('deadbeef'), hexToBuf('deadbeea')));
});

console.log('KatVerifier.run:');
t('keygen 一致性验证 PASS', () => {
  const kv = new KatVerifier('ML-DSA-44').setVectors([
    { id: 1, fields: { seed: hexToBuf('00'), pk: hexToBuf('aa') } },
  ]);
  const summary = kv.run(null, {
    keygen: () => hexToBuf('aa'),
  });
  assert.strictEqual(summary.passed, 1);
  assert.strictEqual(summary.failed, 0);
});
t('keygen 一致性验证 FAIL（结果不匹配）', () => {
  const kv = new KatVerifier('ML-DSA-44').setVectors([
    { id: 1, fields: { seed: hexToBuf('00'), pk: hexToBuf('aa') } },
  ]);
  const summary = kv.run(null, {
    keygen: () => hexToBuf('bb'),
  });
  assert.strictEqual(summary.failed, 1);
});
t('stage 异常捕获', () => {
  const kv = new KatVerifier('X').setVectors([{ id: 1, fields: { pk: hexToBuf('aa') } }]);
  const summary = kv.run(null, { keygen: () => { throw new Error('boom'); } });
  assert.strictEqual(summary.failed, 1);
  assert.strictEqual(summary.details[0].stages.keygen.error, 'boom');
});
t('format default 输出', () => {
  const kv = new KatVerifier('Y').setVectors([{ id: 1, fields: { pk: hexToBuf('aa') } }]);
  const s = kv.run(null, { keygen: () => hexToBuf('aa') });
  const out = kv.format(s);
  assert.ok(out.includes('passed'));
  assert.ok(out.includes('1/1'));
});

console.log('');
console.log(`结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
