# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open source readiness: CI/CD pipelines, issue templates, PR template, CoC, SECURITY.md
- Open source timeline notice on fibemate.net hero area

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