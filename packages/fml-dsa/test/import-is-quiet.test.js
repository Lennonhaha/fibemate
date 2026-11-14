// SPDX-License-Identifier: GPL-3.0-only
// packages/fml-dsa/test/import-is-quiet.test.js
//
// Issue #476: importing the package printed ~45 self-test lines. The self-tests
// must keep running (they catch real defects at load time) and must keep throwing
// on failure; only the success chatter had to go.
//
// These tests pin both halves, because "quiet" is trivially achievable by not
// running the tests at all, and that would be a much worse package.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// Windows: import() of a bare absolute path fails with ERR_UNSUPPORTED_ESM_URL_SCHEME,
// so the child process gets a file:// URL.
const entry = pathToFileURL(resolve(here, '..', 'src', 'index.js')).href;

function importInChild(env) {
  const code = `import(${JSON.stringify(entry)}).then((m) => { if (Object.keys(m).length < 4) process.exit(3); })`;
  const base = { ...process.env };
  delete base.FML_DSA_SELFTEST;
  delete base.NODE_ENV;
  try {
    const out = execFileSync(process.execPath, ['-e', code], {
      encoding: 'utf8',
      env: { ...base, ...env },
    });
    return { ok: true, stdout: out };
  } catch (e) {
    return { ok: false, stdout: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

test('importing the package writes nothing to stdout by default', () => {
  const r = importInChild({});
  assert.equal(r.ok, true, 'import must still succeed');
  assert.equal(r.stdout, '', `expected no output, got:\n${r.stdout.slice(0, 400)}`);
});

test('FML_DSA_SELFTEST=1 restores the full transcript', () => {
  const r = importInChild({ FML_DSA_SELFTEST: '1' });
  assert.equal(r.ok, true);
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  assert.ok(lines.length > 20, `expected the transcript back, got ${lines.length} line(s)`);
});

test('NODE_ENV=test also restores the transcript', () => {
  const r = importInChild({ NODE_ENV: 'test' });
  assert.equal(r.ok, true);
  assert.ok(r.stdout.trim().split('\n').filter(Boolean).length > 20);
});

test('failure lines print even when the transcript is suppressed', async () => {
  const { selftestConsole } = await import('../src/core/selftest-log.js');
  const seen = [];
  const realLog = console.log;
  const savedEnv = process.env.FML_DSA_SELFTEST;
  delete process.env.FML_DSA_SELFTEST;
  delete process.env.NODE_ENV;
  console.log = (...args) => seen.push(args.join(' '));
  try {
    const c = selftestConsole();
    c.log('  PASS something fine');
    c.log('  FAIL power2Round r=1 r1=2 r0=3');
    c.log('  \u2717 polyNeg');
    c.log('  \u274C reduce');
  } finally {
    console.log = realLog;
    if (savedEnv !== undefined) process.env.FML_DSA_SELFTEST = savedEnv;
  }
  assert.equal(seen.length, 3, `expected only the three failure lines, got ${seen.length}`);
  assert.ok(seen[0].includes('FAIL'));
  assert.ok(seen[1].includes('\u2717'));
  assert.ok(seen[2].includes('\u274C'));
});
