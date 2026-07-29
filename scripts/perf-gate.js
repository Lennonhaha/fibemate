#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * FIBEMATE Performance Gate
 * Usage: node scripts/perf-gate.js [--baseline baseline.json]
 * Exit: 0 = PASS, 1 = FAIL
 */

const fs = require('fs');
const path = require('path');

// Baselines (ms/op)
const DEFAULT_BASELINE = {
  'ML-KEM-768.keygen': { p95: 40.0, mean: 32.0 },
  'ML-KEM-768.encaps': { p95: 55.0, mean: 42.0 },
  'ML-KEM-768.decaps': { p95: 60.0, mean: 52.0 },
  'SM2.sign': { p95: 15.0, mean: 10.0 },
  'SM2.verify': { p95: 20.0, mean: 15.0 },
  'SM4-GCM.encrypt': { p95: 2.0, mean: 1.5 },
  'hybrid-kex.full': { p95: 200.0, mean: 150.0 },
};

// Thresholds
const REGRESSION_THRESHOLD = 1.20; // 20% degradation = WARN
const HARD_FAIL_THRESHOLD = 1.50;  // 50% degradation = FAIL

function loadBaseline() {
  const baselineArgIdx = process.argv.indexOf('--baseline');
  if (baselineArgIdx >= 0) {
    const baselinePath = process.argv[baselineArgIdx + 1];
    if (baselinePath && fs.existsSync(baselinePath)) {
      return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    }
  }
  return DEFAULT_BASELINE;
}

function runBenchmark(name, fn, iterations) {
  iterations = iterations || 100;
  // warmup
  for (let i = 0; i < 10; i++) fn();

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6);
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
    return { status: 'FAIL', reason: maxRatio.toFixed(2) + 'x (threshold ' + HARD_FAIL_THRESHOLD + 'x)', p95Ratio, meanRatio };
  }
  if (maxRatio >= REGRESSION_THRESHOLD) {
    return { status: 'WARN', reason: maxRatio.toFixed(2) + 'x (threshold ' + REGRESSION_THRESHOLD + 'x)', p95Ratio, meanRatio };
  }
  return { status: 'PASS', reason: maxRatio.toFixed(2) + 'x', p95Ratio, meanRatio };
}

function main() {
  console.log('FIBEMATE Performance Gate v1.0');
  console.log('==============================================');

  const baseline = loadBaseline();
  const results = [];
  let failCount = 0;
  let warnCount = 0;

  // Dynamically load modules
  const modules = {};
  try { modules.mlkem = require('../packages/pqc-kem/src/ml-kem-768.js'); } catch (e) { console.log('  SKIP mlkem: ' + e.message); }
  try { modules.sm2 = require('../src/crypto/sm2-bigint-ec.js'); } catch (e) { /* optional */ }
  try { modules.sm4 = require('../src/crypto/sm4-alpha-gcm.js'); } catch (e) { /* optional */ }

  // ML-KEM-768
  if (modules.mlkem) {
    const { generateKeypair, encapsulate, decapsulate } = modules.mlkem;
    if (generateKeypair) {
      const r = runBenchmark('ML-KEM-768.keygen', () => generateKeypair(), 50);
      const check = checkRegression(r, baseline['ML-KEM-768.keygen']);
      results.push(Object.assign({}, r, check));
      if (check.status === 'FAIL') failCount++;
      if (check.status === 'WARN') warnCount++;
    }
    if (generateKeypair && encapsulate) {
      const kp = generateKeypair();
      const r = runBenchmark('ML-KEM-768.encaps', () => encapsulate(kp.publicKey), 50);
      const check = checkRegression(r, baseline['ML-KEM-768.encaps']);
      results.push(Object.assign({}, r, check));
      if (check.status === 'FAIL') failCount++;
      if (check.status === 'WARN') warnCount++;
    }
    if (generateKeypair && encapsulate && decapsulate) {
      const kp = generateKeypair();
      const enc = encapsulate(kp.publicKey);
      const r = runBenchmark('ML-KEM-768.decaps', () => decapsulate(kp.secretKey, enc.ciphertext), 50);
      const check = checkRegression(r, baseline['ML-KEM-768.decaps']);
      results.push(Object.assign({}, r, check));
      if (check.status === 'FAIL') failCount++;
      if (check.status === 'WARN') warnCount++;
    }
  }

  // Output
  console.log('\n  op              mean(ms)  p95(ms)  baseline  status');
  console.log('  ' + '-'.repeat(58));

  for (const r of results) {
    const baselineStr = baseline[r.name] ? baseline[r.name].mean + '/' + baseline[r.name].p95 : 'N/A';
    const statusIcon = r.status === 'PASS' ? 'OK' : r.status === 'WARN' ? 'WARN' : 'FAIL';
    console.log('  ' +
      r.name.padEnd(16) +
      r.mean.toFixed(3).padStart(10) +
      r.p95.toFixed(3).padStart(9) +
      baselineStr.padStart(10) +
      '  ' + statusIcon
    );
    if (r.reason && r.status !== 'PASS') {
      console.log('    -> ' + r.reason);
    }
  }

  console.log('\n  ' + results.length + ' ops tested, ' + failCount + ' failures, ' + warnCount + ' warnings');
  console.log('  Thresholds: WARN=' + (REGRESSION_THRESHOLD * 100).toFixed(0) + '%, FAIL=' + (HARD_FAIL_THRESHOLD * 100).toFixed(0) + '%');

  if (failCount > 0) {
    console.log('\nPERF GATE: FAILED (severe regression)');
    process.exit(1);
  }
  if (warnCount > 0) {
    console.log('\nPERF GATE: WARNING (mild regression, non-blocking)');
    process.exit(0);
  }
  console.log('\nPERF GATE: PASSED');
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error('Perf gate error:', e.message);
  process.exit(1);
}
