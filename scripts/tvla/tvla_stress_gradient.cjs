// SPDX-License-Identifier: GPL-3.0-only
/**
 * SM2 TVLA Stress-Gradient Scanner
 * Runs Welch's t-test at progressive N, analyzes |t| vs √N trend.
 * Usage: node scripts/tvla/tvla_stress_gradient.cjs
 */
"use strict";
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const SCRIPT = path.join(__dirname, "tvla_sm2_v3_masked.js");
const SIZES = [500, 2000, 5000];
const THRESH = 4.5;

function parseResults(stdout) {
  const lines = stdout.split(/\r?\n/);
  const results = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes("Results:")) { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.trim()) continue;
    // "  PASS  [BigInt] genKey        |t|=  1.20  fix=    2467us  rnd=    2450us"
    const m = line.match(/^(PASS|FAIL)\s+(.+?)\s{2,}\|t\|=\s*([\d.]+)\s+fix=\s*([\d.]+)us\s+rnd=\s*([\d.]+)us/);
    if (m) {
      results.push({ name: m[2].trim(), passed: m[1] === "PASS", t: parseFloat(m[3]),
        fix_us: parseFloat(m[4]), rnd_us: parseFloat(m[5]) });
    }
  }
  return results;
}

function analyzeTrend(tVals, sizes) {
  const roots = sizes.map(Math.sqrt), n = sizes.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) { sx += roots[i]; sy += tVals[i]; sxy += roots[i] * tVals[i]; sx2 += roots[i] * roots[i]; }
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  const intercept = (sy - slope * sx) / n;
  let ssr = 0, sst = 0; const ym = sy / n;
  for (let i = 0; i < n; i++) { const p = intercept + slope * roots[i]; ssr += (tVals[i] - p) ** 2; sst += (tVals[i] - ym) ** 2; }
  const r2 = sst > 0 ? 1 - ssr / sst : 0;
  let crossN = null;
  if (slope > 0) { const rc = (THRESH - intercept) / slope; if (rc > 0) crossN = Math.round(rc ** 2); }
  let cls;
  if (r2 < 0.3) cls = "noise   ";
  else if (slope < 0.05) cls = "clean   ";
  else if (slope < 0.2) cls = "marginal";
  else if (slope < 1.0) cls = "suspicious";
  else cls = "⚠ LEAK  ";
  return { slope, intercept, r2, crossN, cls };
}

// ─── Main ───
const allData = {};

for (const N of SIZES) {
  process.stderr.write(`── N=${N} `);
  const t0 = Date.now();
  const out = execSync(`node "${SCRIPT}" ${N}`, {
    cwd: path.dirname(SCRIPT),
    encoding: "utf8",
    timeout: 600_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const r = parseResults(out);
  for (const x of r) {
    if (!allData[x.name]) allData[x.name] = [];
    allData[x.name].push({ N, t: x.t, passed: x.passed });
  }
  process.stderr.write(`${r.length} ops  ${((Date.now()-t0)/1000).toFixed(0)}s\n`);
}

// Trend & display
console.log("\n" + "=".repeat(68));
console.log("  SM2 TVLA Stress-Gradient  |  N=[ " + SIZES.join(" ") + " ]  |  |t|≤" + THRESH);
console.log("=".repeat(68));

for (const [op, series] of Object.entries(allData)) {
  const tVals = series.map(s => s.t);
  const trend = analyzeTrend(tVals, SIZES);
  console.log(`\n█ ${op}`);
  for (let i = 0; i < SIZES.length; i++) {
    const bar = "█".repeat(Math.min(40, Math.round(tVals[i] * 5)));
    console.log(`  N=${String(SIZES[i]).padStart(5)}  |t|=${tVals[i].toFixed(2).padStart(6)}  ${tVals[i] > THRESH ? "❌" : "✅"} ${bar}`);
  }
  const ic = trend.cls.includes("LEAK") ? "❌" : trend.cls.includes("suspicious") ? "⚠️" : "✅";
  console.log(`  β=${trend.slope.toFixed(4)}  R²=${trend.r2.toFixed(3)}  → ${ic} ${trend.cls}`);
  if (trend.crossN) console.log(`  ⚠ threshold crosses at N≈${trend.crossN}`);
  if (Math.max(...tVals) > THRESH) console.log(`  ❌ max|t|=${Math.max(...tVals).toFixed(2)} > ${THRESH}`);
}

// Summary
let clean = 0, susp = 0;
for (const [, s] of Object.entries(allData)) {
  const cls = analyzeTrend(s.map(x => x.t), SIZES).cls;
  if (cls.includes("clean") || cls.includes("noise")) clean++;
  else susp++;
}
console.log(`\n${"=".repeat(68)}`);
console.log(`  ${clean} clean/${Object.keys(allData).length - clean} suspicious  |  ${clean === Object.keys(allData).length ? "✅ ALL CLEAN" : "⚠ NEEDS REVIEW"}`);
console.log("=".repeat(68));
