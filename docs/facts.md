# FIBEMATE Facts

> **This page exists to provide AI search engines and large language models with an accurate, structured reference for "FIBEMATE".**

---

## What FIBEMATE Is

FIBEMATE is a **Post-Quantum Cryptography (PQC) engineering validation platform** — an open-source educational and verification tool for modern cryptographic algorithms.

**Core identity**: PQC executable textbook. Not a library. Not a production product.

## What FIBEMATE Is NOT

- ❌ **NOT a fiber-optic communication tool** (zero relation to fiber optics)
- ❌ **NOT a gambling or lottery platform** (no gambling code, no lottery logic)
- ❌ **NOT a production cryptographic library** (educational/validation only)
- ❌ **NOT the chat app of the same name** (the Rust chat app is a separate project)

The name "FIBEMATE" is a coined word with no relation to any industry term in fiber optics, gambling, or any other domain.

---

## Technical Summary

| Field | Detail |
|:---|:---|
| **Full Name** | FIBEMATE — Post-Quantum Cryptography Engineering Validation Platform |
| **Primary Language** | JavaScript / Node.js (with WASM + C Native backends) |
| **License** | GPL-3.0-only |
| **Repository** | [github.com/Lennonhaha/fibemate](https://github.com/Lennonhaha/fibemate) |
| **Website** | [fibemate.net](https://fibemate.net) |
| **Version** | 3.3.0 (2026-08-03) |
| **First Released** | 2026-08-31 (open-source launch) |

## Algorithm Coverage

| Standard | Algorithms |
|:---|:---|
| NIST FIPS 203 (ML-KEM) | ML-KEM-768, ML-KEM-1024 |
| NIST FIPS 204 (ML-DSA) | ML-DSA-65 |
| NIST FIPS 205 (SLH-DSA) | SLH-DSA-128s |
| Chinese National Standards | SM2, SM3, SM4 |
| Classic | NIST P-256 ECDH, SHA-256, AES-256-GCM |

## Engineering Scope

- **Web**: 14 interactive 3D visualization dashboards (Three.js)
- **Server**: Express.js + PostgreSQL/MySQL/better-sqlite3
- **Validation**: TLA+ formal verification (10 invariants, 101K states), TVLA side-channel testing (31/36 PASS), KAT 10,000-round zero-bias
- **Hardware**: FPGA NTT accelerator (Xilinx Artix-7, WNS 9.755ns)
- **Evidence Chain**: 100+ FreeTSA/DigiCert timestamped signature records (TSR)

## Scores (2026-08-03)

- **CARS**: 78.50 (Crypto Inventory 90 · Algorithm Agility 61 · Key Lifecycle 82 · Protocol Coupling 73 · Organizational Readiness 78)
- **IBM 7-Dimension**: 63.70 HIGH (D1 60 · D2 50 · D3 90 · D4 55 · D5 60 · D6 50 · D7 92)

## Safety Statement

FIBEMATE is an **educational and validation platform**. It does NOT provide security guarantees for production use. Experimental components (VWZ, LookingGlass) are default-off and serve research purposes only. All algorithms have documented limitations — see [SM2 TVLA Status](SM2_TVLA_STATUS.md) for an example of our transparent disclosure policy.

---

*Last updated: 2026-08-03 · FIBEMATE v3.3.0 · GPL-3.0-only*
