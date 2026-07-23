// SPDX-License-Identifier: GPL-3.0-only
// CI-friendly compat fixtures runner (no mocha dependency)
import { decapsulate, encapsulate, usingNative } from '../packages/pqc-kem/index.js';
import { readFileSync } from 'fs';

const ref = JSON.parse(readFileSync('test/fixtures/ml-kem-768-golden.json', 'utf8'));
function hex(b) { return Buffer.from(b).toString('hex'); }

console.log('Compat Fixtures — ML-KEM-768 Golden');
console.log('Backend:', usingNative ? 'C NATIVE' : 'JS');
console.log('Vectors:', ref.count);

let pass = 0;
for (let i = 0; i < ref.items.length; i++) {
    const f = ref.items[i];
    const ct = Buffer.from(f.ct, 'hex');
    const sk = Buffer.from(f.sk, 'hex');
    try {
        const d = decapsulate(sk, ct);
        if (hex(d) === f.K) { pass++; continue; }
        console.log('  #' + (i+1) + ' K mismatch');
    } catch (e) {
        console.log('  #' + (i+1) + ' error:', e.message);
    }
}

const ok = pass === ref.count;
console.log('Result:', pass + '/' + ref.count, ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
