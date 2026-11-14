#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * check-deps.cjs — pre-test dependency guard
 *
 * Runs as npm's `pretest` / `pretest:coverage` hook. Its only job is to separate
 * "the environment was never installed" from "the suite failed", because those two
 * look identical from the outside: both end in a wall of MODULE_NOT_FOUND.
 *
 * Why not `npm ls`: it exits non-zero for extraneous packages, peer warnings and
 * unmet optional peers, so a healthy tree can trip it. This walks the declared
 * dependency list instead, which is deterministic and quiet.
 *
 * Cross-platform on purpose: the hook runs on Windows cmd and POSIX sh alike, so it
 * does no shell redirection and no `||` chains. Exit 1 with an actionable message.
 *
 * Usage: node scripts/check-deps.cjs
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (err) {
  console.error(`✗ cannot read ${pkgPath}: ${err.message}`);
  process.exit(1);
}

// Optional dependencies are expected to be absent on the wrong platform, so they are
// never a reason to block. Everything declared in dependencies/devDependencies is.
const optional = new Set(Object.keys(pkg.optionalDependencies || {}));
const declared = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
].filter((name) => !optional.has(name));

const modulesDir = path.join(root, 'node_modules');
if (!fs.existsSync(modulesDir)) {
  console.error('✗ node_modules/ is missing — dependencies were never installed.');
  console.error('  Run `npm ci` (or `npm install`) and try again.');
  process.exit(1);
}

const missing = declared.filter((name) => {
  const installed = path.join(modulesDir, ...name.split('/'));
  return !fs.existsSync(installed);
});

if (missing.length > 0) {
  console.error(`✗ ${missing.length} of ${declared.length} declared packages are not installed:`);
  for (const name of missing.slice(0, 20)) console.error(`    - ${name}`);
  if (missing.length > 20) console.error(`    ... and ${missing.length - 20} more`);
  console.error('  Run `npm ci` (or `npm install`) and try again.');
  console.error('  This is an environment problem, not a test failure.');
  process.exit(1);
}

console.log(`✓ dependencies present (${declared.length} declared, optional ignored)`);
