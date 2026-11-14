#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// scripts/check-metrics.cjs — N3 gate: numbers have one source (docs/metrics.json).
//
// What it does:
//   1. shape check   — every metric carries value + scope + date + command
//   2. recompute     — git-derived metrics are recomputed from the checkout and compared
//   3. retired text  — literals that are known to never have been true are rejected
//
// Exit codes: 0 pass · 1 drift/schema failure · 2 usage or IO failure.
//
// Why not recompute everything: TLA+ and Scorecard values are produced by external
// tools. The registry still requires a reproducible command for them, but the gate only
// verifies the four git-derived counters. Anything else would need a network or a JVM
// in every CI job, which buys less than it costs.

'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(ROOT, 'docs', 'metrics.json');

// Literals that were never a valid measurement and must not reappear (N3/N5).
// 101,467 is deliberately absent: it is a real historical TLA+ figure and stays in
// dated records; only the transposed 201,467 is banned outright.
// A file that documents the ban itself may opt out with the marker below, on its own
// line. The marker is meant for the annex and for this script, nothing else.
const RETIRED_LITERALS = ['201,467'];
const RETIRED_ALLOW_MARKER = 'metrics-gate:allow-retired';

function git(args, opts = {}) {
  return execFileSync('git', ['-C', ROOT, ...args], {
    maxBuffer: 256 * 1024 * 1024,
    encoding: opts.binary ? 'buffer' : 'utf8',
  });
}

function trackedFiles(pattern) {
  return git(['ls-files', pattern]).split('\n').filter(Boolean);
}

// One `git cat-file --batch` process instead of 600 `git show` calls.
function blobDigests(paths) {
  if (paths.length === 0) return new Set();
  const input = paths.map((p) => `HEAD:${p}`).join('\n') + '\n';
  const out = execFileSync('git', ['-C', ROOT, 'cat-file', '--batch'], {
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  const digests = new Set();
  let off = 0;
  for (let i = 0; i < paths.length; i += 1) {
    const nl = out.indexOf(0x0a, off);
    if (nl < 0) throw new Error('cat-file output truncated');
    const header = out.slice(off, nl).toString('utf8');
    const parts = header.split(' ');
    if (parts.length < 3) throw new Error(`cat-file: ${header}`);
    const size = Number(parts[2]);
    const body = out.slice(nl + 1, nl + 1 + size);
    if (body.length !== size) throw new Error('cat-file body truncated');
    digests.add(crypto.createHash('sha256').update(body).digest('hex'));
    off = nl + 1 + size + 1;
  }
  return digests;
}

function countUnique(pattern) {
  const files = trackedFiles(pattern);
  return { files: files.length, unique: blobDigests(files).size };
}

function loadRegistry() {
  let raw;
  try {
    raw = fs.readFileSync(REGISTRY, 'utf8');
  } catch (e) {
    throw new Error(`cannot read ${path.relative(ROOT, REGISTRY)}: ${e.message}`);
  }
  const doc = JSON.parse(raw);
  if (!doc.metrics || typeof doc.metrics !== 'object') {
    throw new Error('metrics.json: missing "metrics" object');
  }
  return doc;
}

function checkShape(doc) {
  const problems = [];
  for (const [name, m] of Object.entries(doc.metrics)) {
    if (typeof m.value !== 'number' || !Number.isFinite(m.value)) {
      problems.push(`${name}: value must be a finite number`);
    }
    for (const field of ['scope', 'date', 'command']) {
      if (typeof m[field] !== 'string' || m[field].trim() === '') {
        problems.push(`${name}: missing ${field}`);
      }
    }
    if (typeof m.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(m.date)) {
      problems.push(`${name}: date must be YYYY-MM-DD`);
    }
    if (typeof m.date === 'string' && m.date > new Date().toISOString().slice(0, 10)) {
      problems.push(`${name}: date ${m.date} is in the future`);
    }
  }
  return problems;
}

function checkRecomputed(doc) {
  const problems = [];
  const computed = {
    'tsr.files': () => countUnique('*.tsr').files,
    'tsr.uniqueTokens': () => countUnique('*.tsr').unique,
    'tsq.files': () => countUnique('*.tsq').files,
    'tsq.uniqueTokens': () => countUnique('*.tsq').unique,
  };
  for (const [name, fn] of Object.entries(computed)) {
    const entry = doc.metrics[name];
    if (!entry) {
      problems.push(`${name}: missing from registry (recompute=git requires an entry)`);
      continue;
    }
    const actual = fn();
    if (actual !== entry.value) {
      problems.push(`${name}: registry ${entry.value}, actual ${actual} (${entry.command})`);
    }
  }
  return problems;
}

function checkRetiredLiterals() {
  const problems = [];
  for (const literal of RETIRED_LITERALS) {
    let out = '';
    try {
      out = git(['grep', '-l', '-F', literal, '--', '.']);
    } catch (e) {
      // git grep exits 1 when there is no match — that is the passing case.
      if (e.status === 1) continue;
      throw e;
    }
    for (const f of out.split('\n').filter(Boolean)) {
      let body = '';
      try {
        body = fs.readFileSync(path.join(ROOT, f), 'utf8');
      } catch {
        body = git(['show', `HEAD:${f}`]);
      }
      if (body.includes(RETIRED_ALLOW_MARKER)) continue;
      problems.push(`${f}: contains retired literal ${literal}`);
    }
  }
  return problems;
}

function main() {
  const doc = loadRegistry();
  const problems = [
    ...checkShape(doc),
    ...checkRecomputed(doc),
    ...checkRetiredLiterals(),
  ];

  if (problems.length > 0) {
    console.error('METRICS GATE: FAIL');
    for (const p of problems) console.error(`  - ${p}`);
    console.error(`\nRegistry: ${path.relative(ROOT, REGISTRY)} (updated ${doc.updated})`);
    process.exit(1);
  }

  const names = Object.keys(doc.metrics);
  console.log(`METRICS GATE: PASS (${names.length} entries, ${names.filter((n) => doc.metrics[n].recompute === 'git').length} recomputed)`);
}

try {
  main();
} catch (e) {
  console.error(`METRICS GATE: ERROR — ${e.message}`);
  process.exit(2);
}
