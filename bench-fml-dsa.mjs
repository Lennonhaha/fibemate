import * as fml from '../src/index.js';
import { Buffer } from 'node:buffer';

const ml = fml.ml_dsa65;
const { keygen, sign, verify } = ml;
const N = 15;

// Pre-generate keys
const kp = keygen();
const pk = kp.publicKey, sk = kp.secretKey;

// Sign benchmark
let t = Date.now();
for (let i = 0; i < N; i++) sign(Buffer.alloc(64, i), sk);
const signOps = Math.round(N * 1000 / (Date.now() - t));
console.error(`sign ${N}x = ${Date.now()-t}ms`);

// Verify benchmark (API: verify(sig, msg, pk))
const sigs = [];
for (let i = 0; i < N; i++) sigs.push(sign(Buffer.alloc(64, i), sk));
t = Date.now();
for (let i = 0; i < N; i++) verify(sigs[i], Buffer.alloc(64, i), pk);
const verifyOps = Math.round(N * 1000 / (Date.now() - t));
console.error(`verify ${N}x = ${Date.now()-t}ms`);

// Sizes
const exampleSig = sign(Buffer.alloc(64), sk);
// pk is Uint8Array
const pkLen = pk.length || pk.byteLength;

console.log(JSON.stringify({
  name: 'ML-DSA-65',
  lib: 'fml-dsa (noble)',
  sign_ops: signOps,
  verify_ops: verifyOps,
  sig_bytes: exampleSig.length,
  pk_bytes: pkLen
}));
