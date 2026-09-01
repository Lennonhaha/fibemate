#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
//
// FIBEMATE Unified PQC Performance Benchmark
// =========================================
// Measures latency (p50 / p95) and throughput for core post-quantum ops:
//   - ML-KEM-768 (FIPS 203): keygen / encaps / decaps
//   - ML-DSA-65  (FIPS 204): keygen / sign  / verify
//
// Usage:
//   node scripts/bench-pqc.js                 # defaults (CI-friendly rounds)
//   node scripts/bench-pqc.js --full          # extended rounds for manual profiling
//   node scripts/bench-pqc.js --json          # machine-readable JSON only
//   PQC_BENCH_ROUNDS=2000 node scripts/bench-pqc.js   # override round count
//
// Exit code 0 on success; 1 on any algorithm failure (a regression in CI).

'use strict';

const { performance } = require('perf_hooks');

// ── Configuration ──────────────────────────────────────────────
const FULL = process.argv.includes('--full');
const JSON_ONLY = process.argv.includes('--json');
const ROUNDS = FULL
  ? { kem: 2000, dsa: 500 }
  : { kem: 100, dsa: 40 };
// CI can override via env (integer, must be ≥ 10)
const envRounds = parseInt(process.env.PQC_BENCH_ROUNDS, 10);
if (Number.isFinite(envRounds) && envRounds >= 10) {
  ROUNDS.kem = envRounds;
  ROUNDS.dsa = Math.max(20, Math.floor(envRounds / 5));
}
const WARMUP = 10;

// ── Percentile helper ─────────────────────────────────────────
function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Benchmark runner ──────────────────────────────────────────
// fn receives no args; returns arbitrary. We time N invocations,
// collect per-iteration latency, and report p50/p95/mean/throughput.
function bench(fn, rounds, warmup = WARMUP) {
  for (let i = 0; i < warmup; i++) fn();
  const samples = new Array(rounds);
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    fn();
    samples[i] = performance.now() - t0;
  }
  samples.sort((a, b) => a - b);
  const totalMs = samples.reduce((s, v) => s + v, 0);
  const meanMs = totalMs / rounds;
  return {
    rounds,
    totalMs,
    p50Ms: percentile(samples, 0.50),
    p95Ms: percentile(samples, 0.95),
    meanMs,
    opsPerSec: 1000 / meanMs,   // throughput at mean latency
  };
}

function fmtMs(v) {
  if (!Number.isFinite(v)) return 'n/a';
  return v >= 1 ? v.toFixed(2) + ' ms' : (v * 1000).toFixed(1) + ' \u00b5s';
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const results = {};
  const started = Date.now();

  // ── ML-KEM-768 ──────────────────────────────────────────────
  const kem = (() => {
    try {
      return require('../packages/pqc-kem');
    } catch (e) {
      return null;
    }
  })();

  if (kem && typeof kem.generateKeypair === 'function') {
    const kemRes = { backend: kem.usingNative ? 'native' : 'pure-js' };

    const kp = kem.generateKeypair();
    const ct = kem.encapsulate(kp.publicKey);
    // correctness guard: decaps must reproduce the shared secret
    const ss = kem.decapsulate(kp.secretKey, ct.ciphertext);
    const ok = Buffer.from(ss).equals(Buffer.from(ct.sharedSecret));
    if (!ok) {
      console.error('FAIL: ML-KEM-768 decapsulate did not reproduce shared secret');
      process.exit(1);
    }

    kemRes.keygen = bench(() => kem.generateKeypair(), ROUNDS.kem);
    kemRes.encaps = bench(() => kem.encapsulate(kp.publicKey), ROUNDS.kem);
    kemRes.decaps = bench(() => kem.decapsulate(kp.secretKey, ct.ciphertext), ROUNDS.kem);
    results['ML-KEM-768'] = kemRes;
  } else {
    results['ML-KEM-768'] = { backend: 'unavailable' };
  }

  // ── ML-DSA-65 ───────────────────────────────────────────────
  let dsa = null;
  try {
    const mod = await import('../packages/fml-dsa/src/index.js');
    dsa = mod.ml_dsa65;
  } catch (e) {
    dsa = null;
  }

  if (dsa && typeof dsa.keygen === 'function') {
    // deterministic seed for stable measurements
    const seed = new Uint8Array(32).fill(7);
    const { publicKey: pk, secretKey: sk } = dsa.keygen(seed);
    const msg = new Uint8Array(64).fill(0xAB);
    const sig = dsa.sign(msg, sk);
    // correctness guard: signature must verify
    const ok = dsa.verify(sig, msg, pk);
    if (!ok) {
      console.error('FAIL: ML-DSA-65 signature did not verify');
      process.exit(1);
    }

    results['ML-DSA-65'] = {
      keygen: bench(() => dsa.keygen(seed), ROUNDS.dsa),
      sign:   bench(() => dsa.sign(msg, sk), ROUNDS.dsa),
      verify: bench(() => dsa.verify(sig, msg, pk), ROUNDS.dsa),
    };
  } else {
    results['ML-DSA-65'] = { backend: 'unavailable' };
  }

  const elapsedSec = (Date.now() - started) / 1000;

  // ── Output ──────────────────────────────────────────────────
  if (JSON_ONLY) {
    console.log(JSON.stringify({ elapsedSec, results }, null, 2));
    return;
  }

  console.log('FIBEMATE PQC Benchmark');
  console.log('======================');
  for (const [algo, data] of Object.entries(results)) {
    console.log(`\n${algo}${data.backend ? ' (' + data.backend + ')' : ''}`);
    for (const [op, r] of Object.entries(data)) {
      if (op === 'backend') continue;
      if (!r || typeof r !== 'object') { console.log(`  ${op}: unavailable`); continue; }
      console.log(
        `  ${op.padEnd(8)} p50=${fmtMs(r.p50Ms).padEnd(10)} ` +
        `p95=${fmtMs(r.p95Ms).padEnd(10)} mean=${fmtMs(r.meanMs).padEnd(10)} ` +
        `${r.opsPerSec.toFixed(1)} ops/s`
      );
    }
  }
  console.log(`\nTotal wall time: ${elapsedSec.toFixed(1)}s`);
}

main().catch((e) => {
  console.error('Benchmark crashed:', e);
  process.exit(1);
});
