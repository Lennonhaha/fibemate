// SPDX-License-Identifier: GPL-3.0-only
/**
 * SM2 TVLA v2 — 旧版 (jsbn/sm-crypto) vs 新版 (BigInt+wNAF+Jacobian)
 * Welch's t-test, interleaved A/B, N=5000, |t| > 4.5 → FAIL
 */
"use strict";

const crypto = require("crypto");
const sm2jsbn = require("sm-crypto").sm2;
const sm3 = require("sm-crypto").sm3;
const bigintEc = require("/opt/fibemate-full/sm2-bigint-ec");

const N = 2000;
const WARMUP = 500;
const THRESH = 4.5;

// ═══════════════════════ Statistics ═══════════════════════
function hrtUs(t) { return t[0] * 1e6 + t[1] / 1e3; }
function mean(a) { let s = 0; for (let v of a) s += v; return s / a.length; }
function variance(a, m) { let s = 0; for (let v of a) { const d = v - m; s += d * d; } return s / (a.length - 1); }
function welch(m1, v1, n1, m2, v2, n2) { const d = Math.sqrt(v1/n1 + v2/n2); return d === 0 ? 0 : Math.abs(m1-m2) / d; }

function runTVLA(name, fixedFn, randomFn) {
  process.stdout.write(`  ${name}... `);
  const tA = new Float64Array(N);
  const tB = new Float64Array(N);
  for (let w = 0; w < WARMUP; w++) { fixedFn(); randomFn(); }
  for (let i = 0; i < N; i++) {
    const sA = process.hrtime(); fixedFn(); tA[i] = hrtUs(process.hrtime(sA));
    const sB = process.hrtime(); randomFn(); tB[i] = hrtUs(process.hrtime(sB));
  }
  const m1 = mean(tA), m2 = mean(tB);
  const v1 = variance(tA, m1), v2 = variance(tB, m2);
  const t = welch(m1, v1, N, m2, v2, N);
  const df = (v1/N + v2/N) ** 2 / (((v1/N)**2)/(N-1) + ((v2/N)**2)/(N-1));
  const passed = t <= THRESH;
  console.log(`|t|=${t.toFixed(2)} ${passed ? "✅" : "❌"}`);
  return { name, t, df, fixedMean: m1, randomMean: m2, fixedCV: Math.sqrt(v1)/m1 * 100, passed };
}

// ═══════════════════════ Prepare test data ═══════════════════════
const msg = "FIBEMATE SM2 post-quantum hybrid verification test message";
const msgHash = sm3(msg); // hex hash for BigInt sign/verify
const userId = "1234567812345678";

// Fixed keypairs
const fixed_jsbn = sm2jsbn.generateKeyPairHex();
const fixed_bi = bigintEc.generateKeyPair();
const fixed_biPubHex = bigintEc.publicKeyToHex(fixed_bi.publicKey);

// Pre-compute signatures & ciphertexts
const sigOld = sm2jsbn.doSignature(msg, fixed_jsbn.privateKey, { hash: true });
const sigNew = bigintEc.sign(fixed_bi.privateKey, msgHash);
const encOld = sm2jsbn.doEncrypt(msg, fixed_jsbn.publicKey, 1);
const encNew = bigintEc.encrypt(fixed_biPubHex, msg);

// ═══════════════════════ Tests ═══════════════════════
const tests = [];

// ---- A. jsbn (sm-crypto) ----
tests.push({
  name: "[jsbn] genKey",
  fixed: () => sm2jsbn.generateKeyPairHex(),
  random: () => sm2jsbn.generateKeyPairHex(),
});
tests.push({
  name: "[jsbn] sign",
  fixed: () => sm2jsbn.doSignature(msg, fixed_jsbn.privateKey, { hash: true }),
  random: () => sm2jsbn.doSignature(msg, sm2jsbn.generateKeyPairHex().privateKey, { hash: true }),
});
tests.push({
  name: "[jsbn] verify",
  fixed: () => sm2jsbn.doVerifySignature(msg, sigOld, fixed_jsbn.publicKey, { hash: true }),
  random: () => {
    const t = sm2jsbn.generateKeyPairHex();
    sm2jsbn.doVerifySignature(msg, sm2jsbn.doSignature(msg, t.privateKey, { hash: true }), t.publicKey, { hash: true });
  },
});
tests.push({
  name: "[jsbn] encrypt",
  fixed: () => sm2jsbn.doEncrypt(msg, fixed_jsbn.publicKey, 1),
  random: () => sm2jsbn.doEncrypt(msg, sm2jsbn.generateKeyPairHex().publicKey, 1),
});
tests.push({
  name: "[jsbn] decrypt",
  fixed: () => sm2jsbn.doDecrypt(encOld, fixed_jsbn.privateKey, 1),
  random: () => {
    const t = sm2jsbn.generateKeyPairHex();
    sm2jsbn.doDecrypt(sm2jsbn.doEncrypt(msg, t.publicKey, 1), t.privateKey, 1);
  },
});

// ---- B. BigInt (optimized wNAF+Jacobian) ----
tests.push({
  name: "[BigInt] genKey",
  fixed: () => bigintEc.generateKeyPair(),
  random: () => bigintEc.generateKeyPair(),
});
tests.push({
  name: "[BigInt] sign",
  fixed: () => bigintEc.sign(fixed_bi.privateKey, msgHash),
  random: () => bigintEc.sign(bigintEc.generateKeyPair().privateKey, msgHash),
});
tests.push({
  name: "[BigInt] verify",
  fixed: () => bigintEc.verify(fixed_biPubHex, msgHash, sigNew.r, sigNew.s),
  random: () => {
    const t = bigintEc.generateKeyPair();
    const s = bigintEc.sign(t.privateKey, msgHash);
    bigintEc.verify(bigintEc.publicKeyToHex(t.publicKey), msgHash, s.r, s.s);
  },
});
tests.push({
  name: "[BigInt] encrypt",
  fixed: () => bigintEc.encrypt(fixed_biPubHex, msg),
  random: () => bigintEc.encrypt(bigintEc.publicKeyToHex(bigintEc.generateKeyPair().publicKey), msg),
});
tests.push({
  name: "[BigInt] decrypt",
  fixed: () => bigintEc.decrypt(fixed_bi.privateKey, encNew.c1, encNew.c2),
  random: () => {
    const t = bigintEc.generateKeyPair();
    const e = bigintEc.encrypt(bigintEc.publicKeyToHex(t.publicKey), msg);
    bigintEc.decrypt(t.privateKey, e.c1, e.c2);
  },
});

// ---- C. Primitives ----
tests.push({
  name: "SHA-256",
  fixed: () => crypto.createHash("sha256").update(msg).digest(),
  random: () => crypto.createHash("sha256").update(crypto.randomBytes(32)).digest(),
});
tests.push({
  name: "randomBytes(32)",
  fixed: () => crypto.randomBytes(32),
  random: () => crypto.randomBytes(32),
});

// ═══════════════════════ Execute ═══════════════════════
console.log("╔══════════════════════════════════════════════════════╗");
console.log("║  SM2 TVLA v2 — jsbn vs BigInt+wNAF+Jacobian        ║");
console.log("╠══════════════════════════════════════════════════════╣");
console.log(`║  N=${N}  warmup=${WARMUP}  threshold=|t|≤${THRESH}                   ║`);
console.log("╚══════════════════════════════════════════════════════╝\n");

const start = Date.now();
const results = [];
for (const t of tests) {
  results.push(runTVLA(t.name, t.fixed, t.random));
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const total = results.length;
const passed = results.filter(r => r.passed).length;
const failed = total - passed;

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(` Results: ${passed}/${total} passed, ${failed} failed  (${elapsed}s)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

// Group by version
const jsbnRes = results.filter(r => r.name.startsWith("[jsbn]"));
const biRes   = results.filter(r => r.name.startsWith("[BigInt]"));
const primRes = results.filter(r => !r.name.startsWith("["));

function printGroup(label, rs) {
  console.log(`  ${label}:`);
  for (const r of rs) {
    console.log(`    ${r.passed ? "✅" : "❌"} ${r.name.padEnd(24)} |t|=${r.t.toFixed(2).padStart(6)}  df=${Math.round(r.df).toString().padStart(6)}  cv=${r.fixedCV.toFixed(1).padStart(5)}%`);
  }
}
printGroup("jsbn (sm-crypto)", jsbnRes);
printGroup("BigInt + wNAF", biRes);
printGroup("Primitives", primRes);

// ═══════════════════════ Report ═══════════════════════
const report = {
  timestamp: new Date().toISOString(),
  nodeVersion: process.version,
  versions: {
    jsbn: "sm-crypto (jsbn 28-bit limb)",
    bigint: "Native BigInt + Jacobian + Precomp + wNAF",
  },
  iterations: N,
  threshold: THRESH,
  elapsedSec: parseFloat(elapsed),
  allPassed: failed === 0,
  jsbnPassed: jsbnRes.every(r => r.passed),
  bigintPassed: biRes.every(r => r.passed),
  results,
};

const fs = require("fs");
const outPath = "/opt/fibemate-full/tvla-sm2-v2-optimized-report.json";
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\n📄 Report: ${outPath}`);

if (failed > 0) {
  console.log("\n⚠️  TVLA FAILED — potential side-channel leakage!");
  process.exit(1);
} else {
  console.log("\n✅ All TVLA tests PASSED");
}
