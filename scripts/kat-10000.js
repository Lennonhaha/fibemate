// SPDX-License-Identifier: GPL-3.0-only
﻿/**
 * KAT 10000-Round Consistency Test - ML-KEM-768
 * Fixed: decapsulate() argument order (secretKey, ciphertext)
 */

"use strict";

const M = require("../packages/pqc-kem/src/ml-kem-768.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TOTAL_ROUNDS = parseInt(process.argv.find(a => a.startsWith("--rounds="))?.split("=")[1])
                  || (process.argv.includes("--quick") ? 100 : 10000);
const SAVE_INTERVAL = 500;
const OUTPUT_DIR = "./kat_results";
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");

function runKATRound(roundNum) {
  const startTime = process.hrtime();
  try {
    const { publicKey, secretKey } = M.generateKeypair();
    const t1 = process.hrtime(startTime);
    const { ciphertext, sharedSecret: ss1 } = M.encapsulate(publicKey);
    const t2 = process.hrtime(t1);
    // FIXED: correct argument order: decapsulate(secretKey, ciphertext)
    const ss2 = M.decapsulate(secretKey, ciphertext);
    const t3 = process.hrtime(t2);
    const ss2Buf = Buffer.from(ss2);
    const match = ss1.equals(ss2Buf);
    const pkSize = publicKey.length;
    const skSize = secretKey.length;
    const ctSize = ciphertext.length;
    const ssSize = ss1.length;
    const totalTime = process.hrtime(startTime);
    const totalUs = totalTime[0] * 1e6 + totalTime[1] / 1e3;
    return {
      round: roundNum,
      success: match,
      sizes: { pkSize, skSize, ctSize, ssSize },
      timing: {
        keypairUs: t1[0] * 1e6 + t1[1] / 1e3,
        encapUs: t2[0] * 1e6 + t2[1] / 1e3,
        decapUs: t3[0] * 1e6 + t3[1] / 1e3,
        totalUs,
      },
      error: null,
    };
  } catch (err) {
    const totalTime = process.hrtime(startTime);
    const totalUs = totalTime[0] * 1e6 + totalTime[1] / 1e3;
    return {
      round: roundNum,
      success: false,
      sizes: null,
      timing: { totalUs },
      error: err.message,
    };
  }
}

function verifySizes(sizes) {
  const EXPECTED = { pkSize: 1184, skSize: 2400, ctSize: 1088, ssSize: 32 };
  if (!sizes) return { valid: false, reason: "No size data" };
  const mismatches = [];
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (sizes[key] !== expected) {
      mismatches.push(`${key}: expected ${expected}, got ${sizes[key]}`);
    }
  }
  return {
    valid: mismatches.length === 0,
    reason: mismatches.length > 0 ? mismatches.join("; ") : null,
    expected: EXPECTED,
    actual: sizes,
  };
}

function calculateSummary(results) {
  const total = results.length;
  const passed = results.filter(r => r.success).length;
  const failed = total - passed;
  const errors = results.filter(r => r.error).length;
  const timings = results.filter(r => r.timing && r.timing.totalUs).map(r => r.timing.totalUs);
  const avgTime = timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 0;
  const minTime = timings.length > 0 ? Math.min(...timings) : 0;
  const maxTime = timings.length > 0 ? Math.max(...timings) : 0;
  const sizeChecks = results.filter(r => r.sizes).map(r => verifySizes(r.sizes));
  const sizeValid = sizeChecks.filter(c => c.valid).length;
  return {
    totalRounds: total,
    passed,
    failed,
    errors,
    passRate: total > 0 ? (passed / total * 100).toFixed(2) + "%" : "N/A",
    timing: { avgUs: avgTime.toFixed(2), minUs: minTime.toFixed(2), maxUs: maxTime.toFixed(2) },
    sizeVerification: { checked: sizeChecks.length, valid: sizeValid, invalid: sizeChecks.length - sizeValid },
  };
}

function saveProgress(results, roundNum) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = path.join(OUTPUT_DIR, `kat_${TOTAL_ROUNDS}rounds_${TIMESTAMP}_round${roundNum}.json`);
  const data = { timestamp: new Date().toISOString(), totalRounds: TOTAL_ROUNDS, completedRounds: roundNum, results: results.slice(-SAVE_INTERVAL), summary: calculateSummary(results) };
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`  💾 Progress saved: ${filename} (${roundNum}/${TOTAL_ROUNDS})`);
}

function saveFinalReport(results) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = path.join(OUTPUT_DIR, `kat_${TOTAL_ROUNDS}rounds_${TIMESTAMP}_FINAL.json`);
  const summary = calculateSummary(results);
  const report = {
    testName: "ML-KEM-768 Known Answer Test (10,000 Rounds)",
    timestamp: new Date().toISOString(),
    configuration: { totalRounds: TOTAL_ROUNDS, algorithm: "ML-KEM-768", implementation: "FIBEMATE Pure JavaScript" },
    summary,
    sampleResults: results.slice(0, 10),
  };
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`\n📄 Final report saved: ${filename}`);
  const txtFilename = filename.replace(".json", ".txt");
  fs.writeFileSync(txtFilename, generateTextReport(report));
  console.log(`📄 Text summary saved: ${txtFilename}`);
  return filename;
}

function generateTextReport(report) {
  const lines = [];
  lines.push("=".repeat(60));
  lines.push("ML-KEM-768 Known Answer Test (10,000 Rounds) - Summary Report");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Test Date: ${report.timestamp}`);
  lines.push(`Algorithm: ${report.configuration.algorithm}`);
  lines.push(`Implementation: ${report.configuration.implementation}`);
  lines.push("");
  lines.push("-".repeat(60));
  lines.push("RESULTS SUMMARY");
  lines.push("-".repeat(60));
  lines.push(`Total Rounds:    ${report.summary.totalRounds}`);
  lines.push(`Passed:          ${report.summary.passed}`);
  lines.push(`Failed:          ${report.summary.failed}`);
  lines.push(`Errors:           ${report.summary.errors}`);
  lines.push(`Pass Rate:        ${report.summary.passRate}`);
  lines.push("");
  lines.push("-".repeat(60));
  lines.push("TIMING STATISTICS (μs)");
  lines.push("-".repeat(60));
  lines.push(`Average:          ${report.summary.timing.avgUs}`);
  lines.push(`Minimum:          ${report.summary.timing.minUs}`);
  lines.push(`Maximum:          ${report.summary.timing.maxUs}`);
  lines.push("");
  lines.push("-".repeat(60));
  lines.push("OUTPUT SIZE VERIFICATION");
  lines.push("-".repeat(60));
  lines.push(`Checked:          ${report.summary.sizeVerification.checked}`);
  lines.push(`Valid:            ${report.summary.sizeVerification.valid}`);
  lines.push(`Invalid:          ${report.summary.sizeVerification.invalid}`);
  lines.push("");
  lines.push("=".repeat(60));
  lines.push("SAMPLE RESULTS (First 10 rounds)");
  lines.push("=".repeat(60));
  if (report.sampleResults) {
    for (const r of report.sampleResults) {
      lines.push(`  Round ${r.round}: ${r.success ? "✅ PASS" : "❌ FAIL"}${r.error ? ` (${r.error})` : ""}`);
    }
  }
  lines.push("");
  lines.push("Full results (JSON): " + report.timestamp);
  lines.push("=".repeat(60));
  return lines.join("\n");
}

async function runKATTest() {
  console.log("=".repeat(60));
  console.log("ML-KEM-768 Known Answer Test (KAT) - Extended to 10,000 Rounds");
  console.log("=".repeat(60));
  console.log(`Total Rounds: ${TOTAL_ROUNDS.toLocaleString()}`);
  console.log(`Save Interval: Every ${SAVE_INTERVAL} rounds`);
  console.log(`Output Directory: ${OUTPUT_DIR}`);
  console.log("");
  const results = [];
  const startTime = Date.now();
  console.log("Warming up (10 rounds)...");
  for (let i = 0; i < 10; i++) M.generateKeypair();
  console.log("Warmup complete.\n");
  console.log(`Starting ${TOTAL_ROUNDS.toLocaleString()} rounds...`);
  console.log("");
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    const result = runKATRound(round);
    results.push(result);
    if (round % 100 === 0 || round === TOTAL_ROUNDS) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = round / elapsed;
      const eta = (TOTAL_ROUNDS - round) / rate;
      process.stdout.write(`\r  Round ${round.toLocaleString()}/${TOTAL_ROUNDS.toLocaleString()} | Pass: ${results.filter(r => r.success).length} | Fail: ${results.filter(r => !r.success).length} | Rate: ${rate.toFixed(1)} rounds/sec | ETA: ${(eta / 60).toFixed(1)} min    `);
    }
    if (round % SAVE_INTERVAL === 0 && round < TOTAL_ROUNDS) {
      console.log("");
      saveProgress(results, round);
    }
    if (round % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  console.log("\n");
  const finalReport = saveFinalReport(results);
  console.log("=".repeat(60));
  console.log("TEST COMPLETE");
  console.log("=".repeat(60));
  const summary = calculateSummary(results);
  console.log(`Total Rounds: ${summary.totalRounds}`);
  console.log(`Passed:       ${summary.passed} (${summary.passRate})`);
  console.log(`Failed:       ${summary.failed}`);
  console.log(`Errors:        ${summary.errors}`);
  console.log("");
  console.log("Timing (μs):");
  console.log(`  Average: ${summary.timing.avgUs}`);
  console.log(`  Min:     ${summary.timing.minUs}`);
  console.log(`  Max:     ${summary.timing.maxUs}`);
  console.log("");
  console.log("Output Sizes:");
  console.log(`  Valid:   ${summary.sizeVerification.valid}/${summary.sizeVerification.checked}`);
  console.log(`  Invalid: ${summary.sizeVerification.invalid}/${summary.sizeVerification.checked}`);
  console.log("=".repeat(60));
  return summary.failed > 0 ? 1 : 0;
}

if (require.main === module) {
  runKATTest().then(exitCode => process.exit(exitCode)).catch(err => { console.error("Fatal error:", err); process.exit(2); });
}

module.exports = { runKATRound, verifySizes, calculateSummary };