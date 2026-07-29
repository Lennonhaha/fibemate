#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * TVLA Summary — validate existing TVLA reports against thresholds
 *
 * Scans scripts/tvla/ for gradient results and checks |t| < 4.5 threshold.
 * Nightly Phase 2: strict mode (fail if any test exceeds threshold).
 *
 * Usage:
 *   node scripts/tvla-summary.js       # strict (exit 1 on threshold breach)
 *   node scripts/tvla-summary.js --warn # warn only (always exit 0)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TVLA_DIR = path.join(__dirname, 'tvla');
const TVLA_THRESHOLD = 4.5; // standard TVLA |t| threshold
const STRICT = !process.argv.includes('--warn');

let filesChecked = 0;
let testsPassed = 0;
let testsWarned = 0;
let testsFailed = 0;

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(filePath);
  filesChecked++;

  // Extract |t| values from gradient results
  const tValues = [];
  const matches = content.matchAll(/\|t\|\s*=\s*([\d.]+)/gi);
  for (const m of matches) {
    const val = parseFloat(m[1]);
    if (!isNaN(val)) tValues.push(val);
  }

  if (tValues.length === 0) {
    // No |t| values found — might be a raw data file
    console.log(`  SKIP ${name}: no |t| values found`);
    return;
  }

  const maxT = Math.max(...tValues);
  const status = maxT > TVLA_THRESHOLD ? 'FAIL' : 'PASS';

  console.log(`  ${status === 'PASS' ? '✓' : '✗'} ${name}: max|t|= ${maxT.toFixed(2)} (threshold=${TVLA_THRESHOLD}, ${tValues.length} samples)`);

  if (maxT > TVLA_THRESHOLD) {
    if (STRICT) testsFailed++;
    else testsWarned++;
  } else {
    testsPassed++;
  }
}

function scan() {
  console.log('TVLA Summary Check\n');
  console.log(`  Directory: ${TVLA_DIR}`);
  console.log(`  Threshold: |t| < ${TVLA_THRESHOLD}`);
  console.log(`  Mode: ${STRICT ? 'STRICT (fail on breach)' : 'WARN (report only)'}\n`);

  try {
    const entries = fs.readdirSync(TVLA_DIR);
    for (const entry of entries.sort()) {
      const fullPath = path.join(TVLA_DIR, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && /\.(txt|log|md|js)$/i.test(entry)) {
        checkFile(fullPath);
      }
    }
  } catch (err) {
    console.error(`  Error reading TVLA directory: ${err.message}`);
    if (STRICT) process.exit(1);
    return;
  }

  console.log(`\n  Summary: ${testsPassed} passed, ${testsWarned} warned, ${testsFailed} failed (${filesChecked} files checked)`);

  if (testsFailed > 0) {
    console.error('\nTVLA SUMMARY: THRESHOLD BREACHED');
    process.exit(1);
  }

  console.log('TVLA SUMMARY PASSED');
}

scan();
