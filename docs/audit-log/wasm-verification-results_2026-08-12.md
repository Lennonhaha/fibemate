# LG v2.2 Real WASM Verification — 2026-08-12 06:17 CST

## Environment
- Rust 1.95.0, wasm-pack 0.14.0, Node.js v22.22.3
- Source: D:\FIBEMATE\rust\lookingglass_v2
- Build: `wasm-pack build --target nodejs --release`
- WASM: ~30KB (release + wasm-opt), 7-layer wreath-product + sparse offset
- Test script: `experimental/vwz-lg/attack/test-real-wasm.js`

## Results

```
depth:              7
active_dim:         48
has_session before: false
roundtrip_test #1:  true
roundtrip_test #2:  true
has_session after init: true
manual roundtrip:   256/256    ← apply_forward → apply_inverse: 100%
determinism:        256/256    ← same session: deterministic
session uniqueness: 48/256 diff ← different session: active subspace differs
tail passthrough:   208/208    ← sparse: only 0..47 touched, 48..255 passthrough
```

## Test Details

| Test | Result | Notes |
|------|:---:|------|
| built-in roundtrip_test | true x2 | `apply_forward` → `apply_inverse` = identity |
| manual roundtrip | 256/256 | byte-for-byte verification |
| session determinism | 256/256 | same session → same output |
| session uniqueness | 48/256 diff | wipe_session() → different session → different output |
| tail passthrough | 208/208 | sparse offset: only active 0..47, identity 48..255 |
| active_dim | 48 | 1×1×2×2×3×2×2 = 48 |

## Key Findings

1. **Roundtrip is 100% correct** on real WASM (Rust → wasm-bindgen → Node.js)
2. **Sparse offset model confirmed**: only first 48 dimensions carry affine offset; tail 208 are identity passthrough
3. **Session-based randomness**: wipe_session() → new offset + new layer permutation → different output
4. **Python simulation aligns**: the XOR+S-box+Fisher-Yates model in collect-samples.py is a simplified analog; the real WASM uses (affine permuted matrix × vector) + sparse offset (mod Q=3329)
5. **Dev build crashes** (memory OOB in expand_to_256) → use --release

## Build Notes
- `wasm-pack build --target nodejs --dev`: memory access out of bounds (debug assertions blow stack for 256×256 matrix)
- `wasm-pack build --target nodejs --release`: works, wasm-opt pass, ~30KB gzipped
- WASM exports: apply_forward, apply_inverse, roundtrip_test, get_depth, get_active_dim, wipe_session, has_session, wipe_offset, has_offset
