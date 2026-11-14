# Changelog

All notable changes to the FIBEMATE project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed

- **ML-DSA signatures are now canonical by construction.** The decoder read the hint
  counters and ignored whatever followed, so a signature with flipped bytes in the
  unused tail still verified: one `(pk, msg)` pair had many accepted byte strings, and
  a signature could not be used as an identifier. `decodeSig` now rejects any non-zero
  byte in the unused tail of the hint block instead of skipping it, and rejects an
  out-of-range row pointer instead of returning an empty hint row - the same defect
  one byte to the left - and requires hint positions within a row to be strictly
  increasing, so a duplicated index is no longer a silent no-op (#456).
- **KeyGen `power2Round` had the mod± bound inverted, and now matches NIST ACVP.** The
  `mod± 2^d` map is `(-2^(d-1), 2^(d-1)]`, so `t0 = +4096` is reachable and `-4096` is
  not. The code used `r0 > half - 1`, folding `+4096` to `-4096`; that value does not fit
  in 13 bits, so `encodeSK` wrapped it modulo 8192 and decoded to a different coefficient -
  and the resulting `t1` was one higher than FIPS 204 for those coefficients. Its own
  self-test asserted the same inverted bound, which is why it never fired. `encodeSK` now
  also rejects out-of-range `s1`/`s2`/`t0` instead of wrapping them, and a failing module
  self-test throws instead of printing (`scan: this block printed FAIL on every run since
  2026-07 and no step ever went red`). New tests: NIST ACVP KeyGen vectors run through
  **our** keygen (75/75 byte-identical), `sk-encoding.test.js` for the range contract
  (#470).
- **Canonical-form backstop.** `decodeSig` now re-encodes what it decoded and requires
  the exact same bytes. Each of the cases above (ignored tail, out-of-range pointer,
  duplicate index, pointer split) was a string that decoded to a valid object without
  being that object's unique encoding; comparing bytes closes the class instead of
  chasing the next instance (#456).
- The regression suite that proves it (`verify-canonical-signature.test.js --strict`)
  runs in CI. It was written on 2026-11-14 in audit mode precisely so it would not turn
  red before the fix existed; the fix and the gate land together.

### Note

- This changes verification behaviour for non-canonical inputs only. Signatures produced
  by this implementation, by @noble/post-quantum, and by the KAT vectors are unaffected:
  the encoder zero-fills the tail, so valid signatures already satisfied the rule.
  Verified against the byte-level oracle (24/24), cross-Noble interop, and the 84-case
  core suite.

## [v3.3.3] — 2026-11-14

Patch release: delivery honesty. Nothing here changes an algorithm; everything here
changes whether the project's own claims can be trusted without re-reading the code.

### Fixed

- **The live version header was lying.** `X-App-Version` was hard-coded in three
  places and read `2238b36f` (PR #413) while the deployed tree was `5e72aa6`
  (PR #448) — 35 commits behind the code it described. It is now rendered at deploy
  time from `package.json` and `git rev-parse --short=8 HEAD`, and the deploy fails
  if the rendered value cannot be verified over HTTPS. (#459)
- **A gate that could not be trusted when it fired.** `check-live-version.sh`
  compared the header without stripping the carriage return `curl` leaves behind, so
  it printed two identical strings and failed anyway. (#460)
- **An unreachable host was reported as a broken link.** The citation probe now
  retries through `curl` when Node's `fetch` cannot connect, records a transport
  failure as unresolved instead of failed, and still fails when nothing at all could
  be verified. (#461, #462)
- **A TLA+ property that could never hold.** `L_Handshake` was asserted as a
  liveness property, but after a session closes its premise stays true forever while
  the conclusion never arrives, so the formula is unsatisfiable — TLC said exit 13.
  Replaced with `L_Reach`, which is the property the model actually supports.

### Changed

- Documentation no longer carries numbers from superseded models: `101,467` states →
  `133,891 generated / 26,115 distinct` (2026-11-14), and the timestamp count is
  stated as `372 files / 261 unique tokens / 111 byte-identical copies`. Historical
  pages keep their dated figures on purpose — a number with a date is a record, a
  number without one is a claim. (#454, #458)
- `scripts/check-deps.cjs` replaces shell-specific `npm ls` preflight; `npm test`
  runs the aggregate suite on Windows, macOS and Ubuntu in CI. (#455, #457)

### Added

- `evidence/` — raw logs, commands and environment for the TLA+ and FPGA numbers, so
  "verified" can be re-run instead of believed.
- `docs/ENGINEERING-DISCIPLINE.md` — the rules the numbers above are held to.
- `packages/fml-dsa/test/verify-canonical-signature.test.js` — regression kit for
  non-canonical ML-DSA signatures (#456). Audit mode today; it becomes a gate in the
  same commit as the decoder fix, deliberately not before.

### Known issues

- ML-DSA decoders accept non-canonical hint tails: one `(pk, msg)` pair has many
  accepted signature byte strings. No forgery and no key exposure; it breaks anything
  that treats signature bytes as an identifier. Tracked as #456, target v2.4.
- The citation probe depends on outbound access to `doi.org`; a blocked network now
  produces "unresolved", not a false accusation against the link.

### Verification

- Production: `v3.3.2 (5f6f8ac6)` deployed 2026-11-14 20:52 GMT+8, delivery gate
  4/4 PASS, 4,536 immutable entries restored byte-for-byte.
- `npm test`, 43/43 checks on pull requests, OpenSSF Scorecard 8.1.

---

## [v3.3.0] — 2026-08-03

### 🎯 Highlights

- **14 interactive 3D visualization dashboards** — full coverage from scores to supply chain risk
- **CARS 77.30** (+13.8 from 63.50) · **IBM 63.70 HIGH** (+24.3 from 39.40)
- **Key Lifecycle engine** (27/27 PASS) + **KLSession** Double-Ratchet integration (35/35 PASS)
- **Algorithm Registry npm package** — 12 algorithms, 9 APIs, structured metadata
- **Cryptographic Law compliance self-assessment** — 12 articles, 88/100 score
- **CBOM 3D force-directed graph** + **CBOM diff tool** for CI dependency change detection
- **Dependabot cleanup** — 5 PRs merged, 2 conflict PRs resolved/closed

### Added

#### Visualization (14 new pages)
- `cars-radar.html` — CARS 5-dimension 3D radar with keyboard controls, spotlight, evidence panel
- `ibm-seven-radar.html` — IBM 7-dimension 3D radar with weighted scoring
- `cars-vs-ibm.html` — Dual-framework side-by-side 3D comparison
- `pqc-benchmark.html` — PQC performance benchmark bar chart (log scale, 4 backends)
- `tvla-dashboard.html` — TVLA side-channel test status dashboard (5 algos, 31/36 PASS)
- `classic-vs-pqc.html` — Classic vs PQC 8-dimension side-by-side comparison
- `cars-ibm-trend.html` — CARS/IBM score trend 3D timeline (7+9 milestones)
- `algo-family-tree.html` — 3D algorithm family tree (18 nodes, 6 branches, radial layout)
- `supply-chain-risk.html` — Supply chain dependency risk graph (12 nodes, 21 edges, 370 files)
- `fpga-heatmap.html` — FPGA resource heatmap (LUT/FF/BRAM/DSP, A7-35T)
- `backend-benchmark.html` — Dual-backend performance comparison (C Native vs pure JS)
- `project-timeline.html` — Project evolution spiral (25 milestones, 4 phases)
- `pqc-security-levels.html` — PQC security level comparison (10 algos, 4 metrics)
- `dependency-drilldown.html` — Interactive dependency drill-down with detail panel

#### Packages

- `packages/algorithm-registry/` — Structured algorithm metadata npm package (12 algos, 9 APIs)
- `packages/key-lifecycle/` — Key Lifecycle Manager engine (6 mechanisms: rotation, versioning, revocation, emergency, audit, export/import)
- `packages/key-lifecycle/double-ratchet-integration.js` — KLSession: KL engine integration with PQ Double Ratchet
- `packages/pqc-kem/src/params.js` — Runtime parameter set switching for ML-KEM-768/1024
- `www/crypto/algorithm-resolver.js` — Browser-compatible algorithm parameter resolver

#### Tools

- `tools/cbom-diff.js` — CBOM dependency change detection for CI
- `tools/cars-snapshot.js` — CARS/IBM score snapshot with SHA-256 self-verification
- `tools/generate-cryptolaw-data.js` — Cryptography Law compliance data generator (12 articles)
- `tools/upgrade-cbom-graph.js` — CBOM force graph auto-upgrade script
- `scripts/generate-dashboard-data.js` — Dashboard data generator from algorithm registry
- `scripts/generate-cbom-graph.js` — CBOM graph data generator
- `scripts/check-bom.cjs` — UTF-8 BOM detector for CI

#### Documentation

- `docs/ANNOUNCEMENT.md` — Open-source announcement v2 (14 viz pages, scores, tech stack)
- `docs/SM2_TVLA_STATUS.md` — SM2 TVLA side-channel test status declaration
- `docs/OPEN_SOURCE_COUNTDOWN.md` — 28-day countdown checklist to Aug 31 open-source
- `docs/THREAT_MODEL.md` — Adversary model & trust boundaries
- `docs/INCIDENT-RESPONSE-FLOW.md` — Security incident response runbook

#### CI/CD

- `.github/dependabot.yml` — Weekly npm + GitHub Actions auto-updates
- `.github/workflows/codeql.yml` — CodeQL security analysis (JS/Python/Actions)
- `CODEOWNERS` — Security path ownership routing (45KB)
- `MAINTAINERS.md` — Maintainer responsibilities and decision workflow

### Changed

#### Scores (recalibrated)
- **CARS**: 63.50 → 77.30 (+13.8) — AA 45→61, KL 70→82, PC 55→73, OR 65→70
- **IBM 七维**: 39.40 → 63.70 HIGH (+24.3) — D1 25→60, D2 15→50, D3 40→90, D4 35→55, D5 20→60, D6 30→50, D7 65→92

#### Refactored

- `packages/pqc-kem/src/ml-kem-768.js` — Compile-time constants → runtime parameter set (12 → currentParamSet)
- `www/crypto/hybrid-kem-client.js` — Hardcoded constants → resolver getters
- `www/crypto/gm.js` — Static algorithm list → dynamic negotiation with fallback (fail-fast / try-all / exclude)
- `api/a2a/a2a-core.js` — Hardcoded PK length check → dynamic `mlkemPkLenValid()`
- `packages/pqc-kem/src/params.js` — ESM → CJS (CI compatibility)

#### Upgraded

- `www/docs/cbom-graph.html` — v2: autoRotate, node lerp, click detail panel, risk-proportional sizing, edge weight mapping
- `www/docs/pqc-dashboard.html` — Data-driven refactor: hardcoded → JSON fetch from algorithm-registry
- `www/docs/cars-radar.html` — Keyboard controls (1-5, S, R, E), dimension spotlight, screenshot export
- `www/docs/ibm-seven-radar.html` — Full rebuild: quiz/2D → 3D radar with 7-color DIM_COLORS
- `www/index.html` — 12 new viz page links + IBM 62.50→63.70

#### Miscellaneous

- UUID generation: `npm:uuid` → `crypto.randomUUID()`
- Removed ghost dependency `jsonwebtoken` (zero code references)
- Updated `ws` 8.21.0→8.20.1, refreshed lockfile

### Fixed

- **3D algorithm family tree**: `nodeMap[n.parent].ring` → `nodeMap[n.parent].pos.ring` (leaf position assignment)
- **cars-radar.html 3D**: Missing comma at line 373 (JS syntax error breaking Three.js init)
- **cbom-viewer.html**: `JSON.parse(DATA)` — DATA was a string, never parsed, all stats showed `-`
- **pqc-dashboard.html**: 4 missing DOM containers (`#bar3d`, `#score-cards`, `#table-head`, `#verification-panels`)
- **CI: npm dependency drift**: `js-yaml@^4.3.0` doesn't exist → overridden to `4.1.1`
- **CI: ESLint ignores**: `packages/fml-dsa/**` added (14 ESM files)
- **CI: encoding**: 3 HTML files with UTF-8 BOM stripped; `sm3-cross-validate.cjs` encoding corruption fixed
- **CI: params.js**: ESM `export` → CJS `module.exports` for Node.js compatibility
- **ibm-seven-radar.html**: `</style>` in JS buildReport() string closing outer style block → full page rebuild
- **ibm-seven-radar.html**: Missing `FIBEMATE_OVERALL`/`FIBEMATE_SCORES` variables → added
- **ibm-seven-radar.html**: DIM_COLORS array length 5→7 (was CARS template)
- **ibm-seven-radar.html**: Page labels showing "CARS" → IBM 7-dim content
- **cbom-graph.html**: Edge matching — explicit ID map → fuzzy `findNodeId` (14 edges all matched)
- **cars-snapshot.js**: Banner injection hash mismatch → removed banner, hash in manifest only

### Security

- Credential leak file deleted (`UsersmaivsAppDataLocalTempgit-cred.txt`)
- `jsonwebtoken` ghost dependency removed (zero code references)
- OpenSSF Scorecard passing · CodeQL integrated · Repolinter compliant
- 11 security governance documents (GDPR/LGPD/IRP/BCP/CryptoLaw)
- TVLA 31/36 PASS — SM2 pure-JS boundaries documented and declared

---

## [v3.2.0] — 2026-07-31

### Added
- ML-KEM-1024 TVLA (3/3 PASS, Noble implementation)
- Nightly CI Phase 2 (4/5 hard success)
- TLA+ Liveness invariants (C2 state machine)
- L4 formal verification: LLL lattice-reduction experiment (BKZ Kannan Embedding, n∈[5,15])
- KAT 10,000 rounds zero-deviation verified
- CI 6/6 all-green baseline

### Changed
- 15 lint errors → 0 (one-shot scripts to .eslintignore)
- v3.3.0 tag pinned → CI/Nightly badge refresh
- README bilingual (zh + en), added CI badges

### Fixed
- Nightly CI lint scope misalignment (CI vs Nightly)
- `@eslint/js@10` peer conflict → pin `@eslint/js@^9`
- `scripts/smoke-test.js` gitignore rule (Windows case-insensitive path)
- Old `nightly.yml` workflow ghost → deleted

---

## [v3.1.0] — 2026-07-25

### Added
- SM3 benchmark (21,272 ops/s @ 3B) + SM4-GCM benchmark (4,879 ops/s encrypt)
- Double-Ratchet PQ hybrid full-chain closed-loop (ML-KEM-768 + P-256)
- ML-KEM + P-256 hybrid X3DH handshake → bidirectional 4-round message encryption
- Project positioning: "PQC Executable Textbook" section in README

### Fixed
- `decapsulate` parameter order (sk, ct) — wrapper inversion + test double-flip
- SM2 `_fastModP` dead loop (12 rounds + fallback)
- `.gitignore`: `*t.js` → `**/scripts/*test.js`, whitelisted `double-ratchet.js` + `fix-ratchet.js`

### Changed
- API migration: `keygen` → `generateKeypair`, plus base class refactor

---

## [v3.0.0] — 2026-07-14

### Added
- TLA+ K3 strong formal verification: 7 invariants, 101,467 states, 0 violations
- State machine model C2.tla + C2.cfg
- TSR lg-069 formal verification timestamp
- L4 Liveness invariants (active state convergence)

### Fixed
- GraphQL query brace bug: 4 `}` in JSON → 3 `}` in GraphQL, plus 1 `}` from `json.dumps`
- Mobile GitHub corner SVG overlap → hidden on mobile + text link fallback

---

## [v2.2.0] — 2026-07-10

### Added
- LookingGlass v2.2 Rust source rebuild (8.5KB WASM + d.ts)
- Variable depth (1..=7 adjustable), pass fusion (5→3 per layer)
- New APIs: `lgv2_confuse_d`, `lgv2_confuse_ex`
- WASM 25.7KB raw / 9.7KB gzip
- Python KAT 100-byte roundtrip verified

### Changed
- Rust 30/30 passed · lg-001~068 TSR archive declared

---

## [v2.1.0] — 2026-06-28

### Added
- VWZ FPGA BRAM solver: `vwz_lambda_rom.v` (60 lines) + `vwz_solve_preimage.v` (470 lines)
- 35-state microcoded Lemma 1 FSM, ~503 cycles = 10µs @50MHz
- VWZ global constant table: k=2/4/8/16/32, Python + Rust/WASM dual-track
- FPGA BRAM behavioral model 5/5 PASS
- LG v2 infinite-nesting theoretical boundary (group-equivariant wreath recursion)

### Changed
- All experimental modules default-disabled (4-layer rationale)
- Default security baseline: ML-KEM + SLH-DSA (no experimental claims)
- k=32 crash fix: `λ ≈ ±α²` col3 duplicate → `safe_alphas()` rejects ± pairs
- DMH → DMTH naming correction

### Fixed
- SM2-SM4 Hybrid AAD: `pubKey[:32]` vs `sm4Key` mismatch → unified to `c1[:32]`
- 10/10 tests passed

---

## [v2.0.0] — 2026-06-27

### Added
- LookingGlass v1 DMTH: ML-KEM + Kronecker nested tensor confusion (d=2~3)
- TVLA side-channel benchmarks: 135/135 all-green (unit 36 + integration 64 + smoke 35)
- Masked kron: |t| compression 91× (65.56→0.72) via additive masking over Z_q
- STM32 C framework compilation self-test passed
- VWZ signature WASM full-chain: Rust→WASM→frontend, 96.8KB→gzip 45.7KB
- 10 WASM exports (keygen/sign/verify/serialize/etc.)
- FPGA NTT hardware synthesis (A7-35T, WNS 9.755ns)

### Changed
- Code coverage: 93.91% line / 92.10% function
- Git cleanup: 519 untracked → 0, .gitignore hardened

---

## [v1.0.0] — 2026-06-22

### Added
- ML-KEM-768 reference implementation (FIPS 203)
- SM2/3/4 reference implementations
- SM2-MLKEM-768 hybrid key exchange
- HTML evaluation dashboard (CARS radar, PQC readiness, NIST CSF gap, PQRA)
- CBOM CycloneDX 1.5 generation
- Native Node.js addon backend (node-addon-api)
- FPGA NTT pipeline RTL

---

*FIBEMATE · GPL-3.0-only*
