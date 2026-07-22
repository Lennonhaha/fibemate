// Quick KAT 1000
const c = require('../packages/pqc-kem/src/ml-kem-768');
let ok = 0;
for (let i = 0; i < 1000; i++) {
    const k = c.generateKeypair();
    const e = c.encapsulate(k.publicKey);
    const s = c.decapsulate(k.secretKey, e.ciphertext);
    if (Buffer.compare(s, e.sharedSecret) === 0) ok++;
}
console.log('KAT 1000: %d/%d %s', ok, 1000, ok === 1000 ? 'PASS' : 'FAIL');
