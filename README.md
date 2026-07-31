> ⚠️ **IMPORTANT DISCLAIMER**
>
> **FIBEMATE is an engineering demonstration platform, not a certified product.**
>
> - **Engineering-verified components** (ML-KEM-768, SLH-DSA, SM2/SM3/SM4) have passed functional verification, KAT, and software TVLA side-channel testing, but **have not undergone third-party security audit**.
> - **Experimental components** (VWZ, LookingGlass) **provide no cryptographic security guarantees**, are default-off, require manual activation.

> ⚠️ VWZ / LookingGlass 实验组件已于 2026-07-24 迁移至 [experimental/vwz-lg](https://github.com/Lennonhaha/fibemate/tree/experimental/vwz-lg) 分支。主分支保留文档引用，源代码不再维护于 main。
> - Full security assessment: see [Security Model](#security-model) and [Known Limitations](#known-limitations).

---

# FIBEMATE — Post-Quantum Cryptography Full-Stack Engineering Platform

[![CI](https://github.com/Lennonhaha/fibemate/actions/workflows/ci.yml/badge.svg)](https://github.com/Lennonhaha/fibemate/actions/workflows/ci.yml)
[![Nightly](https://github.com/Lennonhaha/fibemate/actions/workflows/nightly.yml/badge.svg)](https://github.com/Lennonhaha/fibemate/actions/workflows/nightly.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Version](https://img.shields.io/badge/version-3.3_preview-brightgreen.svg)](https://fibemate.net)
[![CITATION.cff](https://img.shields.io/badge/cite-CITATION.cff-orange.svg)](./CITATION.cff)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13695/badge)](https://www.bestpractices.dev/projects/13695)

> ⚠️ **OpenSSF passing certifies engineering hygiene (CI, docs, license), not cryptographic correctness or security audit. See [SECURITY.md](SECURITY.md) for threat model and limitations.**

**v3.3-preview** · 2026-07-22 · TSR: lg-001~100 (100 records, see [TSR Manifest](docs/TSR-MANIFEST.md)) · [fibemate.net](https://fibemate.net) · [PQC Readiness](https://fibemate.net/docs/pqc-readiness.html)

> **Engineering evaluation platform — not production ready**: 🟢 Verified (default-on, self-tested) | 🔬 Experimental (default-off, no security guarantees). Experimental components are **never in the production encryption path**. See [Security Model](#security-model).

> **Cite this work**: [CITATION.cff](./CITATION.cff) — Liu, T. *FIBEMATE: Post-Quantum Cryptography Full-Stack Engineering Platform*. v3.3-preview, 2026.

---

## 📋 Quick Navigation

| If you are... | Jump to |
| :--- | :--- |
| 🔒 **Engineering evaluation** | → [🟢 Verified Components](#-verified-components-default-on--self-tested) · [Security Model](#security-model) · [Known Limitations](#known-limitations) |
| 🔬 **Researching VWZ / LookingGlass** | → [🔬 Experimental Research Components](#-experimental-research-components-default-off--no-security-guarantees) · [VWZ ePrint](#-publications) |
| 🛠️ **Building / running** | → [Quick Start](#quick-start) · [BUILD.md](BUILD.md) |
| 🤔 **Questioning ML-KEM interoperability** | → [ML-KEM-768 Wire Format](#ml-kem-768-wire-format) |
| 📊 **Verifying claims** | → [Test Scripts](#test-scripts) · [TSR Evidence](#timestamp-evidence) |
| 🏅 **OpenSSF & Project Health** | → [OpenSSF Roadmap](docs/openssf-roadmap.md) · [Best Practices (13695)](https://bestpractices.dev/projects/13695) |

---

## Project Background & Industry Pain Points

### 1. The Critical Moment of Post-Quantum Migration

As fault-tolerant quantum computing continues to advance, traditional public-key cryptosystems based on integer factorization and elliptic curve discrete logarithms (RSA, ECC) face systematic compromise. This real-world threat is driving the most fundamental upgrade of global cryptographic infrastructure since the birth of the internet.

In response, NIST formally released FIPS 203 (ML-KEM) and FIPS 205 (SLH-DSA) in 2024, marking the transition of post-quantum cryptography from theoretical research into engineering deployment. Meanwhile, China's commercial cryptographic standards (SM2/SM3/SM4) are deeply embedded in financial, governmental, and critical infrastructure systems. Achieving **compatible coexistence and synergy between international PQC standards and national cryptographic algorithms** has become a critical challenge for future cryptographic architecture evolution.

Against the backdrop of TLS protocol migration, endpoint encryption, and hardware-accelerated cryptographic upgrades, the industry urgently needs an **end-to-end, deployable, and verifiable** full-stack PQC engineering prototype to guide real-world migration strategy design.

### 2. Three Structural Gaps in Existing Engineering Solutions

Despite rapid progress in academic PQC research, the engineering-to-deployment pipeline exhibits **three layers of structural fragmentation**:

1. **Platform Fragmentation (Endpoint ↔ Server)**
   Most PQC algorithm libraries focus on server-side integration, with limited adaptation for browser (WebAssembly) and mobile environments. This leaves developers and security teams unable to verify cryptographic logic in realistic multi-endpoint business scenarios.

2. **Implementation Fragmentation (Software ↔ Hardware)**
   PQC hardware acceleration efforts typically focus on optimizing individual NTT modules on FPGAs, with implementations decoupled from upper-layer software applications and business logic. This prevents the construction of a complete chain from cryptographic operations to business-level end-to-end communication, and makes it difficult to evaluate system-level performance of hardware-software co-design.

3. **Standards Fragmentation (International ↔ Regional)**
   The vast majority of solutions independently support either NIST standards or China's SM national cryptographic suite. The industry **lacks an engineering reference implementation that fuses both**, particularly one that verifies hybrid key agreement protocols (e.g., application-layer SM2+ML-KEM-768), and cannot provide direct guidance for hybrid cryptographic architectures meeting domestic compliance requirements.

### 3. Project Positioning: Closing the "Last Kilometer" of Engineering Verification

FIBEMATE emerged in response to these gaps. Its core objective is to construct a complete cryptographic pipeline spanning **browser–server–FPGA hardware**, integrating standardized algorithms, national cryptographic compatibility, hardware acceleration, and formal verification into a single engineering system — providing an **open, auditable, and reproducible engineering reference** for the secure migration to post-quantum cryptography.

### 4. Differentiated Approach

FIBEMATE brings together several engineering dimensions that are typically addressed in isolation:

* **Full-Stack Architecture: Crossing Hardware and Software**
  The project constructs a "Web Frontend ↔ Node Server ↔ Artix-7 FPGA" cross-layer full-stack architecture. It is not merely a stack of algorithm libraries, but an **integrated engineering verification vehicle** that bridges endpoints, services, and hardware accelerators, addressing the long-standing gap between software implementation and hardware design within a single project.

* **Dual-Standard Integration: PQC Standards and National Cryptography**
  The platform natively integrates NIST FIPS 203/205 standard algorithms with China's SM2/SM3/SM4 commercial cryptographic suite, and implements an application-layer hybrid key exchange protocol based on **SM2+ML-KEM-768** (IANA #4590). This provides a genuine engineering reference for exploring **viable schemes where international PQC and national cryptographic algorithms work in concert**.

* **Verifiable Systems Engineering**
  Beyond functional delivery, the project integrates **L4 formal verification (TLA+)** into the protocol design process, mathematically verifying core handshake logic. The project also establishes clear module boundaries, strictly distinguishing **engineering-verified standardized components** from **experimental research modules**, complemented by timestamp evidence (TSR, RFC 3161 records) for the trustworthiness and reproducibility of open-source cryptographic engineering.

---

## 🎯 Target Application Scenarios & Audience

**Who is FIBEMATE for?**
- **Cryptographic Engineers & Security Architects:** Evaluating PQC migration strategies, TLS hybrid key exchange, and performance trade-offs.
- **Hardware & Embedded Developers:** Exploring FPGA acceleration for lattice-based cryptography and NTT optimizations.
- **Academic Researchers & Students:** A tangible platform for studying PQC integration, side-channel analysis, and formal verification.
- **Compliance & Standards Bodies:** A reference implementation for evaluating hybrid schemes (e.g., SM2+ML-KEM, IANA #4590).

**Key Application Scenarios:**
- **Educational Platform:** A demonstrative tool for teaching modern cryptography and hardware-software co-design.
- **TLS 1.3 Migration Testbed:** A sandbox environment for testing and verifying hybrid PQC handshake protocols.
- **Hardware-Software Co-Design Research:** A platform for optimizing NTT and lattice-based operations on programmable logic.
- **Hybrid Cryptography Verification:** An engineering validation of integrating national crypto standards (SM series) with NIST-PQC.

---

## 🖥️ Full-Stack System Architecture

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 1. Browser Frontend (www/)                                                         │
│    Implements ML-KEM, SLH-DSA, SM2/SM3/SM4 via WASM packages.                      │
│    Serves as the user interface for testing and demonstration.                     │
└────────────────────────────────────┬──────────────────────────────────────────────┘
                                     │ HTTPS (Hybrid KEX)
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 2. Backend Server (src/)                                                           │
│    Node.js + Express Application.                                                  │
│    Hosts TLS 1.3 Hybrid Handshake (SM2 + ML-KEM-768, Path C-2).                    │
│    Manages OPK (One-Time Pre-Key) protocol for X3DH-like handshakes.               │
└────────────────────────────────────┬──────────────────────────────────────────────┘
                                     │ Native Addon (N-API)
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 3. Native Crypto Core (packages/pqc-kem/)                                          │
│    High-performance C implementation of ML-KEM-768 core primitives.                │
│    Functions as the primary cryptographic engine for the server.                   │
└────────────────────────────────────┬──────────────────────────────────────────────┘
                                     │ PCIe / JTAG (Hardware Offload)
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 4. FPGA NTT Accelerator (rtl/)                                                     │
│    Hardware implementation of the NTT pipeline.                                    │
│    Provides 9.755ns WNS, with fault protection and ILA integrity.                  │
│    Reduces computational latency for lattice-based operations.                     │
└────────────────────────────────────┬──────────────────────────────────────────────┘
                                     │
                                     ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 5. Formal Verification Layer (L4)                                                  │
│    TLA+ state machine (7 invariants) verifying the hybrid handshake.               │
│    Provides mathematical guarantees for critical Path C-2 logic.                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Overview

FIBEMATE is a full-stack post-quantum cryptography engineering platform covering three tracks:

| Track | Content | Status |
|-------|---------|--------|
| **Standard PQC** | ML-KEM-768 (FIPS 203) + SLH-DSA (FIPS 205) - KAT, WASM, TLS 1.3 Hybrid KEX | ✅ Engineering Ready (Audit Pending) |
| **National Crypto Hybrid** | SM2/SM3/SM4 + ML-KEM - IANA #4590 Application-Layer Verification | ✅ Dual-Track Live |
| **Research** | LookingGlass v2 (algebraic group experiment), VWZ lattice-tensor signature, FPGA v5 hardware protection | 🔬 Experimental Branch |

> **Note**: All research components (LookingGlass, VWZ) are **default-off** and do not provide cryptographic security guarantees. See [Security Model](#security-model) for details.

### Production Environment

- **TLS 1.3 Hybrid PQC Handshake** - Path C-2 (SM2 + ML-KEM-768 application-layer hybrid KEX, IANA #4590) ✅ 5/5 E2E, p95=78.5ms, lg-053/lg-057
- **Dual-track graceful degradation** - Standard clients automatically fall back to classical ECDH

---

## 🟢 Verified Components (Default-On · Self-Tested)

These components form the **trusted security foundation** of FIBEMATE. All claims backed by runnable test scripts.

| Module | Description | Verification |
|--------|-------------|-------------|
| **ML-KEM-768** | C Native + WASM dual implementation, FIPS 203 compliant | [KAT 10,000](scripts/kat-quick.js) ✅ |
| **SLH-DSA** | pqc_sphincsplus WASM (FIPS 205), signature 7,856B | WASM integration |
| **fml-dsa** | FIPS 204 (ML-DSA-44/65/87) from-scratch JS implementation · **cross-Noble interop verified** | [bench/BENCHMARK-2026-07-31.md](packages/fml-dsa/bench/BENCHMARK-2026-07-31.md) · p50 within 30% of @noble/post-quantum |
| **SM2 ECDH** | BigInt scalar masking + projective randomization · **⚠️ JS BigInt not constant-time (platform limit)** | TVLA 5/5 PASS (statistical, N=10,000) · see [Security Model](#security-model) |
| **SM4-αGCM** | α=7.5 authenticated encryption, auto-select M2C or SM4 | 10/10 PASS |
| **SM3 Hash** | GB/T 32905 compliant | KAT PASS |
| **TLS 1.3 Hybrid** | Path C-2 (SM2+ML-KEM-768) application-layer ✅ | Path C-2 5/5 |
| **OPK Pre-Keys** | X3DH async handshake, 7/7 PASS | E2E closed |
| **FPGA v5** | NTT pipeline + LFSR PRNG + fault protection | [43/43](scripts/fpga-l8l9-43-test.js) ✅ · WNS=9.755ns · ILA+L4 |
| **L4 Formal Verification** | TLA+ state machine · Path C-2 (SM2+ML-KEM-768) · 7 invariants · 101,467 states · TLC EXIT 0 · DigiCert TSR lg-069 | ✅ Engineering validation |

---

## 🔬 Experimental Research Components (Default-Off · No Security Guarantees)

> ⚠️ These components **provide no cryptographic security guarantees** and are **never in the production encryption path**. They must be manually enabled.

| Module | Description | Status |
|--------|-------------|--------|
| **VWZ Signature** | Vandermonde-Wronskian-Zariski tensor scheme (k=16, NIST-1 128-bit) | 148/148 ✅ (experimental/vwz-lg branch) | VMQ-SPARSE hardness assumption · No reduction to standard LWE · Pending peer review |
| **LookingGlass v2** | Algebraic group representation binary obfuscation tool 🔬 | v2.1 WASM 77/77 · No security claims |

---

### Physical Security Verification Status

| Level | Status | Detail |
|-------|--------|--------|
| Software TVLA | ✅ Complete | 36/36 green (N=5,000, \|t\|<2.06) |
| SM2 BigInt Masking | ✅ Complete | N=10,000 PASS, \|t\|<2.06 |
| FPGA ILA+L4 Timing | ✅ Complete | WNS=9.755ns |
| Hardware ChipWhisperer | ⚠️ Pending | CH340G 5V level mismatch; pending CP2102/FT232 replacement |
| Target Completion | Q4 2026 | — |

---

## 📄 Publications

- **VWZ: A Vandermonde-Wronskian-Zariski Tensor Trapdoor for Compact Post-Quantum Signatures.**
  Tianhe Liu. IACR Cryptology ePrint Archive, Report 2026/110618, 2026 *(submission returned after editorial review)*.
  NIST Security Level 1 parameters: signature 80 bytes, public key 1.76 KB.
  43 cross-validation tests passed (paper implementation); 148 extended functional tests passed (external suite).
  [PDF](papers/vwz-eprint-2026.pdf) · [ePrint](https://eprint.iacr.org/2026/110618) *(submission returned after editorial review)* · [VWZ Challenge](https://fibemate.net/vwz-challenge) · [Hardness: VMQ-SPARSE](docs/research/route-c-lvwz-phase1-math.md) · [Cryptanalysis simulation](docs/research/phase2_lvwz_simulation.py) · [Code](https://github.com/Lennonhaha/fibemate) · [148-Test Report](docs/vwz-148-test-report.md)

  Underlying assumption: VMQ-SPARSE (Vandermonde Multivariate Quadratic tensor orbit pseudorandomness), a novel tensor-based hardness assumption distinct from lattice assumptions such as LWE. The paper does not contain a security reduction to any standard well-studied problem.

> TSR vwz-076 — FreeTSA RFC 3161 timestamp (2026-07-17 11:30:15 GMT, serial 0x06497CB4): [vwz-076-main-20260717.tsr](papers/vwz-076-main-20260717.tsr)

---

## ⚡ Performance Benchmarks

### Benchmarking Environment

To ensure reproducibility, all performance data is captured under the following standardized environment. **To replicate these results, follow the setup in `BUILD.md`.**

| **Component** | **Specification** |
| :--- | :--- |
| **CPU** | Intel Xeon Platinum 8369B (2 vCPUs allocated) |
| **Memory** | 4 GB RAM |
| **Software** | Node.js v22.22.0 (Pure JavaScript, no native bindings for benchmarks) |
| **WASM Build** | `wasm-opt -O4` (aggressive optimization) |
| **FPGA** | Artix-7 XC7A200T-2, operating at 100 MHz |
| **Network** | Localhost loopback (to eliminate network latency variables) |
| **Test Duration** | 10,000 operational rounds per benchmark, single-threaded |

### End‑to‑End Performance (Engineering Baseline)

All measurements on the above environment. Single-run average over 10,000 rounds.

[📊 Full Report + Charts](www/docs/performance-benchmarks-2026-07-18.md)

| Algorithm | Operation | Throughput | Latency (avg) | Notes |
|-----------|----------|------------|---------------|-------|
| **ML-KEM-768** | Full KEM | **107/s** | 9.4 ms | Pure JavaScript, KAT 10K ✅ |
| **ML-KEM-768 (C)** | Full KEM | **~3,200/s** | 0.308 ms | C Native Addon (AVX2), 9.6× vs JS |
| **RSA-2048** | KeyGen | 17/s | 60 ms | Node.js native |
| **ECDSA P-256** | Sign | **578/s** | 1.73 ms | Node.js native |
| **SM2** | Sign | 205/s | 4.87 ms | BigInt ECC v1.3 |
| **VWZ** (C) | Sign | ⚠️ Experimental | — | ⚠️ EPrint submission returned · Default‑Off |
| **FPGA NTT v5** | 256 samples | — | — | WNS 9.755ns |

---

## Quick Start

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥ 18 | 20 or 22 recommended |
| npm | ≥ 9 | — |
| Git | ≥ 2.30 | — |
| C++ compiler | C++17 | Required for native addon (gcc/clang/MSVC 2019+) |
| Python | ≥ 3.8 | Required by node-gyp |

Optional but tested:
- Rust ≥ 1.70 (WebAssembly / wasm-pack)
- OpenSSL ≥ 3.0
- Vivado 2023+ (FPGA RTL)

### Build

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm install
```

**Native Addon (C, ML-KEM-768 NTT)**

The C native addon provides high-performance ML-KEM-768 (keygen ~103 µs, vs. ~1.19 ms pure JS).
It is automatically built when the prerequisite toolchain is available.

The addon is verified in CI across Ubuntu 22.04 with Node 20 and 22, passing
roundtrip, Self-KAT (100/100), and NIST KAT (100/100) checks. See
[`.github/workflows/native-build.yml`](.github/workflows/native-build.yml).

```bash
# The addon builds automatically:
cd packages/pqc-kem && npm install

# Manual rebuild (release mode):
npm run build:native:release

# Verify the native backend loaded:
node -e "const pk = require('.'); console.log('Backend:', pk.usingNative ? 'C NATIVE' : 'JS (no addon)'); const kp = pk.generateKeypair(); console.log('ML-KEM-768 OK:', kp.publicKey.length + 'B pk')"
```

**Troubleshooting:** If `usingNative` is `false`, confirm:
- C++17 compiler is in `PATH`
- Python 3.x is in `PATH` (node-gyp requirement)
- On Windows: Visual Studio Build Tools or MSVC 2019+
- Re-run `npm install` in `packages/pqc-kem/`

The system falls back to pure JS automatically — all KAT vectors pass on both backends.

**Core verification (pure JS, no native dependency):**

```bash
node -e "const m=require('./packages/pqc-kem/src/ml-kem-768.js'); const kp=m.generateKeypair(); console.log('ML-KEM-768 JS:', kp.publicKey.length+'B pk')"
```

### Run

```bash
# Development
npm start

# Production
pm2 start ecosystem.config.template.js

# Service listens at http://localhost:3001 by default
# Nginx reverse proxy example: see BUILD.md
```

---

## Test Scripts

All claims in Core Features are backed by runnable test scripts in `scripts/`:

| Script | Purpose | Tests |
|--------|---------|-------|
| [`ci-gm-sm2.cjs`](scripts/ci-gm-sm2.cjs) | SM2 sign/verify + encrypt/decrypt CI (JS↔Python) | 100 + 100 |
| [`ci-gm-sm3.cjs`](scripts/ci-gm-sm3.cjs) | SM3 hash CI | 30 |
| [`ci-gm-sm4.cjs`](scripts/ci-gm-sm4.cjs) | SM4-GCM AEAD CI | 30 |
| [`ci-mlkem-kat.cjs`](scripts/ci-mlkem-kat.cjs) | ML-KEM-768 roundtrip CI | 100 |
| [`vwz-148-test.js`](../../tree/experimental/vwz-lg/scripts/vwz-148-test.js) | VWZ 148 extended functional tests (in experimental/vwz-lg branch) | 15 groups, 148 tests |
| [`fpga-l8l9-43-test.js`](scripts/fpga-l8l9-43-test.js) | FPGA L8+L9 cross-validation behavioral model | 43/43 PASS |
| [`kat-quick.js`](scripts/kat-quick.js) | ML-KEM-768 KAT quick sampling (supports --samples 10000) | 100/10,000 encap/decap roundtrips |
| [`kat-bench.js`](scripts/kat-bench.js) | KAT performance benchmark | Throughput & latency |
| [`tsr-verify.sh`](scripts/tsr-verify.sh) | RFC 3161 TSR verification | DigiCert / FreeTSA |
| [`stress-test.js`](scripts/stress-test.js) | Load/stress endurance testing | Sustained load |

### Test

```bash
# All core tests
node test/test-fibemate.js

# Per-module tests
node test/test-fibemate.js       # ML-KEM KAT 10,000
node scripts/kat-diag.js         # KAT diagnostic
node test/test-cross-lang.js     # Cross-language verification
```

---

## Project Structure

```
fibemate/
├── src/                 # Server source
│   ├── index.js         # Express entry
│   ├── pqc-hybrid-server.js  # Path C-2 hybrid KEX
│   ├── opk-server.js    # X3DH pre-key protocol
│   └── crypto/          # Obfuscation / padding / filters
├── packages/pqc-kem/    # PQC KEM package (ML-KEM-768 WASM + C bindings)
│   └── src/             # KEM implementation
├── www/                 # Frontend resources
│   ├── index.html       # Main site
│   ├── crypto/          # Browser crypto modules (ML-KEM, SM2, SM3, SM4, PQC hybrid)
│   └── docs/            # Documentation + TSR evidence (lg-001~100)
├── rtl/                 # FPGA RTL (Verilog) — sources in TSR archive docs/tsa/2026-06-25/hardware/
│   └── (timing-critical IP, available on request)
├── c-stm32/             # STM32 C framework
├── scripts/             # CI / build / TVLA cross-verify
├── papers/              # Publications: VWZ ePrint 2026/110618
├── package.json
├── LICENSE              # GPLv3
├── README.md            # This file
├── CITATION.cff         # Citation metadata
├── BUILD.md             # Build and deployment guide
├── .pre-commit-config.yaml   # Multi-language pre-commit hooks
├── docs/
│   ├── testing.md              # 4-layer CI pipeline + functional + compatibility tests
│   ├── quality-assurance.md    # 7-layer QA architecture blueprint
│   ├── security-limitations.md # Security boundaries & stability weighting
│   ├── audit-package-2026-07-22.md  # Third-party audit package
│   ├── platform-matrix.md      # Multi-platform test matrix
│   └── VULNERABILITIES.md      # Vulnerability tracking (FIB-001~)
```

---

## Security Model

FIBEMATE implements a **defense-in-depth** architecture across three layers (research components excluded):

| Layer | Content | Security Level |
|-------|---------|----------------|
| **L1-L7** | Standard ML-KEM-768 + SLH-DSA + SM2 ECDH | 128-bit classical + 128-bit PQC |
| **L8** | Runtime integrity detectors (43/43 PASS) | Logical integrity |
| **L9** | Hardware fault protection (FPGA v5) | Physical attack surface |

> **Important**: LookingGlass (v1 archived, v2 algebraic group experiment) and VWZ are **experimental, default-off research components**. They are purely lossless linear-transform binary obfuscation experiments with **no cryptographic security guarantees**. Neither improves LWE lattice hardness. Default-closed, never in the production encryption path.

### Research Components — Honest Characterization

| Component | What it is | What it is NOT |
|-----------|-----------|----------------|
| **LookingGlass v2** | Binary obfuscation via algebraic group representations (wreath product recursion); educational / hardware self-test aid | Not a cryptographic security primitive; does not enhance LWE hardness |
| **VWZ** | Tensor-based signature scheme (Vandermonde-Wronskian-Zariski); research exploration | Not production-ready; relies on VMQ-SPARSE (novel tensor-based hardness assumption); no reduction to standard LWE; pending peer review |

### Known Limitations

- No formal security reduction to standard lattice assumptions
- Physical TVLA (oscilloscope/ChipWhisperer) not yet performed
- Third-party audit not yet completed
- This is an engineering demonstration, not a certified product

---

## Project Boundaries & Roadmap

### Known Constraints & Boundaries

- **Security Audits:** This project has not undergone a formal, third-party security audit. It is an engineering demonstration.
- **Cryptographic Reductions:** Research components (VWZ) are experimental and lack a formal reduction to standard lattice assumptions.
- **Physical Side-Channel:** Hardware TVLA (ChipWhisperer) is pending due to a level shifter issue (Q4 2026 target).
- **Hardware Provisioning:** The FPGA source code (`rtl/`) is available upon request due to the specific toolchain requirements (Vivado).

### Future Roadmap

| Timeline | Milestone | Status |
| :--- | :--- | :--- |
| **Q3 2026** | **Public Launch & Outreach** — 8/31 open-source launch, extensive documentation, community engagement | 🟢 In Progress |
| **Q4 2026** | **Hardware Security Audit** — Complete physical TVLA evaluation of FPGA implementation | ⏳ Planned |
| **Q1 2027** | **Cross-Platform Expansion** — Expand native bindings to Python/Rust for broader accessibility | 📋 Planned |
| **Q2 2027** | **Formal Security Audit** — Engage a third-party firm for comprehensive cryptographic audit | 📋 Planned |
| **2027-2028** | **Community Growth** — Build developer community, support additional PQC standards (e.g., FALCON) | 📋 Planned |

---

## Implementation Notes

### ML-KEM-768 Implementation

FIBEMATE's ML-KEM-768 implementation uses **NTT-domain** coefficient representation, fully compliant with NIST FIPS 203 (§4.3). All cryptographic primitives (NTT, BaseCaseMultiply, compress/decompress, byteEncode/Decode, cbd2, sampleNTT) have been byte-level verified against independent reference implementations.

**Verification status:**
- ✅ NIST FIPS 203 compatible (NTT domain)
- ✅ Cross-validated with independent implementations: 200/200 both directions
- ✅ Cross-validated against FIPS 203 reference: 10,000/10,000 both directions
- ✅ KAT 10,000 roundtrips passed
- ✅ KEM 1,000 stress: 1,000/1,000 (8.9s)
- ✅ All primitives byte-level verified

**Interoperability:**
- ✅ Compatible wire format with NIST FIPS 203 reference implementation
- ✅ Cross-validated with multiple independent implementations

**Design decisions:**
- NTT domain throughout (aligns with FIPS 203 standard)
- polyMulNTT uses BaseCaseMultiply with `ZETAS[64+⌊i/2⌋]`
- s and t stored in NTT domain (byteEncoded₁₂), reducing repeated transforms
- compress uses `rnd = floor(Q/2) = 1664` matching standard reference

**History:** Originally implemented in time domain; migrated to NTT domain on 2026-07-21. See [docs/design-decisions.md](./docs/design-decisions.md) for migration rationale.

### Nonce Truncation Bug (Fixed 2026-07-18)

A 16-to-8-bit nonce truncation in `samplePoly` caused the ML-KEM A matrix to degenerate (all rows identical). Discovered via external KAT cross-verification on 2026-07-18, fixed in commit `fb8a73c`. Internal round-trip tests still pass (6/6). The bug survived ~2 months before being caught because purely internal tests cannot detect degenerate matrices — only external KAT comparison exposes this class of error. See [docs/design-decisions.md](./docs/design-decisions.md) for details.

---

## IANA #4590

FIBEMATE implements engineering verification of the SM2+ML-KEM-768 hybrid scheme:

- **TLS Layer** (Path A): X25519MLKEM768 — Active via OpenSSL 3.x provider; nginx native NamedGroup integration shelved due to browser/nginx technical blockers, build artifacts retained for reference
- **Application Layer** (Path C-2): SM2+ML-KEM-768 HTTP-layer hybrid KEX, TSR lg-053/lg-057

See [draft-yang-tls-hybrid-sm2-mlkem](https://datatracker.ietf.org/doc/draft-yang-tls-hybrid-sm2-mlkem/).

---

## Contributing

FIBEMATE welcomes contributions from the PQC community. Here's how to get involved:

- **Good First Issues** — See [Good First Issues](./docs/good-first-issues.md) for tagged tasks suitable for new contributors
- **Discussions** — Join the conversation on [GitHub Discussions](https://github.com/Lennonhaha/fibemate/discussions)
- **Security** — Report vulnerabilities privately via [SECURITY.md](./SECURITY.md)
- **Citation** — If you use FIBEMATE in your work, cite via [CITATION.cff](./CITATION.cff)

---

## License

GNU General Public License v3.0 — see [LICENSE](./LICENSE)

The ML-KEM-768 and SLH-DSA implementations are based on NIST FIPS 203/205. The SM2/SM3/SM4 implementations reference Chinese national standards GB/T 32918/32905/32907.

---

## Acknowledgments

- **NIST PQC Standardization Project** — ML-KEM (FIPS 203), SLH-DSA (FIPS 205)
- **Open Quantum Safe** — Cross-validation infrastructure
- **OSCCA (Office of Commercial Cryptography Administration)** — SM2/SM3/SM4 national standards (GB/T 32918, GB/T 32905, GB/T 32907)
- **FreeTSA / UnionTrust** — Timestamp Authority for evidence sealing

---

*FIBEMATE — Post-Quantum Cryptography, Engineered.*
