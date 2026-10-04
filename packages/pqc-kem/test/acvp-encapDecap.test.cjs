// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { test } = require('node:test');

// ⚠️ 相对路径 require —— 绕过 index.js 公开 API
const kem = require('../src/ml-kem-768.js');

const ACVP_DIR = path.join(process.env.TEMP, 'acvp', 'ML-KEM-encapDecap-FIPS203');
const prompt = JSON.parse(fs.readFileSync(path.join(ACVP_DIR, 'prompt.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(ACVP_DIR, 'expectedResults.json'), 'utf8'));

const hexToBytes = h => Buffer.from(h, 'hex');
const bytesEqual = (a, b) => Buffer.from(a).equals(Buffer.from(b));

function findExpected(tgId) {
 const eg = expected.testGroups.find(g => g.tgId === tgId);
 assert.ok(eg, `no expected group for tgId=${tgId}`);
 return eg;
}

// ---------- encapsulation ----------
for (const g of prompt.testGroups.filter(g => g.function === 'encapsulation')) {
 test(`ACVP ${g.parameterSet} encapsulation tgId=${g.tgId} (${g.tests.length})`, () => {
 kem.loadParams(g.parameterSet);
 const eg = findExpected(g.tgId);
 let passed = 0;
 const failures = [];

 g.tests.forEach((tc, i) => {
 const exp = eg.tests.find(t => t.tcId === tc.tcId) || eg.tests[i];
 const r = kem.encapsulateDerand(hexToBytes(tc.ek), hexToBytes(tc.m));

 const cOk = bytesEqual(r.ciphertext, hexToBytes(exp.c));
 const kOk = bytesEqual(r.sharedSecret, hexToBytes(exp.k));
 if (cOk && kOk) passed++;
 else failures.push({ tcId: tc.tcId, cOk, kOk });
 });

 console.log(`[${g.parameterSet}] encaps tgId=${g.tgId}: ${passed}/${g.tests.length}`);
 if (failures.length) console.error('first failure:', failures[0]);
 assert.strictEqual(failures.length, 0);
 });
}

// ---------- decapsulation ----------
for (const g of prompt.testGroups.filter(g => g.function === 'decapsulation')) {
 test(`ACVP ${g.parameterSet} decapsulation tgId=${g.tgId} (${g.tests.length})`, () => {
 kem.loadParams(g.parameterSet);
 const eg = findExpected(g.tgId);
 let passed = 0;
 const failures = [];

 g.tests.forEach((tc, i) => {
 const exp = eg.tests.find(t => t.tcId === tc.tcId) || eg.tests[i];
 const k = kem.decapsulate(hexToBytes(tc.dk), hexToBytes(tc.c));
 if (bytesEqual(k, hexToBytes(exp.k))) passed++;
 else failures.push({ tcId: tc.tcId });
 });

 console.log(`[${g.parameterSet}] decaps tgId=${g.tgId}: ${passed}/${g.tests.length}`);
 if (failures.length) console.error('first failure:', failures[0]);
 assert.strictEqual(failures.length, 0);
 });
}

// ---------- keyCheck ----------
// 只有 ek 或 dk 字节，无 c/k 期望，需 JS 导出 validate 函数
// testType=VAL -> testPassed=true 预期，暂无公开 API
for (const g of prompt.testGroups.filter(g => g.function.includes('KeyCheck'))) {
 test.skip(`ACVP ${g.parameterSet} keyCheck tgId=${g.tgId} — pending validate API`, () => {});
}