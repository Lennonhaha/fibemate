#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// Report how much of this repository's claim surface is machine-bound, and fail
// when a declared contract points at a check that CI does not actually run.
//
// Two numbers, deliberately never merged into one ratio:
//
//   contracts   the declared assertions we promise to keep true. Each one must
//               name a script AND the CI job whose run: block invokes it.
//               This is the gate metric: must contracts must be 100% bound.
//
//   corpus      every line in the documentation that carries a witness a machine
//               could compare against (see inventory.cjs). This is context, not
//               coverage: one contract can cover a thousand lines, and a thousand
//               bound lines do not make one contract.
//
// Merging them into "24/2027 bound" would read as a coverage collapse and would
// be wrong in both directions.
//
// Usage:
//   node scripts/claims/coverage.cjs              # gate (exit 1 on bad binding)
//   node scripts/claims/coverage.cjs --json       # machine-readable
//   node scripts/claims/coverage.cjs --self-test  # prove the gate can fail
//
// Exit: 0 ok, 1 a contract is unbound or its check is not run by CI, 2 bad input.

'use strict';

const fs = require('fs');
const path = require('path');
const { inventory } = require('./inventory.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY = path.join(ROOT, 'docs', 'claims', 'registry.json');
const BACKLOG_BUDGET = 12;

function readRegistry(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.contracts)) throw new Error('registry: contracts[] missing');
  if (!Array.isArray(data.backlog)) throw new Error('registry: backlog[] missing');
  return data;
}

// Split a workflow into job blocks by column-0 `  name:` headers at two spaces.
function jobBlocks(workflowFile) {
  const text = fs.readFileSync(workflowFile, 'utf8');
  const lines = text.split('\n');
  const blocks = new Map();
  let current = null;
  let buf = [];
  const flush = () => {
    if (current) blocks.set(current, buf.join('\n'));
    buf = [];
  };
  for (const line of lines) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) {
      flush();
      current = m[1];
      continue;
    }
    if (current) buf.push(line);
  }
  flush();
  return blocks;
}

// Does this job's run: text mention the script at all?
function jobRuns(jobText, scriptRel) {
  const base = path.basename(scriptRel);
  return jobText.includes(scriptRel) || jobText.includes(base);
}

function validateContract(contract, blocks) {
  const problems = [];
  const b = contract.binding || {};
  if (!b.script || !b.workflow || !b.job) {
    problems.push('no binding (script/workflow/job)');
    return problems;
  }
  const abs = (rel) => (path.isAbsolute(rel) ? rel : path.join(ROOT, rel));
  const scriptPath = abs(b.script);
  if (!fs.existsSync(scriptPath)) problems.push(`script missing: ${b.script}`);
  const workflowPath = abs(b.workflow);
  if (!fs.existsSync(workflowPath)) {
    problems.push(`workflow missing: ${b.workflow}`);
    return problems;
  }
  const blocksForFile = blocks.get(workflowPath) || jobBlocks(workflowPath);
  blocks.set(workflowPath, blocksForFile);
  const jobText = blocksForFile.get(b.job);
  if (!jobText) {
    problems.push(`no job "${b.job}" in ${b.workflow}`);
    return problems;
  }
  if (!jobRuns(jobText, b.script)) {
    problems.push(`job "${b.job}" does not run ${b.script}`);
  }
  return problems;
}

function evaluate(registry, corpus, blocks) {
  const rows = [];
  for (const c of registry.contracts) {
    const tier = c.tier || 'must';
    const problems = tier === 'must' ? validateContract(c, blocks) : [];
    rows.push({ id: c.id, tier, statement: c.statement, binding: c.binding || null, problems });
  }
  const must = rows.filter((r) => r.tier === 'must');
  const sampled = rows.filter((r) => r.tier !== 'must');
  const mustBad = must.filter((r) => r.problems.length);
  const backlog = registry.backlog || [];
  const backlogBound = backlog.filter((b) =>
    rows.some((r) => r.id === b.id || (b.binding && r.binding && r.binding.script === b.binding.script)));
  const failures = [];
  for (const r of mustBad) failures.push(`unbound must contract ${r.id}: ${r.problems.join('; ')}`);
  for (const b of backlogBound) failures.push(`backlog entry ${b.id} is already bound; move it into contracts`);
  if (backlog.length > BACKLOG_BUDGET) {
    failures.push(`backlog grew to ${backlog.length} (budget ${BACKLOG_BUDGET}); bind or retire some`);
  }
  return {
    rows,
    mustTotal: must.length,
    mustBound: must.length - mustBad.length,
    sampledTotal: sampled.length,
    sampledBound: sampled.length - sampled.filter((r) => r.problems.length).length,
    backlog,
    corpus,
    failures,
  };
}

function report(result) {
  const pct = (a, b) => (b === 0 ? 'n/a' : `${Math.round((a / b) * 1000) / 10}%`);
  console.log(
    `[claim-coverage] contracts: ${result.mustBound}/${result.mustTotal} bound (must ${result.mustBound}/${result.mustTotal}, ${pct(result.mustBound, result.mustTotal)})` +
      (result.sampledTotal ? ` + sampled ${result.sampledBound}/${result.sampledTotal}` : ''),
  );
  console.log(
    `[claim-coverage] backlog (visible, not gated): ${result.backlog.length} unbound must-bind statements`,
  );
  for (const b of result.backlog) console.log(`    - ${b.id}: ${b.statement}`);
  console.log(
    `[claim-coverage] corpus context: ${result.corpus.count.toLocaleString('en-US')} claim lines in ${result.corpus.files} files; a contract is one assertion, not one line`,
  );
  if (result.failures.length === 0) {
    console.log('[claim-coverage] OK');
    return;
  }
  for (const f of result.failures) console.error(`[claim-coverage] FAIL ${f}`);
}

function run() {
  const registry = readRegistry(REGISTRY);
  const rows = inventory();
  const corpus = { count: rows.length, files: new Set(rows.map((r) => r.file)).size };
  const result = evaluate(registry, corpus, new Map());
  report(result);
  process.exitCode = result.failures.length ? 1 : 0;
  return result;
}

// ── self-test ──────────────────────────────────────────────────────────────
// Proves the gate fails for the two ways a binding can lie: no binding at all,
// and a binding whose script exists but is not in any CI run: block.
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claim-cov-'));
  const wf = path.join(tmp, 'ci.yml');
  fs.writeFileSync(
    wf,
    ['name: CI', 'jobs:', '  good-job:', '    runs-on: ubuntu-latest', '    steps:', '      - run: node scripts/claims/inventory.cjs', '  other-job:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo hi', ''].join('\n'),
    'utf8',
  );
  const blocks = new Map();
  blocks.set(wf, jobBlocks(wf));
  const corpus = { count: 0, files: 0 };

  const cases = [];
  const run1 = evaluate(
    { contracts: [{ id: 'ok', tier: 'must', statement: 's', binding: { script: 'scripts/claims/inventory.cjs', workflow: wf, job: 'good-job' } }], backlog: [] },
    corpus,
    new Map(blocks),
  );
  cases.push(['healthy contract passes', run1.failures.length === 0]);

  const run2 = evaluate(
    { contracts: [{ id: 'unbound', tier: 'must', statement: 's', binding: null }], backlog: [] },
    corpus,
    new Map(blocks),
  );
  cases.push(['unbound must contract fails', run2.failures.some((f) => f.includes('unbound must contract'))]);

  const run3 = evaluate(
    { contracts: [{ id: 'not-in-ci', tier: 'must', statement: 's', binding: { script: 'scripts/claims/inventory.cjs', workflow: wf, job: 'other-job' } }], backlog: [] },
    corpus,
    new Map(blocks),
  );
  cases.push(['script outside the CI run block fails', run3.failures.some((f) => f.includes('does not run'))]);

  const run4 = evaluate(
    { contracts: [], backlog: Array.from({ length: 13 }, (_, i) => ({ id: 'b' + i, statement: 's' })) },
    corpus,
    new Map(blocks),
  );
  cases.push(['backlog over budget fails', run4.failures.some((f) => f.includes('backlog grew'))]);

  let ok = true;
  for (const [name, pass] of cases) {
    console.log(`${pass ? 'ok  ' : 'FAIL'} self-test: ${name}`);
    if (!pass) ok = false;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!ok) process.exitCode = 1;
  else console.log('self-test: pass (4 cases)');
}

if (process.argv.includes('--self-test')) selfTest();
else if (process.argv.includes('--json')) {
  const r = run();
  process.stdout.write(JSON.stringify(r, null, 1) + '\n');
} else run();
