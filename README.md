# FIBEMATE - Post-Quantum Cryptography Full-Stack Platform
[![CI](https://github.com/Lennonhaha/fibemate/actions/workflows/ci.yml/badge.svg)](https://github.com/Lennonhaha/fibemate/actions/workflows/ci.yml)
[![Nightly](https://github.com/Lennonhaha/fibemate/actions/workflows/nightly.yml/badge.svg)](https://github.com/Lennonhaha/fibemate/actions/workflows/nightly.yml)


**v3.3-preview** | 2026-07-16
TSR: lg-001 ~ lg-076 | License: GNU GPLv3
[fibemate.net](https://fibemate.net) | [PQC Readiness](https://fibemate.net/docs/pqc-readiness.html)

---

## Project Overview

FIBEMATE is a full-stack post-quantum cryptography engineering platform covering three tracks:

| Track | Content | Status |
|-------|---------|--------|
| **Standard PQC** | ML-KEM-768 (FIPS 203) + SLH-DSA (FIPS 205) - KAT, WASM, TLS 1.3 Hybrid KEX | ✅ Production Ready |
| **National Crypto Hybrid** | SM2/SM3/SM4 + ML-KEM - IANA #4590 Application-Layer Verification | ✅ Dual-Track Live |
| **Research** | LookingGlass v2 (algebraic group experiment), VWZ lattice-tensor signature, FPGA v5 hardware protection | 🔬 Experimental Branch |

> **Note**: All research components (LookingGlass, VWZ) are **default-off** and do not provide cryptographic security guarantees. See [Security Model](#security-model) for details.

### Production Environment

- **TLS 1.3 Hybrid PQC Handshake** - Path C-2 (SM2 + ML-KEM-768 application-layer hybrid KEX, IANA #4590) ✅ 5/5 E2E, p95=78.5ms, lg-053/lg-057
- **Dual-track graceful degradation** - Standard clients automatically fall back to classical ECDH

---

## Core Features

| Module | Description | Verification |
|--------|-------------|--------------|
| **ML-KEM-768** | C Native + WASM dual implementation, FIPS 203 compliant | KAT 10,000/10,000 |
| **SLH-DSA** | pqc_sphincsplus WASM (FIPS 205), signature 7,856B | WASM integration |
| **SM2 ECDH** | BigInt scalar masking + projective randomization, constant-time | TVLA 5/5 PASS (N=10,000) |
| **SM4-αGCM** | α=7.5 authenticated encryption, auto-select λ2C or SM4 | 10/10 PASS |
| **SM3 Hash** | GB/T 32905 compliant | KAT PASS |
| **TLS 1.3 Hybrid** | Path C-2 (SM2+ML-KEM-768) application-layer ✅ | Path C-2 5/5 |
| **OPK Pre-Keys** | X3DH async handshake, 7/7 PASS | E2E closed |
| **LookingGlass v2** | Algebraic group representation binary obfuscation tool 🔬 | v2.1 WASM 77/77 |
| **VWZ Signature** | Vandermonde-Wang-Zhang lattice-tensor scheme (k=16, NIST-1 128-bit) | WASM 7/7 · reduction 148/148 |
| **FPGA v5** | NTT pipeline + LFSR PRNG + fault protection | Artix-7 synthesized · WNS=9.755ns ✅ · ILA+L4 closed |
| **L4 Formal Verification** | TLA+ state machine 路 Path C-2 (SM2+ML-KEM-768) 路 7 invariants 路 101,467 states 路 TLC EXIT 0 路 DigiCert TSR lg-069 | ✅ Engineering validation |
---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Git
- (Optional) OpenSSL ≥ 3.0, Rust ≥ 1.70, Vivado 2023+

### Build

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm install

# Compile C Native addon (ML-KEM-768, NTT)
cd addon && npm install && cd ..

# Verify core crypto modules
node -e "const m=require('./addon/build/Release/mlkem.node'); const kp=m.keygen(); console.log('ML-KEM-768 OK:', kp[0].length+'B pk')"
```

### Run

```bash
# Development
npm start

# Production
pm2 start ecosystem.config.js

# Service listens at http://localhost:3001 by default
# Nginx reverse proxy example: see BUILD.md
```

### Test

```bash
# All core tests
node test/test-all.js

# Per-module tests
node crypto/ml-kem-768-kat.js    # ML-KEM KAT 10,000
node crypto/sm2-tvla-suite.js    # SM2 TVLA
node crypto/pqc-hybrid-test.js  # Hybrid handshake
```

---

## Project Structure

```
fibemate/
├── src/                  # Server source
│   ├── index.js         # Express entry
│   ├── pqc-hybrid-server.js  # Path C-2 hybrid KEX
│   ├── opk-server.js    # X3DH pre-key protocol
│   └── crypto/           # Obfuscation / padding / filters
├── addon/               # C Native addon (ML-KEM-768, NTT)
│   ├── build/Release/mlkem.node
│   └── ntt/             # FPGA NTT C reference
├── www/                 # Frontend resources
│   ├── index.html       # Main site
│   ├── crypto/          # Browser crypto modules
│   │   ├── ml-kem-768.js
│   │   ├── sm2-bigint-ec.js (v1.3, TVLA 20/20 N=10k)
│   │   ├── sm3.js (v2.0, inline compression)
│   │   ├── sm4-alpha-gcm.js
│   │   └── pqc-hybrid-client.js
│   ├── docs/            # Docs + TSR evidence
│   │   ├── pqc-readiness.html
│   │   └── tsa/         # lg-001~076 TSR files
│   └── lgv1/            # LookingGlass v1 (DMTH) 📦 archived
├── rtl/                 # FPGA RTL (Verilog)
│   ├── ntt_core_pipe2.v
│   └── vwz/
├── c-stm32/             # STM32 C framework
├── scripts/             # CI / build / TVLA scripts
├── package.json
├── LICENSE              # GPLv3
├── README.md            # Chinese version
├── README.en.md         # English version
└── BUILD.md             # Build and deployment guide
```

---

## Security Model

FIBEMATE implements a **defense-in-depth** architecture across three layers (research components excluded):

| Layer | Content | Security Level |
|-------|---------|-----------------|
| **L1-L7** | Standard ML-KEM-768 + SLH-DSA + SM2 ECDH | 128-bit classical + 128-bit PQC |
| **L8** | Runtime integrity detectors (43/43 PASS) | Logical integrity |
| **L9** | Hardware fault protection (FPGA v5) | Physical attack surface |

> **Important**: LookingGlass (v1 archived, v2 algebraic group experiment) and VWZ are **experimental, default-off research components**. They are pure无损 linear-transform binary obfuscation experiments with **no cryptographic security guarantees**. Neither improves LWE lattice hardness. Default-closed, never in the production encryption path.

### Research Components - Honest Characterization

| Component | What it is | What it is NOT |
|-----------|-----------|----------------|
| **LookingGlass v2** | Binary obfuscation via algebraic group representations (wreath product recursion); educational / hardware self-test aid | Not a cryptographic security primitive; does not enhance LWE hardness |
| **VWZ** | Lattice-tensor signature scheme with Vandermonde structure; research exploration | Not production-ready; no formal security reduction to standard LWE; awaiting external review |

### Known Limitations

- No formal security reduction to standard lattice assumptions
- Physical TVLA (oscilloscope/ChipWhisperer) not yet performed
- Third-party audit not yet completed
- This is an engineering demonstration, not a certified product

---

## IANA #4590

FIBEMATE implements engineering verification of the SM2+ML-KEM-768 hybrid scheme:

- **TLS Layer** (Path A): X25519MLKEM768 -搁置 (browser/nginx technical blockers), build artifacts retained for reference
- **Application Layer** (Path C-2): SM2+ML-KEM-768 HTTP-layer hybrid KEX, TSR lg-053/lg-057

See [draft-yang-tls-hybrid-sm2-mlkem](https://datatracker.ietf.org/doc/draft-yang-tls-hybrid-sm2-mlkem/).

---

## License

GNU General Public License v3.0 - see [LICENSE](./LICENSE)

The ML-KEM-768 and SLH-DSA implementations are based on NIST FIPS 203/205. The SM2/SM3/SM4 implementations reference Chinese national standards GB/T 32918/32905/32907.

---

## Acknowledgements

- **NIST PQC Standardization Project** - ML-KEM (FIPS 203), SLH-DSA (FIPS 205)
- **Open Quantum Safe** - liboqs, oqs-provider
- **OSCCA (Office of Commercial Cryptography Administration)** - SM2/SM3/SM4 national standards (GB/T 32918, GB/T 32905, GB/T 32907)
- **FreeTSA / UnionTrust** - Timestamp Authority for evidence sealing

---

*FIBEMATE - Post-Quantum Cryptography, Engineered.*
