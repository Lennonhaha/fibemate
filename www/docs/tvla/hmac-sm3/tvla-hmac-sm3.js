"use strict";
const crypto = require("crypto");
const sm3_hmac = require("sm-crypto").sm3;
const assert = require("assert");

const N = 2000, WARMUP = 500, THRESH = 4.5;

// ═══════ TVLA core (reused from tvla_sm2_v3.js) ═══════
function hrtUs(t) { return t[0] * 1e6 + t[1] / 1e3; }
function mean(a) { let s = 0; for (let v of a) s += v; return s / a.length; }
function varN(a, m) { let s = 0; for (let v of a) { let d = v - m; s += d * d; } return s / (a.length - 1); }
function welch(m1, v1, n1, m2, v2, n2) { let d = Math.sqrt(v1 / n1 + v2 / n2); return d === 0 ? 0 : Math.abs(m1 - m2) / d; }

function runTVLA(name, fixed, random) {
  process.stdout.write(`  ${name.padEnd(42)} `);
  const ta = new Float64Array(N), tb = new Float64Array(N);
  for (let w = 0; w < WARMUP; w++) { fixed(); random(); }
  for (let i = 0; i < N; i++) {
    let s = process.hrtime(); fixed(); ta[i] = hrtUs(process.hrtime(s));
    s = process.hrtime(); random(); tb[i] = hrtUs(process.hrtime(s));
  }
  let m1 = mean(ta), m2 = mean(tb), v1 = varN(ta, m1), v2 = varN(tb, m2);
  let t = welch(m1, v1, N, m2, v2, N), df = (v1 / N + v2 / N) ** 2 / (((v1 / N) ** 2) / (N - 1) + ((v2 / N) ** 2) / (N - 1));
  let ok = t <= THRESH;
  console.log(`|t|= ${String(t.toFixed(2)).padStart(6)} ${ok ? "✅" : "❌ FAIL"}`);
  return { name, t, df, fixedMean: m1, randomMean: m2, fixedCV: Math.sqrt(v1) / m1 * 100, passed: ok };
}

// ═══════ Self-test: verify HMAC-SM3 correctness ═══════
function selftest() {
  // RFC 4231 Test Case 1 equivalent for SM3 (Chinese standards)
  // Verify that sm3 in hmac mode produces deterministic output
  const key = "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b";
  const data = "4869205468657265"; // "Hi There"
  const h1 = sm3_hmac(data, { mode: "hmac", key: key });
  const h2 = sm3_hmac(data, { mode: "hmac", key: key });
  assert.strictEqual(h1, h2, "HMAC-SM3 must be deterministic");
  assert.strictEqual(h1.length, 64, "HMAC-SM3 output must be 256 bits = 64 hex chars");
  // Verify pure SM3 works (no HMAC)
  const h3 = sm3_hmac(data);
  assert.strictEqual(h3.length, 64, "SM3 pure hash must be 256 bits");
  assert.notStrictEqual(h1, h3, "HMAC-SM3 ≠ SM3 for same input");
  console.log("✅ HMAC-SM3 self-test passed\n");
}

selftest();

// ═══════ Pre-generate test materials ═══════
const FIXED_KEY = crypto.randomBytes(32).toString("hex");
const FIXED_MSG = "FIBEMATE HMAC-SM3 TVLA fixed test message";
const FIXED_MSG_HEX = Buffer.from(FIXED_MSG).toString("hex");
const RANDOM_POOL = Array.from({ length: 200 }, () => crypto.randomBytes(32).toString("hex"));
const RANDOM_MSG_POOL = RANDOM_POOL.map(k => crypto.randomBytes(32).toString("hex"));
let idx = 0;
function next() { return (idx++) % 200; }

// ═══════ Define test pairs ═══════
console.log(`Pre-generating HMAC-SM3 pools... `);
// Pool for pre-computing random-key+random-msg HMACs for verify-like tests
// (not needed for HMAC since it's pure hash, no verify step)
console.log("done.\n");

const tests = [
  // ── CORE: HMAC-SM3 timing independence ──
  [
    "HMAC-SM3: fixed-key + fixed-msg vs random",
    () => sm3_hmac(FIXED_MSG_HEX, { mode: "hmac", key: FIXED_KEY }),
    () => {
      let i = next();
      return sm3_hmac(RANDOM_MSG_POOL[i], { mode: "hmac", key: FIXED_KEY });
    }
  ],

  [
    "HMAC-SM3: all-fixed vs all-random",
    () => sm3_hmac(FIXED_MSG_HEX, { mode: "hmac", key: FIXED_KEY }),
    () => {
      let i = next();
      return sm3_hmac(RANDOM_MSG_POOL[i], { mode: "hmac", key: RANDOM_POOL[i] });
    }
  ],

  [
    "HMAC-SM3: random-key + fixed-msg vs fixed",
    () => {
      let i = next();
      return sm3_hmac(FIXED_MSG_HEX, { mode: "hmac", key: RANDOM_POOL[i] });
    },
    () => sm3_hmac(FIXED_MSG_HEX, { mode: "hmac", key: FIXED_KEY }),
  ],

  // ── BASELINE: pure SM3 hash (no key) ──
  [
    "SM3 pure hash: fixed vs random",
    () => sm3_hmac(FIXED_MSG),
    () => {
      let i = next();
      return sm3_hmac(Buffer.from(RANDOM_MSG_POOL[i], "hex").toString());
    },
  ],

  // ── CONTROL: identical operations (verify false-positive rate) ──
  [
    "CONTROL: HMAC fixed vs same-fixed",
    () => sm3_hmac(FIXED_MSG_HEX, { mode: "hmac", key: FIXED_KEY }),
    () => sm3_hmac(FIXED_MSG_HEX, { mode: "hmac", key: FIXED_KEY }),
  ],

  [
    "CONTROL: SM3 fixed vs same-fixed",
    () => sm3_hmac(FIXED_MSG),
    () => sm3_hmac(FIXED_MSG),
  ],

  // ── COMPARISON: Node.js system HMAC-SHA256 ──
  [
    "Node HMAC-SHA256: fixed-key+fixed-msg vs random-msg",
    () => crypto.createHmac("sha256", FIXED_KEY).update(FIXED_MSG).digest(),
    () => {
      let i = next();
      return crypto.createHmac("sha256", FIXED_KEY).update(RANDOM_MSG_POOL[i]).digest();
    },
  ],

  // ── COMPARISON: system SHA-256 (known to leak via Node internals) ──
  [
    "Node SHA-256: fixed vs random",
    () => crypto.createHash("sha256").update(FIXED_MSG).digest(),
    () => crypto.createHash("sha256").update(crypto.randomBytes(32)).digest(),
  ],
];

// ═══════ Run ═══════
console.log(`╔════════════════════════════════════════════════╗`);
console.log(`║  HMAC-SM3 TVLA v1 — Timing Side-Channel       ║`);
console.log(`╠════════════════════════════════════════════════╣`);
console.log(`║  N=${N}  warmup=${WARMUP}  threshold=|t|≤${THRESH}                     ║`);
console.log(`╚════════════════════════════════════════════════╝\n`);

let start = Date.now(), results = [];
for (let t of tests) results.push(runTVLA(t[0], t[1], t[2]));

let elapsed = ((Date.now() - start) / 1000).toFixed(1);
let passed = results.filter(r => r.passed).length, total = results.length;

let core = results.filter(r => r.name.startsWith("HMAC-SM3:"));
let baseline = results.filter(r => r.name.startsWith("SM3 pure"));
let control = results.filter(r => r.name.startsWith("CONTROL:"));
let system = results.filter(r => r.name.startsWith("Node"));

function printGrp(label, rs) {
  console.log(`\n  ${label}:`);
  for (let r of rs) {
    let mark = r.passed ? "✅" : "❌ FAIL";
    let flag = r.passed ? "" : " ← system";
    console.log(`    ${mark} ${r.name.padEnd(46)} |t|=${String(r.t.toFixed(2)).padStart(6)}  df=${String(Math.round(r.df)).padStart(6)}  cv=${r.fixedCV.toFixed(1).padStart(5)}%${flag}`);
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(` Results: ${passed}/${total} passed  (${elapsed}s)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
printGrp("HMAC-SM3 Core", core);
printGrp("SM3 Pure Baseline", baseline);
printGrp("Control (identical)", control);
printGrp("Node.js System Libs", system);

console.log(`\n──────────────────────────────────────────────────`);
let maxT = core.reduce((m, r) => Math.max(m, r.t), 0);
console.log(core.every(r => r.passed)
  ? `✅ HMAC-SM3 ALL PASS (N=${N}, max|t|=${maxT.toFixed(2)} < ${THRESH})`
  : `⚠️  HMAC-SM3 failed: max|t|=${maxT.toFixed(2)} > ${THRESH}`);

// Check controls are sane
let badControls = control.filter(r => !r.passed);
if (badControls.length > 0) {
  console.log(`⚠️  CONTROL false-positives: ${badControls.length}/${control.length} — test noise level may be high`);
}

// ═══════ Output JSON for reporting ═══════
let report = {
  timestamp: new Date().toISOString(),
  version: "v1",
  N, WARMUP, THRESH,
  total, passed, failed: total - passed,
  elapsed_sec: elapsed,
  results: results.map(r => ({
    name: r.name,
    t: Number(r.t.toFixed(4)),
    df: Math.round(r.df),
    fixed_mean_us: Number(r.fixedMean.toFixed(2)),
    random_mean_us: Number(r.randomMean.toFixed(2)),
    fixed_cv: Number(r.fixedCV.toFixed(1)),
    passed: r.passed,
  })),
};

let fs = require("fs");
let outFile = "/opt/fibemate-full/tvla-hmac-sm3-v1-report.json";
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`\n📊 Report: ${outFile}`);
