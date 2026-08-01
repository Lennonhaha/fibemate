// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SM4-GCM benchmark — encrypt/decrypt throughput at 4 sizes (pure JS)
globalThis.window = globalThis;
const SM4 = require('../www/crypto/sm4-browser.js');
const { performance } = require('perf_hooks');

const WARMUP = 5;
const ROUNDS = 200;
const SIZES = [10, 64, 1024, 10240];
const KEY = '0123456789abcdef0123456789abcdef';
const IV  = '000000000000000000000000';

console.log('SM4-GCM Benchmark (pure JS, Node ' + process.version + ')');
console.log('');

for (const size of SIZES) {
  const input = 'a'.repeat(size);
  // Warmup
  for (let i = 0; i < WARMUP; i++) SM4.encrypt(input, KEY, IV);
  // Encrypt
  const t0 = performance.now();
  for (let i = 0; i < ROUNDS; i++) SM4.encrypt(input, KEY, IV);
  const encElapsed = performance.now() - t0;
  // Decrypt (each round fresh encrypt to avoid reuse cost)
  for (let i = 0; i < WARMUP; i++) { const r = SM4.encrypt(input, KEY, IV); SM4.decrypt(r.ciphertext, KEY, r.iv, r.authTag); }
  const t1 = performance.now();
  for (let i = 0; i < ROUNDS; i++) {
    const r = SM4.encrypt(input, KEY, IV);
    SM4.decrypt(r.ciphertext, KEY, r.iv, r.authTag);
  }
  const decElapsed = performance.now() - t1;

  const encOps = Math.round(ROUNDS / (encElapsed / 1000));
  const decOps = Math.round(ROUNDS / (decElapsed / 1000));
  const label = size < 1024 ? size + 'B' : (size / 1024).toFixed(0) + 'KB';
  console.log(label.padEnd(6) + ': enc=' + String(encOps).padStart(6) + ' ops/s  dec=' + String(decOps).padStart(6) + ' ops/s');
}

console.log('\n=== DONE ===');
