// SPDX-License-Identifier: Apache-2.0
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Ajv = require('ajv');

function createValidator() {
  const schemaDir = path.resolve(__dirname, 'fixtures');
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'bom-1.4.schema.json'), 'utf-8'));
  const spdxSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'spdx.schema.json'), 'utf-8'));
  const jsfSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'jsf-0.82.schema.json'), 'utf-8'));

  const ajv = new Ajv({ strict: false });
  ajv.addSchema(spdxSchema, 'spdx.schema.json');
  ajv.addSchema(jsfSchema, 'jsf-0.82.schema.json#/definitions/signature');
  return ajv.compile(schema);
}

test('CycloneDX 1.4 schema validation against sbom.cdx.json', async () => {
  const validate = createValidator();
  const bomPath = path.resolve(__dirname, '..', 'sbom.cdx.json');
  const bom = JSON.parse(fs.readFileSync(bomPath, 'utf8'));
  const valid = validate(bom);
  assert.ok(valid, 'sbom.cdx.json should validate against CycloneDX 1.4 schema');
  if (!valid) console.error(validate.errors);
});

test('gen-sbom output validates (fixture)', async () => {
  const validate = createValidator();
  const bom = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, 'fixtures', 'gen-sbom-output.json'), 'utf8'));
  const valid = validate(bom);
  assert.ok(valid, 'gen-sbom-output.json should validate against CycloneDX 1.4 schema');
  if (!valid) console.error(validate.errors);
});