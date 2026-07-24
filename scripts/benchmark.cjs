#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// FIBEMATE v3.3-preview Comprehensive Performance Benchmark
// Covers: ML-KEM-768 (Native/JS), SM2 (Mersenne), SM3, SM4-GCM, Double Ratchet PQ

'use strict';

const { performance } = require('perf_hooks');
const crypto = require('crypto');
const os = require('os');

const WARMUP = 5;
const ITERATIONS = {
  mlkem_native: 2000,
  mlkem_js: 200,
  sm2_keygen: 200,
  sm2_sign: 200,
  sm2_verify: 200,
  sm2_encrypt: 200,
  sm2_decrypt: 200,
  sm3_small: 10000,
  sm3_large: 2000,
  sm4_small: 2000,
  sm4_large: 500,
  dr_handshake: 50,
  dr_message: 500,
};

function bench(name, fn, rounds, warmup = WARMUP) {
  try {
    for (let i = 0; i < warmup; i++) fn();
    const start = performance.now();
    for (let i = 0; i < rounds; i++) fn();
    const elapsed = performance.now() - start;
    const avgUs = (elapsed / rounds) * 1000;
    const opsPerSec = rounds / (elapsed / 1000);
    return { name, rounds, totalMs: elapsed, avgUs, opsPerSec, ok: true };
  } catch (e) {
    return { name, ok: false, error: e.message.split('\n')[0] };
  }
}

async function benchAsync(name, fn, rounds, warmup = WARMUP) {
  try {
    for (let i = 0; i < warmup; i++) await fn();
    const start = performance.now();
    for (let i = 0; i < rounds; i++) await fn();
    const elapsed = performance.now() - start;
    const avgUs = (elapsed / rounds) * 1000;
    const opsPerSec = rounds / (elapsed / 1000);
    return { name, rounds, totalMs: elapsed, avgUs, opsPerSec, ok: true };
  } catch (e) {
    return { name, ok: false, error: e.message.split('\n')[0] };
  }
}

function format(r) {
  if (!r.ok) return `  ❌ ${r.name}: ${r.error}`;
  if (r.avgUs < 1000) return `  ✅ ${r.name}: ${r.avgUs.toFixed(1)}µs avg, ${r.opsPerSec.toFixed(0)} ops/s`;
  return `  ✅ ${r.name}: ${(r.avgUs/1000).toFixed(2)}ms avg, ${r.opsPerSec.toFixed(0)} ops/s`;
}

async async function main() {
  const results = [];
  let sep = () => console.log('─'.repeat(62));

  // ================================================================
  // 1. ML-KEM-768
  // ================================================================
  console.log('\n🔐 ML-KEM-768 (FIPS 203)');
  sep();

  // --- Native (C addon) ---
  let nativeOk = false;
  try {
    const pkg = require('../packages/pqc-kem');
    nativeOk = pkg.usingNative;
    console.log(nativeOk ? '  Backend: C Native Addon ✅' : '  Backend: Pure JS (fallback) ⚠️');

    results.push(bench('keygen (Native)', () => pkg.generateKeypair(), ITERATIONS.mlkem_native));

    const kp = pkg.generateKeypair();
    const enc = pkg.encapsulate(kp.publicKey);
    results.push(bench('encaps (Native)', () => pkg.encapsulate(kp.publicKey), ITERATIONS.mlkem_native));
    results.push(bench('decaps (Native)', () => pkg.decapsulate(enc.ciphertext, kp.secretKey), ITERATIONS.mlkem_native));

    console.log(results.slice(-3).map(format).join('\n'));
  } catch (e) {
    console.log('  ❌ ML-KEM package failed: ' + e.message.split('\n')[0]);
    console.log('  (trying JS fallback...)');
  }

  // --- Pure JS ---
  try {
    const js = require('../packages/pqc-kem/src/ml-kem-768.js');
    results.push(bench('keygen (JS)', () => js.generateKeypair(), ITERATIONS.mlkem_js));

    const kp2 = js.generateKeypair();
    const enc2 = js.encapsulate(kp2.publicKey);
    results.push(bench('encaps (JS)', () => js.encapsulate(kp2.publicKey), ITERATIONS.mlkem_js));
    results.push(bench('decaps (JS)', () => js.decapsulate(enc2.ciphertext, kp2.secretKey), ITERATIONS.mlkem_js));

    console.log(results.slice(-3).map(format).join('\n'));
  } catch (e) {
    console.log('  ❌ JS fallback failed: ' + e.message.split('\n')[0]);
  }

  // ================================================================
  // 2. SM2 (Mersenne optimized, in www/crypto/)
  // ================================================================
  console.log('\n🔏 SM2 (Mersenne optimized)');
  sep();

  try {
    const sm2 = require('../www/crypto/sm2-bigint-ec.js');

    results.push(bench('keygen', () => {
      const kp = sm2.generateKeyPair();
      void kp.privateKey;
    }, ITERATIONS.sm2_keygen));

    const kp = sm2.generateKeyPair();
    const pkHex = typeof kp.publicKey === 'string' ? kp.publicKey : sm2.publicKeyToHex(kp.publicKey);
    const msgHash = BigInt('0x' + crypto.createHash('sha256').update('FIBEMATE Benchmark').digest('hex'));

    results.push(bench('sign', () => {
      sm2.sign(kp.privateKey, msgHash);
    }, ITERATIONS.sm2_sign));

    const sig = sm2.sign(kp.privateKey, msgHash);
    const rS = sig.r || sig[0];
    const sS = sig.s || sig[1];
    const freshMsgHash = BigInt('0x' + crypto.createHash('sha256').update('Another message').digest('hex'));
    results.push(bench('verify', () => {
      sm2.verify(pkHex, freshMsgHash, rS, sS);
    }, ITERATIONS.sm2_verify));

    results.push(bench('encrypt', () => {
      sm2.encrypt(pkHex, 'Hello FIBEMATE');
    }, ITERATIONS.sm2_encrypt));

    const ct = sm2.encrypt(pkHex, 'Hello FIBEMATE');
    results.push(bench('decrypt', () => {
      sm2.decrypt(kp.privateKey, ct.c1, ct.c2 || ct.ciphertext);
    }, ITERATIONS.sm2_decrypt));

    console.log(results.slice(-5).map(format).join('\n'));
  } catch (e) {
    console.log('  ❌ SM2 failed: ' + e.message.split('\n')[0]);
  }

  // ================================================================
  // 3. SM3 Hash
  // ================================================================
  console.log('\n🔖 SM3 Hash');
  sep();

  try {
    // Find a working SM3 implementation
    let sm3 = null;
    try { sm3 = require('../www/js/crypto/sm3.js'); } catch(_) {}
    try { if (!sm3) sm3 = require('../www/js/sm3_implementation.js'); } catch(_) {}
    try { if (!sm3) sm3 = require('../www/crypto/sm3-browser.js'); } catch(_) {}
    // Try SM3 from SM2 reference Python pair
    try { if (!sm3) {
      const sm3Impl = require('../packages/sm3-ref/test/sm3-cross-validate.cjs');
      if (typeof sm3Impl === 'function') sm3 = sm3Impl;
    }} catch(_) {}

    if (sm3 && typeof sm3 === 'function') {
      const smallData = crypto.randomBytes(64);
      results.push(bench('SM3 (64B)', () => sm3(smallData), ITERATIONS.sm3_small));

      const largeData = crypto.randomBytes(1024);
      results.push(bench('SM3 (1KB)', () => sm3(largeData), ITERATIONS.sm3_large));
      console.log(results.slice(-2).map(format).join('\n'));
    } else if (sm3 && sm3.hash) {
      const smallData = crypto.randomBytes(64);
      results.push(bench('SM3 (64B)', () => sm3.hash(smallData), ITERATIONS.sm3_small));
      const largeData = crypto.randomBytes(1024);
      results.push(bench('SM3 (1KB)', () => sm3.hash(largeData), ITERATIONS.sm3_large));
      console.log(results.slice(-2).map(format).join('\n'));
    } else {
      console.log('  ⚠️ No functional SM3 found (CI uses ci-gm-sm3.cjs with Python ref)');
    }
  } catch (e) {
    console.log('  ❌ SM3 failed: ' + e.message.split('\n')[0]);
  }

  // ================================================================
  // 4. SM4-GCM
  // ================================================================
  console.log('\n🔒 SM4-GCM');
  sep();

  try {
    const sm4 = require('../www/crypto/sm4-browser.js');

    const key = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const smallPt = Buffer.from('Hello FIBEMATE benchmark test!');

    results.push(bench('enc (64B)', () => {
      sm4.encrypt(key, iv, smallPt);
    }, ITERATIONS.sm4_small));

    const ct = sm4.encrypt(key, iv, smallPt);
    const ctext = ct.ciphertext || ct[0];
    const tag = ct.tag || ct[1];

    results.push(bench('dec (64B)', () => {
      sm4.decrypt(key, iv, ctext, tag);
    }, ITERATIONS.sm4_small));

    const largePt = crypto.randomBytes(1024);
    results.push(bench('enc (1KB)', () => {
      sm4.encrypt(key, iv, largePt);
    }, ITERATIONS.sm4_large));

    console.log(results.slice(-3).map(format).join('\n'));
  } catch (e) {
    console.log('  ❌ SM4 failed: ' + e.message.split('\n')[0]);
  }

  // ================================================================
  // 5. Double Ratchet (PQ Hybrid)
  // ================================================================
  console.log('\n🔁 Double Ratchet (PQ Hybrid)');
  sep();

  try {
    const dr = require('../double-ratchet-pq.js');
    const DR = dr.DoubleRatchet;

    if (!DR) {
      console.log('  ⚠️ Base DoubleRatchet not loaded (standalone PQ-only mode)');
    } else {
      // async handshake + bidirectional test
      const pqKeys = dr.generatePQKeypair();
      
      results.push(await benchAsync('handshake (PQ)', async () => {
        const spkPair = await DR.generateDH();
        const spkPub = await DR.exportPublicKey(spkPair);
        const init = await dr.hybridX3DH_initiator(pqKeys.publicKey, spkPub);
        await dr.hybridX3DH_receiver(pqKeys.secretKey, spkPair, init.kemCt, init.ekPub);
      }, ITERATIONS.dr_handshake));

      // Full message roundtrip
      const spkPair = await DR.generateDH();
      const spkPub = await DR.exportPublicKey(spkPair);
      const init = await dr.hybridX3DH_initiator(pqKeys.publicKey, spkPub);
      const alice = await DR.initAsInitiator(init.rootKey, spkPub);
      const resp = await dr.hybridX3DH_receiver(pqKeys.secretKey, spkPair, init.kemCt, init.ekPub);

      results.push(await benchAsync('msg roundtrip (PQ)', async () => {
        const enc = await DR.encrypt(alice, 'bench');
        await DR.decrypt(resp.state, enc.header, enc.ciphertext, enc.iv);
      }, ITERATIONS.dr_message));

      console.log(results.slice(-2).map(format).join('\n'));
    }
  } catch (e) {
    console.log('  ❌ Double Ratchet failed: ' + e.message.split('\n')[0]);
  }

  // ================================================================
  // 6. SUMMARY TABLE
  // ================================================================
  console.log('\n' + '═'.repeat(62));
  console.log('📊  PERFORMANCE SUMMARY');
  console.log('═'.repeat(62));

  const nativeKem = results.filter(r => r.name.includes('Native'));
  const jsKem = results.filter(r => r.name.includes('JS'));
  const sm2R = results.filter(r => r.name.startsWith('SM2') || r.ok && r.name.match(/^(keygen|sign|verify|encrypt|decrypt) /));

  // Native vs JS ratio
  const nativeKeygen = nativeKem.find(r => r.name.includes('keygen'));
  const jsKeygen = jsKem.find(r => r.name.includes('keygen'));
  if (nativeKeygen?.ok && jsKeygen?.ok) {
    const ratio = jsKeygen.avgUs / nativeKeygen.avgUs;
    console.log(`\n  ML-KEM Speedup (Native vs JS):`);
    console.log(`    keygen: ${ratio.toFixed(1)}×`);
    const nativeEncaps = nativeKem.find(r => r.name.includes('encaps'));
    const jsEncaps = jsKem.find(r => r.name.includes('encaps'));
    if (nativeEncaps?.ok && jsEncaps?.ok) {
      console.log(`    encaps: ${(jsEncaps.avgUs/nativeEncaps.avgUs).toFixed(1)}×`);
    }
    const nativeDecaps = nativeKem.find(r => r.name.includes('decaps'));
    const jsDecaps = jsKem.find(r => r.name.includes('decaps'));
    if (nativeDecaps?.ok && jsDecaps?.ok) {
      console.log(`    decaps: ${(jsDecaps.avgUs/nativeDecaps.avgUs).toFixed(1)}×`);
    }
  }

  console.log('\n  ALL RESULTS:');
  results.forEach(r => console.log(format(r)));

  // FPGA comparison
  console.log('\n  📌 FPGA Reference (Artix-7 @ 50MHz):');
  console.log('    NTT roundtrip: ~10µs (503 cycles)');
  const jsNtt = results.find(r => r.name.includes('NTT'));
  if (jsNtt?.ok) {
    console.log(`    JS NTT (this machine): ${jsNtt.avgUs.toFixed(0)}µs`);
    console.log(`    FPGA speedup over JS: ${(jsNtt.avgUs/10).toFixed(0)}×`);
  }

  // Machine info
  console.log(`\n  🖥️  Machine: ${os.cpus()[0]?.model?.trim()} | Node ${process.version} | ${os.arch()}`);
  console.log(`  CPUs: ${os.cpus().length} logical | OS: ${os.platform()} ${os.release()}`);

  // JSON output
  const jsonOutput = results.filter(r => r.ok).map(r => ({
    name: r.name,
    avgUs: parseFloat(r.avgUs.toFixed(2)),
    opsPerSec: parseFloat(r.opsPerSec.toFixed(0)),
    rounds: r.rounds,
  }));
  console.log('\n  📄 JSON: ' + JSON.stringify(jsonOutput, null, 2));
}

main().catch(e => {
  console.error('\n💥 BENCHMARK FATAL:', e.message);
  process.exit(1);
});
