# ML-KEM-768 WebAssembly, FIPS 203 (not Kyber round 3)

This crate is the source of `www/crypto/wasm/mlkem-fips/`. It exists because the
old `fibemate_pq_wasm` artifact was built from `pqc_kyber 0.7.1`, which is
**Kyber round 3**: same lattice core, different key derivation and a different
final KDF. Two implementations that both say "ML-KEM-768" but disagree on shared
secrets are not interoperable — they fail silently, because the ciphertext is
well-formed and the failure only shows up as a mismatched key.

## Why this is a libcrux build and not a patched `pqc_kyber`

The instruction was: patch `pqc_kyber` to FIPS 203, and fall back to libcrux if
the patch turns out to be a rewrite. It is a rewrite. Concrete evidence from
`pqc_kyber-0.7.1`:

| FIPS 203 requirement | `pqc_kyber 0.7.1` | Location |
|---|---|---|
| `(ρ, σ) = G(d ‖ k)`, `k` = module rank byte | `indcpa_keypair(pk, sk, _seed, _rng)`; the seed parameter is **ignored** (`_seed`) | `src/kem.rs:25` |
| `KeyGen` must be reproducible from `d ‖ z` | no seed-injecting public API at all | `src/kem.rs:12`, `src/wasm.rs:10` |
| `ss = K̄` (no final KDF) | `kdf(ss, &kr, 2*KYBER_SYMBYTES)` — the Kyber round-3 KDF | `src/kem.rs:81`, `src/kem.rs:119` |
| `m` comes from the caller (ACVP) | `encapsulate(pk)` draws randomness internally | `src/wasm.rs:25` |

Changing those four points touches key generation, the CPA-PKE boundary, the
KEM encapsulation/decapsulation finals, and the WASM bindings — and would leave
us maintaining a second FIPS 203 implementation beside the one tauri already
ships. That is not a patch; it is a fork with a permanent divergence risk.

libcrux-ml-kem 0.0.10 is the same backend adopted for the desktop app in
`fibemate-tauri#81`, where its deterministic `KeyGen(d ‖ z)` was verified
byte-identical to `@noble/post-quantum`. Reusing it means **one** FIPS 203
implementation across desktop, mobile (vendored JS, oracle-checked) and web.

## Toolchain (must match exactly)

| Component | Version | Why pinned |
|---|---|---|
| rustc | 1.97.1 | recorded for reproducibility |
| target | `wasm32-unknown-unknown` | only target used |
| `wasm-bindgen` CLI | 0.2.126 | the bindgen schema must match the crate **exactly**; a mismatch fails at bindgen time, not at build time |
| `wasm-bindgen` crate | `=0.2.126` | see above |
| `libcrux-ml-kem` | `=0.0.10` | pre-1.0 crate; drifting minor versions silently changes the surface |

## Build

```bash
./build.sh                 # writes www/crypto/wasm/mlkem-fips/
OUT=/tmp/out ./build.sh    # or somewhere else
```

`build.sh` keeps `CARGO_TARGET_DIR` outside the repository. The generated
`mlkem_fips_bg.wasm` is committed on purpose (`.gitignore` has a blanket
`*.wasm` rule — add it with `git add -f`) so that a deploy never depends on a
Rust toolchain being present on the server.

## Surface

Deterministic only: the JS layer owns randomness, the module owns the maths.

```js
keygen_derand(d, z) -> Uint8Array(1184 + 2400)   // pk ‖ sk,  KeyGen_internal(d, z)
encaps_derand(pk, m) -> Uint8Array(1088 + 32)    // ct ‖ ss,  Encaps_internal(ek, m)
decaps(sk, ct)      -> Uint8Array(32)            // implicit rejection on bad ct
validate_public_key(pk) -> bool                  // FIPS 203 §7.2
version()           -> string
```

Errors are thrown as JS exceptions for wrong lengths and for keys that fail
§7.2/§7.3; a *tampered* ciphertext does **not** throw — it returns the FIPS 203
implicit-rejection value, which is the standard's required behaviour.

## Verification

`test/mlkem-wasm-fips.test.cjs` loads the committed artifact in Node
(`initSync`) and compares against `@noble/post-quantum 0.7.1` on three fixed
seeds:

- pk, sk, ct, ss byte-identical in all three;
- our `decaps` equals noble's shared secret;
- noble can decapsulate **our** ciphertext (cross-direction, not self-consistent);
- tampered ciphertext returns a different 32-byte secret and does not throw;
- wrong lengths fail closed;
- a non-canonical 12-bit coefficient in `ek` is rejected by `validate_public_key`.

`build.sh` prepends the SPDX line to the generated glue: the repository's
`spdx:check` gate requires a header on every tracked `.js`, and bindgen does
not emit one. The `.wasm` bytes are unaffected by that post-step.

Artifact hashes at the time of writing (sha256):

```
92bc1cd91cb18678d4ce9292fb3aa8125d0427826c13c99b4d820e75d9eebab1  mlkem_fips_bg.wasm   (139,929 B)
3d64bc45e30bcb6437d2feb4f1b7e6c8e10bc90c8d0f5a5e6d0a0bda7ab5b44f  mlkem_fips.js
431594e92badb9496cb59109f2d70b5a91e36c6d49951335968ec15d29009861  mlkem_fips.d.ts
```

## Limits (what this does not claim)

- **Not a security review of libcrux.** It is the backend we already ship on the
  desktop; the formal-verification story is libcrux's, not ours.
- **No constant-time claim in the browser.** WASM has no portable constant-time
  guarantee; timing behaviour depends on the engine's JIT.
- **The old `fibemate_pq_wasm` artifact is unchanged.** Nothing in `www/` loads
  the new module yet; switching consumers over is a separate change with its own
  review. Until then this crate is a verified artifact plus a gate, not a
  replacement of the production path.
