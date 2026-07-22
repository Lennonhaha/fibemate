// scripts/bench-proper.js — clear cache between before/after
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');

function bench(label, fn, runs) {
    for (let i=0;i<Math.min(30,runs/3);i++)fn();
    const t0=performance.now();
    for(let i=0;i<runs;i++)fn();
    return (performance.now()-t0)/runs;
}

function run(label, runs) {
    const core = require('../packages/pqc-kem/src/ml-kem-768');
    const kp=core.generateKeypair(); const enc=core.encapsulate(kp.publicKey);
    console.log(label+':');
    let t;
    t=bench('  genKey    ', ()=>core.generateKeypair(), runs); console.log('  genKey     %.3f ms/op  %d/s', t, Math.round(1000/t));
    t=bench('  encaps    ', ()=>core.encapsulate(kp.publicKey), runs); console.log('  encaps     %.3f ms/op  %d/s', t, Math.round(1000/t));
    t=bench('  decaps    ', ()=>core.decapsulate(kp.secretKey, enc.ciphertext), runs); console.log('  decaps     %.3f ms/op  %d/s', t, Math.round(1000/t));
    t=bench('  roundtrip ', ()=>{const k=core.generateKeypair();const e=core.encapsulate(k.publicKey);core.decapsulate(k.secretKey,e.ciphertext)}, runs); console.log('  roundtrip  %.3f ms/op  %d/s', t, Math.round(1000/t));
}

console.log('=== BEFORE (baseline) ===');
execSync('git checkout -- packages/pqc-kem/src/ml-kem-768.js');
delete require.cache[require.resolve('../packages/pqc-kem/src/ml-kem-768')];
run('BEFORE', 300);

console.log('\n=== AFTER (patched) ===');
execSync('python3 scripts/hotpath-patch.py packages/pqc-kem/src/ml-kem-768.js');
delete require.cache[require.resolve('../packages/pqc-kem/src/ml-kem-768')];
run('AFTER', 300);

// KAT
const core = require('../packages/pqc-kem/src/ml-kem-768');
let ok=0;
for(let i=0;i<500;i++){const k=core.generateKeypair();const e=core.encapsulate(k.publicKey);if(Buffer.compare(core.decapsulate(k.secretKey,e.ciphertext),e.sharedSecret)===0)ok++}
console.log('\nKEM self: %d/%d %s', ok, 500, ok===500?'PASS':'FAIL');
