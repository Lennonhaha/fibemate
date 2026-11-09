#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Runs the suites that touch the server and the crypto layer under one V8
 * coverage session, then enforces the statement threshold.
 *
 * Each suite is a separate process; NODE_V8_COVERAGE makes every one of them
 * write into the same directory, so the report is a merge rather than four
 * unrelated numbers. Suites that spawn a server are run in-process for the same
 * reason: a killed child on Windows never flushes its coverage.
 *
 * Usage: npm run test:coverage
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SUITES = [
  'test-all.js',
  'http-integration.test.js',
  'crypto-boundaries.test.js',
  'server-lib-boundaries.test.js',
];

const THRESHOLDS = ['--lines', '80', '--statements', '80'];

const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-coverage-'));
const root = path.join(__dirname, '..');

function run(command, args, env, shell = false) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env,
    shell,
  });
}

for (const suite of SUITES) {
  const result = run(process.execPath, [path.join('test', suite)], {
    ...process.env,
    NODE_V8_COVERAGE: coverageDir,
    NODE_ENV: 'test',
    FIBEMATE_EXPERIMENTAL: '0',
  });
  if (result.status !== 0) {
    console.error(`\n[coverage] ${suite} failed, no report written`);
    process.exit(result.status || 1);
  }
}

let command = process.execPath;
let args = [];
let shell = false;
try {
  args = [require.resolve('c8/bin/c8.js', { paths: [root] })];
} catch (_) {
  command = 'npx';
  args = ['--yes', 'c8'];
  shell = true;
}

args.push(
  'report',
  '--temp-directory',
  coverageDir,
  '--reporter=text-summary',
  '--check-coverage',
  ...THRESHOLDS
);

const report = run(command, args, process.env, shell);
fs.rmSync(coverageDir, { recursive: true, force: true });
process.exit(report.status ?? 1);
