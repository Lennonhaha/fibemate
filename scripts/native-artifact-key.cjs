#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * native-artifact-key.cjs - the identity of a native addon build.
 *
 * The addon is compiled from packages/pqc-kem/native/** with the flags held in
 * .github/workflows/native-build.yml. Two commits that agree on both inputs must
 * accept the same artifact; a commit that changes either one must not. The key is
 * therefore sha256(native tree):sha256(workflow blob), truncated for an artifact name.
 *
 * Keying by commit instead would mean every deploy whose commit did not touch native
 * code has no artifact at all, and the deploy would fall back to "keep whatever is
 * on disk" - which is how packages/ drifted in the first place (#507).
 *
 * Usage:
 *   node scripts/native-artifact-key.cjs --repo <checkout> [--commit <sha>] [--json]
 *
 * Prints the 12-hex key, or a JSON object with the three values in --json mode.
 * Exit: 0 ok, 1 the tree or the workflow file is missing, 2 usage error.
 */
'use strict';

const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const NATIVE_TREE = 'packages/pqc-kem/native';
const WORKFLOW = '.github/workflows/native-build.yml';

function usage(msg) {
  if (msg) process.stderr.write('native-artifact-key: ' + msg + '\n');
  process.stderr.write('usage: node scripts/native-artifact-key.cjs --repo <dir> [--commit <sha>] [--json]\n');
  process.exit(2);
}

function main() {
  const argv = process.argv.slice(2);
  let repo = null;
  let commit = 'HEAD';
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--repo') repo = path.resolve(argv[(i += 1)] || '');
    else if (a === '--commit') commit = argv[(i += 1)] || '';
    else if (a === '--json') json = true;
    else if (a === '--help' || a === '-h') usage('');
    else usage('unknown argument: ' + a);
  }
  if (!repo) usage('--repo is required');
  if (!commit) usage('--commit must not be empty');

  const git = (args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  let sha;
  try {
    sha = git(['rev-parse', '--verify', commit + '^{commit}']);
  } catch {
    process.stderr.write(`native-artifact-key: cannot resolve ${commit} in ${repo}\n`);
    process.exit(1);
  }

  const resolve = (spec, what) => {
    try {
      return git(['rev-parse', spec]);
    } catch {
      process.stderr.write(`native-artifact-key: ${what} is not in ${sha.slice(0, 8)}\n`);
      process.exit(1);
    }
  };

  const nativeTree = resolve(`${sha}:${NATIVE_TREE}`, NATIVE_TREE);
  const workflowSha = resolve(`${sha}:${WORKFLOW}`, WORKFLOW);
  const key = crypto.createHash('sha256').update(`${nativeTree}\n${workflowSha}\n`).digest('hex').slice(0, 12);

  if (json) {
    process.stdout.write(JSON.stringify({ commit: sha, nativeTree, workflowSha, key }) + '\n');
  } else {
    process.stdout.write(key + '\n');
  }
}

main();
