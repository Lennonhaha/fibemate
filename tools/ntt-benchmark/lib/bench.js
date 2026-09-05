// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// NTT 基准核心 — 平台探测 + 计时 + 报告生成
// 设计文档: docs/product-designs/10-ntt-benchmark.md §8
const os = require('os');

// 内嵌 naive NTT（用于 JS 基线，无需依赖外部实现）
function nttNaive(a, q) {
  const n = a.length;
  // 朴素 DFT 风格 NTT：O(n²)，用于性能基线
  const out = new Array(n).fill(0n);
  for (let k = 0; k < n; k++) {
    let acc = 0n;
    for (let j = 0; j < n; j++) {
      // ω^(jk)，这里用简单单位根近似（性能基线用途，非密码学正确性）
      acc = (acc + a[j] * BigInt(((j * k) % n) + 1)) % q;
    }
    out[k] = acc;
  }
  return out;
}

function randomVec(size, q) {
  const vec = new Array(size);
  for (let i = 0; i < size; i++) vec[i] = BigInt(Math.floor(Math.random() * 1000));
  return vec;
}

function bench(fn, size, rounds, q) {
  // 预热
  fn(randomVec(size, q), q);
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const vec = randomVec(size, q);
    const start = process.hrtime.bigint();
    fn(vec, q);
    const elapsed = Number(process.hrtime.bigint() - start);
    times.push(elapsed);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    min: times[0] / 1000,
    avg: sum / times.length / 1000,
    p50: times[Math.floor(times.length * 0.5)] / 1000,
    p95: times[Math.floor(times.length * 0.95)] / 1000,
    p99: times[Math.floor(times.length * 0.99)] / 1000,
    max: times[times.length - 1] / 1000,
    throughput: Math.round(rounds / (sum / 1e9)),
  };
}

function runBenchmark({ size, rounds, modulus }) {
  const q = BigInt(modulus);
  const platforms = [];

  // JS naive 基线
  platforms.push({
    name: 'JS (naive)',
    result: bench(nttNaive, size, rounds, q),
    status: 'ok',
  });

  // 检测是否有本地 NTT 实现（可扩展）
  const meta = {
    date: new Date().toISOString(),
    machine: os.hostname(),
    cpu: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
    arch: os.arch(),
    nodeVersion: process.version,
  };

  return generateReport(platforms, { size, rounds, modulus }, meta);
}

function generateReport(platforms, params, meta) {
  // 以最慢平台为基线计算加速比
  const okPlatforms = platforms.filter(p => p.status === 'ok' && p.result);
  const baseline = okPlatforms.length ? okPlatforms.reduce((a, b) => (a.result.avg > b.result.avg ? a : b)) : null;
  const speedups = {};
  if (baseline) {
    for (const p of okPlatforms) {
      speedups[p.name] = Math.round((baseline.result.avg / p.result.avg) * 100) / 100;
    }
  }

  return {
    meta,
    params: { ...params, modulus: String(params.modulus) },
    results: platforms.map(p => ({ name: p.name, status: p.status, ...(p.result || {}), error: p.error })),
    comparison: {
      baseline: baseline ? baseline.name : null,
      speedups,
    },
  };
}

module.exports = { runBenchmark, bench, nttNaive, randomVec, generateReport };
