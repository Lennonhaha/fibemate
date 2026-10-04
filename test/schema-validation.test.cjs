const { test, after } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const Ajv = require('ajv');

function createValidator() {
  const schema = JSON.parse(fs.readFileSync('./test/fixtures/bom-1.4.schema.json', 'utf-8'));
  const spdxSchema = JSON.parse(fs.readFileSync('./test/fixtures/spdx.schema.json', 'utf-8'));
  const jsfSchema = JSON.parse(fs.readFileSync('./test/fixtures/jsf-0.82.schema.json', 'utf-8'));

  const ajv = new Ajv({ strict: false });
  ajv.addSchema(spdxSchema, 'spdx.schema.json');
  ajv.addSchema(jsfSchema, 'jsf-0.82.schema.json#/definitions/signature');
  return ajv.compile(schema);
}

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'gen-sbom.js');
const FIXTURE = path.resolve(__dirname, 'fixtures', 'sample-project');
const OUT = path.join(os.tmpdir(), `gen-sbom-test-${process.pid}.json`);

// 生成一次——所有测试共享
execSync(`node "${SCRIPT}" "${OUT}"`, { cwd: FIXTURE, stdio: 'pipe' });
const bom = JSON.parse(fs.readFileSync(OUT, 'utf8'));

after(() => { try { fs.unlinkSync(OUT); } catch {} });

test('output validates against CycloneDX 1.4 schema', () => {
  const validate = createValidator();
  const valid = validate(bom);
  if (!valid) {
    const msg = validate.errors.map(e => e.instancePath + ': ' + e.message).join('\n');
    console.error('Schema validation errors:\n' + msg);
  }
  assert.ok(valid, 'Output does not match CycloneDX 1.4 schema');
});

test('declares bomFormat CycloneDX and specVersion 1.4', () => {
  assert.strictEqual(bom.bomFormat, 'CycloneDX');
  assert.strictEqual(bom.specVersion, '1.4');
});

test('emits exactly 2 components (is-odd + is-number)', () => {
  assert.strictEqual(bom.components.length, 2);
  const names = bom.components.map(c => c.name).sort();
  assert.deepStrictEqual(names, ['is-number', 'is-odd']);
});

test('root component exists under metadata.component', () => {
  assert.ok(bom.metadata.component, 'metadata.component missing');
  assert.strictEqual(bom.metadata.component.type, 'application');
  assert.ok(bom.metadata.component.name, 'metadata.component has no name');
});

test('every component has type "library" and a purl', () => {
  for (const c of bom.components) {
    assert.strictEqual(c.type, 'library', `component ${c.name} has wrong type`);
    assert.ok(c.purl, `component ${c.name} missing purl`);
  }
});