// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
#!/usr/bin/env node
/**
 * C Native Addon benchmark â€?ML-KEM-768
 * CI-safe: resolves addon relative to repo root.
 * Usage: node scripts/mlkem-bench-native.cjs [rounds=500]
 */
const path = require('path');
const fs = require('fs');

const candidates = [
  path.join(__dirname, '..', 'packages', 'pqc-kem', 'native', 'build', 'Release', 'mlkem.node'),
  path.join(process.cwd(), 'packages', 'pqc-kem', 'native', 'build', 'Release', 'mlkem.node'),
  path.join(process.cwd(), 'native', 'build', 'Release', 'mlkem.node'),
];
const addonPath = candidates.find(p => fs.existsSync(p));
if (!addonPath) { console.error('mlkem.node not found'); process.exit(2); }

const addon = require(addonPath);
const rounds = parseInt(process.argv[2]) || 500;

function bench(name, fn, n) {
  for (let i = 0; i < 5; i++) fn(); // warmup
  const start = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn();
  const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
  console.log(name.padEnd(28) + (ms / n).toFixed(4).padStart(8) + ' ms/op');
}

console.log(`C Addon ML-KEM-768 Benchmark (${rounds} runs, ${addon.K*256}-bit)\n`);

bench('keygen()',         () => addon.keygen(),         rounds);
const [pk, sk] = addon.keygen();
bench('encaps(pk)',       () => addon.encaps(pk),       rounds);
const [ct, ssEnc] = addon.encaps(pk);
bench('decaps(ct, sk)',   () => addon.decaps(ct, sk),   rounds);

// Verify single
const ssDec = addon.decaps(ct, sk);
console.log('single verify:'.padEnd(28) + (Buffer.from(ssEnc).equals(ssDec) ? 'PASS' : 'FAIL'));

// Full cycle
let mismatches = 0;
const t0 = process.hrtime.bigint();
for (let i = 0; i < rounds; i++) {
  const k = addon.keygen();
  const e = addon.encaps(k[0]);
  if (!Buffer.from(e[1]).equals(addon.decaps(e[0], k[1]))) mismatches++;
}
const total_ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
console.log(('roundtrip(' + rounds + ')').padEnd(28) + (total_ms / rounds).toFixed(4).padStart(8) + ' ms/op');

console.log(mismatches === 0 ? `\nPASS â€?${rounds}/${rounds} zero mismatches` : `\nFAIL â€?${mismatches} mismatches`);
process.exit(mismatches === 0 ? 0 : 1);
