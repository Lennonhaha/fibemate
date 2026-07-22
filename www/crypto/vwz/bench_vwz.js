// SPDX-License-Identifier: GPL-3.0-only
#!/usr/bin/env node
// VWZ WASM Server-Side Benchmark (Node.js)
// Usage: node bench_vwz.js [k=8,16]
'use strict';

const path = require('path');

async function main() {
    const mod = await import(path.join(__dirname, 'vwz_signature.js'));
    await mod.default();
    const { keygen, sign, verify, estimate_sizes } = mod;

    const WARMUP = 5;
    const ROUNDS = 20;
    const msg = new TextEncoder().encode('Fibemate VWZ bench 2026-06-30');

    function measure(fn) {
        // warmup
        for (let i = 0; i < WARMUP; i++) fn();
        global.gc && global.gc();
        const times = [];
        for (let i = 0; i < ROUNDS; i++) {
            const t0 = performance.now();
            fn();
            times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        return {
            min:  times[0],
            p50:  times[Math.floor(times.length * 0.5)],
            p95:  times[Math.floor(times.length * 0.95)],
            p99:  times[Math.floor(times.length * 0.99)],
            max:  times[times.length - 1],
            avg:  times.reduce((a, b) => a + b, 0) / times.length,
        };
    }

    const ks = process.argv.slice(2).length > 0
        ? process.argv.slice(2).map(Number)
        : [8, 16];

    console.log('VWZ WASM Benchmark');
    console.log(`Node ${process.version} | warmup=${WARMUP} rounds=${ROUNDS}`);
    console.log('─'.repeat(62));
    console.log('');

    for (const k of ks) {
        // Size estimate (no-op cost: negligible)
        const sizes = JSON.parse(estimate_sizes(k));

        // Keygen
        let kp;
        const kg = measure(() => { kp = keygen(k); });

        // Sign
        const pk = kp.public_key();
        const sk = kp.secret_key();
        let sig;
        const sg = measure(() => { sig = sign(sk, msg); });

        // Verify
        const vf = measure(() => { verify(pk, msg, sig); });

        console.log(`=== k=${k} ===`);
        console.log(`  PK full: ${sizes.pk_bytes}B  PK rank-1: ${sizes.pk_bytes_rank1_compressed}B  Sig: ${sizes.sig_bytes}B`);
        console.log(`  keygen │ min ${kg.min.toFixed(2)}ms │ p50 ${kg.p50.toFixed(2)}ms │ avg ${kg.avg.toFixed(2)}ms │ max ${kg.max.toFixed(2)}ms`);
        console.log(`  sign   │ min ${sg.min.toFixed(2)}ms │ p50 ${sg.p50.toFixed(2)}ms │ avg ${sg.avg.toFixed(2)}ms │ max ${sg.max.toFixed(2)}ms`);
        console.log(`  verify │ min ${vf.min.toFixed(2)}ms │ p50 ${vf.p50.toFixed(2)}ms │ avg ${vf.avg.toFixed(2)}ms │ max ${vf.max.toFixed(2)}ms`);
        console.log('');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
