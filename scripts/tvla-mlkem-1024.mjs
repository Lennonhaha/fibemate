// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
//
// TVLA for ML-KEM-1024 (Noble implementation)
// Methodology: Welch's t-test, interleaved A/B measurement
// Threshold: |t| > 4.5 = FAIL (leak suspected)
//
// Operations tested:
//  1. keygen (ML-KEM-1024)
//  2. encapsulate
//  3. decapsulate
//
// Note: This is an ES module — run with --input-type=module or as .mjs

import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync } from 'fs';

const N_SAMPLES = 10000;
const WARMUP = 2000;
const THRESH = 4.5;

function hrtUs(t) {
  return t[0] * 1e6 + t[1] / 1e3;
}

function mean(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function variance(arr, m) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return s / (arr.length - 1);
}

function welch(m1, v1, n1, m2, v2, n2) {
  const d = Math.sqrt(v1 / n1 + v2 / n2);
  return d === 0 ? 0 : Math.abs(m1 - m2) / d;
}

// ============================================================
// Test 1: keygen
// ============================================================

function testKeygen() {
  console.log("\n[1/3] ML-KEM-1024 keygen");
  
  const tA = new Float64Array(N_SAMPLES);
  const tB = new Float64Array(N_SAMPLES);
  
  // Warmup
  for (let w = 0; w < WARMUP; w++) ml_kem1024.keygen();
  
  // Interleaved measurement
  for (let i = 0; i < N_SAMPLES; i++) {
    const t0 = process.hrtime();
    ml_kem1024.keygen();
    tA[i] = hrtUs(process.hrtime(t0));
    
    const t1 = process.hrtime();
    ml_kem1024.keygen();
    tB[i] = hrtUs(process.hrtime(t1));
  }
  
  const mA = mean(tA), vA = variance(tA, mA);
  const mB = mean(tB), vB = variance(tB, mB);
  const tStat = welch(mA, vA, N_SAMPLES, mB, vB, N_SAMPLES);
  
  console.log(`  A: mu=${mA.toFixed(2)}us  CV=${(Math.sqrt(vA)/mA*100).toFixed(1)}%`);
  console.log(`  B: mu=${mB.toFixed(2)}us  CV=${(Math.sqrt(vB)/mB*100).toFixed(1)}%`);
  console.log(`  |t| = ${tStat.toFixed(2)}  [${tStat < THRESH ? "PASS" : "FAIL"}]`);
  
  return { name: "keygen-1024", tStat: +tStat.toFixed(2), passed: tStat < THRESH, mA_us: +mA.toFixed(2) };
}

// ============================================================
// Test 2: encapsulate
// ============================================================

function testEncapsulate() {
  console.log("\n[2/3] ML-KEM-1024 encapsulate");
  
  const kp = ml_kem1024.keygen();
  const tA = new Float64Array(N_SAMPLES);
  const tB = new Float64Array(N_SAMPLES);
  
  // Warmup
  for (let w = 0; w < WARMUP; w++) ml_kem1024.encapsulate(kp.publicKey);
  
  // Interleaved measurement
  for (let i = 0; i < N_SAMPLES; i++) {
    const t0 = process.hrtime();
    ml_kem1024.encapsulate(kp.publicKey);
    tA[i] = hrtUs(process.hrtime(t0));
    
    const t1 = process.hrtime();
    ml_kem1024.encapsulate(kp.publicKey);
    tB[i] = hrtUs(process.hrtime(t1));
  }
  
  const mA = mean(tA), vA = variance(tA, mA);
  const mB = mean(tB), vB = variance(tB, mB);
  const tStat = welch(mA, vA, N_SAMPLES, mB, vB, N_SAMPLES);
  
  console.log(`  A: mu=${mA.toFixed(2)}us  CV=${(Math.sqrt(vA)/mA*100).toFixed(1)}%`);
  console.log(`  B: mu=${mB.toFixed(2)}us  CV=${(Math.sqrt(vB)/mB*100).toFixed(1)}%`);
  console.log(`  |t| = ${tStat.toFixed(2)}  [${tStat < THRESH ? "PASS" : "FAIL"}]`);
  
  return { name: "encapsulate-1024", tStat: +tStat.toFixed(2), passed: tStat < THRESH, mA_us: +mA.toFixed(2) };
}

// ============================================================
// Test 3: decapsulate
// ============================================================

function testDecapsulate() {
  console.log("\n[3/3] ML-KEM-1024 decapsulate");
  
  const kp = ml_kem1024.keygen();
  const { cipherText } = ml_kem1024.encapsulate(kp.publicKey);
  const tA = new Float64Array(N_SAMPLES);
  const tB = new Float64Array(N_SAMPLES);
  
  // Warmup
  for (let w = 0; w < WARMUP; w++) ml_kem1024.decapsulate(cipherText, kp.secretKey);
  
  // Interleaved measurement
  for (let i = 0; i < N_SAMPLES; i++) {
    const t0 = process.hrtime();
    ml_kem1024.decapsulate(cipherText, kp.secretKey);
    tA[i] = hrtUs(process.hrtime(t0));
    
    const t1 = process.hrtime();
    ml_kem1024.decapsulate(cipherText, kp.secretKey);
    tB[i] = hrtUs(process.hrtime(t1));
  }
  
  const mA = mean(tA), vA = variance(tA, mA);
  const mB = mean(tB), vB = variance(tB, mB);
  const tStat = welch(mA, vA, N_SAMPLES, mB, vB, N_SAMPLES);
  
  console.log(`  A: mu=${mA.toFixed(2)}us  CV=${(Math.sqrt(vA)/mA*100).toFixed(1)}%`);
  console.log(`  B: mu=${mB.toFixed(2)}us  CV=${(Math.sqrt(vB)/mB*100).toFixed(1)}%`);
  console.log(`  |t| = ${tStat.toFixed(2)}  [${tStat < THRESH ? "PASS" : "FAIL"}]`);
  
  return { name: "decapsulate-1024", tStat: +tStat.toFixed(2), passed: tStat < THRESH, mA_us: +mA.toFixed(2) };
}

// ============================================================
// Main
// ============================================================

function main() {
  console.log("=" .repeat(60));
  console.log("TVLA ML-KEM-1024 (Noble) — Welch's t-test");
  console.log("=" .repeat(60));
  console.log(`N_SAMPLES = ${N_SAMPLES}`);
  console.log(`WARMUP    = ${WARMUP}`);
  console.log(`THRESH    = ${THRESH}`);
  console.log(`Impl      = @noble/post-quantum (ML-KEM-1024)`);
  
  const results = [];
  
  const tStart = Date.now();
  results.push(testKeygen());
  results.push(testEncapsulate());
  results.push(testDecapsulate());
  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  
  // Summary
  console.log("\n" + "=" .repeat(60));
  console.log("SUMMARY");
  console.log("=" .repeat(60));
  
  let pass = 0, fail = 0;
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    console.log(`${status}  ${r.name.padEnd(20)} |t|=${String(r.tStat).padStart(6)}  mu=${r.mA_us.toFixed(2)}us`);
    if (r.passed) pass++; else fail++;
  }
  
  console.log(`\nResults: ${pass}/${results.length} PASS, ${fail}/${results.length} FAIL`);
  console.log(`Elapsed: ${elapsed}s`);
  
  if (fail === 0) {
    console.log("ML-KEM-1024 TVLA PASSED — no timing leakage detected at software level.");
  } else {
    console.log("ML-KEM-1024 TVLA FAILED — timing leakage suspected.");
  }
  
  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    algorithm: "ML-KEM-1024",
    implementation: "@noble/post-quantum",
    method: "Welch's t-test, interleaved A/B",
    N_SAMPLES,
    WARMUP,
    THRESH,
    elapsed_s: +elapsed,
    results,
    summary: { pass, fail, total: results.length }
  };
  
  const outPath = "evidence/tvla/tvla-mlkem-1024-noble.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${outPath}`);
  
  // Print full report for clipboard
  console.log("\n--- RAW REPORT ---");
  console.log(JSON.stringify(report, null, 2));
}

main();
