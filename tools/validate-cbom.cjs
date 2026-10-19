// SPDX-License-Identifier: GPL-3.0-only
/**
 * validate-cbom.cjs — validate a CycloneDX 1.6 BOM/CBOM against the official schema.
 *
 * The three schema files (bom-1.6, spdx, jsf-0.82) are vendored in
 * tools/schemas/ so this validator runs with no external checkout. bom-1.6
 * alone is NOT enough: it $refs spdx.schema.json and
 * jsf-0.82.schema.json#/definitions/signature, and ajv fails to compile
 * without them.
 *
 *   node tools/validate-cbom.cjs tools/cbom-cyclonedx.json
 *
 * Requires ajv 8. It is resolved from --module-dir when given, otherwise from
 * this repository's node_modules (ajv is a devDependency). ajv-formats is
 * optional: the schemas only use date-time / uri / iri-reference / idn-email,
 * and validation passes without it (unknown formats are ignored), so this
 * script does not hard-depend on it.
 *
 * Exit codes: 0 = valid, 1 = schema violations, 2 = usage/IO error.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function usage(msg) {
  if (msg) console.error('error: ' + msg);
  console.error('usage: node tools/validate-cbom.cjs <bom.json> [--schema-dir DIR] [--module-dir DIR]');
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { file: null, schemaDir: null, moduleDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--schema-dir') opts.schemaDir = path.resolve(argv[++i] || usage('--schema-dir needs a value'));
    else if (a === '--module-dir') opts.moduleDir = path.resolve(argv[++i] || usage('--module-dir needs a value'));
    else if (a === '-h' || a === '--help') usage();
    else if (a.startsWith('--')) usage('unknown option ' + a);
    else if (!opts.file) opts.file = path.resolve(a);
    else usage('unexpected argument ' + a);
  }
  if (!opts.file) usage('missing BOM file');
  return opts;
}

function requireFrom(moduleDir, name, optional) {
  const candidates = moduleDir
    ? [path.join(moduleDir, 'node_modules', name), name]
    : [name, path.join(REPO_ROOT, 'node_modules', name)];
  let lastErr;
  for (const c of candidates) {
    try {
      return require(c);
    } catch (e) {
      lastErr = e;
    }
  }
  if (optional) return null;
  console.error('error: cannot resolve "' + name + '". Install ajv@8, or pass --module-dir.');
  console.error('       ' + lastErr.message.split('\n')[0]);
  process.exit(2);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const schemaDir = opts.schemaDir || path.join(__dirname, 'schemas');
  const needed = ['bom-1.6.schema.json', 'spdx.schema.json', 'jsf-0.82.schema.json'];
  const missing = needed.filter((n) => !fs.existsSync(path.join(schemaDir, n)));
  if (missing.length) {
    console.error('error: missing schema file(s) in ' + schemaDir + ': ' + missing.join(', '));
    console.error('       pass --schema-dir <dir containing the three schemas>');
    process.exit(2);
  }

  const { Ajv } = requireFrom(opts.moduleDir, 'ajv/dist/ajv');

  const ajv = new Ajv({ allErrors: true, strict: false, logger: false });
  // ajv-formats is optional (see header): try it, continue without it.
  const addFormats = requireFrom(opts.moduleDir, 'ajv-formats', true);
  if (addFormats) addFormats(ajv);
  for (const name of ['spdx.schema.json', 'jsf-0.82.schema.json', 'bom-1.6.schema.json']) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8')), name);
  }
  const validate = ajv.getSchema('bom-1.6.schema.json');

  const doc = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
  const ok = validate(doc);

  const rel = path.relative(REPO_ROOT, opts.file) || opts.file;
  console.log('file        : ' + rel);
  console.log('specVersion : ' + doc.specVersion);
  console.log('components  : ' + (doc.components || []).length);
  console.log('serialNumber: ' + (doc.serialNumber || '(none)'));
  console.log('VALID       : ' + ok);

  if (!ok) {
    console.log('errors      : ' + validate.errors.length);
    for (const e of validate.errors) {
      console.log('  ' + (e.instancePath || '/') + ' :: ' + e.message + ' :: ' + JSON.stringify(e.params));
    }
    process.exit(1);
  }
}

main();
