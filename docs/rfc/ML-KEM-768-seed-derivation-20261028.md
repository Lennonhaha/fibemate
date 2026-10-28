<!-- SPDX-License-Identifier: Apache-2.0 -->
# RFC: ML-KEM-768 seed derivation in `src/crypto/ml-kem-768-td.js`

Status: **draft — decision needed, no code changed**
Date: 2026-10-28
Scope: `fibemate` repo. Not part of any release; nothing in this document has been deployed.

## 1. What was found

`src/crypto/ml-kem-768-td.js` (the pure time-domain implementation, no NTT) derives the
key-generation seed as

```
const seed = sha3_512(d);           // line 275 (generateKeypair)
const keyseed = sha3_512(d);        // line 486 (generateKeypairWithSeed)
```

FIPS 203 (ML-KEM, Algorithm 13 step 1) specifies `(ρ, σ) = G(d ‖ k)`, where `k` is the
module rank: 2 for ML-KEM-512, 3 for 768, 4 for 1024. The seed input therefore has to be
33 bytes, not 32.

The other two implementations in this repository do include `k`:

| file | line | expression |
|---|---|---|
| `packages/pqc-kem/src/ml-kem-768.js` | 238 | `sha3_512(new Uint8Array([...d, K]))` |
| `www/crypto/ml-kem-768.js` | 148 | `sha3_512(new Uint8Array([...d, 3]))` |
| `src/crypto/ml-kem-768-td.js` | 275, 486 | `sha3_512(d)` — **missing `k`** |

So the repository ships two different key-generation derivations under the same algorithm
name. That much is a code-reading fact; the rest of this document is measurement.

## 2. Measurements (2026-10-28, local)

Oracle: `@noble/post-quantum@0.4.1` (`ml-kem768`), an implementation independent of this
repository, installed into a scratch directory only (not added to any `package.json`).

Fixed input: `seed[i] = i` for `i = 0..63`, split as `d = seed[0..32)`, `z = seed[32..64)`.

| check | result |
|---|---|
| `packages/pqc-kem` ek === noble ek | **true** (bit-identical) |
| `packages/pqc-kem` dk === noble dk | **true** (bit-identical) |
| `packages/pqc-kem` decaps(noble ct) === noble ss | **true** |
| `td` ek === noble ek | **false** |
| noble encaps → `td` decaps | **false** |
| `td` encaps → noble/`packages` decaps | **false** |
| `packages` encaps → `td` decaps | **false** |
| `td` self round-trip (own pk, own sk) | **true** |
| `packages` self round-trip | **true** |

Each implementation is internally consistent; they cannot talk to each other, in either
direction, and `td` cannot talk to the independent oracle.

## 3. Why this is not a one-line fix

The missing `k` explains a different key pair for a given `d`, but **not** the interop
failure. Key generation only chooses `(ρ, σ)`; any `(ρ, σ)` yields a valid ML-KEM key pair,
and a conformant peer can encapsulate to that public key and the holder can decapsulate.
Interop failing in all three directions means there is at least one further divergence in a
convention that both sides must share — public-key byte layout, the `A`-matrix sample
indexing, or ciphertext compression/decompression.

A fix therefore needs a full audit of `td` against FIPS 203, not a `sed` on three lines.
Claiming otherwise would be the same false-green pattern this repository keeps finding: a
"fix" that makes the visible symptom disappear while the divergence survives.

## 4. Blast radius

Who requires `td` (measured with `git grep`):

- `src/tls-hybrid-extension.js:165` — the SM2-MLKEM768 hybrid key exchange (IANA #4590
  extension). This is the only production-shaped consumer.
- `test/test-cross-lang.js:26`, `test/test-cross-lang-seeded.js:23` — cross-language comparisons
  against the Rust/WASM `pqc_kyber` build.
- `test/test-fibemate.js:439` — integrity baseline lookup by file name.
- `docs/tsa/2026-06-08/ml-kem-768-td.js.tsr` (942 bytes) plus `docs/INTEGRITY-MANIFEST.md` and
  `docs/TSR-MANIFEST.md` — the file's sha256 is **timestamped** (current digest
  `1239c7d2c9a6ced5ed2c26af0f6f00aef6968ad23bb6ec4e49da65605ecd018f`). Any edit changes a pinned
  digest, so the fix must come with a new TSR and must not rewrite the old one.

If `tls-hybrid-extension` is reached by a deployed server while the browser side uses
`www/crypto/ml-kem-768.js` (which is conformant), every hybrid handshake on that path fails —
loudly, not silently, because the shared secrets differ. That is the failure mode to confirm
first; this document does not claim the path is deployed, only that it is the one place where
a divergence would matter.

## 5. A second finding, about the test evidence itself

`test/fixtures/ml-kem-768-golden.json` has five vectors with fields
`seed / pk / ct / K` (no `sk`), backend `C-addon-derandomized`.

- `test/run-compat-fixtures.mjs` reads `f.sk` and does `Buffer.from(f.sk, 'hex')` **outside**
  its `try` block, so it throws `ERR_INVALID_ARG_TYPE` on the first vector instead of failing
  a check. The runner is currently broken against its own fixture.
- The fixture's `seed` does not reproduce its own `pk` under the standard mapping: neither
  `d‖z` nor `z‖d` reproduces `pk`, so the fixture cannot be used as a conformance oracle
  until the generator's seed semantics are documented.

The KAT script `scripts/ci-mlkem-kat.cjs` does not use this fixture (it validates a `.rsp`
file with `dk` supplied), so CI is not silently green because of this — but a maintainer
running the compat runner gets a stack trace, not a verdict.

## 6. Options

**A. Repair `td` to FIPS 203.** Audit the module end to end, fix the seed derivation and
whatever else the audit finds, add noble-as-oracle interop tests, publish a new TSR for the
new digest. Cost: real, and it keeps two copies of the same KEM.

**B. Retire `td`.** Point `src/tls-hybrid-extension.js` at `packages/pqc-kem/src/ml-kem-768.js`
(the implementation that is bit-identical to noble), delete `td`, keep the old TSR as history.
Cost: one import change plus re-running the hybrid tests; removes a duplicate implementation
instead of maintaining it. **Recommended.**

**C. Declare `td` experimental and exclude it from every shipped path.** Cheapest, but leaves
a non-conformant KEM in the tree for the next reader to trust.

Under any option, add one CI test: for a fixed 64-byte seed, `keygen` must be bit-identical to
`@noble/post-quantum`, and encaps/decaps must interoperate both ways. A key-generation vector
alone would not have caught the interop divergence measured above.

## 7. What is *not* claimed here

- Not claimed: any deployed user is affected. The consumer list is source-level.
- Not claimed: the timestamped TSR is invalid. It covers the file as it was; the file has not
  been modified in this investigation.
- Not claimed: `packages/pqc-kem` is correct because it matches noble once. One oracle, one
  seed; the KAT evidence around it is separately broken (§5).
