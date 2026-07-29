# FIBEMATE - Next-Generation Post-Quantum Cryptographic Communication Protocol

**v3.3-preview** | 2026-07-16 | TSR Sequence: lg-001 ~ lg-078 | License: GNU GPLv3

[fibemate.net](https://fibemate.net) | [PQC Readiness Status](https://fibemate.net/docs/pqc-readiness.html)

---

## Project Overview

FIBEMATE is a full-stack post-quantum cryptography engineering verification platform with three technical tracks:

| Track | Content | Status |
|-------|---------|--------|
| **Standard PQC** | ML-KEM-768 (FIPS 203) + SLH-DSA (FIPS 205) — KAT, WASM, TLS 1.3 Hybrid Handshake | ✅ Production Ready |
| **National Crypto Mixing** | SM2/SM3/SM4 + ML-KEM — IANA #4590 Application Layer Verification | ✅ Dual-track Launched |
| **Cutting-edge Research** | LookingGlass v1/v2/v2.2, VWZ Lattice-Tensor Signature, FPGA v5 Hardware Protection | 🔬 Experimental |

---

## Production Deployment Status

### Current State

| Layer | Protocol | Status |
|-------|----------|--------|
| **TLS Transport Layer** | Classic ECDHE X25519 | ✅ Industry Standard |
| **TLS Hybrid Handshake** | Path A (X25519MLKEM768 NamedGroup) | ⚠️ Shelved 2026-07-10 (browser/nginx technical blockers) |
| **Application Layer (E2E)** | Path C-2 (SM2+ML-KEM-768) | ✅ Verified 5/5, p95=78.5ms |

**Key Points**:
- Path C-2 runs independently via IANA #4590 application layer verification
- Dual-track non-interference: regular clients auto-downgrade to classic ECDH
- Path A compiled output retained for reference

---

## Core Features

| Module | Description | Verification |
|--------|-------------|--------------|
| **ML-KEM-768** | C Native + WASM, FIPS 203 compliant | KAT 10,000/10,000 ✅ |
| **SLH-DSA** | pqc_sphincsplus WASM (FIPS 205), signature 7,856B | WASM Integrated ✅ |
| **SM2 ECDH** | BigInt scalar masking + projective randomization + Montgomery Ladder | TVLA N=10,000 20/20 ✅ |
| **SM4-αGCM** | α=7.5 authenticated encryption | 10/10 PASS ✅ |
| **SM3 Hash** | GB/T 32905 compliant | KAT PASS ✅ |
| **TLS 1.3 Hybrid** | Path A shelved · Path C-2 application layer ✅ | Path C-2 Independent ✅ |
| **OPK Pre-key** | X3DH Asynchronous Handshake, 7/7 All Green | End-to-end Closed Loop ✅ |
| **LookingGlass** | v1 DMTH 📦 Archived · v2/v2.2 Group Algebra Experiment 🔬 | v1 36/36 TVLA · v2.2 37/37 Unit Tests + 1000/1000 KAT |
| **VWZ Signature** | Vandermonde-Wang-Zhang Lattice-Tensor Scheme (k=16, NIST-1 128-bit) | WASM 7/7 · Reduction 148/148 |
| **FPGA v5** | NTT Pipeline + LFSR PRNG + Fault Protection | Artix-7 Synthesized · WNS 9.755ns · ILA+L4 Confirmed · ⚠️ UART In Progress |
| **L4 Formal Verification** | TLA+ State Machine · Path C-2 · 7 Invariants · 101,467 states · TLC EXIT 0 | ✅ Engineering Verified |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Git
- (Optional) OpenSSL ≥ 3.0, Rust ≥ 1.70, Vivado 2023+

### Build

```bash
# Clone the repository
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate

# Install Node.js dependencies
npm install

# Build C Native addon (ML-KEM-768, NTT)
cd addon && npm install && cd ..

# Verify core crypto module
node -e "const m=require('./addon/build/Release/mlkem.node'); const kp=m.keygen(); console.log('ML-KEM-768 OK:', kp[0].length+'B pk')"
```

### Run

```bash
# Development mode
npm start

# Production mode
pm2 start ecosystem.config.js

# Service default: http://localhost:3001
# Nginx reverse proxy example: BUILD.md
```

### Test

```bash
# Run all core tests
node test/test-all.js

# Module-specific tests
node test/ml-kem-768-kat.js # ML-KEM KAT 10,000
node test/sm2-tvla-suite.js # SM2 TVLA
node test/pqc-hybrid-test.js # Hybrid handshake
```

---

## Project Structure

```
fibemate/
├── src/ # Server source
│   ├── index.js # Express main entry
│   ├── pqc-hybrid-server.js # Path C-2 hybrid handshake
│   ├── opk-server.js # X3DH pre-key protocol
│   ├── vwz-research-api.js # VWZ research API
│   └── crypto/ # Padding/filters
├── addon/ # C Native addon (ML-KEM-768, NTT)
│   ├── build/Release/mlkem.node
│   └── ntt/ # FPGA NTT C reference
├── www/ # Frontend assets
│   ├── index.html # Main site
│   ├── crypto/ # Browser crypto modules
│   │   ├── ml-kem-768.js
│   │   ├── sm2-bigint-ec.js (v1.3, TVLA N=10,000 20/20)
│   │   ├── sm4-alpha-gcm.js
│   │   └── pqc-hybrid-client.js
│   ├── docs/ # Documentation + TSA proofs
│   │   ├── pqc-readiness.html
│   │   ├── lg-vwz-security-en.html
│   │   └── tsa/ # lg-001~078 TSR files
│   ├── lgv1/ # LookingGlass v1 (DMTH) 📦 Archived
│   └── lgv2/ # LookingGlass v2 WASM
├── rtl/ # FPGA RTL (Verilog)
│   ├── ntt_core_pipe2.v
│   ├── vwz/
│   └── hw_monitor.v
├── c-stm32/ # STM32 C framework
├── scripts/ # CI/Build/TVLA scripts
├── experimental/ # Experimental modules
├── package.json
├── ecosystem.config.js
├── LICENSE # GPLv3
├── README.md
└── BUILD.md # Build & deployment guide
```

---

## Security Model

FIBEMATE follows a **defense-in-depth** three-layer architecture (excluding LookingGlass experimental branch):

| Layer | Content | Security Level |
|-------|---------|----------------|
| **L1-L7** | ML-KEM-768 + SLH-DSA + SM2 ECDH | 128-bit Classical + 128-bit PQC |
| **L8** | Runtime Detector (43/43 PASS) | Logical Integrity |
| **L9** | Hardware Fault Protection (FPGA v5) | Physical Attack Surface |

### LookingGlass

> 🔬 **Experimental Module** — Default OFF, not connected to production encryption.
>
> LookingGlass is a finite group representation Kronecker nested algebra experiment. v1 archived; v2/v2.2 used only for group theory teaching, hardware fault tolerance self-check, and L8/L9 operational monitoring experiments. v2.2: Rust source reconstruction with reproducibility closed loop (37/37 unit tests + 1000/1000 KAT, 48.1KB WASM / gzip 22.2KB, 11 exports). Algebraically equivalent to v2.1 — introduces no new cryptographic assumptions, does not increase LWE lattice hardness.
>
> See [pqc-readiness.html §7.10](https://fibemate.net/docs/pqc-readiness.html) for details.

### VWZ

> 🔬 **Research Branch** — Self-developed tensor signature scheme. Not deployed in production.

---

## IANA #4590

FIBEMATE has completed engineering validation of the **SM2+ML-KEM-768** hybrid scheme:

| Path | Protocol | Status |
|------|----------|--------|
| **Path A (TLS Layer)** | X25519MLKEM768 | ⚠️ Shelved 2026-07-10 (browser/nginx technical blockers) |
| **Path C-2 (Application Layer)** | SM2+ML-KEM-768 | ✅ HTTP Layer Hybrid Key Exchange, TSR lg-053/lg-057 |

See [draft-yang-tls-hybrid-sm2-mlkem](https://datatracker.ietf.org/doc/draft-yang-tls-hybrid-sm2-mlkem/) for details.

---

## License

**GNU General Public License v3.0** — See [LICENSE](LICENSE)

The ML-KEM-768 and SLH-DSA implementations in this project are based on NIST FIPS 203/205 standards. SM2/SM3/SM4 implementations reference GB/T 32918/32905/32907 national standards.

---

## Acknowledgments

- **NIST PQC Standardization Project** — ML-KEM (FIPS 203), SLH-DSA (FIPS 205)
- **Open Quantum Safe** — liboqs, oqs-provider
- **China National Cryptography Administration (OSCCA)** — SM2/SM3/SM4 National Standards (GB/T 32918, GB/T 32905, GB/T 32907)
- **FreeTSA / United Trust** — Timestamp Evidence

---

**FIBEMATE — Post-Quantum Cryptography, Engineered.**
