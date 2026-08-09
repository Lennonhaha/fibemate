# FIBEMATE v3.3.0: Full-Stack PQC Engineering Verification Platform (HN Long Post Draft)

> **Status**: DRAFT · Archived, publish 2026-08-30
> **Platform**: Hacker News / dev.to
> **Draft date**: 2026-08-09 · **Open Source**: 2026-08-31

---

## What is FIBEMATE

FIBEMATE is a full-stack engineering verification platform for post-quantum cryptography (PQC), combining NIST PQC standards with Chinese GM cryptography (SM2/3/4). Single repository covers: software crypto libraries, encrypted communication protocols, FPGA hardware acceleration IPs, and a complete time-stamped evidence chain. Open source August 31, GPL-3.0-only.

**Key differentiator**: Not just another crypto library — a verification platform. Every claim has a reproducible test. Every security statement has TSR-backed evidence.

---

## Background: Why PQC Matters Now

NIST finalized FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), and FIPS 205 (SLH-DSA) in August 2024. The migration window is open. But:

- Most open-source libraries are black-box APIs with no verification layer
- GM algorithms (SM2/3/4) and NIST PQC standards exist in separate ecosystems
- "Security claims" often lack independently verifiable evidence chains

FIBEMATE's goal: **turn the black box into a white box** — every line of implementation has a corresponding test, every security claim has reproducible verification results.

---

## What's Inside

### Algorithm stack: 12 algorithms, 4 platforms

| Algorithm | Standard | JS | C++ | WASM | FPGA |
|:---|:---|:---:|:---:|:---:|:---:|
| ML-KEM-768 | FIPS 203 | ✅ | ✅ | ✅ | ✅ |
| ML-KEM-1024 | FIPS 203 | ✅ | — | ✅ | — |
| ML-DSA-65 | FIPS 204 | ✅ | — | ✅ | — |
| SLH-DSA-128s | FIPS 205 | ✅ | — | ✅ | — |
| SM2 | GM | ✅ | — | — | — |
| SM3 | GM | ✅ | — | — | — |
| SM4-GCM | GM | ✅ | — | — | — |

All algorithms verified with **KAT (Known Answer Tests) — 10,000 rounds, zero deviation**. ML-DSA-65 additionally cross-validated against @noble/post-quantum.

### Hybrid key exchange: SM2 + ML-KEM-768

TLS 1.3 hybrid key exchange (IANA #4590) with double-ratchet protocol stack, verified via:
- TLA+ formal verification (10 invariants · 101K states)
- End-to-end integration tests (5/5 PASS)
- One-time pre-generated key OPK tests (7/7 PASS)

### FPGA hardware acceleration: Artix-7 NTT pipeline

Pure Verilog RTL, behavior model **43/43 PASS**, timing report WNS 9.755ns @ 50MHz, with side-channel testing plan.

### Engineering evidence chain

```
KAT:           ML-KEM-768 10,000 rounds · ML-DSA-65 75 vectors · SM2/SM3/SM4 all pass
TVLA:          ML-KEM-768 software 36/36 · hardware 33/36 · HMAC-SM3 6/6
FPGA:          43/43 behavior model PASS
TSR:           200+ time-stamped records (lg-001~101, DigiCert + FreeTSA dual-issuer)
lattice-estimator: ML-KEM-768 security estimate BKZ β≈406 → attack cost 2^143
```

### 26 interactive visualization pages

Algorithm flows (NTT butterfly, ML-KEM key generation), TLS 1.3 hybrid handshake, PQC deployment detector, cryptography history timeline — all running in browser, zero install.

---

## Engineering highlights

- **7 npm packages**, all tests passing: `algorithm-registry` / `fml-dsa` / `key-lifecycle` / `pqc-kem` / `sm2-ref` / `sm3-ref` / `sm4-ref`
- **CI/CD**: 6 GitHub Actions workflows all green (CI / CodeQL / OpenSSF / Repolinter / Nightly Phase1+2)
- **OpenSSF Best Practices** badge (#13695)
- **Dependency governance**: 100% categorized, SPDX + CBOM manifests
- **24 known dependency vulnerabilities** (8 high / 10 moderate / 6 low) — will be patched post-open-source

---

## Honest disclosure: known limitations

We explicitly disclose known limitations rather than hide them:

| Limitation | Details | Mitigation |
|------------|---------|------------|
| **Pure JS non-constant-time** | sm2-ref/sm3-ref/sm4-ref are pure JS, not constant-time | Not for production; Rust/WASM port in roadmap (v4.0 Q1 2027) |
| **SM2 TVLA 15/18** | 3 FAIL items, root cause known (counting/masking strategy) | Data published honestly |
| **No third-party audit** | External security audit not yet completed | This is the biggest gap; v3.4 (Q1 2027) plans third-party audit |
| **Single maintainer** | Bus Factor = 1, no formal team | Recruiting contributors and collaborators post-open-source |

A honest disclaimer is worth more than ten polished marketing phrases.

---

## Open source details

| Item | Content |
|------|---------|
| **Date** | August 31, 2026 |
| **License** | GPL-3.0-only |
| **Repository** | github.com/Lennonhaha/fibemate |
| **Website** | fibemate.net |
| **Stack** | ML-KEM + ML-DSA + SLH-DSA + SM2/SM3/SM4 |

Three spin-off directions post-open-source: **Core** (crypto library) / **Comm** (encrypted comms) / **HW** (FPGA IP). See `PRODUCT-ROADMAP.md`.

---

## Contributing

FIBEMATE is not an endpoint — it's a starting point for the PQC migration verification ecosystem. We need:

- **Contributors**: Can run the project, capable of modifying code, join via good-first-issue
- **Collaborators**: Sustained high-quality PRs, invited after trust is established

See `CONTRIBUTING.md` and `CALL-FOR-COLLABORATORS.md`.

---

## Closing

The quantum threat doesn't wait for us to be ready.

FIBEMATE's goal is not "faster" — it's "clearer." Every migration step traceable, every claim verifiable.

See you August 31.

---

*This is a draft. Verify all data before publishing on 2026-08-30.*
*TSR: lg-v3.3.0-hn-announcement-20260809 (to be generated)*
