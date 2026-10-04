// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const { test } = require('node:test');

// 鈿狅笍 鐩稿璺緞 require 鈥斺€?缁曡繃 index.js 鍏紑 API
const kem = require('../src/ml-kem-768.js');

const ACVP_DIR = path.join(process.env.TEMP, 'acvp', 'ML-KEM-keyGen-FIPS203');
const prompt = JSON.parse(fs.readFileSync(path.join(ACVP_DIR, 'prompt.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(ACVP_DIR, 'expectedResults.json'), 'utf8'));

const hexToBytes = h => Buffer.from(h, 'hex');
const bytesEqual = (a, b) => Buffer.from(a).equals(Buffer.from(b));

for (const pGroup of prompt.testGroups) {
 const paramSet = pGroup.parameterSet; // 'ML-KEM-512' / 'ML-KEM-768' / 'ML-KEM-1024'
 const tgId = pGroup.tgId;
 const eGroup = expected.testGroups.find(g => g.tgId === tgId);

 assert.ok(eGroup, `no expected group for tgId=${tgId}`);

 test(`ACVP ML-KEM-keyGen ${paramSet} tgId=${tgId} (${pGroup.tests.length} cases)`, () => {
 kem.loadParams(paramSet);

 let passed = 0;
 const failures = [];

 pGroup.tests.forEach((tc, i) => {
 const exp = eGroup.tests.find(t => t.tcId === tc.tcId) || eGroup.tests[i];

 const kp = kem.generateKeypairDerand(hexToBytes(tc.d), hexToBytes(tc.z));

 const pkOk = bytesEqual(kp.publicKey, hexToBytes(exp.ek));
 const skOk = bytesEqual(kp.secretKey, hexToBytes(exp.dk));

 if (pkOk && skOk) {
 passed++;
 } else {
 failures.push({
 tcId: tc.tcId,
 idx: i,
 pkOk,
 skOk,
 gotPk: Buffer.from(kp.publicKey).toString('hex').slice(0, 32),
 expPk: exp.ek.slice(0, 32),
 });
 }
 });

 console.log(`[${paramSet}] passed=${passed}/${pGroup.tests.length}`);
 if (failures.length > 0) {
 console.error('First failure:', JSON.stringify(failures[0], null, 2));
 }
 assert.strictEqual(failures.length, 0, `${failures.length} failures in ${paramSet}`);
 });
}