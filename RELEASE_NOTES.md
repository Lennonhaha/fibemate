# FIBEMATE v3.3 Release Notes

**Release Date:** 2026-08-31
**Status:** Open Source
**License:** GPL-3.0-only

---

## Overview

FIBEMATE is a post-quantum cryptography engineering demonstration platform, not production software. This release marks the transition from private development to open source, with full transparency on capabilities, limitations, and known risks.

---

## What's Inside

### Post-Quantum Cryptography
- **ML-KEM-768** (FIPS 203): NTT-domain implementation, KAT 10,000/10,000 Noble cross-validated, C Native Addon ~3,200 ops/s, TVLA 3/3 PASS
- **fml-dsa** (FIPS 204): Self-developed pure JS ML-DSA-65, KeyGen KAT 75/75, Noble bidirectional cross-validation verified
- **ML-KEM-1024**: Noble implementation with TVLA 3/3 PASS
- **SLH-DSA-128s** (FIPS 205): WASM bridge to NIST reference C, 5/5 smoke test
- **SM2/SM3/SM4** (OSCCA): Pure JS, KAT verified, SM4-GCM cross-language validated
- **Double Ratchet PQ**: ML-KEM-768 + P-256 hybrid, re-key every 100 messages
- **TLA+ Formal Verification**: OPK pre-key protocol (3 invariants) + C2 handshake (7 invariants, incl. K3 strong key independence), 101,467 states, 0 violations

### Assessment & Visualization Tools
- **CARS Self-Assessment**: Interactive 15-question survey → 3D radar chart → exportable HTML report. FIBEMATE baseline: **67.0/100**.
- **IBM 7-Dimension Self-Assessment**: Code-level crypto-agility audit tool. FIBEMATE baseline: **39.40/100** (deliberate design tradeoffs for educational clarity).
- **PQC Algorithm Dashboard**: 9 algorithms, 3D bar charts, sortable comparison table, KAT/TVLA coverage.
- **Quantum Risk Propagation Graph**: 12 algorithms × dependency topology, colored blast radii, click-to-inspect file-level evidence.
- **Crypto Asset Audit Dashboard**: 370+ files scanned, 12 algorithm classes, directory heatmap, CBOM generation.
- **PQC Ecosystem Scanner** (`tools/pqc-ecosystem-scan.js`): 147 npm dependencies, 100% classification coverage — reusable on any project.

### External Bias Analysis
- **CARS internal vs external gap**: 67.0 (self) vs 41 (independent evaluator, 5-min survey).
  - Key finding: 26-pt gap driven by information invisibility (TLA+ files, security docs hidden below surface), not judgment difference.
  - Full report: `docs/cars-bias-analysis.md`

## Major Changes Since v3.3-preview

### Security & Audit
- **Engineering verification completed**: ML-KEM-768, SM2, hybrid KDF — self-conducted, cross-validated against Noble + liboqs
- **10 self-identified issues fixed**: bounds checks, input validation, seed clearing, nonce truncation (fb8a73c)
- **Third-party audit**: not yet completed; planned Q4 2026
- **Security policy established**: `SECURITY.md` with disclosure process
- **OpenSSF Best Practices**: Passing badge (project 13695)

### Performance
- **C Native Addon**: 15-31x speedup for ML-KEM/SM2/SM4
- **Barrett reduction**: 14x optimization in NTT
- **SM2 Mersenne optimization**: 1.8x modMul speedup
- **Performance gates**: `perf-gate.js` + `bench-diff.js` for regression detection

### CI/CD & Quality
- **ESLint custom rules**: `no-js-bigint-in-hotpath` for security
- **Nightly Phase 1**: 100-round KAT sampling + strict lint
- **CI strict mode**: FAIL on error (no more `|| echo SKIP`)
- **Repolinter compliance**: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`

### Documentation
- **OpenSSF Roadmap**: English + Chinese, Silver/Gold gap analysis
- **API Documentation**: Complete JS/WASM API reference
- **Security Limitations**: Honest disclosure of all known risks
- **Engineering Verification Report**: Self-conducted findings with fixes, cross-validation logs
- **Dependency Risk Disposition** (`SECURITY.md`): `@noble/curves` (65 refs, quantum vulnerable — test infrastructure only), `bcryptjs` (Grover weakened — demo server)
- **Good First Issues**: 7 beginner-friendly tasks with file paths, line numbers, and acceptance criteria (`docs/good-first-issues.md`)

### Hardware
- **FPGA UART**: TX verified (CH340 @ 115200), RX design complete
- **A7-Lite**: Official pinout mapped (U2/V2)

---

## Known Limitations (Honest Disclosure)

1. **Pure JS not constant-time**: Timing attacks possible in browser
2. **No hardware side-channel testing**: TVLA only software-simulated
3. **C addon not fuzzed**: No continuous fuzzing infrastructure
4. **RTL withheld**: Core IP not open (security review pending)
5. **Single maintainer**: Bus Factor = 1 (AI contributions don't count)
6. **No third-party audit**: Self-verified only; external crypto review planned Q4 2026

---

## Verification

```bash
# Quick health check
node scripts/smoke-test.js

# Full test suite
npm test

# Performance gate
node scripts/perf-gate.js

# Dependency crypto audit
node tools/pqc-ecosystem-scan.js

# CARS self-assessment (browser)
open www/docs/cars-self-assessment.html

# PQC algorithm dashboard (browser)  
open www/docs/pqc-dashboard.html
```

---

## TSR Evidence Chain

- **100 continuous timestamps**: lg-001 ~ lg-100
- **Dual authority**: DigiCert + FreeTSA
- **Manifest**: `timestamp-manifest.json` v3

---

## Acknowledgments

- **NIST**: FIPS 203/204/205 standards
- **OpenSSF**: Best Practices framework
- **noble-curves / liboqs**: Reference implementations for cross-validation
- **Community**: Early testers and issue reporters

---

## Contact

- **Security**: security@fibemate.net
- **Discussions**: GitHub Discussions
- **Issues**: GitHub Issues (not for security reports)

---

*"Silver ground, golden light — honest about its place."*
