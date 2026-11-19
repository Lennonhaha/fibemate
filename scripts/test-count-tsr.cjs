#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE contributors
//
// Regression test for scripts/count-tsr.cjs (issue #579).
//
// The point of this test is not "the counter runs". It is that the classifier
// fails on the exact bytes that were shipped as evidence: a saved TSA error page
// with a .tsr extension. Each case below is a control in one direction, so a
// classifier that just returns null (valid) for everything cannot pass.
//
// Exit codes: 0 pass, 1 a case failed.

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classify, summarize } = require('./count-tsr.cjs');

const cases = [];
const check = (name, fn) => {
  try {
    fn();
    cases.push({ name, ok: true });
  } catch (err) {
    cases.push({ name, ok: false, err: err.message });
  }
};

// A DER SEQUENCE header followed by filler: not a real token, but structurally
// indistinguishable from one at the tag level, and that is the contract here.
const derStub = Buffer.concat([Buffer.from([0x30, 0x82, 0x01, 0x00]), Buffer.alloc(252, 0x00)]);
const htmlError = Buffer.concat([
  Buffer.from('<!DOCTYPE html>\n<html><head><title>Error!</title></head><body>', 'latin1'),
  Buffer.alloc(190, 0x20),
]);
const textError = Buffer.from('000.0% #Bad request format or system error.\n', 'latin1');

check('der stub is valid', () => assert.strictEqual(classify(derStub), null));
check('html error page is invalid', () => assert.strictEqual(classify(htmlError), 'html_error_page'));
check('plain-text TSA error is invalid', () => assert.strictEqual(classify(textError), 'tsa_text_error'));
check('empty file is invalid', () => assert.strictEqual(classify(Buffer.alloc(0)), 'empty'));
check('non-DER text is invalid', () => assert.strictEqual(classify(Buffer.from('not a token at all\n')), 'not_der'));
check('truncated DER-looking blob is invalid', () => assert.strictEqual(classify(Buffer.from([0x30, 0x03, 0x02, 0x01])), 'truncated'));

// End-to-end on a scratch tree: raw = invalid + valid, and the token count keeps
// counting every tracked file (published numbers must stay reproducible), while
// `valid` is the only figure that may be called evidence.
check('summarize splits raw and valid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'count-tsr-'));
  const files = {
    'lg-001.tsr': derStub,
    'lg-002.tsr': derStub,
    'lg-002-copy.tsr': derStub,
    'lg-003.tsr': htmlError, // real shape: an error page saved under an lg- name
    'deploy.tsr': textError,
  };
  for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), buf);
  const r = summarize(dir, Object.keys(files));
  assert.strictEqual(r.raw, 5, 'raw');
  assert.strictEqual(r.invalid, 2, 'invalid');
  assert.strictEqual(r.valid, 3, 'valid');
  assert.strictEqual(r.valid + r.invalid, r.raw, 'raw must equal invalid + valid');
  assert.strictEqual(r.tokens, 3, 'tokens count every tracked basename (lg-001, lg-002, lg-003)');
  assert.strictEqual(r.invalidFiles.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

// Negative control: the old behaviour (count by extension) would report 5 valid
// here. If this assertion ever passes with 5, the gate has regressed.
check('extension-only counting is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'count-tsr-neg-'));
  fs.writeFileSync(path.join(dir, 'a.tsr'), htmlError);
  fs.writeFileSync(path.join(dir, 'b.tsr'), textError);
  const r = summarize(dir, ['a.tsr', 'b.tsr']);
  assert.notStrictEqual(r.valid, 2, 'two error pages must not count as two tokens');
  assert.strictEqual(r.valid, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

let failed = 0;
for (const c of cases) {
  if (c.ok) console.log(`PASS ${c.name}`);
  else {
    failed++;
    console.log(`FAIL ${c.name}: ${c.err}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
