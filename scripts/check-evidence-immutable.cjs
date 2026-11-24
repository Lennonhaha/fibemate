#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE contributors
//
// Evidence immutability gate (G-06).
//
// Once a timestamp token ships, the bytes it covers are history: a .tsr cannot be
// re-stamped, and a SHA256SUMS file is the only record of what was stamped. Editing
// or deleting either one does not "update evidence", it destroys the ability to
// check it -- and nothing in CI noticed, because every other gate reads the current
// tree and the current tree would simply agree with the edit.
//
// This gate only looks at a diff: paths that already existed in the base and are
// now modified, renamed, type-changed or deleted. New evidence is always allowed
// (that is how evidence is added). Deletions and edits are refused unless the path
// appears in scripts/evidence-allowlist.txt with a reason.
//
// Usage:
//   node scripts/check-evidence-immutable.cjs                 # against merge-base with origin/main
//   node scripts/check-evidence-immutable.cjs --base <rev>
//   node scripts/check-evidence-immutable.cjs --base <rev> --head <rev>
//   node scripts/check-evidence-immutable.cjs --self-test
//
// Exit codes: 0 = clean (or nothing in scope), 1 = evidence rewritten, 2 = cannot
// determine the comparison (bad rev, not a git repo) -- never 0 for "I could not tell".

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ALLOWLIST = 'scripts/evidence-allowlist.txt';
const EVIDENCE_RE = /(^|\/)(SHA256SUMS|[^/]+\.(tsr|tsq))$/i;
const STATUS_LABEL = { M: 'modified', R: 'renamed', D: 'deleted', T: 'type-changed' };

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
}

function tryGit(args) {
  try { return git(args); } catch { return null; }
}

function gitOk(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0;
}

function isEvidence(p) {
  return EVIDENCE_RE.test(p);
}

function readAllowlist(root) {
  const file = path.join(root, ALLOWLIST);
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const tab = t.indexOf('\t');
    if (tab < 0) continue;                       // a rule without a reason is not a rule
    map.set(t.slice(0, tab).trim(), t.slice(tab + 1).trim());
  }
  return map;
}

// -z output: "<status>\0<path>\0" or "<status>\0<old>\0<new>\0" for renames/copies.
function parseDiffZ(out) {
  const parts = out.split('\0').filter((s) => s.length);
  const rows = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++];
    const letter = status[0];
    if (letter === 'R' || letter === 'C') {
      const from = parts[i++];
      const to = parts[i++];
      rows.push({ letter, from, to });
    } else {
      const p = parts[i++];
      rows.push({ letter, from: p, to: p });
    }
  }
  return rows;
}

function fail(msg, code = 2) {
  console.error(`FATAL: ${msg}`);
  process.exit(code);
}

function main(argv) {
  const args = { base: null, head: 'HEAD' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') args.base = argv[++i];
    else if (a === '--head') args.head = argv[++i];
    else if (a === '--self-test') return selfTest();
    else fail(`unknown argument: ${a}`);
  }

  if (!gitOk(['rev-parse', '--git-dir'])) fail('not inside a git repository');

  let base = args.base;
  if (!base) {
    const mb = tryGit(['merge-base', args.head, 'origin/main']);
    if (!mb || !mb.trim()) fail(`cannot resolve merge-base with origin/main (pass --base <rev>)`);
    base = mb.trim();
  }
  if (!gitOk(['rev-parse', '--verify', `${base}^{commit}`])) fail(`base rev does not resolve to a commit: ${base}`);
  if (!gitOk(['rev-parse', '--verify', `${args.head}^{commit}`])) fail(`head rev does not resolve to a commit: ${args.head}`);

  const diff = git(['diff', '--name-status', '-z', '--no-renames', base, args.head]);
  const rows = parseDiffZ(diff);
  const inScope = rows.filter((r) => isEvidence(r.to) || isEvidence(r.from));
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const allow = readAllowlist(root);

  const violations = [];
  const allowed = [];
  const added = [];
  for (const r of inScope) {
    const key = isEvidence(r.to) ? r.to : r.from;
    if (r.letter === 'A') { added.push(key); continue; }
    if (!(r.letter in STATUS_LABEL)) continue;          // C/U/X cannot destroy prior evidence
    if (allow.has(key)) { allowed.push({ key, reason: allow.get(key), letter: r.letter }); continue; }
    violations.push({ key, letter: r.letter });
  }

  for (const a of added) console.log(`  ADDED    ${a}`);
  for (const a of allowed) console.log(`  ALLOWED  ${a.key} (${STATUS_LABEL[a.letter]}) :: ${a.reason}`);
  for (const v of violations) console.log(`  VIOLATION ${STATUS_LABEL[v.letter].toUpperCase()} ${v.key}`);

  console.log(`range: ${base.slice(0, 12)}..${args.head.slice(0, 12)}  changed_paths=${rows.length}  evidence_paths=${inScope.length}`);

  if (violations.length) {
    console.error(`FAIL: ${violations.length} evidence path(s) rewritten; a timestamp cannot be re-issued.`);
    console.error(`Fix: restore the file, or add "<path>\\t<reason>" to ${ALLOWLIST} if the removal is deliberate.`);
    process.exit(1);
  }
  if (!inScope.length) {
    console.log(`OK: no evidence paths in this diff (checked ${rows.length} changed path(s))`);
    process.exit(0);
  }
  console.log(`OK: ${inScope.length} evidence path(s) touched, all additions or allowlisted`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Self-test: proves the gate goes red. A gate that has never been shown to fail
// is a comment with a shebang.
// ---------------------------------------------------------------------------
function sh(cwd, args, opts = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function writeFile(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

function runGate(repo, extra = []) {
  const r = spawnSync(process.execPath, [__filename, ...extra], { cwd: repo, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-gate-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  sh(repo, ['init', '-q', '-b', 'main']);
  sh(repo, ['config', 'user.email', 'self-test@example.invalid']);
  sh(repo, ['config', 'user.name', 'self test']);
  sh(repo, ['config', 'commit.gpgsign', 'false']);

  writeFile(repo, 'README.md', 'base\n');
  writeFile(repo, 'docs/tsa/2026-01-01/SHA256SUMS', 'deadbeef  README.md\n');
  writeFile(repo, 'evidence/lg-001.tsr', 'token-bytes\n');
  sh(repo, ['add', '-A']);
  sh(repo, ['commit', '-q', '-m', 'base']);
  const base = sh(repo, ['rev-parse', 'HEAD']).trim();

  // Each case is compared against the commit that preceded it, so one case cannot
  // be masked by another case's damage (a cumulative base would hide the second
  // deletion behind the first).
  const cases = [];
  let prev = base;
  const record = (name, want, fn) => {
    fn();
    const r = runGate(repo, ['--base', prev]);
    const ok = r.status === want;
    cases.push({ name, ok, want, got: r.status, out: r.out });
    if (!ok) console.log(r.out);
    prev = sh(repo, ['rev-parse', 'HEAD']).trim();
  };

  record('editing an ordinary file passes', 0, () => {
    writeFile(repo, 'README.md', 'base\nmore\n');
    sh(repo, ['commit', '-qam', 'docs']);
  });
  record('modifying a .tsr fails', 1, () => {
    writeFile(repo, 'evidence/lg-001.tsr', 'token-bytes-tampered\n');
    sh(repo, ['commit', '-qam', 'tamper token']);
  });
  record('deleting SHA256SUMS fails', 1, () => {
    fs.rmSync(path.join(repo, 'docs/tsa/2026-01-01/SHA256SUMS'));
    sh(repo, ['add', '-A']);
    sh(repo, ['commit', '-qm', 'drop manifest']);
  });
  record('adding new evidence passes', 0, () => {
    writeFile(repo, 'evidence/lg-002.tsr', 'new-token\n');
    sh(repo, ['add', '-A']);
    sh(repo, ['commit', '-qm', 'add evidence']);
  });

  // Restore the manifest so the allowlist case starts from a tree that has it.
  record('restoring a manifest is an addition, not a rewrite', 0, () => {
    writeFile(repo, 'docs/tsa/2026-01-01/SHA256SUMS', 'deadbeef  README.md\n');
    sh(repo, ['add', '-A']);
    sh(repo, ['commit', '-qm', 'restore manifest']);
  });

  // allowlist: deleting the manifest is fine only with a stated reason
  writeFile(repo, ALLOWLIST, 'docs/tsa/2026-01-01/SHA256SUMS\tretired: superseded by lg-002, see issue 000\n');
  record('allowlisted deletion passes', 0, () => {
    fs.rmSync(path.join(repo, 'docs/tsa/2026-01-01/SHA256SUMS'));
    sh(repo, ['add', '-A']);
    sh(repo, ['commit', '-qm', 'retire manifest']);
  });
  const allowOut = cases[cases.length - 1].out;
  cases.push({ name: 'allowlist reason is printed', ok: /ALLOWED .*superseded by lg-002/.test(allowOut), want: 'ALLOWED line', got: allowOut.includes('ALLOWED') ? 'shown' : 'missing' });

  // An allowlist rule without a reason must not silence anything.
  writeFile(repo, ALLOWLIST, 'docs/tsa/2026-01-01/SHA256SUMS\n');
  writeFile(repo, 'docs/tsa/2026-01-01/SHA256SUMS', 'deadbeef  README.md\n');
  sh(repo, ['add', '-A']);
  sh(repo, ['commit', '-qm', 'restore manifest again']);
  const beforeNoReason = sh(repo, ['rev-parse', 'HEAD']).trim();
  fs.rmSync(path.join(repo, 'docs/tsa/2026-01-01/SHA256SUMS'));
  sh(repo, ['add', '-A']);
  sh(repo, ['commit', '-qm', 'drop again']);
  const noReason = runGate(repo, ['--base', beforeNoReason]);
  cases.push({ name: 'allowlist entry without a reason does not silence a deletion', ok: noReason.status === 1, want: 1, got: noReason.status });

  const bad = runGate(repo, ['--base', 'no-such-rev']);
  cases.push({ name: 'unresolvable base is FATAL (exit 2, never 0)', ok: bad.status === 2, want: 2, got: bad.status });

  const okIfNoScope = (() => {
    const r = runGate(repo, ['--base', 'HEAD']);
    return { ok: r.status === 0 && /no evidence paths in this diff/.test(r.out), want: 'exit 0 + explicit no-evidence line', got: r.status };
  })();
  cases.push({ name: 'empty diff reports scope explicitly', ok: okIfNoScope.ok, want: okIfNoScope.want, got: okIfNoScope.got });

  fs.rmSync(dir, { recursive: true, force: true });

  let failed = 0;
  for (const c of cases) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  (want ${c.want}, got ${c.got})`);
  }
  if (failed) {
    console.error(`\nSELFTEST FAILED: ${failed}/${cases.length} -- the gate cannot be trusted`);
    process.exit(1);
  }
  console.log(`\nSELFTEST OK: ${cases.length}/${cases.length}`);
  process.exit(0);
}

main(process.argv.slice(2));
