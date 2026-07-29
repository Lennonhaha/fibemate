# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3-preview] — 2026-07-29

### Added
- Nightly Phase 1 & 2 cron workflows (06:00 UTC daily)
  - Phase 1: KAT 100 rounds, ESLint, smoke test, cross-lang seed equivalence
  - Phase 2: KAT 10,000, TVLA summary, perf gate, STM32 build, liboqs cross-verify
- `scripts/perf-gate.js`: performance regression detection (WARN 20%, FAIL 50%)
- `scripts/tvla-summary.js`: TVLA |t| threshold scanner (4.5 threshold)
- `scripts/daily-audit.js`: 7-item daily audit (bounds check, crypto API, seed zeroing, etc.)
- OpenSSF Badge (Passing 13695) + Roadmap (English + Chinese)
- Repolinter compliance + OpenSSF Scorecard green
- Native Addon CI stabilized (5-day failure history resolved)
- SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, RELEASE_NOTES.md
- `.github/ISSUE_TEMPLATE/`: disclosure-audit, bug-report, ci-issue, rtl-repro

### Fixed
- Nightly Phase 1: shebang displaced by SPDX headers (11 files) — SyntaxError
- Nightly Phase 1: missing `eslint` devDependency — exit 127
- Nightly Phase 2: `perf-gate.js` GBK encoding corruption — syntax error
- Nightly Phase 2: `tvla-summary.js` referenced but did not exist
- ESLint flat config: GBK comments → ASCII (Linux CI pass)
- Repolinter: missing `axioms` field in config
- Native Addon: `node-addon-api` dependency resolution + `--ignore-scripts` removal
- README dead links: `kat-10000.js` → `kat-quick.js`, `vwz-148-test.js` → branch reference
- `double-ratchet.js` ML-KEM hybrid X3DH handshake parameter order
- `ml-kem-768.js` samplePoly bounds check, hardcoded KYBER_QHALF, crypto.getRandomValues guard

### Changed
- `README.md`: Native Addon build section with prerequisites and verification snippet
- `CHANGELOG.md`: this entry
- Shebang restored to line 1 in 11 scripts (SPDX+Copyright follow on lines 2-3)
- Legacy debug/diagnostic scripts archived in git history, removed from working tree
- `package.json`: eslint ^9.7.0 devDependency added

## [3.3-preview] — 2026-07-17

### Added
- TLS 1.3 hybrid key exchange Path A (X25519MLKEM768 via oqs-provider + systemd override)
- TLS hybrid deployment guide (`docs/tls-hybrid-deployment.md`, 9 chapters)
- Performance baseline: X25519MLKEM768 KeyGen 9.50ms, Encaps 2.78ms, Decaps 2.79ms (N=200)
- Formal security model documentation: ROM/QROM proofs for hybrid KEM composability
- Cached OPRF-based privacy-preserving authentication (OPAQUE-PAKE draft)
- LookingGlass v3.1 spherical projection research (archived, mathematical infeasibility confirmed)
- TLA+ formal verification for Path C-2: 7 invariants, 101,467 states, 0 violations
- Open source readiness: Code of Conduct, Contributing guide, Security policy
- Open source timeline notice on fibemate.net hero area

### Changed
- Nginx/sslh 443 port multiplexing for HTTPS + SSH
- SM2 TVLA upgraded N=10,000 (was N=5,000), 20/20 passed
- INTT scaling constant corrected: 3316 → 3303 (paper errata)

### Security
- QROM formal proof referenced for hybrid KEM IND-CCA2 composability
- TLS 1.3 server-side hybrid handshake verified (key_share 0x11ec, IANA #4588)
- Browser fallback path confirmed: classic ECDH for clients without oqsprovider
- 76 TSR timestamped evidence records (lg-001~lg-076)

## [3.2-preview] — 2026-07-07

## [3.2-preview] — 2026-07-07

### Added
- ML-KEM-768 (FIPS 203) pure JS implementation with KAT 10,000 verification
- SLH-DSA (FIPS 205) WASM implementation
- SM2/SM3/SM4 cryptographic primitives
- TLS 1.3 hybrid key exchange (SM2 + ML-KEM-768)
- FPGA NTT accelerator (Artix-7 35T, WNS=8.14ns)
- LookingGlass v2.1 obfuscation layer
- VWZ hash-and-sign post-quantum signature scheme
- React Native mobile app skeleton
- CI/CD: three GitHub Actions pipelines

### Security
- SM2 TVLA (N=10,000) 20/20 passed, max |t|=1.82
- FPGA v5.3 bitstream 256/256 NTT round-trip verified
- 57 TSR timestamped evidence records

## [3.1] — 2026-06-23

### Added
- SM2-SM4 hybrid encryption (10/10 tests)
- OPK pre-key protocol
- Safety number verification
- DR session persistence (full CRUD)

### Fixed
- SM2 BigInt TVLA masking (k+rN without mod N)

## [3.0] — 2026-06-19

### Added
- Core ML-KEM-768 time-domain reference implementation
- SM2 elliptic curve operations
- FPGA NTT pipeline v1.3
- Initial project documentation
- DigiCert TSA evidence chain