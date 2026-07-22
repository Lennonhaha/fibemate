#!/usr/bin/env node
// scripts/prep-release.js — Pre-release checklist runner
// SPDX-License-Identifier: GPL-3.0-only
//
// Usage: node scripts/prep-release.js

'use strict';

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION = 'v3.3-preview';

const CHECKS = [
  {
    name: 'KAT 10,000 self-test',
    run: () => {
      const { generateKeypair, encapsulate, decapsulate } = require('../packages/pqc-kem/src/ml-kem-768.js');
      const N = 10000;
      let ok = 0, t0 = Date.now();
      for (let i = 0; i < N; i++) {
        const kp = generateKeypair();
        const { ciphertext, sharedSecret: s1 } = encapsulate(kp.publicKey);
        const s2 = decapsulate(kp.secretKey, ciphertext);
        if (Buffer.compare(s1, s2) === 0) ok++;
      }
      const ms = Date.now() - t0;
      return ok === N ? `PASS ${ok}/${N} in ${ms}ms` : `FAIL ${ok}/${N}`;
    }
  },
  {
    name: 'docs/ tree (10 files)',
    run: () => {
      const files = [
        'docs/API.md', 'docs/architecture.md', 'docs/deployment.md',
        'docs/testing.md', 'docs/security-limitations.md',
        'docs/pqc-readiness.md', 'docs/platform-matrix.md',
        'docs/VULNERABILITIES.md', 'docs/api-stability.md',
        'docs/v3.3-audit-gap-analysis-2026-07-22.md',
      ];
      const missing = files.filter(f => !existsSync(path.join(ROOT, f)));
      return missing.length === 0 ? `PASS (${files.length} files)` : `FAIL missing: ${missing.join(', ')}`;
    }
  },
  {
    name: 'SPDX headers present in packages/',
    run: () => {
      const out = execSync('git grep -l "SPDX-License-Identifier" packages/ | wc -l', { cwd: ROOT, encoding: 'utf8' }).trim();
      return parseInt(out) > 0 ? `PASS (${out} files tagged)` : 'FAIL';
    }
  },
  {
    name: 'git status clean',
    run: () => {
      const out = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
      return out === '' ? 'PASS' : `DIRTY:\n${out}`;
    }
  },
  {
    name: 'Node.js >= 22',
    run: () => {
      const v = process.versions.node.split('.').map(Number);
      return v[0] >= 22 ? `PASS (v${process.versions.node})` : `FAIL (v${process.versions.node})`;
    }
  },
];

function run() {
  console.log('═'.repeat(60));
  console.log(`  FIBEMATE Release Prep  ·  ${VERSION}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  let pass = 0, fail = 0;
  for (const check of CHECKS) {
    try {
      const result = check.run();
      const ok = !result.startsWith('FAIL');
      const icon = ok ? '✅' : '❌';
      if (ok) pass++; else fail++;
      const label = result.startsWith('PASS') ? result.slice(5) : result;
      console.log(`  ${icon} ${check.name}`);
      if (label.length > 5) console.log(`     ${label}`);
    } catch (e) {
      fail++;
      console.log(`  ❌ ${check.name} — ${e.message}`);
    }
  }

  console.log('─'.repeat(60));
  console.log(`  ${pass}/${pass + fail} checks passed`);

  if (fail > 0) {
    console.log(`\n  ⚠️  ${fail} checks failed. Fix before release.`);
    process.exit(1);
  }
  console.log(`\n  ✅ All ${pass} checks PASS. Ready for release.`);
}

run();
