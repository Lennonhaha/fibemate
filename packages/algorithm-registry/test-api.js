// SPDX-License-Identifier: GPL-3.0-only
/**
 * @fibemate/algorithm-registry — API Test
 */

const Registry = require('./index.js');

console.log('=== Algorithm Registry Test ===\n');

// Test 1: Get all IDs
const ids = Registry.getAlgorithmIds();
console.log('✅ getAlgorithmIds():', ids.length, 'algorithms');
console.log('   IDs:', ids.join(', '));

// Test 2: Get specific algorithm
const mlkem = Registry.getAlgorithm('ML-KEM');
console.log('\n✅ getAlgorithm("ML-KEM"):');
console.log('   Name:', mlkem.name);
console.log('   Version:', mlkem.version);
console.log('   Security (classical/quantum):', mlkem.securityLevel.classical + '/' + mlkem.securityLevel.quantum);
console.log('   Standard:', mlkem.standards.primary);
console.log('   CBOM risk:', mlkem.cbom.risk);
console.log('   PQC-ready:', mlkem.cbom.pqcReady);

// Test 3: Get by category
const pqcKems = Registry.getByCategory('pqc-kem');
console.log('\n✅ getByCategory("pqc-kem"):', pqcKems.length, 'algorithms');
pqcKems.forEach(a => console.log('   -', a.name));

// Test 4: Get by risk
const safeAlgos = Registry.getByRisk('safe');
const warningAlgos = Registry.getByRisk('warning');
console.log('\n✅ getByRisk():');
console.log('   safe:', safeAlgos.length, '(' + safeAlgos.map(a => a.id).join(', ') + ')');
console.log('   warning:', warningAlgos.length, '(' + warningAlgos.map(a => a.id).join(', ') + ')');

// Test 5: Get by migration priority
const highPriority = Registry.getByMigrationPriority('high');
console.log('\n✅ getByMigrationPriority("high"):', highPriority.length, 'algorithms');
highPriority.forEach(a => console.log('   -', a.name, '(' + a.cbom.migrationNote + ')'));

// Test 6: Get PQC-ready
const pqcReady = Registry.getPQCReady();
console.log('\n✅ getPQCReady():', pqcReady.length, 'algorithms');
pqcReady.forEach(a => console.log('   -', a.name));

// Test 7: Get native implementations
const native = Registry.getNativeImplementations();
console.log('\n✅ getNativeImplementations():', native.length, 'algorithms');
native.forEach(a => console.log('   -', a.name, '(' + a.implementation.languages.join(', ') + ')'));

// Test 8: Get FPGA implementations
const fpga = Registry.getFPGAImplementations();
console.log('\n✅ getFPGAImplementations():', fpga.length, 'algorithms');
fpga.forEach(a => console.log('   -', a.name));

// Test 9: Generate CBOM
const cbom = Registry.generateCBOM();
console.log('\n✅ generateCBOM():', cbom.length, 'components');
console.log('   Sample (ML-KEM):');
const mlkemComponent = cbom.find(c => c.name === 'ML-KEM-768');
console.log('   - bom-ref:', mlkemComponent['bom-ref']);
console.log('   - properties:', mlkemComponent.properties.length, 'items');

// Test 10: Statistics
const stats = Registry.getStatistics();
console.log('\n✅ getStatistics():');
console.log('   Total:', stats.total);
console.log('   By category:', JSON.stringify(stats.byCategory));
console.log('   By risk:', JSON.stringify(stats.byRisk));
console.log('   By migration:', JSON.stringify(stats.byMigrationPriority));
console.log('   PQC-ready:', stats.pqcReady);
console.log('   Native:', stats.nativeImplementations);
console.log('   FPGA:', stats.fpgaImplementations);

console.log('\n=== All Tests Passed ===');
