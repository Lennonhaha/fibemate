// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SLH-DSA-128s benchmark (Noble implementation) — keygen/sign/verify
import { slh_dsa_sha2_128s } from '@noble/post-quantum/slh-dsa.js';
import { performance } from 'perf_hooks';

const ROUNDS = 20;
const WARMUP = 3;

console.log('SLH-DSA-128s Benchmark (Noble, Node ' + process.version + ')');
console.log('');

// KeyGen
let keys;
for (let i = 0; i < WARMUP; i++) { keys = slh_dsa_sha2_128s.keygen(); }
const t0 = performance.now();
for (let i = 0; i < ROUNDS; i++) { keys = slh_dsa_sha2_128s.keygen(); }
const keygenMs = (performance.now() - t0) / ROUNDS;
console.log('KeyGen:    ' + keygenMs.toFixed(1).padStart(7) + ' ms');

// Sign (1KB)
const msg = new TextEncoder().encode('SLH-DSA benchmark ' + 'x'.repeat(980));
for (let i = 0; i < WARMUP; i++) { slh_dsa_sha2_128s.sign(msg, keys.secretKey); }
const t1 = performance.now();
let sig;
for (let i = 0; i < ROUNDS; i++) { sig = slh_dsa_sha2_128s.sign(msg, keys.secretKey); }
const signMs = (performance.now() - t1) / ROUNDS;
console.log('Sign (1KB):' + signMs.toFixed(1).padStart(7) + ' ms  (' + sig.length + 'B sig)');

// Verify
for (let i = 0; i < WARMUP; i++) { slh_dsa_sha2_128s.verify(sig, msg, keys.publicKey); }
const t2 = performance.now();
for (let i = 0; i < ROUNDS; i++) { slh_dsa_sha2_128s.verify(sig, msg, keys.publicKey); }
const verifyMs = (performance.now() - t2) / ROUNDS;
console.log('Verify:    ' + verifyMs.toFixed(1).padStart(7) + ' ms');

// Sizes
console.log('');
console.log('pk: ' + keys.publicKey.length + 'B  sk: ' + keys.secretKey.length + 'B  sig: ' + sig.length + 'B');
console.log('\n=== DONE ===');
