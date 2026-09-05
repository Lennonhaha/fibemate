#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// NTT 基准 CLI — run/compare/web
// 设计文档: docs/product-designs/10-ntt-benchmark.md §8.1
const { runBenchmark } = require('../lib/bench');

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--size') flags.size = parseInt(argv[++i], 10);
    else if (a === '--rounds') flags.rounds = parseInt(argv[++i], 10);
    else if (a === '--modulus') flags.modulus = argv[++i];
    else if (a === '--json') flags.json = true;
    else flags._.push(a);
  }
  return flags;
}

function showHelp() {
  console.log(`ntt-bench — FIBEMATE 跨平台 NTT 性能基准

用法:
  ntt-bench run      [--size N] [--rounds N] [--modulus Q] [--json]
  ntt-bench compare  [--history DIR]
  ntt-bench web      [--port P]

选项:
  --size 256|512|1024    NTT 维度（默认 256）
  --rounds 1000          测试轮数（默认 1000）
  --modulus 3329|8380417 模数 Q（默认 8380417）
  --json                 JSON 输出
`);
}

function renderTable(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('⚡ NTT 性能基准');
  console.log(`   机器: ${report.meta.machine} (${report.meta.cpu})`);
  console.log(`   参数: N=${report.params.size} rounds=${report.params.rounds} Q=${report.params.modulus}`);
  console.log('');
  console.log('   ' + '平台'.padEnd(20) + 'avg(µs)'.padEnd(12) + 'p95(µs)'.padEnd(12) + 'ops/s'.padEnd(12) + '加速比');
  for (const p of report.results) {
    const speedup = report.comparison.speedups[p.name] ? report.comparison.speedups[p.name] + '×' : '-';
    if (p.status !== 'ok') {
      console.log('   ' + p.name.padEnd(20) + 'SKIPPED');
      continue;
    }
    console.log('   ' + p.name.padEnd(20) + String(p.avg.toFixed(2)).padEnd(12) + String(p.p95.toFixed(2)).padEnd(12) + String(p.throughput).padEnd(12) + speedup);
  }
  console.log('');
  console.log(`   📊 基线: ${report.comparison.baseline || 'N/A'}`);
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const cmd = flags._[0] || 'run';

  if (cmd === 'run' || cmd === undefined) {
    const size = flags.size || 256;
    const rounds = flags.rounds || 1000;
    const modulus = flags.modulus || 8380417;
    const report = runBenchmark({ size, rounds, modulus });
    renderTable(report, flags.json);
  } else if (cmd === 'compare') {
    console.log('compare 模式：加载多平台历史结果（需 --history 目录，8/31 后补全多平台数据）');
    console.log('提示：当前仅内置 JS naive 基线，WASM/C/FPGA 实现待接');
  } else if (cmd === 'web') {
    console.log('web 模式：待实现（复用 design-system 的 Canvas 对比页）');
  } else {
    showHelp();
  }
}

main();
