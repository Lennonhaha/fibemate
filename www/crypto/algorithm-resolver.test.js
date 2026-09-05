// SPDX-License-Identifier: GPL-3.0-only
// Test: Algorithm Resolver unit tests
const assert = require('assert');
const resolver = require('./algorithm-resolver.js');

let passed = 0, failed = 0;
function t(cond, msg) { if (cond) { passed++; } else { console.log('  FAIL:', msg); failed++; } }

console.log('=== 1. Default fallbacks (no registry loaded) ===');
t(resolver.isLoaded() === false, 'not loaded initially');
t(resolver.ianaGroup('ML-KEM-768') === 4590, 'ML-KEM-768 IANA group falls back to 4590');
t(resolver.pkSize('ML-KEM-768') === 1184, 'ML-KEM-768 pkSize falls back to 1184');
t(resolver.skSize('ML-KEM-768') === 2400, 'ML-KEM-768 skSize falls back to 2400');
t(resolver.ctSize('ML-KEM-768') === 1088, 'ML-KEM-768 ctSize falls back to 1088');
t(resolver.ssSize('ML-KEM-768') === 32, 'ML-KEM-768 ssSize falls back to 32');
t(resolver.ianaGroup('SM2') === 41, 'SM2 IANA group = 41');
t(resolver.pkSize('SM2') === 64, 'SM2 pkSize = 64');
t(resolver.ianaGroup('P-256') === 23, 'P-256 IANA group = 23');
t(resolver.pkSize('P-256') === 65, 'P-256 pkSize = 65');

console.log('=== 2. preferredAlgorithms (no registry) ===');
var prefs = resolver.preferredAlgorithms();
t(prefs.length === 3, '3 preferred algorithms');
t(prefs[0] === 'ML-KEM-768', 'ML-KEM-768 is first preference');
t(prefs.indexOf('SM2') > -1, 'SM2 in list');
t(prefs.indexOf('P-256') > -1, 'P-256 in list');

console.log('=== 3. kemParams ===');
var kp = resolver.kemParams('ML-KEM-768');
t(kp.pk === 1184, 'kemParams ML-KEM pk');
t(kp.sk === 2400, 'kemParams ML-KEM sk');
t(kp.ct === 1088, 'kemParams ML-KEM ct');
t(kp.ss === 32, 'kemParams ML-KEM ss');
t(kp.ianaGroup === 4590, 'kemParams IANA group 4590');

console.log('=== 4. Unknown algorithm ===');
t(resolver.ianaGroup('UNKNOWN_ALGO') === null, 'unknown algo IANA = null');
t(resolver.pkSize('UNKNOWN') === 64, 'unknown algo pkSize = default 64');

console.log('=== 5. Load registry ===');
var testRegistry = {
  name: 'test-registry',
  version: '1.0.0',
  algorithms: [
    { id: 'ML-KEM-768', category: 'pqc', pqcReady: true, params: { pkSize: 1184, skSize: 2400, ctSize: 1088, ssSize: 32, ianaGroup: 4590, nistLevel: 3, quantumBits: 128 } },
    { id: 'ML-DSA-65', category: 'pqc', pqcReady: true, params: { pkSize: 1952, skSize: 4032, sigSize: 3309, nistLevel: 3 } },
    { id: 'SM2', category: 'classic', pqcReady: false, params: { pkSize: 64, skSize: 32, ssSize: 32, ianaGroup: 41 } },
    { id: 'P-256', category: 'classic', pqcReady: false, params: { pkSize: 65, skSize: 32, ssSize: 32, ianaGroup: 23 } },
    { id: 'SHA-256', category: 'classic', pqcReady: false, params: { digestSize: 32 } }
  ]
};
resolver.load(testRegistry);
t(resolver.isLoaded() === true, 'registry loaded');
var allIds = resolver.ids();
t(allIds.length === 5, '5 algorithms loaded');

console.log('=== 6. Query loaded registry ===');
var mlkem = resolver.get('ML-KEM-768');
t(mlkem !== null, 'ML-KEM found in registry');
t(mlkem.category === 'pqc', 'category is pqc');
t(resolver.pkSize('ML-KEM-768') === 1184, 'resolver pkSize from registry');

var pqc = resolver.pqcReady();
t(pqc.length === 2, '2 PQC-ready algos');
t(pqc[0].id === 'ML-KEM-768' || pqc[1].id === 'ML-KEM-768', 'ML-KEM in PQC list');

var classic = resolver.byCategory('classic');
t(classic.length === 3, '3 classic algorithms');
t(classic.map(function(a){return a.id}).indexOf('SM2') > -1, 'SM2 in classic');
t(classic.map(function(a){return a.id}).indexOf('P-256') > -1, 'P-256 in classic');

console.log('=== 7. preferredAlgorithms (with registry) ===');
prefs = resolver.preferredAlgorithms();
t(prefs.length >= 5, '5+ preferred (PQC first)');
t(prefs[0] === 'ML-KEM-768', 'ML-KEM-768 first');
t(prefs[1] === 'ML-DSA-65', 'ML-DSA second');

console.log('=== 8. Registry overrides defaults ===');
// ML-KEM-768 should use registry values even though defaults exist
t(resolver.ianaGroup('ML-KEM-768') === 4590, 'IANA group from registry');

console.log('\n=== RESULTS ===');
console.log('  Passed:', passed, ' Failed:', failed, ' Total:', passed + failed);
if (failed > 0) process.exit(1);
