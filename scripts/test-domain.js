// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// Quick domain test for modAdd/modSub
const core = require('../packages/pqc-kem/src/ml-kem-768');
const Q = 3329;
let ma = 0, ms = 0;
for (let a = 0; a < Q; a += 19) {
    for (let b = 0; b < Q; b += 19) {
        const ref = ((a + b) % Q + Q) % Q;
        if (ref !== core.modAdd(a, b)) { console.log('add FAIL:', a, b, ref, core.modAdd(a, b)); process.exit(1); }
        ma++;
        const refs = ((a - b) % Q + Q) % Q;
        if (refs !== core.modSub(a, b)) { console.log('sub FAIL:', a, b, refs, core.modSub(a, b)); process.exit(1); }
        ms++;
    }
}
console.log('modAdd [0,%d): %d/%d PASS', Q, ma, ma);
console.log('modSub [0,%d): %d/%d PASS', Q, ms, ms);
