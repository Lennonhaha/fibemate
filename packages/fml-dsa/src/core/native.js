// SPDX-License-Identifier: GPL-3.0-only
// fml-dsa/src/core/native.js — ML-DSA API factory
// Phase 1: noble-backed stubs (algorithm provided by @noble/post-quantum)
// Phase 1 wraps @noble/post-quantum: the KeyGen 75/75 NIST ACVP result belongs to that backend,
// not to code in this package. The wrapper's own surface is checked by test/fml-dsa.test.js
// against the same vectors; sign/verify additionally uses a noble oracle (7/7).

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(resolve(__dirname, '..', '..', '..', '..', 'www', 'noble-pq-bundle', 'ml-dsa.js'), 'utf8');
eval(bundle.replace('var __NOBLE_PQ__', 'globalThis.__NOBLE_PQ__'));
const noble = globalThis.__NOBLE_PQ__;

// ── Parameter sets ──
// FIPS 204 Table 1
const PS = {
  44:  { q: 8380417n, N: 256, k: 4, l: 4, η: 2,  τ: 39,  β: 78,   γ1: 2**17, γ2: ((8380417-1)/88)|0, ω: 80,  name: 'ML-DSA-44' },
  65:  { q: 8380417n, N: 256, k: 6, l: 5, η: 4,  τ: 49,  β: 196,  γ1: 2**19, γ2: ((8380417-1)/32)|0, ω: 55,  name: 'ML-DSA-65' },
  87:  { q: 8380417n, N: 256, k: 8, l: 7, η: 2,  τ: 60,  β: 120,  γ1: 2**19, γ2: ((8380417-1)/32)|0, ω: 75,  name: 'ML-DSA-87' },
};

function createAPI(nobleFn, params) {
  const p = params;
  return {
    // Phase 1: noble-backed KeyGen
    keygen(seed) {
      const keys = nobleFn.keygen(seed);
      return { publicKey: keys.publicKey, secretKey: keys.secretKey };
    },

    // Phase 1: noble-backed Sign (FIPS 204 opts passthrough: { context?, extraEntropy?, externalMu? })
    sign(msg, sk, opts) {
      return nobleFn.sign(msg, sk, opts);
    },

    // Phase 1: noble-backed Verify (FIPS 204 opts passthrough: { context? })
    verify(sig, msg, pk, opts) {
      return nobleFn.verify(sig, msg, pk, opts);
    },

    params: p,
    name: p.name,
  };
}

export const ml_dsa44_raw = createAPI(noble.ml_dsa44, PS[44]);
export const ml_dsa65_raw = createAPI(noble.ml_dsa65, PS[65]);
export const ml_dsa87_raw = createAPI(noble.ml_dsa87, PS[87]);
