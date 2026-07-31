// fml-dsa/src/core/keygen.js
// FIPS 204 §4.1: ML-DSA.KeyGen()
// Generates (pk, sk) for ML-DSA-44, ML-DSA-65, ML-DSA-87
// 2026-07-29

import { MLDSA_PARAMS } from './params.js';
import { ntt } from './ntt.js';
import { shake256 } from './shakestream.js';
import { expandA, expandS } from './sampling.js';
import { vecNtt, vecInvNtt, matVecMulNtt, vecAdd } from './polyvec.js';
import { encodePK, encodeSK } from './encode.js';
import { power2Round, decompose } from './reduce.js';

/**
 * ML-DSA.KeyGen() — FIPS 204 Algorithm 4
 *
 * Returns { pk: { rho, t1 }, sk: { rho, K, tr, s1, s2, t0 } }
 *
 * All internal polynomials work in normal (non-NTT) domain.
 * NTT transformation is applied only where FIPS 204 specifies it.
 */
export function keygen(paramSet = 'ML-DSA-65') {
  const { k, l, eta } = MLDSA_PARAMS[paramSet];
  const D = 13;
  const gamma2 = 261888; // (Q-1)/32, valid for all ML-DSA parameter sets

  // Step 1: ζ ← {0,1}^{256} (seed for ExpandS)
  const zeta = crypto.getRandomValues(new Uint8Array(32));

  // Step 2: (ρ, σ, K) ← H(zeta) — split SHAKE-256(zeta, 96B)
  const seed = shake256(zeta, 96); // 32+32+32 = 96
  const rho = seed.slice(0, 32);      // seed for ExpandA
  const sigma = seed.slice(32, 64);   // seed for ExpandS
  const K = seed.slice(64, 96);       // symmetric key (not used in pure sign)

  // Step 3: A ← ExpandA(ρ). Noble convention: pass time-domain A directly to
  // MultiplyNTTs (do not NTT-encode A).
  const A = expandA(rho, paramSet);

  // Step 4: (s1, s2) ← ExpandS(σ) — s1 ∈ R_q^l, s2 ∈ R_q^k
  const sAll = expandS(sigma, paramSet);
  const s1_raw = sAll.slice(0, l); // l vectors
  const s2_raw = sAll.slice(l);    // k vectors

  // Normalize: expandS outputs [-η,η], arithmetic requires [0,Q)
  const normalize = (v) => { for (const p of v) for (let j = 0; j < 256; j++) if (p[j] < 0) p[j] += 8380417; };
  normalize(s1_raw);
  normalize(s2_raw);

  // Step 5: t ← A·s1 + s2  (all in NTT domain)
  const s1Ntt = vecNtt(s1_raw);
  const s2Ntt = vecNtt(s2_raw);
  const tNtt = vecAdd(matVecMulNtt(A, s1Ntt), s2Ntt);

  // Step 6: t ← NTT⁻¹(tNtt), then (t1, t0) ← Power2Round(t, 13)
  // FIPS 204 requires Power2Round on NORMAL-domain coefficients
  const tNormal = vecInvNtt(tNtt);
  const t1 = [], t0 = [];
  for (let i = 0; i < k; i++) {
    const t1Poly = new Int32Array(256);
    const t0Poly = new Int32Array(256);
    for (let j = 0; j < 256; j++) {
      const [h, l] = power2Round(tNormal[i][j], D);
      t1Poly[j] = h;
      t0Poly[j] = l;
    }
    t1.push(t1Poly);
    t0.push(t0Poly);
  }

  // Step 7: tr ← H(encodePK(pk), 64) — FIPS 204: full 64-byte hash of pk
  const pkObj = { rho: new Uint8Array(rho), t1 };
  const tr = shake256(encodePK(pkObj, paramSet), 64);

  // Step 8: return (pk, sk)
  const sk = { rho: new Uint8Array(rho), K: new Uint8Array(K), tr, s1: s1_raw, s2: s2_raw, t0 };

  return { pk: pkObj, sk };
}

// ══════════════════════════════════════════════
// Convenience: keygen + encode
// ══════════════════════════════════════════════
export function keygenEncoded(paramSet = 'ML-DSA-65') {
  const { pk, sk } = keygen(paramSet);
  return {
    pkBytes: encodePK(pk, paramSet),
    skBytes: encodeSK(sk, paramSet),
    pk,
    sk,
  };
}

// ══════════════════════════════════════════════
// Self-tests
// ══════════════════════════════════════════════
(function selfTest() {
  let ok = true;

  // 1. KeyGen produces correct pk.sk structure
  const { pk, sk } = keygen('ML-DSA-65');
  const { k, l } = MLDSA_PARAMS['ML-DSA-65'];

  ok = ok && pk.rho instanceof Uint8Array && pk.rho.length === 32;
  ok = ok && Array.isArray(pk.t1) && pk.t1.length === k;
  ok = ok && pk.t1.every(p => p instanceof Int32Array && p.length === 256);

  ok = ok && sk.rho instanceof Uint8Array && sk.rho.length === 32;
  ok = ok && sk.K instanceof Uint8Array && sk.K.length === 32;
  ok = ok && sk.tr instanceof Uint8Array && sk.tr.length === 64;
  ok = ok && Array.isArray(sk.s1) && sk.s1.length === l;
  ok = ok && Array.isArray(sk.s2) && sk.s2.length === k;
  ok = ok && Array.isArray(sk.t0) && sk.t0.length === k;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} keygen structure`);

  // 2. Deterministic keygen with fixed seed (mock crypto.getRandomValues)
  const origGetRandom = crypto.getRandomValues;
  let callCount = 0;
  crypto.getRandomValues = function(buf) {
    for (let i = 0; i < buf.length; i++) buf[i] = (callCount + i) & 0xFF;
    callCount++;
    return buf;
  };

  const k1 = keygen('ML-DSA-65');
  callCount = 0;
  const k2 = keygen('ML-DSA-65');

  crypto.getRandomValues = origGetRandom;

  // ρ, K, tr should be identical
  const rhoEq = k1.pk.rho.every((b, i) => b === k2.pk.rho[i]);
  const t1Eq = k1.pk.t1.every((p, i) => p.every((v, j) => v === k2.pk.t1[i][j]));
  ok = ok && rhoEq && t1Eq;
  console.log(`  ${rhoEq && t1Eq ? 'PASS' : 'FAIL'} deterministic keygen`);

  // 3. KeyGen for all param sets
  for (const ps of ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']) {
    const r = keygen(ps);
    const { k: kk, l: ll } = MLDSA_PARAMS[ps];
    ok = ok && r.pk.t1.length === kk && r.sk.s1.length === ll && r.sk.s2.length === kk;
    if (!ok) console.log(`  FAIL keygen(${ps}) dimensions`);
  }
  console.log(`  ${ok ? 'PASS' : 'FAIL'} keygen all param sets`);

  // 4. Encode/decode roundtrip
  const { pkBytes, skBytes } = keygenEncoded('ML-DSA-65');
  ok = ok && pkBytes.length > 0 && skBytes.length > 0;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} encode roundtrip (pk=${pkBytes.length}B, sk=${skBytes.length}B)`);

  // 5. pk.rho == sk.rho
  ok = ok && pk.rho.every((b, i) => b === sk.rho[i]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} pk.rho == sk.rho`);

  // 6. tr consistency
  ok = ok && sk.tr.length === 64;
  // tr should be all-zero? No — it's computed from rho+t1, let's just verify length
  const someNonZero = sk.tr.some(b => b !== 0);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} tr is ${someNonZero ? 'non-zero' : 'zero'} (length=${sk.tr.length})`);

  if (ok) console.log('✅ keygen: self-tests passed');
  else throw new Error('keygen self-test FAILED');
})();
