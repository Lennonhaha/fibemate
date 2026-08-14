// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * Batch API Benchmark —ML-KEM-1024
 * Usage: node bench.js
 */
const addon = require('./build/Release/mlkem.node');
const { performance } = require('perf_hooks');

const N = 1000, WARMUP = 10;

function bench(label, fn) {
    for (let i = 0; i < WARMUP; i++) fn();
    const t0 = performance.now();
    const r = fn();
    const dt = (performance.now() - t0) * 1000; // us
    console.log(label + ': ' + dt.toFixed(0) + ' us, ' + (dt/N).toFixed(2) + ' us/op');
    return r;
}

console.log('=== ML-KEM-' + addon.K*256 + ' Batch API Bench (N=' + N + ') ===');

// Batch operations
const kb = bench('keygen_batch  ', () => addon.keygen_batch(N));
const eb = bench('encaps_batch  ', () => addon.encaps_batch(kb.pk, N));
const db = bench('decaps_batch  ', () => addon.decaps_batch(eb.ct, kb.sk, N));
const rt = bench('roundtrip_batch', () => addon.roundtrip_batch(N));

console.log('Bytes: pk=' + addon.PUBLICKEYBYTES + ' sk=' + addon.SECRETKEYBYTES +
            ' ct=' + addon.CIPHERTEXTBYTES + ' ss=' + addon.SSBYTES);

if (rt.ok === rt.count) {
    console.log('KAT: ' + rt.ok + '/' + rt.count + ' ALL MATCH');
} else {
    console.log('KAT FAIL: ' + rt.ok + '/' + rt.count);
    process.exit(1);
}
