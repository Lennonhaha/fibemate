#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * TVLA summary - validate TVLA measurements against the 4.5 threshold.
 *
 * History: before 2026-11-15 this script scanned scripts/tvla/*.{txt,log,md,js}
 * for "|t| = N" and passed on a single archived sample sitting exactly on the
 * 4.5 line, while the live timing test leaked at |t| = 58-86 (issue #510). Two
 * things were wrong and are fixed here:
 *
 *   1. a file with too few samples cannot pass - it has to be INSUFFICIENT
 *   2. the scanned set is reported honestly: skipped files and total samples
 *
 * Live measurements are fed in with --include (see scripts/tvla-live-gate.cjs),
 * so the gate always sees the code in this checkout, not just old text files.
 *
 * Usage:
 *   node scripts/tvla-summary.js
 *   node scripts/tvla-summary.js --warn
 *   node scripts/tvla-summary.js --min-samples=100 --allow-leak=NTT \
 *        --include="$RUNNER_TEMP/live-tvla.json"
 *
 * Exit codes: 0 all good / 1 threshold breach or insufficient evidence / 2 usage
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TVLA_DIR = path.join(__dirname, 'tvla');
const THRESHOLD = 4.5;

function parseArgs(argv) {
  const opts = {
    strict: !argv.includes('--warn'),
    minSamples: 10,
    allow: ['NTT'],
    include: [],
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--warn') opts.strict = false;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--min-samples=')) opts.minSamples = Number(arg.slice('--min-samples='.length));
    else if (arg.startsWith('--allow-leak=')) {
      opts.allow = arg.slice('--allow-leak='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--include=')) opts.include.push(arg.slice('--include='.length));
    else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.minSamples) || opts.minSamples < 1) {
    console.error('--min-samples must be a positive number');
    process.exit(2);
  }
  return opts;
}

function recordsFromText(content) {
  const out = [];
  for (const m of content.matchAll(/\|t\|\s*=\s*([\d.]+)/gi)) {
    const t = parseFloat(m[1]);
    if (!Number.isNaN(t)) out.push({ name: null, t, samples: null });
  }
  // A text scan cannot know the sample count. Treat the number of extracted
  // values as the evidence count: one number in a file is one number.
  for (const rec of out) rec.samples = out.length;
  return out;
}

function recordsFromJson(content, label) {
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    return null;
  }
  if (!data || !Array.isArray(data.tests)) return null;
  return data.tests.map((t) => ({
    name: t.name ? `${label}:${t.name}` : label,
    t: Number(t.t),
    samples: Number.isFinite(Number(t.samples)) ? Number(t.samples) : null,
    // tvla-live-gate reports already carry a verdict (they know about the
    // allowlist and the noise band). Trust it instead of re-judging at 4.5,
    // otherwise the summary turns every gate WARN into a FAIL.
    status: t.status || null,
  }));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('node scripts/tvla-summary.js [--warn] [--min-samples=N] [--allow-leak=NAME,...] [--include=<file>]');
    return 0;
  }

  const allow = new Set(opts.allow);
  const records = [];
  let filesChecked = 0;
  let skipped = 0;

  console.log('TVLA Summary Check\n');
  console.log(`  Directory: ${TVLA_DIR}`);
  console.log(`  Threshold: |t| < ${THRESHOLD}`);
  console.log(`  Min samples per file: ${opts.minSamples}`);
  console.log(`  Allowlisted leaks: ${opts.allow.length ? opts.allow.join(', ') : '(none)'}`);
  console.log(`  Mode: ${opts.strict ? 'STRICT (fail on breach or thin evidence)' : 'WARN (report only)'}\n`);

  let entries = [];
  try {
    entries = fs.readdirSync(TVLA_DIR).sort();
  } catch (err) {
    console.error(`  Error reading TVLA directory: ${err.message}`);
    if (opts.strict) process.exit(1);
    return 0;
  }

  const scanned = [];
  for (const entry of entries) {
    const full = path.join(TVLA_DIR, entry);
    try {
      if (!fs.statSync(full).isFile()) continue;
    } catch (err) {
      continue;
    }
    // Only result-bearing files. .js files are sources and used to inflate the
    // "files checked" count while contributing nothing.
    if (!/\.(txt|log|md)$/i.test(entry)) continue;
    scanned.push(full);
  }

  for (const file of scanned) {
    const name = path.basename(file);
    const recs = recordsFromText(fs.readFileSync(file, 'utf8'));
    if (recs.length === 0) {
      console.log(`  SKIP ${name}: no |t| values found`);
      skipped++;
      continue;
    }
    filesChecked++;
    console.log(`  ${name}: ${recs.length} sample(s)`);
    for (const rec of recs) records.push({ label: name, ...rec });
  }

  for (const file of opts.include) {
    const name = path.basename(file);
    if (!fs.existsSync(file)) {
      console.log(`  MISSING ${file}`);
      records.push({ label: file, name: null, t: NaN, samples: 0, missing: true });
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    const recs = /\.json$/i.test(file) ? recordsFromJson(content, name) : recordsFromText(content);
    if (recs === null) {
      console.log(`  SKIP ${name}: not a TVLA report`);
      skipped++;
      continue;
    }
    if (recs.length === 0) {
      console.log(`  SKIP ${name}: no |t| values found`);
      skipped++;
      continue;
    }
    filesChecked++;
    console.log(`  ${name}: ${recs.length} test(s) [included]`);
    for (const rec of recs) records.push({ label: name, ...rec });
  }

  let passed = 0;
  let expected = 0;
  let warned = 0;
  let failed = 0;
  let insufficient = 0;
  let totalSamples = 0;

  for (const rec of records) {
    const label = rec.name || rec.label;
    if (rec.missing || Number.isNaN(rec.t)) {
      console.log(`  FAIL ${label}: unreadable report`);
      failed++;
      continue;
    }
    const samples = rec.samples === null ? 0 : rec.samples;
    totalSamples += samples;
    if (samples < opts.minSamples) {
      console.log(`  INSUFFICIENT ${label}: ${samples} sample(s), need >= ${opts.minSamples} (a thin sample cannot clear a gate)`);
      insufficient++;
      continue;
    }
    const breaches = rec.t > THRESHOLD;
    const allowlisted = allow.has(label) || allow.has(String(label).split(':').pop());
    if (rec.status === 'new-leak') {
      console.log(`  FAIL ${label}: |t|= ${rec.t.toFixed(2)} > ${THRESHOLD} (${samples} samples)`);
      failed++;
    } else if (rec.status === 'expected-leak' || (rec.status === null && breaches && allowlisted)) {
      console.log(`  EXPECTED ${label}: |t|= ${rec.t.toFixed(2)} (${samples} samples) - declared in docs/security-limitations.md`);
      expected++;
    } else if (rec.status === 'warn' || rec.status === 'ok-improved') {
      console.log(`  WARN ${label}: |t|= ${rec.t.toFixed(2)} (${samples} samples) - reported by the live gate, not failing`);
      warned++;
    } else if (!breaches) {
      console.log(`  PASS ${label}: |t|= ${rec.t.toFixed(2)} (${samples} samples)`);
      passed++;
    } else {
      console.log(`  FAIL ${label}: |t|= ${rec.t.toFixed(2)} > ${THRESHOLD} (${samples} samples)`);
      failed++;
    }
  }

  console.log(`\n  Summary: ${passed} passed, ${expected} expected, ${warned} warned, ${failed} failed, ${insufficient} insufficient (${filesChecked} files checked, ${skipped} skipped, ${totalSamples} samples)`);

  if (filesChecked === 0) {
    console.error('\nTVLA SUMMARY: NO EVIDENCE - nothing measured. Pass --include=<live report>.');
    return opts.strict ? 1 : 0;
  }

  if (failed > 0 || insufficient > 0) {
    console.error(`\nTVLA SUMMARY: ${failed > 0 ? 'THRESHOLD BREACHED' : ''}${failed > 0 && insufficient > 0 ? ' AND ' : ''}${insufficient > 0 ? 'INSUFFICIENT EVIDENCE' : ''}`);
    return opts.strict ? 1 : 0;
  }

  console.log('TVLA SUMMARY PASSED');
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { parseArgs, recordsFromText, recordsFromJson };
