# FIBEMATE Project Status

> Last updated: 2026-08-25

## Overview

FIBEMATE is a post-quantum cryptography full-stack engineering demonstration and verification platform. It implements hybrid key exchange (SM2 + ML-KEM-768), post-quantum signatures (ML-DSA-44, SLH-DSA), and GM-compliant cryptography (SM2/SM3/SM4-GCM) across Web, Node.js, FPGA, and STM32 targets.

**License:** GPL-3.0
**Repository:** [github.com/Lennonhaha/fibemate](https://github.com/Lennonhaha/fibemate)
**Current version:** v3.3-preview

## Security Posture

| Area | Status | Evidence |
|:---|:---|:---|
| npm dependencies | 0 vulnerabilities | `npm audit` clean |
| SM2 100k endurance | PASS | 100,000 rounds / 0 failures / 41.5 min |
| ML-KEM-768 KAT | PASS | noble + liboqs 10,000-round cross-validation |
| SM3/SM4-GCM KAT | PASS | 3-platform CI (Ubuntu/macOS/Windows) |
| TLA+ protocol verification | PASS | 7 invariants / 101,467 states / EXIT 0 |
| TVLA side-channel (software) | PASS | N=10,000, 36/36 green |
| CodeQL | 0 critical | Critical SSRF dismissed (false positive) |
| Dependabot | 0 open | 40 historical alerts dismissed (all fixed/upgraded) |
| ESLint (CI scope) | 0 errors | `packages/pqc-kem/src/ + test/ --max-warnings 0` green |
| ESLint (full scripts/) | 0 errors, 106 warnings | Down from 112 errors + 239 warnings |

## Known Limitations (P0)

1. **Experimental component isolation** — VWZ/LookingGlass controlled by runtime flags only; no compile-time enforcement. Deadline 2026-08-20 (overdue).
2. **No third-party security audit** — All testing is self-performed. Highest-leverage improvement item.
3. **FPGA physical side-channel** — Logic-only verification; no power/EM leakage testing. Planned Q4 2026.
4. **JS BigInt non-constant-time** — SM2/ML-KEM use BigInt with timing side-channel risk. k-masking mitigates SPA but not fully.

See [docs/security-limitations.md](docs/security-limitations.md) for full disclosure.

## CI Pipeline

All jobs green on `main`:
- `gm-crossval` — SM2/SM3/SM4-GCM KAT (3 platforms × Node 18/22)
- `mlkem-kat` — ML-KEM-768 roundtrip + KAT (3 platforms)
- `node-test` — keccak + fibemate unit tests (3 platforms)
- `lint` — ESLint (pqc-kem/src + test, --max-warnings 0)
- `docs-check` — markdownlint + link check
- `bom-check` — BOM + encoding corruption check

## Documentation

- [Security Limitations](docs/security-limitations.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Risk Rectification](docs/risk-rectification.md)
- [Design Decisions](docs/design-decisions.md)

## Not a Security Product

FIBEMATE is an engineering demonstration platform, not a production-ready security library. Do not use it for classified, financial, government, or critical infrastructure scenarios. See [§11 Mandatory Usage Constraints](docs/security-limitations.md#11-强制使用约束必读) in security-limitations.md.
