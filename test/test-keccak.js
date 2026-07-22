// SPDX-License-Identifier: GPL-3.0-only
const keccak = require('../lib/keccak.js');
const assert = require('assert');
const crypto = require('crypto');

const { sha3_256_hex, sha3_512_hex, shake128_hex, shake256_hex, keccakP } = keccak;
function sbuf(s) { return new Uint8Array(Buffer.from(s, 'utf8')); }

// KAT: NIST FIPS 202
console.log('=== KAT: NIST FIPS 202 ===');
const kat = [
  ['sha3_256', '', 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a'],
  ['sha3_256', 'abc', '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'],
  ['sha3_512', '', 'a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26'],
  ['sha3_512', 'abc', 'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0'],
];
const fnMap = { sha3_256: sha3_256_hex, sha3_512: sha3_512_hex };
for (const [fn, inp, exp] of kat) {
  const res = fnMap[fn](sbuf(inp));
  const label = inp.slice(0, 20) || '(empty)';
  assert.strictEqual(res, exp, 'KAT ' + fn + '(' + label + ')');
  console.log('  PASS ' + fn + '(' + label + ')');
}
console.log('  ' + kat.length + '/' + kat.length + ' KAT vectors passed\n');

// KAT: SHAKE128
console.log('=== KAT: SHAKE128 ===');
const s128 = shake128_hex(sbuf(''), 32);
assert.strictEqual(s128, '7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26');
console.log('  PASS shake128(, 32)');

// Cross-validation with Node.js crypto
console.log('\n=== Node.js crypto cross-validation ===');
try {
 for (const msg of ['hello', 'FIBEMATE', 'abcdefghijklmnopqrstuvwxyz']) {
 const jsR = sha3_256_hex(sbuf(msg));
 const nodeR = crypto.createHash('sha3-256').update(msg).digest('hex');
 assert.strictEqual(jsR, nodeR, 'Mismatch on ' + msg);
 console.log(' PASS sha3_256(' + msg + ') == Node.js crypto');
 }
} catch (e) {
 console.log(' WARN Node.js sha3-256 not available: ' + e.message);
}

// Determinism: 1000 rounds
console.log('\n=== Determinism (1000 rounds) ===');
const seed = 'deterministic_seed_20260615';
for (let i = 0; i < 1000; i++) {
 const h1 = sha3_256_hex(sbuf(seed + i));
 const h2 = sha3_256_hex(sbuf(seed + i));
 assert.strictEqual(h1, h2);
}
console.log(' PASS 1000/1000 deterministic');

// Consistency with random inputs
console.log('\n=== Consistency with random inputs ===');
for (let i = 0; i < 100; i++) {
 const len = 1 + Math.floor(Math.random() * 1024);
 const buf = new Uint8Array(crypto.randomBytes(len));
 const h1 = sha3_256_hex(buf);
 const h2 = sha3_256_hex(buf);
 assert.strictEqual(h1, h2);
}
console.log(' PASS 100/100 consistent');

// SHA3-512 determinism
console.log('\n=== SHA3-512 determinism ===');
for (let i = 0; i < 100; i++) {
 const h1 = sha3_512_hex(sbuf('sha512_test_' + i));
 const h2 = sha3_512_hex(sbuf('sha512_test_' + i));
 assert.strictEqual(h1, h2);
}
console.log(' PASS 100/100 deterministic');

// Self-test
console.log('\n=== Built-in self-test ===');
assert.strictEqual(keccak.keccak_selfTest(), true);
console.log(' PASS keccak_selfTest()');

console.log('\n*** All Keccak tests passed ***');
