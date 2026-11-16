// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// The gate lost its footing once deploys stopped being git checkouts.
//
// On 2026-11-16 the deploy moved to an immutable release directory built with
// `git archive`, and `check-live.cjs` - the only check that proves the public site
// serves the right bytes - died with "not a git repository". A gate that cannot run
// where it is needed is worse than no gate, because the deploy script still reported
// a step number for it.
//
// These tests cover the replacement source: a VERSION.json written at build time,
// with the property that matters - it refuses to vouch for a tree that was edited
// after the build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { manifestSource, openSource, SCHEMA } = require('../scripts/lib/expected-source.cjs');

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function makeRelease(overrides) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-tree-'));
  fs.mkdirSync(path.join(dir, 'docs', 'tsa'), { recursive: true });
  const files = {
    'docs/manifest.md': 'manifest body\n',
    'docs/tsa/a.tsr': 'token A\n',
    'docs/tsa/b.tsr': 'token B\n',
    'www/index.html': '<html></html>\n',
    ...(overrides || {}),
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content, 'utf8');
  }
  const manifest = {
    schema: SCHEMA,
    commit: 'a'.repeat(40),
    commitShort: 'aaaaaaa',
    tree: 'b'.repeat(40),
    builtAt: new Date(0).toISOString(),
    fileCount: Object.keys(files).length,
    files: Object.fromEntries(
      Object.entries(files)
        .filter(([, v]) => v !== null)
        .map(([rel, content]) => [rel, sha256(Buffer.from(content, 'utf8'))]),
    ),
  };
  fs.writeFileSync(path.join(dir, 'VERSION.json'), JSON.stringify(manifest), 'utf8');
  return dir;
}

test('manifest source returns the exact bytes for a listed file', () => {
  const dir = makeRelease();
  try {
    const src = manifestSource(dir, 'VERSION.json');
    assert.equal(src.kind, 'manifest');
    assert.equal(src.commit, 'a'.repeat(40));
    assert.equal(src.short, 'aaaaaaa');
    const got = src.blobs(['docs/manifest.md']);
    assert.equal(got.get('docs/manifest.md').bytes.toString('utf8'), 'manifest body\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('manifest source enumerates a directory the way git ls-files did', () => {
  const dir = makeRelease();
  try {
    const src = manifestSource(dir, 'VERSION.json');
    assert.deepEqual(src.under('docs/tsa'), ['docs/tsa/a.tsr', 'docs/tsa/b.tsr']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The whole point: a release directory is not allowed to disagree with its manifest.
test('a file edited after the build is refused, not silently trusted', () => {
  const dir = makeRelease();
  try {
    const src = manifestSource(dir, 'VERSION.json');
    fs.writeFileSync(path.join(dir, 'docs/manifest.md'), 'tampered\n', 'utf8');
    assert.throws(() => src.blobs(['docs/manifest.md']), /does not match the build manifest/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a file deleted after the build is refused with the reason', () => {
  const dir = makeRelease();
  try {
    const src = manifestSource(dir, 'VERSION.json');
    fs.rmSync(path.join(dir, 'docs/manifest.md'));
    assert.throws(() => src.blobs(['docs/manifest.md']), /missing from the tree/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a path the manifest never listed is refused', () => {
  const dir = makeRelease();
  try {
    const src = manifestSource(dir, 'VERSION.json');
    assert.throws(() => src.blobs(['docs/not-built.md']), /not in the build manifest/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a tree with neither .git nor VERSION.json fails loudly', () => {
  const dir = makeRelease();
  try {
    fs.rmSync(path.join(dir, 'VERSION.json'));
    assert.throws(() => openSource(dir, {}), /no \.git .* and no build manifest/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a manifest from a different schema is refused', () => {
  const dir = makeRelease();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'VERSION.json'), 'utf8'));
    m.schema = 'something-else/v9';
    fs.writeFileSync(path.join(dir, 'VERSION.json'), JSON.stringify(m), 'utf8');
    assert.throws(() => manifestSource(dir, 'VERSION.json'), /schema is/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Deploying the wrong tree is a silent failure mode without this.
test('--expect-commit rejects a tree built from another commit', () => {
  const dir = makeRelease();
  try {
    assert.throws(() => openSource(dir, { expectCommit: 'c'.repeat(40) }), /does not match/);
    assert.equal(openSource(dir, { expectCommit: 'aaaaaaa' }).commit, 'a'.repeat(40));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
