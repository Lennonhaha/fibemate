// SPDX-License-Identifier: GPL-3.0-only
/**
 * Regression guards for defects that shipped fixes without a test.
 *
 * Each block names the pull request that fixed the defect and asserts the one
 * property that would have failed before the fix. The mapping to pull requests
 * is kept in docs/REGRESSION-TESTS.md.
 *
 * Run: node --test test/regression-guards.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function runNode(args, opts = {}) {
  return spawnSync(process.execPath, args, {
    cwd: opts.cwd || root,
    encoding: 'utf8',
    timeout: 60000,
  });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fibemate-regress-'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sbom(version, components) {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.4',
    metadata: { component: { name: 'fibemate', version } },
    components,
  };
}

// #140 / #286 — the drift gate must compare the root component version as well
// as the component set. The old gate only compared components, so a version
// bump in package.json passed silently.
test('sbom drift gate fails on a component drift and on a root version drift', () => {
  const dir = tmpDir();
  try {
    const pkg = path.join(dir, 'package.json');
    const committed = path.join(dir, 'committed.json');
    const same = path.join(dir, 'same.json');
    const drifted = path.join(dir, 'drifted.json');
    const versionDrifted = path.join(dir, 'version-drift.json');

    writeJson(pkg, { version: '9.9.9' });
    writeJson(committed, sbom('9.9.9', [{ name: 'a', version: '1.0.0' }]));
    writeJson(same, sbom('9.9.9', [{ name: 'a', version: '1.0.0' }]));
    writeJson(drifted, sbom('9.9.9', [{ name: 'a', version: '1.0.0' }, { name: 'b', version: '2.0.0' }]));
    writeJson(versionDrifted, sbom('9.9.8', [{ name: 'a', version: '1.0.0' }]));

    const equal = runNode(['scripts/check-sbom-drift.cjs', same, committed, '--package-json', pkg]);
    assert.strictEqual(equal.status, 0, `equal case should pass, got ${equal.status}: ${equal.stdout}${equal.stderr}`);

    const componentDrift = runNode(['scripts/check-sbom-drift.cjs', drifted, committed, '--package-json', pkg]);
    assert.strictEqual(componentDrift.status, 1, `component drift should fail, got ${componentDrift.status}`);

    // The regression that motivated the second comparison layer: same
    // components, different root version.
    const rootDrift = runNode(['scripts/check-sbom-drift.cjs', versionDrifted, committed, '--package-json', pkg]);
    assert.strictEqual(rootDrift.status, 1, `root version drift should fail, got ${rootDrift.status}`);

    const usage = runNode(['scripts/check-sbom-drift.cjs', committed]);
    assert.strictEqual(usage.status, 2, `missing argument should be a usage error, got ${usage.status}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// #284 — the CBOM must stay CycloneDX 1.6 compliant; the fix added the schema
// gate, and this keeps the committed artifact honest even if ajv is absent.
test('the committed CBOM declares CycloneDX 1.6', () => {
  const file = path.join(root, 'tools', 'cbom-cyclonedx.json');
  const bom = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(bom.bomFormat, 'CycloneDX');
  assert.strictEqual(bom.specVersion, '1.6');
  assert.ok(Array.isArray(bom.components) && bom.components.length > 0, 'CBOM has components');
  for (const component of bom.components) {
    assert.ok(component.type, `component ${component.name} declares a type (required by the 1.6 schema)`);
    assert.ok(component.name, 'component declares a name');
  }
});

// #284 — run the vendored-schema validator when ajv is installed. CI installs
// devDependencies, so this is exercised there; a plain checkout skips it.
test('the committed CBOM validates against the vendored 1.6 schema', (t) => {
  try {
    require.resolve('ajv', { paths: [root] });
  } catch {
    t.skip('ajv is not installed in this checkout');
    return;
  }
  const result = runNode(['tools/validate-cbom.cjs', 'tools/cbom-cyclonedx.json']);
  assert.strictEqual(result.status, 0, `validator failed: ${result.stdout}${result.stderr}`);
});

// #411 — npm start pointed at a file that did not exist (src/server.js). The
// guard is deliberately dumb: resolve the script target and require it to be
// a real file.
test('every npm script that names a node entry point points at a real file', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const checked = [];
  for (const [name, command] of Object.entries(pkg.scripts)) {
    const match = /^node\s+([^\s]+)/.exec(command);
    if (!match || match[1].startsWith('-')) continue;
    const target = path.join(root, match[1]);
    assert.ok(fs.existsSync(target), `npm run ${name} points at a missing file: ${match[1]}`);
    checked.push(name);
  }
  assert.ok(checked.includes('start'), 'the start script is covered');
});


// #234 — ws-padding accepted only Buffer and string before the fix; the pure
// Web API path must also take an ArrayBuffer and any typed-array view.
test('ws-padding accepts ArrayBuffer and typed-array views', () => {
  const { WsPadding } = require('../src/crypto/ws-padding.js');
  const raw = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const fromBuffer = raw.buffer.slice(0);
  const padded = WsPadding.pad(fromBuffer);
  assert.ok(padded instanceof Uint8Array, 'returns bytes');
  assert.deepStrictEqual(Array.from(WsPadding.unpad(padded).payload), Array.from(raw));
  const view = new DataView(fromBuffer);
  assert.deepStrictEqual(Array.from(WsPadding.unpad(WsPadding.pad(view)).payload), Array.from(raw));
});

// #339 / #396 — the package is Apache-2.0 and its KEM module must not carry a
// contradictory GPL header, nor quietly fall back to a hand-written Keccak.
test('the pqc-kem sources carry no contradictory licence header and no local Keccak', () => {
  const srcDir = path.join(root, 'packages', 'pqc-kem', 'src');
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'pqc-kem sources exist');

  for (const file of files) {
    const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
    assert.ok(
      !/GNU General Public License/.test(text),
      `${file} carries a GPL header although the package is Apache-2.0`
    );
  }

  const kem = fs.readFileSync(path.join(srcDir, 'ml-kem-768.js'), 'utf8');
  assert.ok(
    !/function\s+keccak[_\w]*\s*\(/.test(kem),
    'a hand-written Keccak reappeared in ml-kem-768.js; use the audited dependency instead'
  );
  assert.ok(/@noble\/hashes/.test(kem), 'the KEM module uses the audited hash dependency');
});
