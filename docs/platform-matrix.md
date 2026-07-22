# Cross-Platform Compatibility Matrix

> v3.3-preview · 2026-07-22 · Auto-tested + manually verified

## Legend

| Symbol | Meaning |
|:---|:---|
| ✅ | Fully verified (KAT 500+ passes) |
| ⚠️ | Limited test (smoke only, <100 cases) |
| ⬜ | Not tested |
| ❌ | Known incompatible |
| 🔬 | Experimental / untested assumption |

---

## ML-KEM-768 (FIPS 203) — NTT Domain Implementation

| Platform | Host OS | Runtime | KAT 10K | liboqs 10K × | Noble 200 | Barrett 500 × | Status |
|:---|:---|:---|:---|:---|:---|:---|:---|
| x86_64 ECS | Ubuntu 22.04 | Node.js v22.22.3 | ✅ | ✅ | ✅ | ✅ | ✅ |
| x86_64 local | Windows 11 | Node.js v22.22.3 | ✅ | — | ✅ | ✅ | ✅ |
| x86_64 local | Windows 11 | Chrome 133+ | ⚠️ | — | — | — | ⚠️ |
| x86_64 ECS | Ubuntu 22.04 | Node.js v20 LTS | ⬜ | — | — | — | ⬜ |
| macOS | 14 (Sonoma) | Node.js v22 | ⬜ | — | — | — | ⬜ |
| macOS | 14 (Sonoma) | Safari 18+ | ⬜ | — | — | — | ⬜ |
| AArch64 | Linux | Node.js v22 | ⬜ | — | — | — | ⬜ |
| iOS | 17+ | Hermes / JSC | ⬜ | — | — | — | ⬜ |
| Android | 14+ | Hermes / V8 | ⬜ | — | — | — | ⬜ |
| STM32F407 | bare metal | C (liboqs) | 0 | ⬜ | — | — | 🔬 |

### ML-KEM-768 Test Coverage by Function

| Function | Unit | KAT | Fuzz | TVLA | Cross-val |
|:---|:---|:---|:---|:---|:---|
| `generateKeypair()` | ✅ | ✅ | ⬜ | — | ✅ |
| `encapsulate(pk)` | ✅ | ✅ | ⬜ | — | ✅ |
| `decapsulate(sk, ct)` | ✅ | ✅ | ⬜ | — | ✅ |
| `sampleNTT(seed)` | ✅ | ✅ | ⬜ | — | ✅ |
| `ntt(f)` / `invNtt(f)` | ✅ | ✅ | ⬜ | — | ✅ |
| `polyMulNTT(a, b)` | ✅ | ✅ | ⬜ | — | ✅ |
| `byteEncode(d)/Decode(d)` | ✅ | ✅ | ⬜ | — | ✅ |
| `compress(x,d)/decompress(y,d)` | ✅ | ✅ | ⬜ | — | ✅ |
| `modMul(a,b)` (Barrett) | ✅ | ✅ | — | — | 0/11M errors |

---

## SM2 / SM3 / SM4 — 国密套件

| Platform | Host OS | Runtime | KAT | TVLA | SM2 Hybrid | Status |
|:---|:---|:---|:---|:---|:---|:---|
| x86_64 ECS | Ubuntu 22.04 | Node.js v22 | ✅ | ✅ | ✅ (900/900) | ✅ |
| x86_64 local | Windows 11 | Node.js v22 | ✅ | ✅ | ✅ | ✅ |
| x86_64 local | Windows 11 | Chrome 133+ | ⚠️ | — | ⚠️ | ⚠️ |
| STM32F407 | bare metal | C framework | — | — | — | 🔬 |

### SM2 Side-Channel (TVLA)

| Test | N | |t| threshold | Result |
|:---|:---|:---|:---|
| genKey (fixed vs random) | 10,000 | 0.01 | <4.5 | ✅ |
| sign (fixed vs random, masked) | 10,000 | 0.06 | <4.5 | ✅ |
| verify (fixed vs random) | 10,000 | 0.11 | <4.5 | ✅ |
| encrypt (fixed vs random, masked) | 10,000 | 0.86 | <4.5 | ✅ |
| decrypt (fixed vs random, masked) | 10,000 | 2.06 | <4.5 | ✅ |

---

## WASM Compilation Targets

| Source | Target | Size (gzip) | Roundtrip | Status |
|:---|:---|:---|:---|:---|
| VWZ sign (Rust) | wasm32-unknown-unknown | 45.7 KB | ✅ | ✅ |
| LookingGlass v2.2 (Rust) | wasm32-unknown-unknown | 25.7 KB | ✅ | ✅ |
| ML-KEM-768 core | not yet built | — | — | ⬜ |

---

## FPGA Hardware (Artix-7 A35T)

| Test | Method | Result | Status |
|:---|:---|:---|:---|
| Verilog behavioral sim | iverilog / Vivado xsim | 256/256 | ✅ |
| Synthesis (Vivado 2024.1) | WNS 9.755ns | MET | ✅ |
| NTT masked wrapper v2 | Behavioral | PASS | ✅ |
| REMO dual butterfly | Simulation | PASS | ✅ |
| UART physical link | Board test | CH340G 5V ↔ PGA 3.3V mismatch | ❌ |
| Power estimation | Vivado report | Not published | ⬜ |

---

## TLS / KEX Integration

| Path | Layer | Server | Client | E2E | Status |
|:---|:---|:---|:---|:---|:---|
| Path A (X25519MLKEM768) | TLS 1.3 | oqs-provider + nginx | OpenSSL s_client | ⚠️ | ⚠️ |
| Path C-2 (#4590 SM2+ML-KEM) | HTTP/TLS Exporter | reg-server | hybrid-kem-client.js | ✅ (10/10) | ✅ |

---

## Node.js Version Compatibility

| Version | LTS | ML-KEM | SM2 | WASM | Notes |
|:---|:---|:---|:---|:---|:---|
| v22.x | ✅ Active | ✅ | ✅ | ✅ | Primary target |
| v20.x | ✅ Maintenance | ⬜ | ⬜ | ⬜ | Not tested |
| v18.x | ❌ EOL | ❌ | ❌ | ❌ | BigInt/ArrayBuffer compat risk |

---

## Known Gaps

1. **No macOS/iOS physical test**: All cross-platform claims are Linux/Windows only
2. **No mobile Hermes engine test**: React Native stated but not verified
3. **No 32-bit runtime test**: All tests on 64-bit; 32-bit BigInt/ArrayBuffer edge cases unknown
4. **No CI matrix automation**: Matrix maintained manually in this document
5. **No browser cross-version regression**: Only Chrome 133+ tested, Firefox/Safari untested
