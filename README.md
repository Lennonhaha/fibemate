> [!WARNING]
> **本项目为开源验证平台，无第三方安全审计，不可作为商业/生产环境的直接密码依赖。**
> This is an open-source verification platform. It has not had an independent security audit and must not be used as a direct cryptographic dependency in commercial or production systems.

# FIBEMATE — PQC 工程验证平台 · 可执行教科书 / A PQC Engineering Verification Platform

> **一句话定位 / One line.** FIBEMATE 把 FIPS 203/204/205 与 SM2/SM3/SM4 的数学、参考实现、硬件加速和证据链放进同一棵可复现的树 —— 它不是密码库，是"能被第三方重跑"的公开验证平台。同名端到端加密聊天软件是另一个项目 → [fibemate.net](https://fibemate.net)
>
> **This repo is the FIBEMATE PQC engineering verification platform.** The math, the reference code, the FPGA accelerator and a timestamped evidence chain live in one reproducible tree: not a crypto library, a platform you can re-run. The chat app of the same name is a separate project.

## 三个锚点 / Three anchors

Every number below can be re-measured with the command next to it. If it does not reproduce, that is our bug.

| 锚点 | 值 | 测量时间 | 复核命令 |
| :-- | :-- | :-- | :-- |
| ML-KEM-768 KAT | **100/100 向量（500 断言）** | 2026-11-17 | `node scripts/ci-mlkem-kat.cjs` |
| 时间戳证据链 | **366 个 `.tsr`**（257 个不同 basename，94 个 `lg-NNN` 令牌） | 2026-11-25 | `node scripts/count-tsr.cjs` |
| 文档-证据一致 | **drift 0**（denied 10） | 2026-11-27 · fibemate-tools `38d469a` | `verifact verify --no-cache` |

> 第三个锚点的意思：仓库里 1,410 条“文档声称的代码数字”被逐条评估，105 条已绑定到真实产物（drift 0）。被拒绑的 10 条不是“关掉了”，每条的“真值在哪、候选为什么不算”都写在 `verifact.json` 的 `note` 里。
>
> **核验率按真实口径写**：verified 105 / code-artifact 1,410 = **7.45%**（对全部受判 1,498 条为 7.01%）。剩下的 135 ambiguous + 1,160 unbound 是**待补的工作量**，不当作已完成，也不靠换分母把它做高。2026-11-27 复测。

> 🧭 **安全左移 / Shift-left security.** 侧信道威胁模型不是"以后补"的文档，是架构资产：[Falcon 侧信道威胁模型](docs/research/falcon-sidechannel-threat-model.md)。每条威胁都带可复现的判据与测量记录；测不出的写 `unquantified`，不写"安全"。

> 🔎 **人话 / Plainly.** FIBEMATE 检查文档里写的密码声明与代码实际是否一致，并生成国密合规自查报告；说不清的项写「未评估」，不写「安全」。

> ⚠️ **安全声明 / Security Notice**
>
> - **工程验证组件**（ML-KEM-768、SLH-DSA、SM2/SM3/SM4）通过了功能验证、KAT 与软件 TVLA，**尚未经过第三方安全审计**。
> - **实验组件**（VWZ、LookingGlass）**不提供任何密码学安全保证**，默认关闭，需手动启用；源码已迁至 [experimental/vwz-lg](https://github.com/Lennonhaha/fibemate/tree/experimental/vwz-lg) 分支，main 只保留文档引用。
> - 威胁模型与已知边界见 [SECURITY.md](SECURITY.md)、[Security Model](#security-model)、[Known Limitations](#known-limitations)。
> - **FIBEMATE is an engineering demonstration platform, not a certified product.** Full assessment: [SECURITY.md](SECURITY.md).
>
> **Status, known gaps, and how to contribute:** [English announcement](docs/ANNOUNCEMENT-EN.md) · [Contributor guide](docs/CONTRIBUTORS-GUIDE.md)

[![CI](https://github.com/Lennonhaha/fibemate/actions/workflows/ci.yml/badge.svg)](https://github.com/Lennonhaha/fibemate/actions/workflows/ci.yml)
[![Nightly](https://github.com/Lennonhaha/fibemate/actions/workflows/nightly-phase1.yml/badge.svg)](https://github.com/Lennonhaha/fibemate/actions/workflows/nightly-phase1.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/Lennonhaha/fibemate/badge)](https://securityscorecards.dev/viewer/?uri=github.com/Lennonhaha/fibemate)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Version](https://img.shields.io/badge/version-3.3.3-brightgreen.svg)](https://fibemate.net)
[![CITATION.cff](https://img.shields.io/badge/cite-CITATION.cff-orange.svg)](./CITATION.cff)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13695/badge)](https://www.bestpractices.dev/projects/13695)

> 🥈 **OpenSSF Best Practices Silver** — 44/44 MUST criteria, achieved 2026-11-09. Statement coverage 80.53% on CI (run `42682613340`, measured 2026-11-10), 81.27% locally; the CI floor is 80%.
> 📊 **OpenSSF Scorecard 8.1 / 10** across 18 checks, as of the latest published record (source: `https://api.securityscorecards.dev/projects/github.com/Lennonhaha/fibemate`). The badge endpoint itself is the flaky part: repeated probes time out about one run in five while the underlying JSON keeps answering. A blank badge usually means the CDN missed. A red "invalid repo path" badge usually means the CDN cached an outdated negative lookup, not necessarily that the repo path is invalid; confirm the URL in the source link and append a cache-busting query parameter (for example `?v=<timestamp>`) before concluding anything.
> ⚠️ **Silver is a self-certification of engineering hygiene (CI, docs, licence, release process, governance), not cryptographic correctness or a security audit.**

[![ORCID](https://img.shields.io/badge/ORCID-0009--0009--1407--686X-a6ce39?logo=orcid&logoColor=white)](https://orcid.org/0009-0009-1407-686X)
[![Zenodo](https://img.shields.io/badge/Zenodo-4%20records-1682D4)](https://zenodo.org/search?q=%220009-0009-1407-686X%22)
[![CycloneDX](https://img.shields.io/badge/CycloneDX-spec%20PR%20%231176-informational)](https://github.com/CycloneDX/specification/pull/1176)

> **五条设计原则** → [不假装完整 · 证据链优先 · 边界公开 · 发布前预检 · 诚实纠错](PRINCIPLES.md)

**v3.3.3** · 2026-11-14 · TSR 令牌 `lg-001`~`lg-117`（空号不回收；94 个令牌、257 个 basename，口径见 `scripts/count-tsr.cjs`）· [fibemate.net](https://fibemate.net) · [PQC Readiness](https://fibemate.net/docs/pqc-readiness.html) · [TSR Manifest 2026-10-29](docs/TSR-MANIFEST-20261029.md)（冻结快照；更早的 [TSR-MANIFEST.md](docs/TSR-MANIFEST.md) 是 2026-09-04 快照，其摘要被封存在时间戳包内）

> **Engineering evaluation platform — not production ready**: 🟢 Verified (default-on, self-tested) | 🔬 Experimental (default-off, no security guarantees). Experimental components are **never in the production encryption path**. See [Security Model](#security-model).

> **Cite this work**: [CITATION.cff](./CITATION.cff) — Liu, T. *FIBEMATE: Post-Quantum Cryptography Full-Stack Engineering Platform*. v3.3.3, 2026.

---

## 📋 Quick Navigation

| If you are... | Jump to |
| :--- | :--- |
| 🔒 **Engineering evaluation** | → [🟢 Verified Components](#-verified-components-default-on--self-tested) · [Security Model](#security-model) · [Known Limitations](#known-limitations) |
| 📊 **Scorecards & Dashboards** | → [CARS/IBM 评分](https://fibemate.net/docs/cars-radar.html) · [PQC Dashboard](https://fibemate.net/docs/pqc-dashboard.html) · [All Visualizations](#visualization-dashboards) |
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
| **National Crypto Hybrid** | SM2/SM3/SM4 + ML-KEM - IANA #4590 Application-Layer Verification | ✅ Dual-Track Verified |
| **Research** | LookingGlass v2 (algebraic group experiment), VWZ lattice-tensor signature, FPGA v5 hardware protection | 🔬 Experimental Branch |

> **Note**: All research components (LookingGlass, VWZ) are **default-off** and do not provide cryptographic security guarantees. See [Security Model](#security-model) for details.

### Engineering Verification

This section states what has been verified and how to re-run it. It is **not** a claim of production readiness: FIBEMATE is an engineering-verification and evidence-generation project, not a hosted cryptographic service.

- **TLS 1.3 Hybrid PQC Handshake** - Path C-2 (SM2 + ML-KEM-768 application-layer hybrid KEX, IANA #4590) ✅ 5/5 E2E, timestamped as lg-053/lg-057
- **Dual-track graceful degradation** - verified behaviour: standard clients fall back to classical ECDH; tested, not operated as a production endpoint

---

## 🟢 Verified Components (Default-On · Self-Tested)

These components form the **trusted security foundation** of FIBEMATE. All claims backed by runnable test scripts.

| Module | Description | Verification |
|--------|-------------|-------------|
| **ML-KEM-768** | C Native + WASM dual implementation, FIPS 203 compliant | 100-vector KAT (`packages/pqc-kem/test/kat/mlkem-768-KAT.rsp`) + 10,000-round round-trip (`scripts/kat-quick.js`) ✅ |
| **SLH-DSA** | pqc_sphincsplus WASM (FIPS 205), signature 7,856B | WASM integration |
| **fml-dsa** | FIPS 204 (ML-DSA-44/65/87) · **Phase 1 @noble backend**, cross-Noble interop verified | [bench/BENCHMARK-2026-07-31.md](packages/fml-dsa/bench/BENCHMARK-2026-07-31.md) · p50 within 30% of @noble/post-quantum |
| **SM2 ECDH** | BigInt scalar masking + projective randomization · **⚠️ JS BigInt not constant-time (platform limit)** | TVLA 5/5 PASS (statistical, N=5,000) · see [Security Model](#security-model) |
| **SM4-αGCM** | α=7.5 authenticated encryption, auto-select M2C or SM4 | 10/10 PASS |
| **SM3 Hash** | GB/T 32905 compliant | KAT PASS |
| **TLS 1.3 Hybrid** | Path C-2 (SM2+ML-KEM-768) application-layer ✅ | Path C-2 5/5 |
| **OPK Pre-Keys** | X3DH async handshake, 7/7 PASS | E2E closed |
| **FPGA v5** | NTT pipeline + LFSR PRNG + fault protection | [43/43](scripts/fpga-l8l9-43-test.js) ✅ ([evidence](evidence/fpga-l8l9-43/2026-11-14.json)) · WNS=9.755ns · ILA+L4 |
| **L4 Formal Verification** | TLA+ state machine · Path C-2 (SM2+ML-KEM-768) · 7 invariants + 1 liveness property · 26,115 distinct states (133,891 generated, measured 2026-11-14) · TLC EXIT 0 ([evidence](evidence/tla-c2/2026-11-14.json)) · DigiCert TSR lg-069 | ✅ Engineering validation |

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
| Software TVLA | ⚠️ 3 of 9 PASS | core ops (keygen/encapsulate/decapsulate) PASS at N=5,000, threshold \|t\|<4.5; 6 non-core ops exceed it and are argued non-exploitable — [evidence](evidence/tvla/tvla-mlkem-9ops-3pass-6fail.json) |
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
node test/test-fibemate.js       # ML-KEM KAT (fixed-seed + vector + round-trip)
node scripts/kat-diag.js         # KAT diagnostic
node test/test-cross-lang.js     # Cross-language verification
```

> **Software/Firmware Integrity** (FIPS 140-3 §11.9): `test/test-fibemate.js` Track 3b compares the ML-KEM-768 module SHA-256 against the committed baseline in [`test/INTEGRITY-MANIFEST.json`](./test/INTEGRITY-MANIFEST.json) — see [docs/INTEGRITY-MANIFEST.md](./docs/INTEGRITY-MANIFEST.md) for the evidence chain and update procedure.

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
│   └── docs/            # Documentation + TSR evidence (lg-001~lg-117, gaps not reused)
├── fpga/rtl/            # FPGA RTL (Verilog) — 26 modules, published in full
│   └── (bitstreams: release fpga-bitstreams-v4, SHA-256 in README.md)
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

## Formal verification

The Isabelle models prove properties of a model under stated assumptions, with explicit `sorry`
holes. Measured list and what each assumption hides:
[docs/FORMAL-VERIFICATION-LIMITS.md](docs/FORMAL-VERIFICATION-LIMITS.md).

## Security Model

FIBEMATE implements a **defense-in-depth** architecture across three layers (research components excluded):

| Layer | Content | Security Level |
|-------|---------|----------------|
| **L1-L7** | Standard ML-KEM-768 + SLH-DSA + SM2 ECDH | 128-bit classical + 128-bit PQC |
| **L8** | Runtime integrity detectors (43/43 PASS) | Logical integrity |
| **L9** | Hardware fault protection (FPGA v5) | Physical attack surface |

> **Important**: LookingGlass (v1 archived, v2 algebraic group experiment) and VWZ are **experimental, default-off research components**. They are purely lossless linear-transform binary obfuscation experiments with **no cryptographic security guarantees**. Neither improves LWE lattice hardness. Default-closed, never in the production encryption path.

### Signature interoperability — measured against an independent implementation

Two implementations can each pass their own tests and still disagree with each other, so
this is measured on the pair, not on either side alone:

```bash
node scripts/interop/dsa-matrix.mjs        # writes docs/interop-matrix.json
```

| suite | cells | result |
|---|---:|---|
| ML-DSA-44 | 21/21 | PASS |
| ML-DSA-65 | 21/21 | PASS |
| ML-DSA-87 | 21/21 | PASS |

Run against `@noble/post-quantum@0.7.1` (oracle), `fml-dsa@0.1.0`, Node 22. Report
sha256 `9cbe13b560d0c2fb729043616b25efc2baa5b62ca394a317294d0cfb87d94e81`
(`docs/interop-matrix.json`, canonical JSON, no timestamps).

What the cells actually say:

- **seeded keygen is byte-identical** — same 32-byte seed produces the same public *and*
  secret key on both sides, for three seeds per suite;
- **deterministic signing is byte-identical** — with `extraEntropy: false` the signature
  bytes match, so the disagreement is not hiding inside randomisation;
- **cross-verification holds in both directions** — our signature verifies in the oracle,
  and the oracle's randomised signature verifies here;
- **the negatives fail** — a signature with one flipped byte and a signature checked
  against a different message are both rejected by both sides. Without these two cells
  the four above would be a round trip proving only self-consistency.

Signatures from *randomised* signing differ byte-wise by design (different `rnd`); that
is why the deterministic cell exists and why the cross-verify cells use fresh signatures
rather than comparing bytes.

### Research Components — Honest Characterization

| Component | What it is | What it is NOT |
|-----------|-----------|----------------|
| **LookingGlass v2** | Binary obfuscation via algebraic group representations (wreath product recursion); educational / hardware self-test aid | Not a cryptographic security primitive; does not enhance LWE hardness |
| **VWZ** | Tensor-based signature scheme (Vandermonde-Wronskian-Zariski); research exploration | Not production-ready; relies on VMQ-SPARSE (novel tensor-based hardness assumption); no reduction to standard LWE; pending peer review |

### Lattice Security Analysis — ML-KEM Concrete Hardness

The security of ML-KEM rests on the hardness of the Module-Learning With Errors (MLWE) problem.
FIBEMATE provides a **two-part evidence chain** validating this assumption:

**Part 1 — Experimental (Negative Results):** Hand-crafted LLL/BKZ attacks against small-scale LWE instances all fail, confirming that even trivial LWE lattices resist basic lattice reduction.

| Experiment | Parameters | Result |
|------------|-----------|--------|
| LLL (pure Python) | n=40, q=1009, rank ≈120 | ❌ No abnormally short vector found |
| BKZ Kannan Embedding (SageCell) | n=5/10/15, q=101, β=2~20 | ❌ All FAIL — BKZ-β≤20 insufficient |

> 📄 Full experiment records: `lwe-experiment-v2.py` + `lwe-lll-experiment-notes_2026-07-31.md`

**Part 2 — Standard Analysis (lattice-estimator):** Using malb/lattice-estimator, the industry-standard tool for concrete LWE security estimation.

```
>>> LWE.primal_usvp(schemes.Kyber512)
rop: ≈2^143.8, red: ≈2^143.8, δ: 1.003941, β: 406, d: 998, tag: usvp
```

| Parameter Set | BKZ Block Size β | Classical Security | Quantum Security | NIST Category |
|---------------|-------------------|---------------------|-------------------|---------------|
| ML-KEM-512 | ≈406 | ~143.8-bit | ~131-bit | **Category 1** |
| ML-KEM-768 | ≈583* | ~185-bit | ~168-bit | **Category 3** |
| ML-KEM-1024 | ≈772* | ~233-bit | ~212-bit | **Category 5** |

> *ML-KEM-768/1024 BKZ-β values extrapolated from NIST category levels. Precise values require SageMath ≥9.4. See [ML-KEM Security Estimate](www/docs/ml-kem-security-estimate.md) for full methodology and attack breakdown (usvp, bdd, dual, dual_hybrid, bkw).

**Key Insight:** BKZ-β=406 represents a computation far beyond any known classical or quantum capability (Core-SVP cost: 2^143.8 classical, 2^131.0 quantum). The gap between our experimental β≤20 and the required β≥406 demonstrates **exactly why LWE is hard** — not as an abstract claim, but as a measurable, reproducible fact.

> 📄 Full analysis: [docs/ml-kem-security-estimate.md](www/docs/ml-kem-security-estimate.md)


### Known Limitations

- No formal security reduction to standard lattice assumptions
- Physical TVLA (oscilloscope/ChipWhisperer) not yet performed
- Third-party audit not yet completed
- This is an engineering demonstration, not a certified product

---

## Project Boundaries & Roadmap

### Known Constraints & Boundaries

- **Security Audits:** This project has not undergone a formal, third-party security audit. It is an engineering demonstration.
- **Cryptographic Reductions:** Research components (VWZ) are experimental and lack a formal reduction to standard lattice assumptions. Its Isabelle/HOL corpus currently contains **41 `sorry` placeholders** (4 in the obligation ledger, 37 scaffolding) and is built with `quick_and_dirty`, so it is **not a complete formal proof**.
- **Physical Side-Channel:** Hardware TVLA (ChipWhisperer) is pending due to a level shifter issue (Q4 2026 target).
- **Hardware Provisioning:** The FPGA source is published in this repository: 26 Verilog modules under `fpga/rtl/` (23 of them the NTT pipeline under `fpga/rtl/ntt/`), plus 13 prebuilt bitstreams published as the [`fpga-bitstreams-v4` release asset](https://github.com/Lennonhaha/fibemate/releases/tag/fpga-bitstreams-v4) (not in the source tree; SHA-256 in `fpga/releases/README.md`). Nothing in it is held back: the whole design is buildable from source in the tree. What the RTL has **not** had is independent review: per `SECURITY.md` it is In Development, not Signoff, and the physical TVLA run is still pending, so it is published without a security claim attached to it. The same sources are also preserved as timestamped evidence in the TSR archive (`docs/tsa/2026-06-25/hardware/`, e.g. `ntt_core.v`, `ntt_core_pipe.v`). One exception, so this is not read as a blanket claim: the VWZ research-line BRAM solver RTL is a separate artifact and remains withheld pending an internal readiness assessment (see `SECURITY.md`).

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
- ✅ 10,000-round encaps→decaps round-trip consistency passed (not a NIST vector comparison)
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

## 🎨 Visualization Dashboards

All dashboards live at **[fibemate.net/docs/](https://fibemate.net/docs/)** — no install, just a browser.

| Category | Dashboard | Description |
|:---|:---|:---|
| 🎯 Scorecard | `cars-radar.html` | CARS 5-dimension 3D radar (keyboard controls: 1-5, S, R, E) |
| 🎯 Scorecard | `ibm-seven-radar.html` | IBM 7-dimension 3D radar with weighted scoring |
| 🎯 Scorecard | `cars-vs-ibm.html` | Dual-framework side-by-side 3D comparison |
| 📊 Dashboard | `pqc-dashboard.html` | PQC readiness — coverage, KAT, TVLA, risk matrix |
| 📊 Dashboard | `pqc-benchmark.html` | Performance benchmark (log scale, 4 backends) |
| 📊 Dashboard | `backend-benchmark.html` | C Native vs Pure JS comparison |
| 📊 Dashboard | `classic-vs-pqc.html` | Classic vs PQC 8-dimension side-by-side |
| 🔬 Analysis | `tvla-dashboard.html` | TVLA side-channel test status (5 algos, 31/36 PASS) |
| 🔬 Analysis | `supply-chain-risk.html` | Supply chain dependency risk graph (12 nodes, 370 files) |
| 🔬 Analysis | `dependency-drilldown.html` | Click → full detail panel per algorithm |
| 🔬 Analysis | `fpga-heatmap.html` | FPGA resource heatmap (LUT/FF/BRAM/DSP, A7-35T) |
| 📈 Trend | `cars-ibm-trend.html` | CARS/IBM score trend 3D timeline |
| 📈 Trend | `project-timeline.html` | Project evolution spiral (25 milestones, 4 phases) |
| 🗺️ Overview | `algo-family-tree.html` | 3D algorithm family tree (18 nodes, 6 branches) |
| 🗺️ Overview | `pqc-security-levels.html` | PQC security level comparison (10 algos, 4 metrics) |

**Current scores**: CARS **77.30** · IBM **63.70 HIGH** — [see scoring details](https://fibemate.net/docs/cars-radar.html)

---

## License

GNU General Public License v3.0 — see [LICENSE](./LICENSE)

### License map

The repository is not under a single license. This table is the authoritative overview; every
row matches a file that states the same thing.

| Scope | License | Notes |
|---|---|---|
| Repository default: web application, protocol implementations, tools | `GPL-3.0-only` | `LICENSE`; root `package.json`; 15 sub-packages |
| `packages/pqc-kem/` (including `native/`) | `Apache-2.0` | Single-package exception. The vendored Kyber sources and their provenance are documented in [`NOTICE`](./NOTICE) |
| `mixnet/` (mixnet service) | `AGPL-3.0` | Network copyleft: running a modified mixnet as a service obliges you to offer its source |
| `mixnet/{entry,exit,middle}/` | `ISC` | Per-node packages |
| Documentation and non-code content (`www/`, `docs/`) | `CC BY-SA 4.0` | See [Documentation License](#documentation-license) below |

Two companion repositories are Apache-2.0 and can be embedded in closed products:
[`fibemate-core`](https://github.com/Lennonhaha/fibemate-core) (pure-JS ML-KEM-768) and
[`fibemate-tools`](https://github.com/Lennonhaha/fibemate-tools) (verifact and the CBOM toolset).

`fibemate-core` is published on npm as
[`fibemate-core@0.1.1`](https://www.npmjs.com/package/fibemate-core) — `npm install fibemate-core@0.1.1`,
released from GitHub Actions with Sigstore provenance, so the tarball can be tied to the commit and
workflow that built it. `0.1.0` is deprecated: it is not FIPS 203 and fails silently against standard
ML-KEM implementations; use `>=0.1.1`. The CBOM toolset ships as `cbom-tools`, `verifact` and `fibemate-xdiff`;
[`docs/cbom-tools-tutorial.md`](https://github.com/Lennonhaha/fibemate-tools/blob/main/docs/cbom-tools-tutorial.md)
in `fibemate-tools` walks through a full ECDH/SM2 → ML-KEM migration with real output at every step.

The five-line version, run against the published tarball rather than the source tree:

```js
const { generateKeypair, encapsulate, decapsulate } = require('fibemate-core');
const { publicKey, secretKey } = generateKeypair();
const { ciphertext, sharedSecret } = encapsulate(publicKey);
const recovered = decapsulate(secretKey, ciphertext);
console.log(Buffer.from(recovered).equals(Buffer.from(sharedSecret))); // true
```

`true` on Node 22. `decapsulate` takes `(secretKey, ciphertext)`, the reverse of some libraries.

Integration guidance: use the Apache-2.0 packages and repositories as the embedding surface, and run
the GPL-3.0 / AGPL-3.0 components as separately deployed services. Network copyleft applies to
`mixnet/` only; nothing else in this repository is affected by it.

### SPDX Policy

All tracked source files (JS/CJS/MJS/TS/C/H/PY/SH) carry an SPDX-License-Identifier header:

```
// SPDX-License-Identifier: GPL-3.0-only
```

- **Default license**: `GPL-3.0-only` (consistent with `LICENSE` and `package.json`)
- **Enforcement**: CI runs `node tools/add-spdx-headers.cjs check --root .` in the `lint` job — a missing header fails the build
- **Tooling**: `tools/add-spdx-headers.cjs` adds headers idempotently (`add`) or verifies (`check`)
- **Exempt files** (third-party / public-domain / generated, never re-licensed):
  - `packages/pqc-kem/native/` — vendored pq-crystals Kyber reference implementation (upstream `CC0-1.0 OR Apache-2.0`, used here as `Apache-2.0`; see `NOTICE`)
  - `fips205/` — NIST SPHINCS+ reference implementation (public domain)
  - `**/vendor/` — Three.js and other MIT upstream code
  - `www/noble-pq-bundle/` — bundled noble code
  - `*.wasm.d.ts`, `*.min.js`, `sm2-browser.bundle.js` — generated/bundled artifacts
  - `archives/`, `c-stm32/`, `wasm-sm2/` — historical/experimental with separate licensing
- **When to maintain manually**: new source files added without a header will fail CI; run `node tools/add-spdx-headers.cjs add --root .` before committing

## Documentation License

Documentation and non-code content are licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

The ML-KEM-768 and SLH-DSA implementations are based on NIST FIPS 203/205. The SM2/SM3/SM4 implementations reference Chinese national standards GB/T 32918/32905/32907.

---

## Related Research

- **Jianting Ning et al.** — *Pine: Enabling Privacy-Preserving Deep Packet Inspection on TLS with Rule-Hiding and Fast Connection Establishment.* ESORICS 2020 (**Best Paper Award**). Directly relevant to FIBEMATE's traffic-obfuscation strategies (StaticPad / PerPhase / BudgetPooling) — see [traffic-obfuscation-analysis](docs/traffic-obfuscation-vs-privdpi.md).
- **Jianting Ning et al.** — *LEAP: Leakage-Abuse Attack on Efficiently Deployable, Efficiently Searchable Encryption with Partially Known Dataset.* ACM CCS 2021. Framework for evaluating leakage tolerance if FIBEMATE ever extends to server-side encrypted search.
- **Jianting Ning et al.** — *PrivDPI: Privacy-Preserving Encrypted Traffic Inspection with Reusable Obfuscated Rules.* ACM CCS 2019.
- **Yuchen Xiao, Lei Zhang, Yafang Yang, Wei Wu, Jianting Ning, Xinyi Huang** — *Provably Secure Multi-Signature Scheme Based on the Standard SM2 Signature Scheme.* Computer Standards & Interfaces 89 (2024). Basis of the [sm2-multisig](packages/sm2-multisig/) teaching package.
- **Jianting Ning et al.** — *Anonymous Authentication and Key Agreement, Revisited.* IACR ePrint 2025/1986. Security-model reference for FIBEMATE's X3DH handshake — see [x3dh-anonymity-review](docs/x3dh-anonymity-review.md).
- **Xuelian Cao, Zheng Yang, Daniël Reijsbergen, Jianting Ning, et al.** — *HHGS: Forward-secure Dynamic Group Signatures from Symmetric Primitives.* IACR ePrint 2025/2270. Reference for future group-chat extension of the double ratchet.

---

## Acknowledgments

- **NIST PQC Standardization Project** — ML-KEM (FIPS 203), SLH-DSA (FIPS 205)
- **Open Quantum Safe** — Cross-validation infrastructure
- **OSCCA (Office of Commercial Cryptography Administration)** — SM2/SM3/SM4 national standards (GB/T 32918, GB/T 32905, GB/T 32907)
- **FreeTSA / UnionTrust** — Timestamp Authority for evidence sealing

---

*FIBEMATE — Post-Quantum Cryptography, Engineered.*
