// SPDX-License-Identifier: GPL-3.0-only
/**
 * fml-dsa vs Noble ML-DSA Benchmark
 *
 * Compares KeyGen/Sign/Verify latency for ML-DSA-44/65/87
 * between fml-dsa (our FIPS 204 implementation) and @noble/post-quantum
 *
 * Usage: node bench-compare.cjs [iterations=100] [messageSize=1024]
 */

const { performance } = require('perf_hooks');

// Load fml-dsa (CJS via dynamic import)
async function loadFmlDsa() {
  const all = await import('../src/core/all.js');
  const idx = await import('../src/index.js');
  const encode = await import('../src/core/encode.js');
  return {
    keygen: all.keygen,
    sign: all.sign,
    verify: all.verify,
    signEncoded: (await import('../src/core/sign.js')).signEncoded,
    encodePK: encode.encodePK,
    ml_dsa44: idx.ml_dsa44,
    ml_dsa65: idx.ml_dsa65,
    ml_dsa87: idx.ml_dsa87,
  };
}

function fmtMs(ns) {
  if (ns < 1000) return `${ns.toFixed(0)} ns`;
  if (ns < 1_000_000) return `${(ns / 1000).toFixed(2)} µs`;
  return `${(ns / 1_000_000).toFixed(2)} ms`;
}

function percentile(sorted, p) {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    mean: sum / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

async function benchFmlDsa(api, paramSet, msg, iterations) {
  const { keygen, signEncoded, verify, encodePK, sign } = api;

  // Pre-generate keys
  const keys = [];
  for (let i = 0; i < iterations; i++) {
    keys.push(keygen(paramSet));
  }

  const keygenTimes = [];
  const signTimes = [];
  const verifyTimes = [];

  // KeyGen
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    keygen(paramSet);
    keygenTimes.push((performance.now() - t0) * 1_000_000);
  }

  // Sign + Verify
  for (let i = 0; i < iterations; i++) {
    const { pk, sk } = keys[i];
    const pkBytes = encodePK(pk, paramSet);

    const t1 = performance.now();
    const sig = signEncoded(sk, msg, new Uint8Array(0), paramSet);
    signTimes.push((performance.now() - t1) * 1_000_000);

    const t2 = performance.now();
    const ok = verify(pkBytes, msg, sig, new Uint8Array(0), paramSet);
    verifyTimes.push((performance.now() - t2) * 1_000_000);

    if (!ok) throw new Error('verify failed in bench');
  }

  return { keygen: stats(keygenTimes), sign: stats(signTimes), verify: stats(verifyTimes) };
}

async function benchNoble(api, paramSet, msg, iterations) {
  // paramSet: ML-DSA-44 -> ml_dsa44, etc.
  const map = { 'ML-DSA-44': api.ml_dsa44, 'ML-DSA-65': api.ml_dsa65, 'ML-DSA-87': api.ml_dsa87 };
  const noble = map[paramSet];

  // Pre-generate keys
  const keys = [];
  for (let i = 0; i < iterations; i++) {
    keys.push(noble.keygen());
  }

  const keygenTimes = [];
  const signTimes = [];
  const verifyTimes = [];

  // KeyGen
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    noble.keygen();
    keygenTimes.push((performance.now() - t0) * 1_000_000);
  }

  // Sign + Verify
  for (let i = 0; i < iterations; i++) {
    const { publicKey, secretKey } = keys[i];

    const t1 = performance.now();
    const sig = noble.sign(msg, secretKey);
    signTimes.push((performance.now() - t1) * 1_000_000);

    const t2 = performance.now();
    const ok = noble.verify(sig, msg, publicKey);
    verifyTimes.push((performance.now() - t2) * 1_000_000);

    if (!ok) throw new Error('noble verify failed in bench');
  }

  return { keygen: stats(keygenTimes), sign: stats(signTimes), verify: stats(verifyTimes) };
}

async function main() {
  const iterations = parseInt(process.argv[2] || '100', 10);
  const msgSize = parseInt(process.argv[3] || '1024', 10);
  const msg = new Uint8Array(msgSize);
  for (let i = 0; i < msgSize; i++) msg[i] = i & 0xff;

  console.log(`fml-dsa vs Noble ML-DSA Benchmark`);
  console.log(`Iterations: ${iterations}, Message size: ${msgSize} bytes`);
  console.log(`Node: ${process.version}, Platform: ${process.platform}/${process.arch}`);
  console.log('');

  const api = await loadFmlDsa();
  const results = {};

  for (const paramSet of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']) {
    console.log(`\n=== ${paramSet} ===`);

    // Warmup
    console.log('  warmup...');
    for (let i = 0; i < 10; i++) {
      const { pk, sk } = api.keygen(paramSet);
      const sig = api.signEncoded(sk, msg, new Uint8Array(0), paramSet);
      api.verify(pk, msg, sig, new Uint8Array(0), paramSet);
    }

    console.log('  fml-dsa:');
    const fmlResult = await benchFmlDsa(api, paramSet, msg, iterations);
    console.log(`    KeyGen:  p50=${fmtMs(fmlResult.keygen.p50)}, p95=${fmtMs(fmlResult.keygen.p95)}, mean=${fmtMs(fmlResult.keygen.mean)}`);
    console.log(`    Sign:    p50=${fmtMs(fmlResult.sign.p50)}, p95=${fmtMs(fmlResult.sign.p95)}, mean=${fmtMs(fmlResult.sign.mean)}`);
    console.log(`    Verify:  p50=${fmtMs(fmlResult.verify.p50)}, p95=${fmtMs(fmlResult.verify.p95)}, mean=${fmtMs(fmlResult.verify.mean)}`);

    console.log('  noble:');
    const nobleResult = await benchNoble(api, paramSet, msg, iterations);
    console.log(`    KeyGen:  p50=${fmtMs(nobleResult.keygen.p50)}, p95=${fmtMs(nobleResult.keygen.p95)}, mean=${fmtMs(nobleResult.keygen.mean)}`);
    console.log(`    Sign:    p50=${fmtMs(nobleResult.sign.p50)}, p95=${fmtMs(nobleResult.sign.p95)}, mean=${fmtMs(nobleResult.sign.mean)}`);
    console.log(`    Verify:  p50=${fmtMs(nobleResult.verify.p50)}, p95=${fmtMs(nobleResult.verify.p95)}, mean=${fmtMs(nobleResult.verify.mean)}`);

    results[paramSet] = { fml: fmlResult, noble: nobleResult };
  }

  // Output JSON
  const fs = require('fs');
  const path = require('path');
  const outPath = path.join(__dirname, `../bench-result-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    iterations,
    msgSize,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    timestamp: new Date().toISOString(),
    results,
  }, null, 2));
  console.log(`\nResults written to: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });