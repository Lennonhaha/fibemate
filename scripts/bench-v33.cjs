// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
#!/usr/bin/env node
// FIBEMATE v3.3-preview Comprehensive Benchmark
// Covers: ML-KEM-768 (Native/JS), SM2 Mersenne, SM3, SM4-GCM, FPGA NTT reference

'use strict';

const { performance } = require('perf_hooks');
const crypto = require('crypto');

const WARMUP = 10;
const ROUNDS = { mlkem: 1000, sm2: 500, sm3: 5000, sm4: 1000 };

function bench(name, fn, rounds = 1000, warmup = 10) {
  for (let i = 0; i < warmup; i++) fn();
  const start = performance.now();
  for (let i = 0; i < rounds; i++) fn();
  const elapsed = performance.now() - start;
  return { name, rounds, totalMs: elapsed, avgUs: (elapsed / rounds * 1000) };
}

function format(r) {
  return `${r.name}: ${r.avgUs.toFixed(1)}µs ×${r.rounds} (total ${r.totalMs.toFixed(1)}ms)`;
}

async function main() {
  const results = [];

  // ========== ML-KEM-768 ==========
  console.log('=== ML-KEM-768 ===');
  try {
    const mlkem = require('../packages/pqc-kem');
    if (typeof mlkem.keygen !== 'function') throw new Error('no keygen');
    
    // Keygen
    results.push(bench('ML-KEM keygen', () => {
      const kp = mlkem.keygen();
    }, ROUNDS.mlkem));
    
    // Encaps
    const kp = mlkem.keygen();
    results.push(bench('ML-KEM encaps', () => {
      const ct = mlkem.encaps(kp.publicKey);
    }, ROUNDS.mlkem));
    
    // Decaps
    const ct = mlkem.encaps(kp.publicKey);
    results.push(bench('ML-KEM decaps', () => {
      const ss = mlkem.decaps(ct, kp.secretKey);
    }, ROUNDS.mlkem));
    
    results.forEach(r => console.log('  ' + format(r)));
  } catch (e) {
    console.log('  ML-KEM SKIP: ' + e.message);
  }

  // ========== SM2 Mersenne ==========
  console.log('\n=== SM2 (Mersenne optimized) ===');
  try {
    const sm2 = require('../packages/pqc-kem/src/sm2-bigint-ec-v1.2.cjs');
    if (typeof sm2.generateKeyPair !== 'function') throw new Error('no SM2');
    
    const kp = sm2.generateKeyPair();
    
    results.push(bench('SM2 keygen', () => {
      sm2.generateKeyPair();
    }, ROUNDS.sm2));
    
    results.push(bench('SM2 sign', () => {
      sm2.sign(crypto.randomBytes(32), kp.privateKey);
    }, ROUNDS.sm2));
    
    const sig = sm2.sign(crypto.randomBytes(32), kp.privateKey);
    results.push(bench('SM2 verify', () => {
      sm2.verify(Buffer.from(crypto.randomBytes(32)).toString('hex'), sig, kp.publicKey);
    }, ROUNDS.sm2));
    
    results.forEach(r => console.log('  ' + format(r)));
  } catch (e) {
    console.log('  SM2 SKIP: ' + e.message);
  }

  // ========== SM3 ==========
  console.log('\n=== SM3 ===');
  try {
    // Try finding SM3 module
    let sm3;
    try { sm3 = require('../packages/pqc-kem/src/sm3.cjs'); } catch(_) {}
    try { if (!sm3) sm3 = require('../src/crypto/sm3'); } catch(_) {}
    
    const data = crypto.randomBytes(64);
    results.push(bench('SM3 (64B)', () => {
      sm3(data);
    }, ROUNDS.sm3));
    
    const big = crypto.randomBytes(1024);
    results.push(bench('SM3 (1KB)', () => {
      sm3(big);
    }, ROUNDS.sm3 / 5));
    
    results.forEach(r => console.log('  ' + format(r)));
  } catch (e) {
    console.log('  SM3 SKIP: ' + e.message);
  }

  // ========== SM4-GCM ==========
  console.log('\n=== SM4-GCM ===');
  try {
    let sm4gcm;
    try { sm4gcm = require('../packages/pqc-kem/src/sm4-gcm-v2.cjs'); } catch(_) {}
    try { if (!sm4gcm) sm4gcm = require('../src/crypto/sm4-gcm'); } catch(_) {}
    
    if (sm4gcm && typeof sm4gcm.encrypt === 'function') {
      const key = crypto.randomBytes(16);
      const iv = crypto.randomBytes(12);
      const pt = crypto.randomBytes(64);
      
      results.push(bench('SM4-GCM enc (64B)', () => {
        sm4gcm.encrypt(key, iv, pt);
      }, ROUNDS.sm4));
      
      const ct = sm4gcm.encrypt(key, iv, pt);
      results.push(bench('SM4-GCM dec (64B)', () => {
        sm4gcm.decrypt(key, iv, ct.ciphertext, ct.tag);
      }, ROUNDS.sm4));
      
      const big = crypto.randomBytes(1024);
      results.push(bench('SM4-GCM enc (1KB)', () => {
        sm4gcm.encrypt(key, iv, big);
      }, ROUNDS.sm4 / 2));
      
      results.forEach(r => console.log('  ' + format(r)));
    }
  } catch (e) {
    console.log('  SM4-GCM SKIP: ' + e.message);
  }

  // ========== Double Ratchet ==========
  console.log('\n=== Double Ratchet (PQ Hybrid) ===');
  try {
    const dr = require('../double-ratchet-pq.js');
    const exports = Object.keys(dr);
    console.log('  Exports: ' + exports.join(', '));
    
    // Try handshake if available
    if (typeof dr.hybridHandshakeInitiate === 'function') {
      // Generate seeds
      const seed1 = crypto.randomBytes(32);
      const seed2 = crypto.randomBytes(32);
      
      results.push(bench('DR handshake (PQ)', () => {
        const init = dr.hybridHandshakeInitiate(seed1);
        const resp = dr.hybridHandshakeRespond(seed2, init.message);
      }, 100));
      console.log('  ' + format(results[results.length-1]));
    } else {
      console.log('  No hybridHandshakeInitiate export, checking available functions...');
    }
    
    // Try message ratchet
    if (typeof dr.ratchetEncrypt === 'function') {
      results.push(bench('DR ratchet encrypt', () => {
        dr.ratchetEncrypt(crypto.randomBytes(32));
      }, 500));
      console.log('  ' + format(results[results.length-1]));
    }
  } catch (e) {
    console.log('  DR SKIP: ' + e.message.split('\n')[0]);
  }

  // ========== NTT (JS reference for FPGA comparison) ==========
  console.log('\n=== NTT (JS reference) ===');
  try {
    const { execSync } = require('child_process');
    // Try to find NTT JS implementation
    let nttPath;
    try { 
      execSync('ls ../packages/pqc-kem/src/ntt*.js', {cwd: __dirname}); 
      nttPath = '../packages/pqc-kem/src/ml-kem-768.js';
    } catch(_) {}
    
    if (nttPath) {
      const mlkem768 = require(nttPath);
      // Just use keygen as NTT stress test
      results.push(bench('NTT roundtrip (via keygen)', () => {
        mlkem768.keygen();
      }, 200));
      console.log('  ' + format(results[results.length-1]));
      console.log('  FPGA reference: ~10µs @ 50MHz (503 cycles)');
    }
  } catch (e) {
    console.log('  NTT SKIP: ' + e.message);
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY (all times in µs, lower = faster)');
  console.log('='.repeat(60));
  results.forEach(r => console.log(format(r)));

  // Machine info
  const os = require('os');
  console.log('\nMachine: ' + os.cpus()[0]?.model + ' | ' + os.arch() + ' | Node ' + process.version);
  console.log('CPUs: ' + os.cpus().length + ' logical');
}

main().catch(e => { console.error('BENCH FATAL:', e.message); process.exit(1); });
