// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
#!/usr/bin/env node
/**
 * FIBEMATE CI 性能回归检�?�?bench diff
 * 用法: node scripts/bench-diff.js --before baseline.json --after current.json
 * �?   node scripts/bench-diff.js --run --save baseline.json
 */

const fs = require('fs');
const path = require('path');

const REGRESSION_THRESHOLD = 1.20;
const HARD_FAIL_THRESHOLD = 1.50;

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function compare(before, after) {
  const results = [];
  
  for (const [name, afterMetrics] of Object.entries(after)) {
    const beforeMetrics = before[name];
    if (!beforeMetrics) {
      results.push({ name, status: 'NEW', before: null, after: afterMetrics });
      continue;
    }
    
    const p95Ratio = afterMetrics.p95 / beforeMetrics.p95;
    const meanRatio = afterMetrics.mean / beforeMetrics.mean;
    const maxRatio = Math.max(p95Ratio, meanRatio);
    
    let status = 'PASS';
    let reason = `${maxRatio.toFixed(2)}x`;
    
    if (maxRatio >= HARD_FAIL_THRESHOLD) {
      status = 'FAIL';
      reason = `${maxRatio.toFixed(2)}x退�?阈�?{HARD_FAIL_THRESHOLD}x)`;
    } else if (maxRatio >= REGRESSION_THRESHOLD) {
      status = 'WARN';
      reason = `${maxRatio.toFixed(2)}x退�?阈�?{REGRESSION_THRESHOLD}x)`;
    }
    
    results.push({
      name,
      status,
      reason,
      before: beforeMetrics,
      after: afterMetrics,
      p95Ratio,
      meanRatio,
    });
  }
  
  // 检查消失的测试�?  for (const name of Object.keys(before)) {
    if (!after[name]) {
      results.push({ name, status: 'MISSING', before: before[name], after: null });
    }
  }
  
  return results;
}

function printReport(results) {
  console.log('══════════════════════════════════════════════════════════════════════�?);
  console.log('  FIBEMATE 性能回归报告');
  console.log('══════════════════════════════════════════════════════════════════════�?);
  
  console.log('\n┌─────────────────────┬──────────┬──────────┬──────────┬──────────�?);
  console.log('�?操作                �?基线p95  �?当前p95  �?倍率     �?状�?    �?);
  console.log('├─────────────────────┼──────────┼──────────┼──────────┼──────────�?);
  
  let failCount = 0;
  let warnCount = 0;
  
  for (const r of results) {
    if (r.status === 'NEW') {
      console.log(`�?${r.name.padEnd(19)} �?${'N/A'.padStart(8)} �?${r.after.p95.toFixed(3).padStart(8)} �?${'NEW'.padStart(8)} �?�?新增   │`);
      continue;
    }
    if (r.status === 'MISSING') {
      console.log(`�?${r.name.padEnd(19)} �?${r.before.p95.toFixed(3).padStart(8)} �?${'N/A'.padStart(8)} �?${'MISS'.padStart(8)} �?�?消失   │`);
      continue;
    }
    
    const statusIcon = r.status === 'PASS' ? '�? : r.status === 'WARN' ? '⚠️ ' : '�?;
    console.log(`�?${r.name.padEnd(19)} �?${r.before.p95.toFixed(3).padStart(8)} �?${r.after.p95.toFixed(3).padStart(8)} �?${r.p95Ratio.toFixed(2).padStart(8)}x �?${statusIcon} ${r.status.padEnd(5)} │`);
    
    if (r.status === 'FAIL') failCount++;
    if (r.status === 'WARN') warnCount++;
  }
  
  console.log('└─────────────────────┴──────────┴──────────┴──────────┴──────────�?);
  
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log(`  结果: ${results.length} �? ${failCount} 失败, ${warnCount} 警告`);
  console.log(`  阈�? WARN=${(REGRESSION_THRESHOLD*100).toFixed(0)}%, FAIL=${(HARD_FAIL_THRESHOLD*100).toFixed(0)}%`);
  console.log('───────────────────────────────────────────────────────────────────────');
  
  return { failCount, warnCount };
}

async function main() {
  const args = process.argv.slice(2);
  const beforeIdx = args.indexOf('--before');
  const afterIdx = args.indexOf('--after');
  const runIdx = args.indexOf('--run');
  const saveIdx = args.indexOf('--save');
  
  if (runIdx >= 0) {
    // 运行基准测试并保�?    const savePath = saveIdx >= 0 ? args[saveIdx + 1] : 'bench-baseline.json';
    console.log(`运行基准测试并保存到 ${savePath}...`);
    // 这里调用 perf-gate.js 的逻辑或独立的 benchmark
    console.log('TODO: 集成 perf-gate.js 输出');
    return;
  }
  
  if (beforeIdx < 0 || afterIdx < 0) {
    console.log('用法:');
    console.log('  node scripts/bench-diff.js --before baseline.json --after current.json');
    console.log('  node scripts/bench-diff.js --run --save baseline.json');
    process.exit(1);
  }
  
  const before = loadJson(args[beforeIdx + 1]);
  const after = loadJson(args[afterIdx + 1]);
  
  const results = compare(before, after);
  const { failCount } = printReport(results);
  
  if (failCount > 0) {
    console.log('\n�?性能回归检测未通过');
    process.exit(1);
  }
  console.log('\n�?性能回归检测通过');
  process.exit(0);
}

main().catch(e => {
  console.error('bench-diff 执行失败:', e.message);
  process.exit(1);
});
