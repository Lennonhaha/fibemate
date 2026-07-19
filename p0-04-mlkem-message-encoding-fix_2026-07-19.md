# P0-04: ML-KEM-768 KEM Roundtrip Failure — Root Cause & Fix

**Date**: 2026-07-19  
**Severity**: P0 (critical — KEM self-consistency completely broken)  
**Status**: ✅ Fixed & Validated

---

## Root Cause

**2-bit message encoding** used in `www/crypto/crypto/ml-kem-768.js`:

```javascript
// ❌ Wrong (2-bit/coefficient)
for (let i = 0; i < 256; i++)
  mPoly[i] = ((m[i>>2] >> (2*(i&3))) & 3) * Math.floor(KYBER_Q/4);
// ...
for (let i = 0; i < 256; i++)
  mPrime[i>>2] |= mpc[i] << (2*(i&3));
```

ML-KEM FIPS 203 specifies **1-bit/coefficient** with `compress(_, 1)`:

```javascript
// ✅ Correct (1-bit/coefficient, FIPS 203 §4.2)
for (let i = 0; i < 256; i++)
  mPoly[i] = ((m[i>>3] >> (i&7)) & 1) * Math.floor(KYBER_Q/2);
// ...
for (let i = 0; i < 256; i++)
  mPrime[i>>3] |= mpc[i] << (i&7);
```

**Why it fails**: The K-PKE layer's `compress(mp, 1)` recovers only 1 bit per coefficient from the decompressed polynomial, but the encoding reads 2 bits per coefficient from `m`. The high bit of each 2-bit group is noise from decompression rounding — `mPrime ≠ m` after decode → `K_bar_prime ≠ K_bar` → `ss ≠ ss'` → **KEM roundtrip always fails**.

## Fix

3 lines changed in `www/crypto/crypto/ml-kem-768.js`:

| Line | Change |
|------|--------|
| `mPoly` encode (encapsulate) | `i>>2,2*(i&3),&3,Math.floor(Q/4)` → `i>>3,i&7,&1,Math.floor(Q/2)` |
| `mPrime` decode (decapsulate) | `i>>2,2*(i&3)` → `i>>3,i&7` |
| `mPoly2` re-encode (decapsulate) | `i>>2,2*(i&3),&3,Math.floor(Q/4)` → `i>>3,i&7,&1,Math.floor(Q/2)` |

## Copy Matrix

| Path | MD5 | Status |
|------|-----|--------|
| `www/crypto/crypto/ml-kem-768.js` | 643F8648… | ✅ Fixed (was buggy) |
| `packages/pqc-kem/src/ml-kem-768.js` | 23E9B1DB… | ✅ Already correct (NTT-domain variant) |
| `www/crypto/ml-kem-768.js` | 44B3748D… | ✅ Already correct (1-bit encoding) |
| `public/crypto/crypto/ml-kem-768.js` | E8B8FCB4… | ⚠️ Different variant (hash.js dependency, can't load standalone) |

## Validation

- **100/100 KEM roundtrip** PASS
- **20/20 distinct SS** per encaps (same pk) PASS
- CT & SS **non-deterministic** PASS
- **Tampered ciphertext** → different SS PASS
- Key sizes: pk=1184, sk=2400, ct=1088, ss=32 — all match FIPS 203

## Lessons

1. **2-bit vs 1-bit encoding**: The ML-KEM message encoding uses 1 bit per polynomial coefficient (not 2), because `compress(_, 1)` only preserves 1 bit of information per coefficient. Mixing 2-bit encoding with 1-bit compression loses the high bit → deterministic failure.

2. **4 divergent copies**: The workspace has 4 different implementations of ML-KEM-768 with different MD5 hashes. One was buggy, three were correct. This is a maintainability hazard — consider consolidating to a single canonical source.

3. **Test gap**: The KEM module had no roundtrip self-test. A simple `encapsulate(decapsulate(...))` test would have caught this immediately.
