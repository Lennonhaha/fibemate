// SM2 TVLA — High-Order (v1.3, N=5000)
// Tests: genKey / sign / verify / encrypt / decrypt
// Orders: 1 (mean) / 2 (variance) / 3 (skewness) / 4 (kurtosis)
// Threshold: |t| ≤ 4.5 (NIST IR 8214A)
"use strict";

const crypto = require("crypto");
const sm3 = require("sm-crypto").sm3;
const bigintEc = require("./sm2-bigint-ec-v1.3");

const N = process.argv[2] ? parseInt(process.argv[2]) : 5000;
const WARMUP = 500;
const THRESH = 4.5;
const POOL = 100;
const ORDERS = [1, 2, 3, 4];

function hrtUs(t) { return t[0] * 1e6 + t[1] / 1e3; }

function mean(a) {
  let s = 0;
  for (let v of a) s += v;
  return s / a.length;
}

function centralMoment(a, mu, order) {
  // μ_k = E[(X - μ)^k]
  let s = 0;
  for (let v of a) {
    s += Math.pow(v - mu, order);
  }
  return s / a.length;
}

function varianceOf(data, mu, order) {
  // sample variance of (x_i - μ)^order
  const m = centralMoment(data, mu, order);
  let s = 0;
  for (let v of data) {
    const d = Math.pow(v - mu, order) - m;
    s += d * d;
  }
  return s / (data.length - 1);
}

function welch(m1, v1, n1, m2, v2, n2) {
  const d = Math.sqrt(v1 / n1 + v2 / n2);
  return d === 0 ? 0 : Math.abs(m1 - m2) / d;
}

/**
 * Run high-order TVLA for one operation.
 * Returns results for orders 1..4.
 */
function runHighOrderTVLA(name, fixedFn, randomFn) {
  process.stdout.write("  " + name + " ...\n");

  const ta = new Float64Array(N);
  const tb = new Float64Array(N);

  // Warmup
  for (let w = 0; w < WARMUP; w++) {
    fixedFn();
    randomFn();
  }

  // Collect timing data
  for (let i = 0; i < N; i++) {
    let s = process.hrtime();
    fixedFn();
    ta[i] = hrtUs(process.hrtime(s));

    s = process.hrtime();
    randomFn();
    tb[i] = hrtUs(process.hrtime(s));
  }

  const muA = mean(ta);
  const muB = mean(tb);

  const results = [];
  for (const order of ORDERS) {
    // k-th central moments of timing data
    const mA = centralMoment(ta, muA, order);
    const mB = centralMoment(tb, muB, order);
    // Variance of the k-th power deviations
    const vA = varianceOf(ta, muA, order);
    const vB = varianceOf(tb, muB, order);
    const t = welch(mA, vA, N, mB, vB, N);
    const ok = t <= THRESH;
    results.push({ order, t, ok, fixedMoment: mA, randomMoment: mB });
  }

  return { name, meanA: muA, meanB: muB, results };
}

// ============ Main ============
console.log("=".repeat(64));
console.log("  SM2 TVLA — High-Order  v1.3 (Montgomery Ladder + 3x Defense)");
console.log("  N=" + N + "  Orders=" + ORDERS.join(",") + "  |t|≤" + THRESH);
console.log("=".repeat(64));

console.log("\nPre-generating pools (size=" + POOL + ")...");
const msg = "FIBEMATE SM2 post-quantum hybrid verification test message";
const msgHash = sm3(msg);

// Pool pre-generation
const B = { keys: [], pubHexes: [], sigs: [], enc: [] };
for (let i = 0; i < POOL; i++) {
  const kp = bigintEc.generateKeyPair();
  B.keys.push(kp);
  B.pubHexes.push(bigintEc.pk2hex(kp.publicKey));
}
const hashes = [];
for (let i = 0; i < POOL; i++) {
  const m = crypto.randomBytes(32).toString("hex");
  const hx = sm3(m);
  hashes.push(BigInt("0x" + hx));
  const skHex = bigintEc.bi2hex(B.keys[i].privateKey);
  B.sigs.push(bigintEc.sign(skHex, hx));
  B.enc.push(bigintEc.encrypt(B.pubHexes[i], "test message ho " + i));
}
console.log("done.");

// Fixed-key precompute
const fB = bigintEc.generateKeyPair();
const fBH = bigintEc.pk2hex(fB.publicKey);
const fBSkHex = bigintEc.bi2hex(fB.privateKey);
const sigBF = bigintEc.sign(fBSkHex, msgHash);
const encBF = bigintEc.encrypt(fBH, msg);

let idx = 0;
function n() {
  return (idx++) % POOL;
}

const tests = [
  {
    name: "genKey",
    fixed: () => bigintEc.generateKeyPair(),
    random: () => bigintEc.generateKeyPair(),
  },
  {
    name: "sign",
    fixed: () => bigintEc.sign(fBSkHex, msgHash),
    random: () => {
      const i = n();
      return bigintEc.sign(bigintEc.bi2hex(B.keys[i].privateKey), bigintEc.bi2hex(hashes[i]));
    },
  },
  {
    name: "verify",
    fixed: () =>
      bigintEc.verify(fBH, msgHash, sigBF.r, sigBF.s),
    random: () => {
      const i = n();
      return bigintEc.verify(
        B.pubHexes[i],
        bigintEc.bi2hex(hashes[i]),
        B.sigs[i].r,
        B.sigs[i].s
      );
    },
  },
  {
    name: "encrypt",
    fixed: () => bigintEc.encrypt(fBH, msg),
    random: () => {
      const i = n();
      return bigintEc.encrypt(B.pubHexes[i], "test ho idx=" + i);
    },
  },
  {
    name: "decrypt",
    fixed: () => bigintEc.decrypt(fBSkHex, encBF.c1, encBF.c2),
    random: () => {
      const i = n();
      return bigintEc.decrypt(
        bigintEc.bi2hex(B.keys[i].privateKey),
        B.enc[i].c1,
        B.enc[i].c2
      );
    },
  },
];

const start = Date.now();
const allResults = [];

for (const t of tests) {
  const res = runHighOrderTVLA(t.name, t.fixed, t.random);
  allResults.push(res);

  for (const r of res.results) {
    const label = "Order " + r.order;
    const status = r.ok ? "✅ PASS" : "❌ FAIL";
    console.log(
      "    " +
        label.padEnd(8) +
        " |t|=" +
        r.t.toFixed(2).padStart(6) +
        "  " +
        status
    );
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const totalTests = allResults.reduce((s, r) => s + r.results.length, 0);
const totalPassed = allResults.reduce(
  (s, r) => s + r.results.filter((x) => x.ok).length,
  0
);

console.log("\n" + "=".repeat(64));
console.log(
  "  Summary: " +
    totalPassed +
    "/" +
    totalTests +
    " PASS  (" +
    elapsed +
    "s)"
);
console.log("=".repeat(64) + "\n");

// Detailed table
console.log(
  "Operation".padEnd(12) +
    "Order 1".padStart(10) +
    "Order 2".padStart(10) +
    "Order 3".padStart(10) +
    "Order 4".padStart(10)
);
console.log("-".repeat(52));
for (const r of allResults) {
  let row = r.name.padEnd(12);
  for (const o of r.results) {
    row +=
      (o.ok ? "✅" : "❌") + o.t.toFixed(2).padStart(8);
  }
  console.log(row);
}

// Timing reference
console.log("\nTiming (µs):");
for (const r of allResults) {
  console.log(
    "  " +
      r.name.padEnd(10) +
      " fixed=" +
      r.meanA.toFixed(1).padStart(8) +
      "µs  random=" +
      r.meanB.toFixed(1).padStart(8) +
      "µs"
  );
}

// JSON report
const report = {
  version: "high-order v1.0",
  implementation: "sm2-bigint-ec v1.3 (Montgomery Ladder + Scalar Masking + Projective Randomization)",
  N,
  threshold: THRESH,
  timestamp: new Date().toISOString(),
  results: allResults.map((r) => ({
    operation: r.name,
    meanFixedUs: r.meanA,
    meanRandomUs: r.meanB,
    orders: r.results.map((o) => ({
      order: o.order,
      "|t|": +o.t.toFixed(4),
      pass: o.ok,
    })),
  })),
  summary: {
    passed: totalPassed,
    total: totalTests,
    elapsedSeconds: +elapsed,
  },
};

const fs = require("fs");
const outPath = __dirname + "/tvla-sm2-high-order-report.json";
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log("\nReport saved: " + outPath);

if (totalPassed === totalTests) {
  console.log("\n✅ ALL " + totalTests + "/" + totalTests + " PASS — 三重防护在高阶统计下仍有效");
} else {
  console.log(
    "\n⚠️  " +
      (totalTests - totalPassed) +
      " FAIL detected — 存在高阶泄漏，需定位"
  );
}
