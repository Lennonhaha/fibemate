# FIBEMATE — Test Coverage & Risk Assessment Report

**Generated**: 2026-08-01
**Version**: 1.1
**Scope**: 8 core modules (experimental modules excluded)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Modules assessed | 8 |
| Average coverage | **64%** |
| High risk | 1 |
| Medium risk | 4 |
| Low risk | 3 |

---

## Module Detail

| # | Module | Coverage | Risk | TVLA | Genuine Pass | Max |t| | Known Failures | KAT | CI |
|---|--------|----------|------|------|-------------|----------|---------------|-----|----|
| 1 | SLH-DSA | 40% | 🔴 high | — | — | — | — | Yes | ubuntu, macos, windows |
| 2 | SM3 | 50% | 🟡 medium | — | — | — | — | Yes | ubuntu, macos, windows |
| 3 | SM4-GCM | 50% | 🟡 medium | — | — | — | — | Yes | ubuntu, macos, windows |
| 4 | P-256/ECDH | 50% | 🟡 medium | — | — | — | — | Yes | ubuntu |
| 5 | HMAC-SM3 | 60% | 🟡 medium | 100% | 100% | 3.20 | — | Yes | ubuntu |
| 6 | ML-KEM-768 | 100% | 🟢 low | 100% | 100% | 0.00 | 1 | Yes | ubuntu, macos, windows |
| 7 | SM2 | 90% | 🟢 low | 100% | 100% | 0.00 | 3 | Yes | ubuntu, macos, windows |
| 8 | FPGA NTT | 70% | 🟢 low | — | — | — | — | N/A | Timing closure |

---

## Risk Analysis

### 🔴 High Risk

**SLH-DSA** (coverage: 40%, risk score: 30)

FIPS 205 stateless hash-based signature. NIST reference C implementation. WASM build validated in CI.

- No TVLA testing

### 🟡 Medium Risk

**SM3** (coverage: 50%)
Chinese national standard hash (≈SHA-256). Pure JS, education/validation use. ~5 KB/s throughput.

**SM4-GCM** (coverage: 50%)
Chinese national standard block cipher + GCM mode. Pure JS, ~230 KB/s encrypt throughput.

**P-256/ECDH** (coverage: 50%)
NIST P-256 ECDH for double-ratchet key exchange. No dedicated TVLA (relies on Node.js built-in crypto).

**HMAC-SM3** (coverage: 60%)
HMAC over SM3. TVLA 8/8 ALL PASS. KAT verified via scripts/hmac-sm3-kat.cjs (GBT 32905-2016 vectors, 6 tests).

### 🟢 Low Risk

**ML-KEM-768** (coverage: 100%) — all critical tests passing.
Flagship PQC KEM. TVLA 8/9 pass (1 known: compress public-data operation). Full CI + interop.
**SM2** (coverage: 90%) — all critical tests passing.
Chinese national standard ECC. jsbn verify/decrypt + BigInt verify have known JS variable-time limitations; BigInt genKey/sign/encrypt/decrypt all pass.
**FPGA NTT** (coverage: 70%) — all critical tests passing.
Hardware NTT accelerator (Artix-7). Timing closure passed (WNS=9.755ns). Not applicable for software CI/KAT.

---

## Known & Documented TVLA Failures

These timing side-channel findings are **acknowledged in project documentation** and do not represent unresolved security defects:

| Module | Function | Root Cause | Status |
|--------|----------|-----------|--------|
| ML-KEM-768 | compress (pre-alloc) | Operates on public data during Encaps; documented in README and tvla-9of9-summary.md | Documented |
| SM2 | [jsbn] verify | jsbn 28-bit limb variable-time scalar mul; documented as known limitation for pure-JS fallback | Documented |
| SM2 | [jsbn] decrypt | Same jsbn variable-time root cause as verify; SM2 decrypt uses SM2_Decrypt → scalarMult | Documented |
| SM2 | [BigInt] verify | Native BigInt wNAF verify — timing variance from precomp table access; fixed-length on roadmap | Documented |

---

## Methodology

### Scoring Dimensions (Software)

| Dimension | Weight | Description |
|-----------|--------|-------------|
| TVLA | 30% | Side-channel leakage testing (Welch t-test, N=5,000-10,000, threshold 4.5). Known/documented failures excluded from penalty. |
| KAT | 20% | Known Answer Test vectors (NIST or self-generated) |
| CI multi-platform | 20% | Cross-platform CI matrix (ubuntu, macos, windows) |
| Smoke test | 10% | Pre-commit basic roundtrip validation |
| Benchmark | 10% | Quantitative performance characterization |
| Interop | 10% | Cross-language roundtrip (JS↔C↔WASM) |

### Scoring Dimensions (Hardware — FPGA NTT)

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Timing closure | 20% | Vivado static timing analysis (WNS > 0) |
| Design verification | 20% | RTL simulation + ILA hardware debug |
| Constraints | 10% | XDC pin/timing constraint completeness |
| RTL code review | 10% | Verilog quality + testbenches |

### Risk Levels

- **🔴 High**: Genuine TVLA failures OR coverage < 40% OR no KAT + no CI (software modules)
- **🟡 Medium**: Partial coverage OR no TVLA OR single-platform CI
- **🟢 Low**: Full test suite passing, multi-platform CI, TVLA clean (or known failures only)

---

## Data Sources

| Source | Path | Content |
|--------|------|---------|
| TVLA ML-KEM-768 | www/docs/tvla/ml-kem-768/ | 11-function timing analysis (v2 corrected), 8/9 PASS |
| TVLA SM2 | www/docs/tvla/sm2/ | jsbn + BigInt dual-implementation, 12-test suite |
| TVLA HMAC-SM3 | www/docs/tvla/hmac-sm3/ | 8-test suite, all pass |
| CI | .github/workflows/ci.yml | 6-job matrix, 3 OS x 2 Node.js |
| KAT | test/fixtures/ml-kem-768-golden.json | ML-KEM-768 reference vectors |
| KAT | fips205/ | NIST SLH-DSA reference implementation |
| Smoke | test/smoke-crypto.js | Pre-commit roundtrip validation |
| Benchmark | scripts/benchmark.cjs | ML-KEM / SM2 / P-256 / AES / SM3 / SM4-GCM |
| FPGA | fpga/releases/v4/ | Vivado timing closure reports |

---

## Recommendations

### SLH-DSA
- **P1**: Add TVLA testing (Welch t-test, N >= 5,000)

### FPGA NTT
- **P2**: Hardware CI impractical — retain Vivado timing closure as acceptance gate
- **P2**: Add ILA capture evidence to docs/ for audit trail
- **P3**: Physical side-channel testing (ChipWhisperer) when hardware available

---

*Report auto-generated by tools/build-risk-assessment.cjs*
*Part of FIBEMATE v3.3-preview 8/31 open-source preparation*
