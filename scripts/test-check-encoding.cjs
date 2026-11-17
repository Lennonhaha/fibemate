// Negative suite for scripts/check-encoding.cjs.
//
// The gate had a hole until 2026-11-17: "鈥?" (an em dash read as GBK) is legal
// UTF-8, contains no U+FFFD and no PUA character, so every existing judgement
// passed while eleven comments in packages/pqc-kem were corrupted. A fix
// without a failing fixture would be a fix nobody can re-test, so each class of
// corruption gets an input that must be rejected, and the clean case must pass.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const gate = path.join(__dirname, 'check-encoding.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'encgate-'));
let failed = 0;

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

// the class that was invisible: em dash mis-decoded as GBK
check('em dash mojibake (鈥?) is rejected', 1, write('emdash.js', '// kem 鈥?ML-KEM-768\n'));

// the classes that were already covered, kept so a future refactor cannot drop them
check('U+FFFD is rejected', 1, write('fffd.js', '// broken \uFFFD\uFFFD text\n'));
check('UTF-8 BOM is rejected', 1, write('bom.js', '\uFEFFconst x = 1;\n'));
// NUL byte inside an otherwise-text file (a binary mistaken for text). The gate
// skips files whose first block already looks binary, so the fixture has to look
// like text first -- that is the shape that actually bit us.
fs.writeFileSync(path.join(tmp, 'nul.js'), 'a'.repeat(9000) + '\u0000' + 'b'.repeat(10));
check('NUL byte after a text head is rejected', 1, path.join(tmp, 'nul.js'));

// an arrow mis-decoded as GBK, the fingerprint that was already present
check('arrow mojibake (鈫?) is rejected', 1, write('arrow.js', '// next 鈫?step\n'));

// invalid UTF-8 bytes (a lone continuation byte)
fs.writeFileSync(path.join(tmp, 'invalid.js'), Buffer.from([0x2f, 0x2f, 0x20, 0xe2, 0x80, 0x0a]));
check('invalid UTF-8 is rejected', 1, path.join(tmp, 'invalid.js'));

// A file that is not on the allowlist is rejected even when the offending line
// looks like documentation of the pattern. The exemption is by path on purpose:
// a line that carries the corruption cannot certify itself, which is how the
// original gate let eleven corrupted comments through.
check(
  'quoting the pattern outside the allowlist is still rejected',
  1,
  write('sample.js', '// detect mojibake: /鈥\\?/ flags an em dash read as GBK\n'),
);

// the whole repository must stay clean under the stricter table
const repo = path.join(__dirname, '..');
const all = spawnSync(process.execPath, [path.join(repo, 'scripts', 'check-encoding.cjs')], {
  cwd: repo,
  encoding: 'utf8',
});
const repoOk = all.status === 0;
if (!repoOk) failed += 1;
console.log(`${repoOk ? 'PASS' : 'FAIL'} repository scan is clean${repoOk ? '' : ': ' + (all.stderr || '').split('\n')[0]}`);

fs.rmSync(tmp, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
