#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Negative suite for scripts/check-encoding.cjs.
//
// The gate had a hole until 2026-11-17: an em dash read as GBK (U+9225 followed
// by "?") is legal UTF-8, contains no U+FFFD and no PUA character, so every
// judgement passed while eleven comments and three exported strings in
// packages/pqc-kem were corrupted. A fix without a failing fixture cannot be
// re-tested, so each corruption class gets an input that must be rejected.
//
// Fixture content is built from code points on purpose: this file is scanned by
// the gate it tests, so it must not carry the corruption as literal characters.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const gate = path.join(__dirname, 'check-encoding.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'encgate-'));
let failed = 0;

const EMDASH_MOJI = String.fromCodePoint(0x9225) + '?'; // "?" for an em dash
const ARROW_MOJI = String.fromCodePoint(0x922b) + '?'; // "?" for an arrow
const RHO_MOJI = String.fromCodePoint(0x87fb); // rho, read as GBK from CE C1

function check(label, expected, file) {
  const r = spawnSync(process.execPath, [gate, file], { encoding: 'utf8' });
  const got = r.status;
  const ok = got === expected;
  if (!ok) failed += 1;
  const detail = ok ? '' : ` (got ${got}) ${(r.stderr || '').split('\n')[0]}`;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail}`);
}

const write = (name, content) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, content);
  return p;
};

check('clean file passes', 0, write('clean.js', 'const x = 1; // a - b\n'));

// the class that was invisible
check('em dash mojibake is rejected', 1, write('emdash.js', '// kem ' + EMDASH_MOJI + 'ML-KEM-768\n'));

// the fingerprint that was already present, kept so a refactor cannot drop it
check('arrow mojibake is rejected', 1, write('arrow.js', '// next ' + ARROW_MOJI + 'step\n'));

// rho survived the first pass on main: present in params.js, absent from the table
check('rho mojibake is rejected', 1, write('rho.js', '// incl. 32B ' + RHO_MOJI + ')\n'));

// the classes that were already covered
check('U+FFFD is rejected', 1, write('fffd.js', '// broken \uFFFD\uFFFD text\n'));
check('UTF-8 BOM is rejected', 1, write('bom.js', '\uFEFFconst x = 1;\n'));

// A NUL-only file passes, because the gate skips files whose first block looks
// binary. The shape that actually bit us is text with a NUL further in.
fs.writeFileSync(path.join(tmp, 'nul.js'), 'a'.repeat(9000) + '\u0000' + 'b'.repeat(10));
check('NUL byte after a text head is rejected', 1, path.join(tmp, 'nul.js'));

// invalid UTF-8: a lone continuation byte after a valid prefix
fs.writeFileSync(path.join(tmp, 'invalid.js'), Buffer.from([0x2f, 0x2f, 0x20, 0xe2, 0x80, 0x0a]));
check('invalid UTF-8 is rejected', 1, path.join(tmp, 'invalid.js'));

// A file that is not on the allowlist is rejected even when the offending line
// looks like documentation of the pattern: the exemption is by path, because a
// line carrying the corruption used to certify itself.
check(
  'quoting the pattern outside the allowlist is still rejected',
  1,
  write('sample.js', '// detect mojibake: /' + EMDASH_MOJI + '/ flags an em dash read as GBK\n'),
);

// the whole repository must stay clean under the stricter table
const repo = path.join(__dirname, '..');
const all = spawnSync(process.execPath, [path.join(repo, 'scripts', 'check-encoding.cjs')], {
  cwd: repo,
  encoding: 'utf8',
});
const repoOk = all.status === 0;
if (!repoOk) failed += 1;
console.log(
  `${repoOk ? 'PASS' : 'FAIL'} repository scan is clean` +
    (repoOk ? '' : ': ' + (all.stderr || '').split('\n')[0]),
);

fs.rmSync(tmp, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
