const fml = require('./src/fml-dsa.js');
const kp = fml.keygen(65); // ML-DSA-65
const N = 50;
let t, msg, sig;

// Sign only
t = Date.now();
for (let i = 0; i < N; i++) { msg = Buffer.alloc(64, i); sig = fml.sign(kp.sk, msg); }
const signOps = (N * 1000 / (Date.now() - t)).toFixed(0);

// Verify only
t = Date.now();
for (let i = 0; i < N; i++) { msg = Buffer.alloc(64, i); sig = fml.sign(kp.sk, msg); }
const sigs = []; for (let i = 0; i < N; i++) { sigs.push(fml.sign(kp.sk, Buffer.alloc(64, i))); }
t = Date.now();
for (let i = 0; i < N; i++) { fml.verify(kp.pk, Buffer.alloc(64, i), sigs[i]); }
const verifyOps = (N * 1000 / (Date.now() - t)).toFixed(0);

// Signature size
const exampleSig = fml.sign(kp.sk, Buffer.alloc(64));
const sigBytes = exampleSig.length;
const pkBytes = kp.pk.length;

console.log(JSON.stringify({
  name: 'fml-dsa (ML-DSA-65)',
  sign_ops: +signOps,
  verify_ops: +verifyOps,
  sig_bytes: sigBytes,
  pk_bytes: pkBytes
}, null, 2));
