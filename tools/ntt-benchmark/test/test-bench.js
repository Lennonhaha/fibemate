// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// ntt-benchmark 单元测试
const assert = require('assert');
const { bench, nttNaive, randomVec, generateReport, runBenchmark } = require('../lib/bench');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' → ' + e.message); }
}

console.log('bench:');
t('nttNaive 返回正确维度', () => {
  const vec = randomVec(256, 8380417n);
  const out = nttNaive(vec, 8380417n);
  assert.strictEqual(out.length, 256);
});
t('bench 返回完整统计', () => {
  const r = bench(nttNaive, 32, 10, 8380417n);
  assert.ok(r.avg >= 0);
  assert.ok(r.min <= r.max);
  assert.ok(r.p50 >= r.min && r.p50 <= r.max);
  assert.ok(r.throughput > 0);
});

console.log('generateReport:');
t('报告结构完整 + 加速比', () => {
  const platforms = [
    { name: 'A', status: 'ok', result: { avg: 100, p95: 120, throughput: 10000 } },
    { name: 'B', status: 'ok', result: { avg: 50, p95: 60, throughput: 20000 } },
    { name: 'C', status: 'error', error: 'no impl' },
  ];
  const report = generateReport(platforms, { size: 256, rounds: 100, modulus: 8380417 }, { date: 'x', machine: 'm', cpu: 'c', arch: 'a', nodeVersion: 'v' });
  assert.strictEqual(report.comparison.baseline, 'A');
  assert.strictEqual(report.comparison.speedups['A'], 1);
  assert.strictEqual(report.comparison.speedups['B'], 2);
  assert.strictEqual(report.results.length, 3);
});

console.log('runBenchmark:');
t('端到端 run 不抛异常', () => {
  const report = runBenchmark({ size: 16, rounds: 5, modulus: 8380417 });
  assert.strictEqual(report.params.size, 16);
  assert.ok(report.results.length >= 1);
  assert.strictEqual(report.results[0].name, 'JS (naive)');
  assert.strictEqual(report.results[0].status, 'ok');
});

console.log('');
console.log(`结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
