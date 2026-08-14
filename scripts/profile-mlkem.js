// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// scripts/profile-mlkem.js —Hot-path profiler for ML-KEM-768
const { generateKeypair, encapsulate, decapsulate } = require('../packages/pqc-kem');

const RUNS = 1000;

function bench(label, fn) {
    for (let i = 0; i < 100; i++) fn(); // warmup
    const start = performance.now();
    for (let i = 0; i < RUNS; i++) fn();
    const elapsed = performance.now() - start;
    const perOp = elapsed / RUNS;
    console.log('  %-30s %6d runs  %8.2f ms total  %8.2f ms/op  %8.0f ops/s',
        label, RUNS, elapsed, perOp, 1000/perOp);
    return { elapsed, perOp };
}

const core = require('../packages/pqc-kem/src/ml-kem-768');
const _modMul = core.modMul;
const _modAdd = core.modAdd;
const _polyMul = core.polyMul;
const _samplePoly = core.samplePoly;
const _shake128 = core.shake128;

const kp = generateKeypair();
const { ciphertext, sharedSecret } = encapsulate(kp.publicKey);

console.log('=== ML-KEM-768 Profile ===');
console.log('Runs: %d per benchmark', RUNS);
console.log();

console.log('--- Macro ops ---');
bench('generateKeypair',  () => generateKeypair());
bench('encapsulate',      () => encapsulate(kp.publicKey));
bench('decapsulate',      () => decapsulate(kp.secretKey, ciphertext));
bench('full roundtrip',   () => {
    const kp2 = generateKeypair();
    const enc = encapsulate(kp2.publicKey);
    const ss = decapsulate(kp2.secretKey, enc.ciphertext);
});

console.log();
console.log('--- Micro ops (1M iterations) ---');
const MICRO = 1000000;
const a = 1234567890123n, b = 9876543210987n;

bench('modMul (Barrett)', () => { for (let i = 0; i < MICRO; i++) _modMul(a, b); });
bench('modAdd',           () => { for (let i = 0; i < MICRO; i++) _modAdd(a + BigInt(i % 1000), b + BigInt(i % 1000)); });

console.log();
console.log('--- Hot-path call counters (100 roundtrips) ---');

let ntt_ct = 0, intt_ct = 0, pm_ct = 0, sp_ct = 0;
const origNTT = core.NTT, origINTT = core.iNTT;
core.NTT = (...args) => { ntt_ct++; return origNTT(...args); };
core.iNTT = (...args) => { intt_ct++; return origINTT(...args); };
core.polyMul = (...args) => { pm_ct++; return _polyMul(...args); };
core.samplePoly = (...args) => { sp_ct++; return _samplePoly(...args); };

for (let i = 0; i < 100; i++) {
    const kp3 = generateKeypair();
    encapsulate(kp3.publicKey);
}
core.NTT = origNTT; core.iNTT = origINTT;
core.polyMul = _polyMul; core.samplePoly = _samplePoly;

console.log('  NTT calls:            %d (per keygen+encaps)', ntt_ct / 100);
console.log('  iNTT calls:           %d', intt_ct / 100);
console.log('  polyMul calls:        %d', pm_ct / 100);
console.log('  samplePoly calls:     %d', sp_ct / 100);

console.log();
console.log('--- NTT/iNTT inner loop ---');
const testPoly = new Int16Array(256);
for (let i = 0; i < 256; i++) testPoly[i] = i % 3329;
bench('NTT (1 poly 256)',  () => core.NTT(testPoly.slice()));
bench('iNTT (1 poly 256)', () => core.iNTT(testPoly.slice()));
const nttPoly = core.NTT(testPoly.slice());
bench('polyMul (NTT dom)',  () => core.polyMul(nttPoly, nttPoly));

console.log();
if (typeof process !== 'undefined' && process.memoryUsage) {
    const mu = process.memoryUsage();
    console.log('--- Heap ---');
    console.log('  RSS:       %d MB', Math.round(mu.rss / 1024 / 1024));
    console.log('  Heap used: %d MB', Math.round(mu.heapUsed / 1024 / 1024));
    console.log('  Heap total:%d MB', Math.round(mu.heapTotal / 1024 / 1024));
}
console.log();
console.log('=== Profile complete ===');
