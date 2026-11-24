#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE contributors
//
// PR baseline gate (G-07).
//
// Two incidents this exists to catch, both of which passed every other check:
//
//   1. A branch was created from the head of a PR that had already been squashed
//      into main. The new PR therefore carried the whole previous PR. `git log
//      origin/main..HEAD` looked plausible; `--stat` looked plausible; the diff
//      was half a merged feature.
//   2. A squash merge that silently changed content (conflict resolution, a
//      dropped hunk). The PR was closed as merged, the tree no longer matched
//      what was reviewed, and nobody compared the two.
//
// Pre mode answers: "does this branch carry commits whose patch is already in the
// base?" Patch identity is content-based, so it survives rebases and squashes --
// unlike ancestry, which is exactly what fails to catch case 1.
//
// Post-merge mode answers: "is the squash commit the same change I reviewed?"
//
// Usage:
//   node scripts/check-pr-baseline.cjs                       # base=origin/main head=HEAD
//   node scripts/check-pr-baseline.cjs --base <rev> --head <rev>
//   node scripts/check-pr-baseline.cjs --post-merge <squash-sha> --base <rev> --head <rev>
//   node scripts/check-pr-baseline.cjs --self-test
//
// Exit: 0 clean, 1 carrying already-merged content / squash != reviewed change,
//       2 cannot determine (bad rev, no base) -- never 0 when it could not tell.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'buffer', maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) {
    const err = r.stderr ? r.stderr.toString('utf8') : '';
    const e = new Error(`git ${args.join(' ')} failed: ${err.trim()}`);
    e.gitStatus = r.status;
    throw e;
  }
  return r.stdout;
}
const gitText = (args, opts) => git(args, opts).toString('utf8');

function resolves(rev) {
  const r = spawnSync('git', ['rev-parse', '--verify', `${rev}^{commit}`], { encoding: 'utf8' });
  return r.status === 0;
}

function fail(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const a = { base: null, head: 'HEAD', postMerge: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--self-test') a.selfTest = true;
    else if (t === '--base') a.base = argv[++i];
    else if (t === '--head') a.head = argv[++i];
    else if (t === '--post-merge') a.postMerge = argv[++i];
    else fail(`unknown argument: ${t}`);
  }
  return a;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.selfTest) return selfTest();

  const insideGit = spawnSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' }).status === 0;
  if (!insideGit) fail('not inside a git repository');

  if (!args.base) {
    if (!resolves('origin/main')) fail('origin/main does not resolve; pass --base <rev>');
    args.base = 'origin/main';
  }
  if (!resolves(args.base)) fail(`base rev does not resolve: ${args.base}`);
  if (!resolves(args.head)) fail(`head rev does not resolve: ${args.head}`);

  return args.postMerge ? postMerge(args) : pre(args);
}

function pre({ base, head }) {
  // git cherry prints "+ <sha>" for a patch not in base, "- <sha>" for one that is.
  const out = gitText(['cherry', base, head]);
  const lines = out.split(/\r?\n/).filter(Boolean);
  const carried = lines.map((l) => ({ dup: l.startsWith('-'), sha: l.slice(2).trim() }));

  const ancestorCheck = spawnSync('git', ['merge-base', '--is-ancestor', base, head]);
  const baseIsAncestor = ancestorCheck.status === 0;
  const behind = Number(gitText(['rev-list', '--count', `${head}..${base}`]).trim() || '0');

  const dups = carried.filter((c) => c.dup);
  for (const c of dups) {
    const subject = gitText(['show', '-s', '--format=%h %s', c.sha]).trim();
    console.log(`  ALREADY-IN-BASE  ${subject}`);
  }
  console.log(`base=${base} head=${head} commits_carried=${carried.length} duplicates=${dups.length} base_is_ancestor=${baseIsAncestor} base_commits_not_in_head=${behind}`);

  if (dups.length) {
    console.error(`FAIL: ${dups.length} commit(s) in this branch have a patch already present in ${base}.`);
    console.error('This is the signature of a branch cut from a pre-squash head: the PR will carry merged work.');
    console.error(`Fix: git switch -c <new> ${base}  then re-apply only this PR's changes.`);
    process.exit(1);
  }
  if (!baseIsAncestor) {
    console.log('NOTE: base is not an ancestor of head (branch predates a squash). No duplicated patches found.');
  }
  if (!carried.length) {
    console.log('OK: no commits ahead of base (nothing for this PR to carry)');
    process.exit(0);
  }
  console.log(`OK: ${carried.length} commit(s) ahead of base, none already merged`);
  process.exit(0);
}

function postMerge({ base, head, postMerge }) {
  if (!resolves(postMerge)) fail(`post-merge rev does not resolve: ${postMerge}`);
  const reviewed = git(['diff', '--binary', '--no-color', base, head]);
  const merged = git(['diff', '--binary', '--no-color', base, postMerge]);
  if (reviewed.equals(merged)) {
    console.log(`OK: squash ${postMerge.slice(0, 12)} changes ${base} identically to reviewed head ${head.slice(0, 12)} (${reviewed.length} patch bytes)`);
    process.exit(0);
  }
  // A unique directory per run: a fixed name in the shared temp dir is a
  // predictable path that another local process can pre-create (CodeQL
  // js/insecure-temporary-file). mkdtempSync returns a path only this process
  // knows, and 'wx' refuses to follow anything already there.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-baseline-'));
  const a = path.join(dir, 'reviewed.patch');
  const b = path.join(dir, 'merged.patch');
  fs.writeFileSync(a, reviewed, { flag: 'wx' });
  fs.writeFileSync(b, merged, { flag: 'wx' });
  console.error(`FAIL: squash ${postMerge.slice(0, 12)} does not reproduce the reviewed change.`);
  console.error(`  reviewed patch: ${reviewed.length} B (${a})`);
  console.error(`  merged patch:   ${merged.length} B (${b})`);
  const d = spawnSync('git', ['diff', '--no-index', '--stat', a, b], { encoding: 'utf8' });
  if (d.stdout) console.error(d.stdout.trim());
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-test. Scenario 2 is the incident this gate exists for: a branch that
// carries a commit whose patch main already has under a different SHA.
// ---------------------------------------------------------------------------
function sh(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`);
  return r.stdout;
}
function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}
function run(cwd, extra) {
  const r = spawnSync(process.execPath, [__filename, ...extra], { cwd, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-baseline-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  const G = (...a) => sh(repo, a);
  G('init', '-q', '-b', 'main');
  G('config', 'user.email', 'self-test@example.invalid');
  G('config', 'user.name', 'self test');
  G('config', 'commit.gpgsign', 'false');

  write(repo, 'app.js', 'const x = 1;\n');
  G('add', '-A');
  G('commit', '-qm', 'base');

  // clean branch: one commit of its own
  G('switch', '-q', '-c', 'clean');
  write(repo, 'app.js', 'const x = 1;\nconst y = 2;\n');
  G('commit', '-qam', 'add y');
  const clean = run(repo, ['--base', 'main']);
  G('switch', '-q', 'main');

  // the incident: main squashes the clean branch (new SHA, same patch), then a
  // second branch is cut from the pre-squash head and carries that commit.
  G('merge', '-q', '--squash', 'clean');
  G('commit', '-qm', 'squash clean (#1)');
  const squash = G('rev-parse', 'HEAD').trim();
  const cleanHead = G('rev-parse', 'clean').trim();

  G('switch', '-q', '-c', 'stale', 'clean');       // cut from the pre-squash head
  write(repo, 'app.js', 'const x = 1;\nconst y = 2;\nconst z = 3;\n');
  G('commit', '-qam', 'add z on a stale base');
  const stale = run(repo, ['--base', 'main']);

  // behind but clean: main moves on with unrelated work after the branch was cut
  G('switch', '-q', 'main');
  write(repo, 'other.txt', 'unrelated\n');
  G('add', '-A');
  G('commit', '-qm', 'unrelated');
  G('switch', '-q', '-c', 'behind', 'main');
  write(repo, 'app.js', 'const x = 1;\nconst y = 2;\n// behind but clean\n');
  G('commit', '-qam', 'own change');
  G('switch', '-q', 'main');
  write(repo, 'other.txt', 'unrelated\nmore unrelated\n');
  G('commit', '-qam', 'main moves on');
  const behindRun = run(repo, ['--base', 'main', '--head', 'behind']);

  // post-merge: same tree of changes passes
  const good = run(repo, ['--post-merge', squash, '--base', 'main', '--head', cleanHead]);
  // post-merge: a squash that dropped a hunk fails
  G('switch', '-q', '-c', 'lossy', 'main');
  write(repo, 'app.js', 'const x = 1;\n');
  G('commit', '-qam', 'squash that lost the change');
  const lossySquash = G('rev-parse', 'HEAD').trim();
  const lossy = run(repo, ['--post-merge', lossySquash, '--base', 'main', '--head', cleanHead]);

  const badRev = run(repo, ['--base', 'no-such-rev']);

  fs.rmSync(dir, { recursive: true, force: true });

  const cases = [
    ['clean branch passes', clean.status === 0],
    ['branch carrying an already-squashed patch fails', stale.status === 1 && /ALREADY-IN-BASE/.test(stale.out)],
    ['behind-but-clean passes with a note', behindRun.status === 0 && /not an ancestor|predates/.test(behindRun.out)],
    ['squash reproducing the reviewed change passes', good.status === 0],
    ['squash that changed content fails', lossy.status === 1 && /does not reproduce/.test(lossy.out)],
    ['unresolvable base is FATAL (exit 2)', badRev.status === 2],
  ];
  let failed = 0;
  for (const [name, ok] of cases) {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  }
  if (failed) {
    if (stale.status === 0) console.log(stale.out);
    if (lossy.status === 0) console.log(lossy.out);
    console.error(`\nSELFTEST FAILED: ${failed}/${cases.length}`);
    process.exit(1);
  }
  console.log(`\nSELFTEST OK: ${cases.length}/${cases.length}`);
  process.exit(0);
}

main(process.argv.slice(2));
