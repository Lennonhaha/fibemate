# VWZ 148/148 Full Validation Report

**Date**: 2026-07-18 | **Node**: v22.22.2 | **KS**: [2, 4, 8, 16, 32]  
**TSR**: lg-083 (DigiCert, SHA-512, Granted) | **FIBEMATE**: v3.3-preview

## Result

```
VWZ: 148P / 0F / 148 total
OK 148/148 — VWZ 148/148 verified.
```

## Test Groups (15)

| # | Group | Tests | Result |
|---|-------|-------|--------|
| 1-2 | Basic Roundtrip + Multi-Message (k=2,4,8,16,32) | 20 | ✅ |
| 3 | Wrong Message Rejection | 5 | ✅ |
| 4 | Wrong Public Key Rejection | 5 | ✅ |
| 5 | Public Key Serialization (3 roundtrips/k) | 15 | ✅ |
| 6 | Signature Serialization (3 roundtrips/k) | 15 | ✅ |
| 7 | Size Estimates (pk+sig bytes, rank-1 compression) | 5 | ✅ |
| 8 | Seeded Keygen Determinism (`BigInt` seed) | 5 | ✅ |
| 9 | Edge Messages (empty / unicode / 10KB) | 15 | ✅ |
| 10 | Cross-k Incompatibility (mixed k-values) | 10 | ✅ |
| 11 | Keypair Uniqueness (no two same PK) | 5 | ✅ |
| 12 | Tampered Signature Bytes (byte-level mutation, 9 positions × 5 k) | 45 | ✅ |
| 13 | Zero-Length Signature Rejection | 1 | ✅ |
| 14 | Tampered Public Key Rejection | 1 | ✅ |
| 15 | Batch 50 (one key, 50 messages) | 1 | ✅ |

## Bugs Found & Fixed (Test Script Only)

| Round | Symptom | Root Cause | Fix |
|-------|---------|------------|-----|
| 1 | `keygen_seeded` all 5 fail | `seed: u64` in Rust → wasm-bindgen requires JS `BigInt`. Script passed `Buffer`/`Number`/hex string. | `BigInt(Math.floor(...))` |
| 2 | Tamper tests silently pass false | `VwzSignature` is a WASM wrapper object; `sig[0] ^= 0xFF` mutates JS shell, not the underlying bytes. | `serialize_signature()` → byte mutation → `deserialize_signature()` |
| 3 | Short-signature index out-of-bounds | k=2 signature is 11 bytes, k=4 is 21 bytes; fixed `byteIdxs` array (up to 36) exceeded short sig length. | `Math.min(idx, ser.length-1)` clamp |

**Zero bugs in the VWZ algorithm itself** — all three fixes were test-script API comprehension issues.

## Key Dimensions Verified

- ✅ All five security parameter sizes (k=2,4,8,16,32)
- ✅ Correctness under serialization roundtrips (PK + Sig)
- ✅ Rejection of wrong messages, wrong public keys, tampered signatures
- ✅ Deterministic key generation from seeded state
- ✅ Cross-parameter incompatibility (sign with k=8, verify with k=16 → reject)
- ✅ Keypair uniqueness (randomized keygen never produces duplicate PK)
- ✅ Edge cases: empty message, Unicode, 10KB payload, zero-length signature
- ✅ Batch throughput: 50 sequential sign+verify on single key

## Artifacts

| Artifact | Path |
|----------|------|
| Test suite | `scripts/vwz-148-test.js` |
| TSR (DigiCert) | `www/docs/tsa/2026-07-18/lg-083-vwz-148-suite-20260718.tsr` |
| Rust WASM source | `www/crypto/vwz/vwz_signature_bg.wasm` |
| Reduction proof | `docs/research/route-c-lvwz-phase1-math.md` (VMQ-SPARSE → EUF-CMA) |
| ePrint | `papers/vwz-eprint-2026.pdf` (IACR 2026/110618, pending) |
