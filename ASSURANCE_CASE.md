# Assurance Case — FIBEMATE

**Document version:** 1.0
**Applies to:** FIBEMATE v3.3.2 (`github.com/Lennonhaha/fibemate`, GPL-3.0)
**Owner:** Lennon (lennonhaha), sole maintainer
**Last reviewed:** 2026-11-09

This document is the project's assurance case in the sense used by the
[OpenSSF Best Practices Badge](https://www.bestpractices.dev/) silver criterion
`assurance_case`: it states the security requirements, describes the threat model,
identifies the trust boundaries, and argues — with references to checkable
evidence — that secure design principles were applied and that common
implementation weaknesses have been countered.

It is written to be **falsifiable**. Every claim below points at a file, a test
suite, or a command that a reader can re-run. Where the project cannot support a
claim, the gap is stated in [§8](#8-known-gaps-and-residual-risk) rather than
omitted.

---

## 1. Security requirements

FIBEMATE is a post-quantum messaging reference implementation. Its security
requirements, in priority order:

| ID | Requirement | Where it is stated |
|:---|:---|:---|
| SR-1 | Message plaintext and private keys never leave the user's browser; the server stores and forwards ciphertext only. | `docs/THREAT_MODEL.md` §1 (trust-boundary assertions) |
| SR-2 | Key exchange resists a quantum adversary: ML-KEM-768 (FIPS 203) for the KEM leg, hybridised with an ECDHE leg. | `docs/hybrid-kex-design.md`, `packages/pqc-kem/` |
| SR-3 | Cryptographic implementations match published test vectors and do not leak secret-dependent timing at the JS layer. | `packages/pqc-kem/test/kat/`, `docs/SM2_TVLA_STATUS.md` |
| SR-4 | Protocol state machines cannot reach a state where one side believes a session is established while the other does not, and session keys are independent across sessions. | `docs/tla/C2.tla`, `docs/tla/OPK.tla` |
| SR-5 | Account takeover is rate-limited, and credentials are stored as iterated hashes. | `src/lib/lockout.js`, `src/index.js` (bcrypt cost 12) |
| SR-6 | Build and distribution artifacts are reproducible, SBOM-attributable, and signed. | `scripts/gen-sbom.js`, `.github/workflows/repro-build-check.yml`, `.github/workflows/release.yml` |

**Explicit non-goals:** protecting against a compromised browser or OS, coercion
of the user, or a malicious browser vendor. These are recorded in
`docs/THREAT_MODEL.md` §3.3 and are out of scope for any browser-delivered E2EE
system.

---

## 2. Threat model

The full model lives in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). Its
structure, and the parts this assurance case depends on:

**Assets** (sensitivity high → low): ML-KEM-768 private key and session keys
(browser memory only) → plaintext messages (browser memory/DOM) → user passphrase
(momentary, used to build a ZK proof) → ciphertext at rest → protocol metadata.

**Adversaries considered:**

| Adversary | Capability | Primary countermeasure |
|:---|:---|:---|
| Network attacker | Read/modify/drop traffic; TLS interception | TLS 1.3 + E2EE; tampered ciphertext fails ML-KEM implicit rejection |
| Server operator | Full control of server storage and logs | Zero-knowledge design: no keys, no plaintext, server cannot forge a session |
| Database attacker | Dump of the message store | Only ciphertext, public keys and metadata are stored |
| Quantum adversary (harvest-now-decrypt-later) | Records traffic today, decrypts later | ML-KEM-768 KEM leg is post-quantum; hybrid construction keeps the classical leg |
| Local timing observer | Measures JS execution time | Scalar masking, projective randomisation, verify-side blinding; TVLA evidence in §5 |
| Supply-chain attacker | Tampered dependency or release artifact | Lockfile-exact installs, Dependabot + OSV, SBOM drift check, cosign-signed release checksums |

**Threats explicitly not defended** (documented, not hidden): coerced device
handover, user-initiated key disclosure, browser 0-days, malicious browser
extensions, and a break of ML-KEM itself (`docs/THREAT_MODEL.md` §3.3).

---

## 3. Trust boundaries

Four boundaries are identified. Crossing one changes what an attacker must do.

```
┌───────────────────────────────┐
│ User device — TRUSTED COMPUTING BASE
│  · ML-KEM-768 private key, session keys
│  · plaintext, passphrase, ZK proof generation
│  · crypto.getRandomValues
└──────────────┬────────────────┘
               │  B1: browser ⟷ network   (TLS 1.3 + E2EE payload)
┌──────────────┴────────────────┐
│ Network — UNTRUSTED
└──────────────┬────────────────┘
               │  B2: network ⟷ server    (TLS terminated at nginx)
┌──────────────┴────────────────┐
│ Server process — SEMI-TRUSTED (sees metadata, never plaintext)
│  · ciphertext store, public keys, presence, timestamps
│  · cannot decrypt, cannot impersonate a user
└──────────────┬────────────────┘
               │  B3: server ⟷ storage    (SQLite file)
┌──────────────┴────────────────┐
│ Storage — UNTRUSTED at rest
└───────────────────────────────┘

B4: build/release pipeline ⟷ public artifacts (signing + SBOM + lockfile)
```

**Boundary assertions** (each is a testable design constraint, not a slogan):

- **B1** — the private key is generated by `crypto.getRandomValues` inside the
  browser, is never `postMessage`d out, and is never serialised into
  `localStorage`/`sessionStorage`. See `www/crypto/` and `docs/THREAT_MODEL.md` §1.
- **B2** — the server terminates TLS at the reverse proxy; the application
  process never sees certificate material. Consequence: certificate
  verification is a *deployment* property, not an application-code property
  (see §8, gap G-4).
- **B3** — a full dump of the message store yields ciphertext, public keys and
  metadata; it does not yield plaintext or private keys.
- **B4** — release artifacts are signed with cosign (keyless, GitHub OIDC) and
  the checksum file is what gets signed, so a substituted binary is detectable
  without trusting the download host.

---

## 4. Secure design principles applied

Mapped to the principles named in the BadgeApp `know_secure_design` criterion.

| Principle | How it is applied here | Evidence |
|:---|:---|:---|
| **Least privilege** | The server has no decryption capability at all; experimental subsystems (`mixnet`, `phase4`, `zk-auth`, proxies) are gated behind `flags.EXPERIMENTAL` and are off by default. | `src/flags.js`, `src/index.js` header comment |
| **Defence in depth** | TLS 1.3 *and* application-layer E2EE; rate limiting *and* account lockout *and* replay guard; CSP/helmet *and* constant-time comparison. | `src/index.js` (helmet, cors, rate limit), `src/lib/constant-time.js`, `src/lib/lockout.js` |
| **Fail safe defaults** | Tampered ML-KEM ciphertext is rejected implicitly (different shared secret, never throws) — the FIPS 203 behaviour; invalid JWT → 401; unknown route → timing-equalised 404. | `test/mlkem-wasm-fips.test.cjs` (case 3, 4), `src/index.js` `authMiddleware` |
| **Economy of mechanism** | One KEM (ML-KEM-768), one AEAD path, one token format; no custom hash or custom PRF in the shipped path. | `package.json` dependencies; `packages/pqc-kem/src/ml-kem-768.js` |
| **Complete mediation** | Every `/api` route except `/api/auth/*` and `/api/health` is behind `authMiddleware`; `/api` also passes a global rate limiter and a replay guard before routing. | `src/index.js` L445–L454 and per-route middleware |
| **Open design** | Algorithms, parameter sets, protocol model and test vectors are public; no security by obscurity. | `docs/tla/`, `packages/pqc-kem/test/kat/`, `docs/protocol-spec.md` |
| **Separation of duties** | Research code (VWZ, LookingGlass, mixnet) is kept out of the production tree and never merged into `main`; the VWZ proof corpus lives in a separate repository. | `AGENTS.md` (research/production split), `fibemate-vwz` repo |
| **Least astonishment** | Claimed security properties are stated with their boundaries in `SECURITY-POSTURE.md`; overclaims found during review are corrected in place (see the FIPS 203 draft-vs-final correction in `docs/mlkem1024-kat-verified.md`). | `SECURITY-POSTURE.md`, `docs/pre-release-claims.md` |

---

## 5. Common implementation weaknesses countered

Each row is a weakness class, the countermeasure, and the evidence that lets a
reviewer check the claim.

| Weakness class | Countermeasure | Evidence (re-runnable) | Residual risk |
|:---|:---|:---|:---|
| Non-constant-time secret comparison | `timingSafeEqual` wrappers for secrets, hex, and record lookup; timing-equalised 404 | `src/lib/constant-time.js`, unit tests in `test/` | V8 may still optimise differently across versions |
| Secret-dependent timing in ECC scalar multiply | Scalar masking (`k' = k + r·N`), Jacobian projective randomisation, verify-side scalar blinding | `docs/SM2_TVLA_STATUS.md`: masked v1.2 → 5/5 TVLA PASS (\|t\| 1.19 verify / 2.06 decrypt, N=5,000); ladder variant → 20/20 PASS at orders 1–4. **The unprotected baseline is kept as a negative control and FAILS (\|t\| 7.42 / 3.80)**, which is what makes the passing numbers meaningful. | JS engine-level leakage not controllable; no hardware TVLA on the C addon |
| KEM implementation drifting from the standard | NIST KAT vectors in-tree; cross-implementation differential tests against `@noble/post-quantum`; ACVP keyGen cases for the final FIPS 203 | `packages/pqc-kem/test/kat/mlkem-768-KAT.rsp`, `test/mlkem-wasm-fips.test.cjs` (byte-identical to noble on 3 seeds), `docs/mlkem1024-kat-verified.md` (records that the older "ALL MATCH" referenced the **draft** FIPS 203 and is *not* evidence for the final standard) | Test-vector coverage ≠ proof of correctness |
| Malformed / adversarial input to parsers | 19 Jazzer harnesses, 10,000 runs each, `max_len=4096`, scheduled in CI | `.github/workflows/fuzz.yml`, `fuzz/` | Fuzzing finds, never proves absence |
| Protocol state-machine bugs (premature session, key reuse) | TLA+ model of the C2 handshake and the OPK pre-key protocol, checked with TLC | `docs/tla/C2.tla` + `C2.cfg` (7 invariants: `TypeOK`, `K1`–`K5`, `K3_Strong`), 101,467 states, TLC exit 0, DigiCert TSR `lg-069`; nightly parity run in `.github/workflows/docs-tla-verify.yml` | Model ≠ code; the model is hand-written from the spec |
| Credential attacks | bcrypt cost 12, ≥8-char password policy, 5 attempts / 15 min lockout, TOTP 2FA with recovery codes | `src/index.js` register/login, `src/lib/lockout.js`, `src/lib/totp.js`, `test/lockout.test.js` | In-memory lockout resets on restart |
| Token forgery / replay | HS256 JWT with a 64-byte secret from env or a `0600` file, 2 h access / 7 d refresh, replay guard on `/api` | `src/index.js` `resolveJwtSecret`, `genToken`, `replayGuardMiddleware` | A single shared signing secret (no key rotation yet) |
| Supply-chain substitution | `npm ci` lockfile-exact in CI, Dependabot, OSV scan, Scorecard, CycloneDX SBOM + drift check, cosign keyless signature over release checksums | `.github/workflows/{ci,osv-scan,scorecard,repro-build-check,release}.yml`, `RELEASE_CHECKSUMS.sig` on `v3.3.2` | Upstream maintainer compromise remains possible |
| Overclaiming in documentation | Claims are periodically audited against code; corrections are recorded rather than silently edited | `docs/pre-release-claims.md`, `SECURITY-POSTURE.md`, `docs/mlkem1024-kat-verified.md` header | Requires continued discipline |

---

## 6. Formal-verification evidence and its exact boundaries

Two bodies of formal work exist. **They are reported separately because they
have different status**, and conflating them would be the single easiest way to
mislead a reader.

### 6.1 TLA+ — shipped protocol models (in-tree, gated in CI)

- Models: `docs/tla/C2.tla` (C2 handshake, SM2 + ML-KEM-768) and `docs/tla/OPK.tla`
  (one-time pre-key protocol).
- C2 is checked against 7 invariants (`TypeOK`, `K1_NoPrematureActive`,
  `K2_ServerKeyPrecondition`, `K3_StrongKeyIndependence`,
  `K3p_StrongKeyIndependence`, `K4_NoStateLeak`, `K5_ServerActiveRequiresClientFinish`).
- Recorded run: **101,467 states, 0 violations, TLC exit 0**, timestamped with
  DigiCert TSR `lg-069`. Re-runnable via `scripts/tla/c2-tlc-nightly.sh`
  (nightly parity workflow `.github/workflows/docs-tla-verify.yml`).
- Scope limit: this proves properties of a *hand-written model*. It does not
  prove the JavaScript implementation refines the model. Refinement is not
  claimed anywhere in this repository.

### 6.2 VWZ — Isabelle/HOL research corpus (**not shipped**)

- Location: separate repository `fibemate-vwz`; the VWZ construction is **not
  present in any production path** of FIBEMATE (`docs/VWZ-STATUS.md`).
- The ledger is machine-counted, not hand-counted:
  `node tools/count-obligations.cjs` →
  **56 lemmas, 18 `sorry`** (T0 17/0, T1-A 16/0, T1-D 5/2, T2 10/8, T3 8/8),
  plus **1 known open** lemma outside the ledger (`aux_el_det_elementary_i_gt_0`,
  statement verified numerically, proof open).
- **The session runs with `quick_and_dirty`.** A successful build therefore means
  "everything not marked `sorry` type-checks" — it is **not** a proof of the
  theorem. The `sorry` count is the progress metric; the exit code is not.
- The construction's unforgeability is explicitly **outside** what this
  formalisation targets: the hardness assumption (VWZ-PR) is novel and
  conjectural, so there is no standard assumption to reduce to
  (`experimental/vwz-lg/docs/formalization-plan_20260906.md` §0).
- This work is included here because it is real engineering evidence of the
  project's verification discipline, **not** because it underwrites any shipped
  security claim.

---

## 7. Evidence index

| Evidence | Command / location | What it establishes |
|:---|:---|:---|
| Unit + integration suites (11 suites) | `npm test` | Functional correctness of primitives, 2FA, lockout, KEX peer resolution, WASM backend parity |
| Statement coverage | `npx c8 node test/test-all.js` | Current baseline **52.16 %** (4,309/8,261), branches 82.07 % — see gap G-1 |
| KAT | `packages/pqc-kem/test/kat/`, `scripts/ci-mlkem-kat.cjs` | Conformance to NIST vectors |
| TVLA | `docs/SM2_TVLA_STATUS.md` | Side-channel behaviour, with a failing negative control |
| TLA+ | `docs/tla/`, `.github/workflows/docs-tla-verify.yml` | Protocol invariants |
| Fuzzing | `.github/workflows/fuzz.yml`, `fuzz/` | Parser robustness |
| SBOM + reproducibility | `scripts/gen-sbom.js`, `check-sbom-drift.cjs`, `repro-build-check.yml` | Artifact attribution and bit-identical rebuild |
| Release signing | `.github/workflows/release.yml`, release assets `.sig`/`.pem` | Artifact integrity for consumers |
| Supply chain | `dependabot.yml`, `osv-scan.yml`, `scorecard.yml` | Dependency currency and vulnerability monitoring |

---

## 8. Known gaps and residual risk

Stated plainly, because an assurance case that lists no gaps is not an assurance
case.

| ID | Gap | Impact | Status |
|:---|:---|:---|:---|
| G-1 | Automated statement coverage is **52.16 %**, below the 80 % target. `src/index.js` (1,910 statements) is the largest untested surface. | Regressions in untested routes can ship undetected. | Open — raising coverage is active work; no `c8 ignore` suppressions are used to inflate the number |
| G-2 | **No independent third-party security audit.** All evidence above is self-produced. | Trust rests on reproducibility, not on external attestation. | Open (known, declared in `SECURITY.md`) |
| G-3 | **Single maintainer, bus factor 1.** | Continuity risk; see `GOVERNANCE.md` §Bus Factor. | Open — succession and key-custody plan is being written |
| G-4 | TLS terminates at nginx; the application performs **no certificate verification** and contains no `rejectUnauthorized` handling. | Application-level mitigation of a mis-issued certificate is absent; security depends on deployment configuration. | Documented; deployment guidance in `docs/deployment.md` |
| G-5 | Input validation is **partial**: `express.json` size limits and per-route checks exist, but there is no schema-level allowlist across all endpoints. | Malformed-but-parseable payloads may reach handlers. | Open — targeted for the 80 % coverage work |
| G-6 | VWZ formalisation has **18 open `sorry`** and 1 open auxiliary lemma; VWZ is not shipped. | No production impact; the research claim remains unproven. | Open, tracked by `count-obligations.cjs` |
| G-7 | Lockout and 2FA tickets are in-memory; a restart clears them. | Short window of reduced brute-force resistance after restart. | Accepted, documented |

---

## 9. Maintaining this case

- This document is reviewed whenever a security-relevant component changes, and
  at least once per release.
- Numbers in §6.2 must be re-derived with `node tools/count-obligations.cjs`
  before being quoted; numbers in §7 with the commands listed there.
- A claim that can no longer be reproduced must be **removed or downgraded**,
  not left standing. The correction header in `docs/mlkem1024-kat-verified.md`
  is the model for how this is done.
