// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// SM3 hash benchmark — throughput at 4 sizes, single-threaded
globalThis.window = globalThis;
const SM3 = require('../www/crypto/sm3-browser.js');
const { performance } = require('perf_hooks');

const WARMUP = 10;
const ROUNDS = 1000;
const SIZES = [3, 64, 1024, 102400]; // bytes

console.log('SM3 Hash Benchmark (pure JS, Node ' + process.version + ')');
console.log('');

for (const size of SIZES) {
  const input = 'a'.repeat(size);
  // Warmup
  for (let i = 0; i < WARMUP; i++) SM3.digestHex(input);
  // Timed
  const t0 = performance.now();
  for (let i = 0; i < ROUNDS; i++) SM3.digestHex(input);
  const elapsed = performance.now() - t0;
  const opsPerSec = Math.round(ROUNDS / (elapsed / 1000));
  const mbPerSec = ((size * ROUNDS) / (elapsed / 1000) / 1e6).toFixed(3);
  const label = size < 1024 ? size + 'B' : (size / 1024).toFixed(0) + 'KB';
  console.log(label.padEnd(6) + ': ' + String(opsPerSec).padStart(6) + ' ops/s  ' + mbPerSec + ' MB/s');
}

console.log('\n=== DONE ===');
