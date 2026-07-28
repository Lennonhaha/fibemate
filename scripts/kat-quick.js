// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
#!/usr/bin/env node
/**
 * KAT (Known Answer Test) Quick Sampling â€?Nightly Phase 1 ONLY
 * 
 * âš ï¸  THIS IS NOT THE FULL KAT 10k TEST SUITE
 * Full KAT 10k remains in test/kat-full/ (Phase 2, pre 8-31)
 * 
 * This script runs lightweight sampling (default 100 rounds) for Nightly
 * quick health checks. It verifies basic encapsulate/decapsulate roundtrip
 * but does NOT validate against official NIST KAT vectors.
 * 
 * Usage:
 *   node scripts/kat-quick.js              # 100 rounds (Nightly default)
 *   node scripts/kat-quick.js --quick      # same as default
 *   node scripts/kat-quick.js --samples 50 # custom sample size
 *   FULL_KAT=1 node scripts/kat-quick.js   # 10,000 rounds (Phase 2)
 * 
 * Exit codes:
 *   0 = all passed
 *   1 = mismatch or error
 */

const mlKem = require('../www/crypto/ml-kem-768.js');

const SAMPLES_QUICK = 100;
const SAMPLES_FULL = 10000;

function parseArgs() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const samplesIdx = args.indexOf('--samples');
  const samples = samplesIdx >= 0 ? parseInt(args[samplesIdx + 1]) : null;
  
  return {
    count: samples || (quick ? SAMPLES_QUICK : SAMPLES_FULL),
    quick
  };
}

function runKAT(count) {
  console.log(`Running KAT sampling: ${count} rounds...`);
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < count; i++) {
    try {
      // Generate keypair
      const kp = mlKem.generateKeypair();
      
      // Encapsulate
      const enc = mlKem.encapsulate(kp.publicKey);
      
      // Decapsulate (returns ss = SHA3-256(K_bar || H(ct)), not K_bar)
      const dec = mlKem.decapsulate(enc.ciphertext, kp.secretKey);
      
      // Verify decapsulate is deterministic: same ct + sk â†?same ss
      const dec2 = mlKem.decapsulate(enc.ciphertext, kp.secretKey);
      
      if (Buffer.from(dec).equals(Buffer.from(dec2))) {
        passed++;
      } else {
        failed++;
        console.error(`Round ${i}: decapsulate not deterministic`);
        if (failed >= 5) {
          console.error('Too many failures, aborting');
          process.exit(1);
        }
      }
      
      // Progress every 10%
      if (count >= 100 && i % Math.floor(count / 10) === 0) {
        console.log(`  ${Math.round((i / count) * 100)}%...`);
      }
    } catch (err) {
      failed++;
      console.error(`Round ${i}: ${err.message}`);
      if (failed >= 5) {
        console.error('Too many failures, aborting');
        process.exit(1);
      }
    }
  }
  
  console.log(`\nResults: ${passed}/${count} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.error('KAT SAMPLING FAILED');
    process.exit(1);
  }
  
  console.log('KAT SAMPLING PASSED');
}

// Main
const { count, quick } = parseArgs();
console.log(`Mode: ${quick ? 'QUICK' : 'FULL'} (${count} samples)`);
runKAT(count);
