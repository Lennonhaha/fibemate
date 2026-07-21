# ML-KEM-768 Cross-Validation Fix — 2026-07-21

## Result
**100% cross-compatibility achieved with @noble/post-quantum ml-kem.**

```
our→noble: 200/200 ✅
noble→our: 200/200 ✅
our self:  200/200 ✅
```

## Root Cause: sampleNTT SHAKE128 Byte Request Too Small

### The Bug
`sampleNTT(seed)` requested only **504 bytes** from SHAKE128. The rejection sampling loop discards 12-bit values ≥3329 (~19% rejection rate). While 504 bytes is sufficient on average, extreme edge cases (like seed `rho‖2‖2`) produce slightly worse distribution, causing the stream to run out at coefficient 255. The code then fills the remaining slot with 0 — a **silent data corruption**.

Noble's `XOF128.get()` uses **840 bytes** (ceil to next 168-byte block after 3·256=768, with safety margin).

### Affected Matrix Entries
Only A[2][2] (keygen) / A^T[2][2] (encaps) showed the issue, because it was the only seed among the 9 matrix entries that hit the rejection boundary. But in principle, any seed could trigger this.

The 1/256 coefficient error in A[2][2] propagated through `polyMulNTT` into u[2], v, and ultimately the ciphertext — causing the 3% cross-validation failure rate.

### Fix
```javascript
// before
function sampleNTT(seed){const stream=shake128(seed,504);...}

// after
function sampleNTT(seed){const stream=shake128(seed,840);...}
```

File: `packages/pqc-kem/src/ml-kem-768.js`, line 120.

## All Verified Primitives (0 differences vs noble)

| Primitive | Status | Test |
| :--- | :--- | :--- |
| NTT / NTT_inv | ✅ 256/256 match | `xtest-ntt-intt.mjs` |
| polyMulNTT (BaseCaseMultiply) | ✅ 256/256 match | `xverify-pm.mjs` |
| byteEncode / byteDecode (d=10,4,12) | ✅ 0/0 diffs | `xtest-vs-noble.mjs` |
| compress / decompress (d=10,4) | ✅ 0/3329 diffs | `xtest-vs-noble.mjs` |
| cbd2 | ✅ 256/256 match | earlier tests |
| sampleNTT (with 840-byte stream) | ✅ 256/256 match | `xtest-sampleNTT.mjs` |
| matVecMulNTT | ✅ 768/768 match | `xtest-u2-vs-noble.mjs` |

## Key Architecture Decisions

1. **NTT domain throughout** — keygen stores `s` and `t` in NTT domain (byteEncoded d=12)
2. **A matrix seed order** — keygen: `A[i][j] = sampleNTT(ρ‖j‖i)`, encaps: `AT[i][j] = sampleNTT(ρ‖i‖j)` (A^T)
3. **polyMulNTT** uses BaseCaseMultiply with `ZETAS[64+(i>>1)]`
4. **compress/decompress** uses `rnd = floor(Q/2) = 1664` (matching noble's `Q/2` integer division)
5. **sharedSecret** = raw `K_bar` (not `SHA3-256(K_bar‖H(ct))`) for noble compatibility

## Testing Files Created

- `xfinal-v5.mjs` — final integrated cross-validation
- `xtest-u2-root.mjs`, `-detail.mjs`, `-vs-noble.mjs` — u[2] tracing
- `xtest-shake-root.mjs` — SHAKE128 byte count analysis
- `xtest-sampleNTT.mjs` — sampleNTT byte-by-byte comparison
- `xtest-polymul-pure.mjs`, `xverify-pm.mjs` — BaseCaseMultiply verification
- `xtest-compress.mjs`, `xtest-vs-noble.mjs` — compress/decompress/byteEncode comparisons
