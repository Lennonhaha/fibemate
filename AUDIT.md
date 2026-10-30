# AUDIT — 2026-10-30

What this document is: the evidence behind the claim "the ML-KEM / ML-DSA paths and the
evidence chain have been audited, not merely tested". Every number below was produced by a
command in this repository or its siblings, and the raw logs are named next to each section.

What it is not: a security proof, a third-party audit report, or a statement that ML-KEM-768
is unbroken. Section 7 lists exactly what remains unproven.

Revised 2026-10-30. The 10-29 revision covered the code, the tests and the timestamps. This
revision adds the delivery layer (§4), re-pins the commits below, and replaces the one-line
claim about the WASM artifact (§7.6) with the consumer status as measured — the conclusion
holds, the reason given for it was thin. Sections that were true yesterday and
are still true are unchanged, including the failed check recorded in §3 — a document that only
reports what went right is not an audit either.

Repositories at the time of this revision:

| Repository | Commit | Note |
|---|---|---|
| `fibemate` | `a643568` + this document | site, WASM artifact, TSR packages, published PDFs |
| `fibemate-tauri` | `fdf571a` | Rust backend, ACVP KATs |
| `fibemate-mobile` | `557f172` | FIPS 203-only KEM boundary |
| `fibemate-tools` | `c45fd8ee` | verifact, claim-evidence, interop-matrix, delivery gate |

---

## 1. Algorithmic level: official vectors, not self-consistency

**ACVP KATs run, none ignored.** `cargo test --all-features` in `fibemate-tauri`
(`tauri-test.log`):

```
running 182 tests
test result: ok. 182 passed; 0 failed; 0 ignored
running 6 tests
test result: ok. 6 passed; 0 failed; 0 ignored
```

The KAT lines that matter, verbatim from the log:

```
test pq::mlkem_kat::acvp_mlkem768_keygen ... ok
test pq::mlkem_kat::acvp_mlkem768_encapsulation ... ok
test pq::mlkem_kat::acvp_mlkem768_decapsulation ... ok
test pq::mlkem_kat::acvp_mlkem768_tamper_yields_implicit_rejection ... ok
test pq::mldsa_kat::acvp_mldsa65_keygen ... ok
test pq::mldsa_kat::acvp_mldsa65_siggen ... ok
test pq::mldsa_kat::acvp_mldsa65_sigver ... ok
test pq::mldsa_kat::mldsa65_rejects_tampering ... ok
```

Before the migration these four ML-DSA tests carried `#[ignore]` and the CI run reported
"178 passed, 4 ignored": the suite was green while the standard's vectors never executed.
The count is now 182 passed / 0 ignored, and the number is read from the log rather than
inferred from green check marks.

**Three implementations, byte for byte.** Three fixed seeds from the interop matrix, each
driving Rust (`libcrux-ml-kem 0.0.10`, this repository's `pq` module), WebAssembly (the
shipped `www/crypto/wasm/mlkem-fips` artifact, same library, independent build), and
`@noble/post-quantum 0.7.1` (independent implementation):

| Seed | pk/sk/ct/ss bytes | Equality checks | Matrix match |
|---|---|---|---|
| S1 | 1184 / 2400 / 1088 / 32 | 12/12 | ct, ss, pk prefix all match |
| S2 | 1184 / 2400 / 1088 / 32 | 12/12 | ct, ss, pk prefix all match |
| S3 | 1184 / 2400 / 1088 / 32 | 12/12 | ct, ss, pk prefix all match |

The twelve checks per seed are not twelve ways of saying the same thing: pk and sk compared
Rust↔noble and Rust↔WASM, ct and ss additionally compared noble↔WASM, plus three round
trips in both directions. `layer12.json`
holds the digests; `interop-matrix/out/matrix.json` holds the same values from the earlier
independent run (62/62 checks).

## 2. Protocol level: fail closed, and fail the same way everywhere

**Cross-end round trip.** Rust generates the keypair, the other end encapsulates, Rust
decapsulates: `noble → Rust` and `WASM → Rust` both recover the shared secret, and
`Rust → noble` works in the other direction. This is the "Tauri key, Web ciphertext, Tauri
plaintext" path with the transport removed — a wire-format check, not a claim that the
protocol above it is secure.

**Implicit rejection.** One bit flipped at offset 42 of a valid ciphertext, then decapsulated
by all three ends:

- no exception thrown on any end;
- 32 bytes returned on each;
- all three return the *same* value (`3443e453…` for S1);
- that value differs from the real shared secret;
- repeating the call returns the same bytes (no per-call randomness in the rejection path).

A FIPS 203 decapsulator must not signal failure on a tampered ciphertext — signalling is the
oracle the mechanism exists to deny. Three implementations agreeing on the rejection value is
the evidence that this holds across the stack, not just in one binary.

**Legacy material is refused, not decoded.** In `fibemate-mobile`
(`node --test test/kem-clean-break.node.cjs`, 7/7 pass), the archived pre-FIPS keypair
passes every structural check — `decapsKeyCheck` and `isValidEncapsulationKey` both return
true — because the old format is a legal encoding of the wrong thing. The functional probe
catches it: `assertFipsCapable` throws `LegacyKemMaterialError` (code `legacy_kem_material`)
instead of returning a derived key. This is why the boundary uses a probe rather than a
validator: structure cannot distinguish the two formats, behaviour can.

## 3. Infrastructure level: supply chain and timestamps

**npm provenance, verified.** `verifact@0.2.4` is published with a SLSA v1 provenance
attestation. `npm audit signatures` in a clean project (`L31-npm-audit-signatures.json`):

```
install: added 1 package in 3s
audit signatures exit: 0
{"invalid": [], "missing": []}
```

`missing: []` means every installed package carried a signature npm could verify — not that
an attestation file merely exists. The tarball's sha512 matches the registry `integrity`
field, so the verified subject is the artifact that would actually run.

**PyPI provenance, verified.** `crypto-time-machine 0.1.2` ships a wheel and an sdist, and
both carry a PEP 740 publish attestation:

```
https://pypi.org/integrity/crypto-time-machine/0.1.2/<file>/provenance   -> 200
  publisher:     Lennonhaha/fibemate-tools
  workflow:      release-pypi.yml
  environment:   pypi
  predicateType: https://docs.pypi.org/attestations/publish/v1
  subject:       the file itself (wheel, sdist)
```

The first revision of this section reported the opposite, and the error is worth keeping:
`https://pypi.org/pypi/<project>/json` has **no** `provenance` key. Per-file provenance is
served only by the `/integrity/` endpoint. Reading an absent key as "no attestation"
produced a false negative that was filed as issue #387 and copied onto the website. The
artifact was never unsigned; the check was. A supply-chain section that cannot be wrong
about its own method is not an audit either.

**Timestamp token.** `lg-116` (FreeTSA, serial `0x09823CA3`, `Oct 28 11:58:04 2026 GMT`)
against the 14-file interop-matrix digest list:

```
verdict: verified
  filesMatchManifest: pass          (14/14 files)
  tokenParsed: pass
  imprintMatchesManifest: pass
  signatureVerified: pass
  nonceMatchesRequest: pass
  requestImprintMatchesToken: pass
```

The nonce check is not decoration: it binds the token to the request that produced it, so a
token for a different request with the same imprint cannot be substituted.

## 4. Delivery level: the deploy was green and the bytes were wrong

`git reset --hard` returning 0 means the working copy moved. It does not mean the site serves
what the repository contains. On 2026-10-29 those two things disagreed and every existing
check was green.

**What was served, what was committed.**

| | |
|---|---|
| Artifact | `docs/tsa/2026-10/verify_cyclonedx_data_loss.py` |
| Committed blob (`git cat-file`) | 5,170 B, 145 CR / 145 LF |
| Served by fibemate.net | 5,025 B, 0 CR |
| Difference | 145 B — exactly one byte per line |

The published mirror under `www/docs/tsa/` had been normalised to LF. `.gitattributes` carried
`* text=auto eol=lf`, and while `docs/tsa/**` was excluded with `-text` — the sealed artifacts
were never to be rewritten — the mirror under `www/docs/tsa/**` was not. Every text-level check
in CI reads the working tree, where the normalisation is expected and harmless; nothing compared
the served bytes to the committed blob.

This is not a cryptographic finding. It is an evidence finding, and a worse class of failure
than a red deploy: the hash in `SHA256SUMS` no longer described the file the site was handing
out. A failed deploy gets fixed the same hour. A deploy that reports success while serving
different bytes gets discovered by a stranger with a hash.

**What changed.**

1. `www/docs/tsa/** -text` added, so the mirror carries the sealed bytes rather than a
   rendering of them.
2. `scripts/check-live.cjs` — a black-box gate that fetches from `https://fibemate.net` and
   compares against `git cat-file`, never against the working tree, because on a Windows
   checkout `.gitattributes` rewrites line endings on disk and hashing the visible file
   reports drift the deployed copy does not have.
3. The deploy script runs the gate as step `[6/6]`, and a non-zero exit fails the deploy.
   Delivery is considered complete only when `[6/6]` passes; a `git reset --hard` that returns
   0 is not evidence of anything on its own.

**The gate, run today against `a643568`:**

```
check-live: https://fibemate.net (repo HEAD a643568)
[PASS] live:manifest sha256 a6064635af926432 (30238 B)
[PASS] live:token sha256 7e3477b02accfb15 (4643 B)
[PASS] live:archive 264/266 files identical, 2 denied by policy
DEPLOY VERIFY: PASS (3 checks, 3431 ms)
```

The same file today: 200, `application/octet-stream`, 5,170 B, 145 CR — the blob, served.

Three design points that make the gate able to fail:

- **Every tracked file under `docs/tsa/` must be accounted for.** 264 of 266 match byte for
  byte; the remaining 2 are `.sh` files that nginx denies on purpose, and for those the gate
  requires a **403**. A 200 there would mean the deny rule stopped working, and would be red.
- **`www/docs/tsa/` is deliberately a superset of `docs/tsa/`** (tokens minted directly into
  `www` since PR #399), so "file counts must be equal" is not the assertion. The assertion is
  stricter where it matters: nothing from the repo may be missing, and everything served must
  be byte-identical.
- **The expected bytes come from the commit, not the checkout.** The first version of this
  check hashed the working tree and reported drift on files the site served correctly.

## 5. Meta level: the verifier is tested too

**Value comparison and byte comparison fail differently.** Same claim, same artifact, four
scenarios (`fibemate-tools`, `docs/claim-evidence-e2e-2026-10-29.md`):

| # | Tampering | `verifact` (values) | `verify-evidence` (bytes + token) |
|---|---|---|---|
| S0 | none | exit 0, 3 verified | `verified`, exit 0 |
| S1 | a number changes (62 → 61) | `drift`, exit 1 | `drift`, exit 1 |
| S2 | one byte, no number touched | **exit 0, still green** | `drift`, exit 1 |
| S3 | S2 + digest list rewritten | exit 0 | `drift`, exit 1 (imprint) |
| S4 | CA omitted | — | `unverifiable`, exit 3 |

S2 is the important row: a value-level checker cannot see byte-level tampering, and it does
not warn — it reports success. S3 is why the digest list is sealed by a token rather than
trusted on its own: rewriting the list restores link 1, and only the token's imprint over the
old list catches it.

**Mutation testing.** Two deliberate defects, run locally against the full suite, then
reverted:

| Mutation | Result |
|---|---|
| `mldsa65_verify_bytes` always returns true | 3 tests fail: `acvp_mldsa65_sigver`, `mldsa65_rejects_tampering`, `test_mldsa65_sign_verify` |
| `mlkem768_decapsulate_bytes` returns the ciphertext prefix as the secret | 1 test fails: `test_mlkem768_decapsulate_bytes_reports_bad_input` |

The second result is a coverage fact worth stating: the ACVP decapsulation KAT exercises the
typed entry point, not the byte-level one, so the byte-level wrapper is guarded by a unit
test instead. A mutation that only the KAT would catch does not exist for that path.

**CI blocks the mutation.** The first attempt to prove this was misleading: the `Build & Test`
job went red at `cargo fmt --check`, before any test ran. A red pipeline that never reaches
the tests proves nothing about the tests. After formatting the probe, `PR #85` failed on all
three platforms at the test step:

```
running 182 tests
test commands::ipc_tests::x3dh_initiate_rejects_tampered_spk_signature ... FAILED
test double_ratchet::tests::test_x3dh_with_independent_spk_signature ... FAILED
test pq::mldsa_kat::acvp_mldsa65_sigver ... FAILED
test pq::mldsa_kat::mldsa65_rejects_tampering ... FAILED
test pq::tests::test_mldsa65_sign_verify ... FAILED
test result: FAILED. 177 passed; 5 failed; 0 ignored
```

Two of the five failures are protocol-level tests that consume signature verification: a
broken verifier propagates into X3DH acceptance, which is what a real regression would look
like. The probe PR was closed without merging and its branch deleted.

## 6. What this revision changed in the code and docs

- `rustpq 0.3` (draft-era ML-KEM key generation, 3293-byte ML-DSA signatures) is gone from
  `fibemate-tauri`; both algorithms come from `libcrux-ml-kem 0.0.10` and
  `libcrux-ml-dsa 0.0.11`, whose keygen and signing accept caller-supplied randomness — the
  property that lets ACVP deterministic vectors run in CI at all.
- The WASM artifact is built from the same library and pinned by digest in
  `wasm/mlkem-fips203/README.md`.
- `fibemate-mobile` has one KEM engine (FIPS 203), refuses legacy material by probe, and no
  longer ships a second implementation.
- The claim-evidence experiment settled three spec questions and one negative result
  (`fibemate-tools/docs/claim-evidence-e2e-2026-10-29.md`).
- `www/docs/tsa/**` is byte-exact (`-text`), and deployment is gated by `check-live.cjs` (§4).

Published alongside this revision, with the bytes that are live:

| Artifact | Bytes | sha256 |
|---|---|---|
| `www/docs/fibemate-whitepaper-20261030.pdf` | 628,933 | `481A84ABBD5931CC8AB53C17DC2EDC01C5DBC02029E8A0B027648745CC7170C8` |
| `www/docs/verifact-sample-report-20261030.pdf` | 329,521 | `562197A9F00349FDE80E07346492120E9EE9E96D674A2953F3E9F1447D75C2F7` |
| `www/docs/fibemate-intro-20261030.pdf` | 307,914 | `1D055A2C43F43CB44CB57F3FB65A1FC98897CA47383C25738C21D2950E3D7595` |

## 7. What this does not prove

1. **That the implementations are secure.** Byte-identity with `@noble` and agreement with
   ACVP vectors means "conforms to the standard as implemented by two independent parties".
   It does not mean the standard is unbroken, nor that these binaries resist side channels.
2. **That the protocol is secure.** The round trip above tests serialization, not the
   handshake, the ratchet, or key storage.
3. **That the provenance is honest.** A PEP 740 attestation binds an artifact to the
   workflow run that built it. It says nothing about whether that run's inputs were
   trustworthy. It is a chain-of-custody claim, not a correctness claim.
4. **aarch64 was exercised in CI, not on hardware.** The cross-check runs on a native arm
   runner; NEON-specific behaviour on a physical device is not separately measured.
5. **The delivery gate proves bytes, not correctness.** `[6/6]` passing means the site serves
   what the commit contains; it does not mean the content is right, and it covers the manifest,
   the `lg-116` token and `docs/tsa/**` — not the HTML pages, which are checked separately by
   `check-nginx-drift.cjs` and the manifest, and not anything that changes after the check
   runs.
6. **The WASM artifact ships, but no page under `www/` imports it.** It is built, tested
   (`test/mlkem-wasm-fips.test.cjs`) and digest-pinned. No page loads it — there is no
   `<script>` tag or dynamic import pointing at `mlkem_fips.js`, so the loader inside it never
   runs on the site (the CBOM viewer lists the file as an evidence occurrence, which is a
   catalogue entry, not a consumer). `www/bench/wasm-bench.html` does fetch a WASM build, but `mlkem_ct_wasm`, a different
   artifact. `www/index.html` lists mlkem-fips under shipped modules, which describes a file
   in the tree, not a code path in use. The 10-29 text reached the right conclusion for the
   wrong reason — "no site consumer" is accurate, but it read as if the artifact were idle by
   accident, when in fact it is built, pinned and covered by a test.
7. **Timestamps prove existence, not correctness.** A token over a wrong answer is still a
   token over a wrong answer.

## 8. Reproduce

```bash
# Rust: 182 passed, 0 ignored, plus the ACVP KAT lines
cd fibemate-tauri && cargo test --all-features

# Claim vs bytes: S0-S4
cd fibemate-tools && node scripts/claim-evidence/run-e2e.cjs --fibemate ../fibemate

# Mobile legacy boundary
cd fibemate-mobile && node --test test/kem-clean-break.node.cjs

# npm provenance
cd fibemate-tools && npm audit signatures

# Delivery: live bytes against the commit (expects exit 0 and 3 PASS lines)
cd fibemate && node scripts/check-live.cjs
```

Two harnesses in this audit were local and are deliberately not committed: the three-way
byte comparison (it needs a throwaway example binary that links this crate's `pq` module)
and the mutation runs (they edit `pq/mod.rs` and revert it, which has no business in a
repository history). Both are described above with their outputs; the invariants they
cover are already held by committed tests: the tauri ACVP KATs,
`fibemate/test/mlkem-wasm-fips.test.cjs`, the mobile oracle test, and `interop-matrix`.

Raw logs (`tauri-test.log`, `layer12.json`, `layer34.json`, `layer4-mutation.json`,
`ci-mutation.json`, `L31-npm-audit-signatures.json`, `ci-fail2-ubuntu.log`) live in the
audit workspace and are not part of the repository.
