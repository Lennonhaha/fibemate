# FIBEMATE v3.3.0 Release Checklist

> Target: 2026-08-31 | Status: Pre-release

## Pre-Release

- [x] All core tests passing (KAT 10,000 / VWZ 148/148 / FPGA 43/43)
- [x] TSR cumulative 130+ (lg-001~lg-085+), DigiCert + FreeTSA dual-source
- [x] Performance benchmarks documented
- [x] README / CONTRIBUTING / SECURITY / CODE_OF_CONDUCT / CHANGELOG reviewed
- [x] CITATION.cff authored
- [x] BUILD.md (482 lines, full build guite)
- [x] .github/workflows: CI (ci.yml) / Nightly / Release / Repolinter / Scorecard
- [x] .github/ISSUE_TEMPLATE: bug_report / feature_request / good-first-issue
- [ ] License headers on all source files (core files done, audit ongoing)

## Release Day (2026-08-31)

- [ ] Tag `v3.3.0` on main
- [ ] Create GitHub Release with changelog
- [ ] Upload WASM artifacts:
  - `lgv2_bg.wasm` (LookingGlass v2.2.3)
  - `vwz_signature_bg.wasm` (VWZ k=16)
- [ ] Update website footer with release link
- [ ] Post Announcement on Discussions

## Post-Release

- [ ] Monitor Issues/PRs
- [ ] Update roadmap for v3.4
- [ ] Begin third-party audit coordination

## Version Snapshot

| Domain | Status |
|--------|--------|
| ML-KEM-768 | KAT 10,000/10,000 ✅ |
| SM2 | 11/11 tests (v1.3) ✅ |
| SM4 | Bit-sliced constant-time S-box ✅ |
| SLH-DSA | WASM compiled ✅ |
| LookingGlass | v2.2.3 cold/hot path (61/61) ✅ |
| VWZ | 148/148 + C reference ✅ |
| FPGA | NTT v5, WNS 9.755ns, L8+L9 43/43 ✅ |
| TLS Hybrid | IANA #4590, Path C-2 ✅ |
| TLA+ | Path C-2 formal (7 invariants, 0 deadlock) ✅ |
| TSR | 130+ items ✅ |
