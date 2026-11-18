#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * test-tree-hash.cjs - prove the #507 digest and its live check can both fail.
 *
 * Two things are tested, and the second is the one that matters:
 *
 *   1. `treeHash()` is a pure, order-independent digest of a manifest subtree.
 *   2. `checkTree()` - the `live:tree` gate in scripts/check-live.cjs - says FAIL
 *      when the running process reports the wrong commit, the wrong packages
 *      digest, or no build block at all. A gate that has only ever been observed
 *      green is not evidence (the lesson of scripts/test-verify-tree-sha.cjs).
 *
 * The stub server is real HTTP on 127.0.0.1 and the expected side is a fake source
 * object shaped exactly like scripts/lib/expected-source.cjs, so no network, no
 * production, and no git are involved.
 *
 * Exit: 0 all assertions pass, 1 a check behaved wrongly, 2 setup error.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const path = require('path');

const { treeHash } = require('../src/lib/tree-hash');
const { checkTree } = require('./check-live.cjs');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let failures = 0;
let assertions = 0;
function ok(name, cond, detail) {
  assertions += 1;
  if (cond) return;
  failures += 1;
  process.stdout.write('FAIL ' + name + (detail ? ' - ' + detail : '') + '\n');
}
function eq(name, actual, expected) {
  ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}

// ---------------------------------------------------------------- unit: treeHash

const files = {
  'packages/pqc-kem/src/index.js': 'a'.repeat(64),
  'packages/pqc-kem/package.json': 'b'.repeat(64),
  'packages/fml-dsa/src/index.js': 'c'.repeat(64),
  'src/index.js': 'd'.repeat(64),
  'www/index.html': 'e'.repeat(64),
};

const pkg = treeHash(files, 'packages');
eq('count covers only packages/', pkg.count, 3);
eq('no malformed entries', pkg.skipped.length, 0);

// Same map, different insertion order: the digest must not depend on key order.
const reordered = {};
for (const k of Object.keys(files).reverse()) reordered[k] = files[k];
eq('order independent', treeHash(reordered, 'packages').hash, pkg.hash);

// The whole tree must differ from the subtree; otherwise the prefix is ignored.
ok('prefix actually filters', treeHash(files, 'packages').hash !== treeHash(files, '').hash);

// One changed byte in one covered file must change the digest.
const mutated = Object.assign({}, files, { 'packages/pqc-kem/src/index.js': 'f'.repeat(64) });
ok('digest tracks content', treeHash(mutated, 'packages').hash !== pkg.hash);

// Renaming a file must change the digest even when its content does not.
const renamed = Object.assign({}, files);
delete renamed['packages/fml-dsa/src/index.js'];
renamed['packages/fml-dsa/src/moved.js'] = 'c'.repeat(64);
ok('digest tracks paths', treeHash(renamed, 'packages').hash !== pkg.hash);

// A prefix must not match a sibling that merely shares the first characters.
const sibling = { 'packages-old/x.js': 'a'.repeat(64), 'packages-real/y.js': 'a'.repeat(64) };
eq('prefix is a path segment', treeHash(sibling, 'packages').count, 0);

// Malformed digests are reported instead of being hashed into a stable-looking value.
const broken = treeHash({ 'packages/x.js': 'not-a-digest' }, 'packages');
eq('malformed counted', broken.skipped.length, 1);
eq('malformed not hashed', broken.count, 0);

// ------------------------------------------------------- integration: checkTree

const EXPECTED_COMMIT = '0123456789abcdef0123456789abcdef01234567';

// Fake source: same shape as lib/expected-source.cjs, backed by the map above.
function fakeSource() {
  return {
    kind: 'fake',
    commit: EXPECTED_COMMIT,
    short: EXPECTED_COMMIT.slice(0, 7),
    under(relDir) {
      const prefix = relDir.replace(/\/+$/, '') + '/';
      return Object.keys(files).filter((r) => r.indexOf(prefix) === 0).sort();
    },
    blobs(rels) {
      const m = new Map();
      for (const rel of rels) m.set(rel, { bytes: Buffer.from(rel, 'utf8') });
      return m;
    },
  };
}

// The expected digest, computed the same way checkTree computes it.
const expectedMap = {};
for (const rel of fakeSource().under('packages')) expectedMap[rel] = sha256(Buffer.from(rel, 'utf8'));
const EXPECTED_HASH = treeHash(expectedMap, 'packages').hash;
const EXPECTED_COUNT = treeHash(expectedMap, 'packages').count;

function serve(health) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url !== '/health') {
        res.writeHead(404).end('nope');
        return;
      }
      if (health.raw !== undefined) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(health.raw);
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(health.json));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function runCase(name, health, opts) {
  const server = await serve(health);
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const result = await checkTree({ base, timeout: 5000, source: fakeSource() });
    const expectOk = opts.expectOk;
    ok(name + ' verdict', result.ok === expectOk, 'ok=' + result.ok + ' reason=' + (result.reason || ''));
    if (opts.reasonIncludes) {
      ok(name + ' reason', String(result.reason || '').indexOf(opts.reasonIncludes) !== -1, String(result.reason || ''));
    }
    return result;
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function goodHealth(overrides) {
  return {
    json: Object.assign(
      {
        status: 'ok',
        build: {
          commit: EXPECTED_COMMIT.slice(0, 7),
          source: 'build-manifest',
          files: 9,
          packages: { hash: EXPECTED_HASH, count: EXPECTED_COUNT, malformed: 0 },
        },
      },
      overrides || {},
    ),
  };
}

async function main() {
  const good = await runCase('match', goodHealth(), { expectOk: true });
  eq('reports the compared digest', String(good.actual.hash).slice(0, 16), EXPECTED_HASH.slice(0, 16));

  await runCase(
    'wrong digest',
    goodHealth({ build: { commit: EXPECTED_COMMIT.slice(0, 7), packages: { hash: '0'.repeat(64), count: 3, malformed: 0 } } }),
    { expectOk: false, reasonIncludes: 'packages/' },
  );

  await runCase(
    'wrong commit',
    goodHealth({ build: { commit: 'deadbee', packages: { hash: EXPECTED_HASH, count: EXPECTED_COUNT, malformed: 0 } } }),
    { expectOk: false, reasonIncludes: 'commit' },
  );

  await runCase('no build block', { json: { status: 'ok' } }, { expectOk: false, reasonIncludes: 'no build block' });

  await runCase(
    'malformed manifest entries',
    goodHealth({ build: { commit: EXPECTED_COMMIT.slice(0, 7), packages: { hash: EXPECTED_HASH, count: EXPECTED_COUNT, malformed: 2 } } }),
    { expectOk: false, reasonIncludes: 'malformed' },
  );

  await runCase('non-JSON health', { raw: '<html>502</html>' }, { expectOk: false, reasonIncludes: 'not JSON' });

  // A source with no packages/ must be an error, not a vacuous pass.
  const server = await serve(goodHealth());
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const empty = {
      kind: 'fake',
      commit: EXPECTED_COMMIT,
      short: EXPECTED_COMMIT.slice(0, 7),
      under: () => [],
      blobs: () => new Map(),
    };
    const result = await checkTree({ base, timeout: 5000, source: empty });
    ok('empty source is red', result.ok === false, 'ok=' + result.ok);
  } finally {
    await new Promise((r) => server.close(r));
  }

  process.stdout.write('test-tree-hash: ' + (assertions - failures) + '/' + assertions + ' assertions passed\n');
  process.stdout.write(failures === 0 ? 'OK\n' : 'FAILED (' + failures + ')\n');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write('test-tree-hash: unexpected error: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(2);
});
