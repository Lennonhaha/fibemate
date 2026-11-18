#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// Negative-first tests for scripts/tsr-verify.cjs. Every case answers "does the gate
// object when it should", not "does it print something".
//
// The stub replaces openssl: the classifier is driven by the file name, so the tests
// assert exit codes and drift kinds without needing a real TSA or a real token.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const VERIFIER = path.join(REPO, 'scripts', 'tsr-verify.cjs');

// A private directory from mkdtempSync, not a predictable name in the shared temp
// dir: the stub is executed, so another local user must not be able to pre-create or
// replace it. CodeQL flagged the first version of this.
const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsr-stub-'));
const stub = path.join(stubDir, 'openssl-stub.cjs');
fs.writeFileSync(
  stub,
  `#!/usr/bin/env node
const path = require('path');
const args = process.argv.slice(2);
const file = args[args.indexOf('-in') + 1] || '';
const name = path.basename(file);
const say = (s) => { process.stderr.write(s + '\\n'); process.exit(0); };
if (name.startsWith('ok-')) say('Verification: OK');
if (name.startsWith('nocert-')) say('PKCS7 routines:PKCS7_get0_signers:signer certificate not found');
if (name.startsWith('nodata-')) say('Verification: FAILED\\nmessage imprint mismatch');
if (name.startsWith('badchain-')) say('Verification: FAILED\\nts_verify_cert:certificate verify error');
if (name.startsWith('notoken-')) say('ts_check_status_info:no timestamp token info');
say('Verification: FAILED\\nunclassified');
`,
);
fs.chmodSync(stub, 0o755);

let failures = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
};

const makeTree = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsr-v-'));
  for (const [rel, kind] of Object.entries(files)) {
    const p = path.join(root, 'www/docs/tsa', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `stub:${kind}`);
  }
  return root;
};

const runV = (root, allow, extra = []) =>
  spawnSync(process.execPath, [VERIFIER, '--root', root, '--allowlist', allow, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, TSR_VERIFY_OPENSSL: `node ${stub}` },
  });

const writeAllow = (root, lines) => {
  const p = path.join(root, 'allow.txt');
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
};

// 1. recursion: a token three levels down must be seen (the 2/241 regression)
{
  const root = makeTree({ '2026-01-01/deep/nested/nocert-001.tsr': 'nocert' });
  const allow = writeAllow(root, ['www/docs/tsa/2026-01-01/deep/nested/nocert-001.tsr\tNO_CERT']);
  const r = runV(root, allow);
  check('a nested token is counted', r.status === 0 && /1 tokens/.test(r.stdout), r.stdout.trim());
}

// 2. a new unverifiable token is not silently absorbed
{
  const root = makeTree({ 'nocert-001.tsr': 'nocert' });
  const allow = writeAllow(root, []);
  const r = runV(root, allow);
  check('unlisted token fails the gate', r.status === 1 && /unlisted/.test(r.stdout), r.stdout.trim());
}

// 3. a class change fails: it may mean the token was replaced
{
  const root = makeTree({ 'nocert-001.tsr': 'nocert' });
  const allow = writeAllow(root, ['www/docs/tsa/nocert-001.tsr\tNO_DATA']);
  const r = runV(root, allow);
  check('class change fails the gate', r.status === 1 && /class-changed/.test(r.stdout), r.stdout.trim());
}

// 4. a stale entry fails: the evidence it described is gone
{
  const root = makeTree({ 'nocert-001.tsr': 'nocert' });
  const allow = writeAllow(root, [
    'www/docs/tsa/nocert-001.tsr\tNO_CERT',
    'www/docs/tsa/lg-999.tsr\tNO_CERT',
  ]);
  const r = runV(root, allow);
  check('stale allowlist entry fails the gate', r.status === 1 && /stale-entry/.test(r.stdout), r.stdout.trim());
}

// 5. zero tokens is "cannot measure", not "nothing to report"
{
  const root = makeTree({ 'README.md': 'no tokens here' });
  const allow = writeAllow(root, []);
  const r = runV(root, allow);
  check('empty tree exits 2', r.status === 2 && /zero evidence/.test(r.stderr), r.stderr.trim());
}

// 6. a missing allowlist is also "cannot measure"
{
  const root = makeTree({ 'nocert-001.tsr': 'nocert' });
  const r = runV(root, path.join(root, 'does-not-exist.txt'));
  check('missing allowlist exits 2', r.status === 2, r.stderr.trim());
}

// 7. the passing path still exists, and a matching allowlist is quiet
{
  const root = makeTree({ 'nodata-001.tsr': 'nodata', 'badchain-002.tsr': 'badchain', 'sub/ok-003.tsr': 'ok' });
  const allow = writeAllow(root, [
    'www/docs/tsa/nodata-001.tsr\tNO_DATA',
    'www/docs/tsa/badchain-002.tsr\tBAD_CHAIN',
  ]);
  const r = runV(root, allow);
  check(
    'verifiable token is green without an entry',
    r.status === 0 && /IMPRINT_OK=1/.test(r.stdout) && /allowlist=2 known gaps/.test(r.stdout) && /verified=1/.test(r.stdout),
    r.stdout.trim(),
  );
}

// 7b. a verifiable token still on the allowlist: the list did not shrink
{
  const root = makeTree({ 'ok-003.tsr': 'ok' });
  const allow = writeAllow(root, ['www/docs/tsa/ok-003.tsr\tIMPRINT_OK']);
  const r = runV(root, allow);
  check(
    'verifiable-but-allowlisted fails the gate',
    r.status === 1 && /verifiable-but-allowlisted/.test(r.stdout),
    r.stdout.trim(),
  );
}

// 8. --update rebuilds the allowlist, and the rebuilt one passes its own check
{
  const root = makeTree({ 'a/b/nocert-001.tsr': 'nocert', 'a/nodata-002.tsr': 'nodata' });
  const allow = writeAllow(root, []);
  const up = runV(root, allow, ['--update']);
  const after = runV(root, allow);
  check('--update writes a list the check accepts', up.status === 0 && after.status === 0, `${up.status}/${after.status}`);
  const body = fs.readFileSync(allow, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  check('--update sorted and complete', body.length === 2 && body[0].endsWith('NO_CERT'), body.join(' | '));
}

// 8b. --update must not list a verifiable token
{
  const root = makeTree({ 'a/ok-001.tsr': 'ok', 'a/nocert-002.tsr': 'nocert' });
  const allow = writeAllow(root, []);
  const up = runV(root, allow, ['--update']);
  const body = fs.readFileSync(allow, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  check(
    '--update omits verifiable tokens',
    up.status === 0 && body.length === 1 && body[0].includes('nocert-002') && /1 known gaps/.test(up.stdout),
    up.stdout.trim() + ' | ' + body.join(' | '),
  );
}

// 9. json mode reports the same verdict, for logs that are parsed rather than read
{
  const root = makeTree({ 'nocert-001.tsr': 'nocert' });
  const allow = writeAllow(root, ['www/docs/tsa/nocert-001.tsr\tNO_CERT']);
  const r = runV(root, allow, ['--json']);
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (e) { /* handled below */ }
  check('--json emits a parseable verdict', r.status === 0 && parsed && parsed.summary.verdict === 'OK', r.stdout.slice(0, 80));
}

fs.rmSync(stubDir, { recursive: true, force: true });
if (failures > 0) {
  console.log(`${failures} case(s) did not behave as expected`);
  process.exit(1);
}
console.log('all tsr-verify cases behaved as expected');
