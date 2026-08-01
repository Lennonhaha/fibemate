# FIBEMATE v3.3 Release Notes

**Release Date:** 2026-08-31
**Status:** Open Source
**License:** GPL-3.0-only

---

## Overview

FIBEMATE is a post-quantum cryptography engineering demonstration platform, not production software. This release marks the transition from private development to open source, with full transparency on capabilities, limitations, and known risks.

---

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

# KAT sampling
node scripts/kat-quick.js --quick

# Full test suite
npm test

# Performance gate
node scripts/perf-gate.js
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
