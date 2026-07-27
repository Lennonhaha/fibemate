#!/usr/bin/env node
/**
 * FIBEMATE 性能门禁 — 最小补丁
 * 用法: node scripts/perf-gate.js [--baseline baseline.json]
 * 退出码: 0 = PASS, 1 = FAIL
 */

const fs = require('fs');
const path = require('path');

// 性能基线（单位: ms/op）
const DEFAULT_BASELINE = {
  'ML-KEM-768.keygen': { p95: 1.5, mean: 1.0 },
  'ML-KEM-768.encaps': { p95: 2.0, mean: 1.3 },
  'ML-KEM-768.decaps': { p95: 2.0, mean: 1.3 },
  'SM2.sign': { p95: 15.0, mean: 10.0 },
  'SM2.verify': { p95: 20.0, mean: 15.0 },
  'SM4-GCM.encrypt': { p95: 2.0, mean: 1.5 },
  'hybrid-kex.full': { p95: 25.0, mean: 18.0 },
};

// 退化阈值
const REGRESSION_THRESHOLD = 1.20; // 20% 退化即报警
const HARD_FAIL_THRESHOLD = 1.50;  // 50% 退化即失败

function loadBaseline() {
  const baselinePath = process.argv.find((a, i) => i > 1 && process.argv[i - 1] === '--baseline');
  if (baselinePath && fs.existsSync(baselinePath)) {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  }
  return DEFAULT_BASELINE;
}

function runBenchmark(name, fn, iterations = 100) {
  // 预热
  for (let i = 0; i < 10; i++) fn();
  
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6); // ms
  }
  
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  
  return { name, mean, p95, p99, min: times[0], max: times[times.length - 1] };
}

function checkRegression(result, baseline) {
  if (!baseline) return { status: 'SKIP', reason: 'no baseline' };
  
  const p95Ratio = result.p95 / baseline.p95;
  const meanRatio = result.mean / baseline.mean;
  const maxRatio = Math.max(p95Ratio, meanRatio);
  
  if (maxRatio >= HARD_FAIL_THRESHOLD) {
    return { status: 'FAIL', reason: `${maxRatio.toFixed(2)}x退化(阈值${HARD_FAIL_THRESHOLD}x)`, p95Ratio, meanRatio };
  }
  if (maxRatio >= REGRESSION_THRESHOLD) {
    return { status: 'WARN', reason: `${maxRatio.toFixed(2)}x退化(阈值${REGRESSION_THRESHOLD}x)`, p95Ratio, meanRatio };
  }
  return { status: 'PASS', reason: `${maxRatio.toFixed(2)}x`, p95Ratio, meanRatio };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  FIBEMATE 性能门禁 v1.0');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const baseline = loadBaseline();
  const results = [];
  let failCount = 0;
  let warnCount = 0;
  
  // 动态加载待测模块（如果存在）
  const modules = {};
  try { modules.mlkem = require('../packages/pqc-kem/src/ml-kem-768.js'); } catch (e) {}
  try { modules.sm2 = require('../src/crypto/sm2-bigint-ec.js'); } catch (e) {}
  try { modules.sm4 = require('../src/crypto/sm4-alpha-gcm.js'); } catch (e) {}
  
  // ML-KEM-768 测试
  if (modules.mlkem) {
    const { generateKeypair, encapsulate, decapsulate } = modules.mlkem;
    if (generateKeypair) {
      const r = runBenchmark('ML-KEM-768.keygen', () => generateKeypair(), 50);
      const check = checkRegression(r, baseline['ML-KEM-768.keygen']);
      results.push({ ...r, ...check });
      if (check.status === 'FAIL') failCount++;
      if (check.status === 'WARN') warnCount++;
    }
    if (generateKeypair && encapsulate) {
      const kp = generateKeypair();
      const r = runBenchmark('ML-KEM-768.encaps', () => encapsulate(kp.publicKey), 50);
      const check = checkRegression(r, baseline['ML-KEM-768.encaps']);
      results.push({ ...r, ...check });
      if (check.status === 'FAIL') failCount++;
      if (check.status === 'WARN') warnCount++;
    }
  }
  
  // 输出报告
  console.log('\n┌─────────────────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ 操作                │ 均值(ms) │ p95(ms)  │ 基线     │ 状态     │');
  console.log('├─────────────────────┼──────────┼──────────┼──────────┼──────────┤');
  
  for (const r of results) {
    const baselineStr = baseline[r.name] ? `${baseline[r.name].mean}/${baseline[r.name].p95}` : 'N/A';
    const statusIcon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`│ ${r.name.padEnd(19)} │ ${r.mean.toFixed(3).padStart(8)} │ ${r.p95.toFixed(3).padStart(8)} │ ${baselineStr.padStart(8)} │ ${statusIcon} ${r.status.padEnd(5)} │`);
    if (r.reason && r.status !== 'PASS') {
      console.log(`│ ${''.padEnd(19)} │ 退化: ${r.reason.padEnd(32)} │`);
    }
  }
  
  console.log('└─────────────────────┴──────────┴──────────┴──────────┴──────────┘');
  
  // 汇总
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`  结果: ${results.length} 项测试, ${failCount} 失败, ${warnCount} 警告`);
  console.log(`  阈值: WARN=${(REGRESSION_THRESHOLD*100).toFixed(0)}%, FAIL=${(HARD_FAIL_THRESHOLD*100).toFixed(0)}%`);
  console.log('───────────────────────────────────────────────────────────────');
  
  if (failCount > 0) {
    console.log('\n❌ 性能门禁未通过 — 存在严重退化');
    process.exit(1);
  }
  if (warnCount > 0) {
    console.log('\n⚠️  性能门禁警告 — 存在轻度退化（非阻塞）');
    process.exit(0);
  }
  console.log('\n✅ 性能门禁通过');
  process.exit(0);
}

main().catch(e => {
  console.error('性能门禁执行失败:', e.message);
  process.exit(1);
});
