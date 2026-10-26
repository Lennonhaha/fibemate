// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 FIBEMATE Contributors
/*
 * Build-level controls for two defects:
 *   #344  native randombytes must fail closed (no key from an unwritten buffer)
 *   #343  poly/polyvec parameter guards must reject unsupported configurations
 *
 * Both defects are invisible to a green build: the first only appears when the
 * CSPRNG fails, the second only when a non-ML-KEM-768 parameter set is compiled.
 * So each control is a mutation check: the assertion is only trusted if the
 * same command also succeeds on the healthy configuration.
 *
 * Usage: node scripts/test-native-guards.cjs [--cc gcc]
 * Exit:  0 all controls pass | 1 a control failed | 2 toolchain missing
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const nativeDir = path.join(repoRoot, 'packages', 'pqc-kem', 'native');
const testDir = path.join(nativeDir, 'test');

function findCc() {
  const explicit = process.argv.indexOf('--cc');
  const candidates = [
    explicit > -1 ? process.argv[explicit + 1] : null,
    process.env.CC,
    'gcc',
    'clang',
    'cc',
  ].filter(Boolean);
  for (const cc of candidates) {
    const r = spawnSync(cc, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return cc;
  }
  return null;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

function build(outFile, sources, extraArgs) {
  const args = ['-std=c11', '-O1', '-o', outFile, ...sources, '-I', nativeDir, ...extraArgs];
  return spawnSync(cc, args, { encoding: 'utf8' });
}

const cc = findCc();
if (!cc) {
  console.error('SKIP: no C toolchain found (set CC or pass --cc)');
  process.exit(2);
}
console.log(`toolchain: ${cc}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-guards-'));
const kyberSources = [
  'cbd.c', 'fips202.c', 'indcpa.c', 'kem.c', 'ntt.c',
  'poly.c', 'polyvec.c', 'randombytes.c', 'reduce.c',
  'symmetric-shake.c', 'verify.c',
].map((f) => path.join(nativeDir, f));

// ---- Control 1: #344 fail-closed RNG -------------------------------------
{
  const exe = path.join(tmp, process.platform === 'win32' ? 'rng_failclosed.exe' : 'rng_failclosed');
  const ctrlSource = path.join(testDir, 'rng_failclosed_test.c');
  const buildArgs = ['-DFIBEMATE_RNG_FAULT_INJECT'];
  if (process.platform === 'win32') buildArgs.push('-lbcrypt');

  const b = build(exe, [...kyberSources, ctrlSource], buildArgs);
  if (b.status !== 0) {
    record('#344 builds with fault injection', false, (b.stderr || '').split('\n').slice(0, 3).join(' '));
  } else {
    record('#344 builds with fault injection', true);
    const run = spawnSync(exe, [], { encoding: 'utf8' });
    const out = `${run.stdout || ''}${run.stderr || ''}`.trim();
    record('#344 fails closed on CSPRNG failure', run.status === 0, out.split('\n').slice(-1)[0]);
    if (run.status === 0 && !/PASS: 4 failure-path assertions \+ 2 controls/.test(out)) {
      record('#344 control reports its assertion count', false, 'unexpected output shape');
    }
  }
}

// ---- Control 2: #343 parameter guards ------------------------------------
function guardControl(label, sourceFile, macroLine, badValue, expectedError) {
  const caseDir = fs.mkdtempSync(path.join(tmp, 'guard-'));
  const header = fs.readFileSync(path.join(nativeDir, 'params.h'), 'utf8');
  if (!header.includes(macroLine)) {
    record(`${label} fixture is current`, false, `params.h no longer contains "${macroLine}"`);
    return;
  }
  // Copy every header: poly.h/polyvec.h include "params.h" themselves, so a
  // single overridden copy next to the source is not enough — the second
  // include would resolve back to the pristine tree and redefine the macro.
  for (const f of fs.readdirSync(nativeDir)) {
    if (f.endsWith('.h')) fs.copyFileSync(path.join(nativeDir, f), path.join(caseDir, f));
  }
  fs.writeFileSync(path.join(caseDir, 'params.h'), header.replace(macroLine, badValue), 'utf8');
  fs.copyFileSync(path.join(nativeDir, sourceFile), path.join(caseDir, sourceFile));

  // Mutation: a bad parameter set must be rejected by the compiler.
  const bad = spawnSync(cc, ['-std=c11', '-fsyntax-only', '-I', nativeDir, '-I', caseDir,
    path.join(caseDir, sourceFile)], { encoding: 'utf8' });
  const badMsg = `${bad.stderr || ''}`;
  const rejected = bad.status !== 0 && badMsg.includes(expectedError);
  record(`${label} rejects unsupported parameters`, rejected,
    bad.status === 0 ? 'compiled without a diagnostic' : expectedError);

  // Positive control: the pristine tree must still compile.
  const good = spawnSync(cc, ['-std=c11', '-fsyntax-only', '-I', nativeDir,
    path.join(nativeDir, sourceFile)], { encoding: 'utf8' });
  record(`${label} compiles with ML-KEM-768 parameters`, good.status === 0,
    good.status === 0 ? '' : (good.stderr || '').split('\n')[0]);
}

guardControl('#343 poly.c', 'poly.c',
  '#define KYBER_POLYCOMPRESSEDBYTES     128',
  '#define KYBER_POLYCOMPRESSEDBYTES     96',
  'KYBER_POLYCOMPRESSEDBYTES needs to be in {128, 160}');

guardControl('#343 polyvec.c', 'polyvec.c',
  '#define KYBER_POLYVECCOMPRESSEDBYTES  (KYBER_K * 320)',
  '#define KYBER_POLYVECCOMPRESSEDBYTES  (KYBER_K * 384)',
  'KYBER_POLYVECCOMPRESSEDBYTES needs to be in {320*KYBER_K, 352*KYBER_K}');

fs.rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controls passed`);
if (failed.length) {
  console.error(`FAILED: ${failed.map((f) => f.name).join('; ')}`);
  process.exit(1);
}
