#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
'use strict';

/**
 * Fail a workflow when a job it depends on did not succeed.
 *
 * GitHub treats a `skipped` required check as a pass, and only blocks on
 * `cancelled` when that exact context is required. Neither is visible in the
 * PR view: on 2026-11-25, PR #703 merged with
 * `node-test (macos-latest, 22) = CANCELLED` and `mergeStateStatus=UNSTABLE`,
 * because none of the matrix legs was a required context.
 *
 * This turns "did it actually run?" into an explicit verdict over `needs`:
 *
 *   failure | timed_out  -> fail, always
 *   cancelled            -> fail, always
 *   skipped              -> fail only when the job is in MUST_RUN
 *   success | neutral    -> ok
 *
 * `skipped` cannot be a blanket failure: jobs gated on path filters
 * legitimately skip (mlkem-kat and fml-dsa-kat both did on #703), and turning
 * that into a red build would freeze every PR that does not touch the
 * relevant paths. MUST_RUN is the list that must run on every pull request
 * regardless of paths.
 *
 * Input: NEEDS_JSON env var, as produced by `toJSON(needs)`.
 * Usage: node scripts/check-needed-results.cjs [--json]
 * Exit: 0 ok, 1 something did not run or did not pass, 2 bad input.
 */

const MUST_RUN = new Set(['lint', 'bench', 'sbom', 'bom-check', 'docs-check']);
const BAD = new Set(['failure', 'cancelled', 'timed_out']);

function classify(results) {
  const rows = [];
  const failures = [];
  for (const [job, info] of Object.entries(results)) {
    const result = String((info && info.result) || 'unknown');
    let verdict;
    if (BAD.has(result)) verdict = 'BLOCKED';
    else if (result === 'skipped') verdict = MUST_RUN.has(job) ? 'BLOCKED' : 'allowed-skip';
    else if (result === 'success' || result === 'neutral') verdict = 'ok';
    else verdict = 'BLOCKED';
    rows.push({ job, result, verdict });
    if (verdict === 'BLOCKED') failures.push({ job, result });
  }
  return { rows, failures };
}

function main() {
  const asJson = process.argv.includes('--json');
  const raw = process.env.NEEDS_JSON;
  if (!raw) {
    process.stderr.write('FAILED: NEEDS_JSON is empty; the job must run with if: always() and pass toJSON(needs)\n');
    process.exit(2);
  }
  let results;
  try {
    results = JSON.parse(raw);
  } catch (err) {
    process.stderr.write('FAILED: NEEDS_JSON is not valid JSON: ' + err.message + '\n');
    process.exit(2);
  }
  if (!results || typeof results !== 'object' || Array.isArray(results) || Object.keys(results).length === 0) {
    process.stderr.write('FAILED: NEEDS_JSON parsed to no jobs; refusing to report a verdict over nothing\n');
    process.exit(2);
  }

  const { rows, failures } = classify(results);

  if (asJson) {
    process.stdout.write(JSON.stringify({ rows, failures }, null, 2) + '\n');
  } else {
    for (const r of rows) {
      const mark = r.verdict === 'BLOCKED' ? 'BLOCK' : r.verdict === 'allowed-skip' ? '  skip' : '    ok';
      process.stdout.write(mark + '  ' + r.job + '  ' + r.result + '\n');
    }
    const allowed = rows.filter((r) => r.verdict === 'allowed-skip').map((r) => r.job);
    if (allowed.length) {
      process.stdout.write('note: path-filtered skip, not a failure: ' + allowed.join(', ') + '\n');
    }
    process.stdout.write(
      failures.length
        ? 'RESULT: ' + failures.length + ' job(s) did not run or did not pass\n'
        : 'RESULT: every needed job ran and passed (' + rows.length + ' checked)\n'
    );
  }

  process.exit(failures.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { classify, MUST_RUN };
