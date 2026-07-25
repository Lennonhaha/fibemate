# FIBEMATE v3.3 — Open Source Launch Announcement

> Draft v2 · 2026-07-25 · Target: 2026-08-31
> Strategy: short announcement (2,500 words) + deep-dive series (weekly)

---

## Opening

**FIBEMATE is now open source.** 🎉

What does it take to ship post-quantum cryptography end-to-end — from browser to FPGA, from NIST standards to Chinese national algorithms, from KAT vectors to TLA+ formal proofs?

Two years. One person. 100 timestamped evidence records. Here's what we found.

---

## What FIBEMATE Is

*A post-quantum cryptography executable textbook. Not a security product — an engineering proof that the full chain works.*

| Track | Coverage | Status |
|:---|:---|:---|
| **Standard PQC** | ML-KEM-768 (FIPS 203), NTT domain, C Native addon (15-31× speedup), WASM | ✅ Verified |
| **National Crypto Hybrid** | SM2/SM3/SM4-GCM + ML-KEM-768, IANA #4590, double-ratchet PQ mix-net | ✅ Verified |
| **Hardware (FPGA)** | NTT pipeline on Artix-7 35T, UART physical debug passed, 256×256 roundtrip | ✅ Live |
| **Protocol Verification** | TLA+ Path C-2 model, 7 invariants, 101,467 states, K3 strong key independence | ✅ Formal |
| **Research (default-off)** | VWZ tensor signatures, LookingGlass v2 — isolated branch, zero security claims | ⚠️ Lab |

---

## Why This Exists

The post-quantum migration is an **engineering problem**, not a paper problem.

FIPS 203 exists. liboqs exists. But stitching them together — WebCrypto ↔ FPGA BRAM, SM2 legacy ↔ ML-KEM hybrids, unit tests ↔ TLA+ models — that's where the real work lives.

FIBEMATE answers: *Can one person build, verify, and timestamp-evidence the entire stack?* Yes. With honest caveats.

---

## What Works (verified with evidence)

### Core Cryptography

- **ML-KEM-768**: NTT domain (FIPS 203 aligned) · noble 10K/10K ✅ · liboqs 10K/10K ✅
- **C Native Addon**: keygen 103µs (15.8× JS), encaps 92µs (31.5×), decaps 184µs (14.1×)
- **SM2**: GB/T 32918 · constant-time Barrett reduction (14×) · scalar masking · software TVLA N=10K PASS
- **SM3/SM4-GCM**: KAT vectors · pure JS benchmarks (SM3 21K ops/s, SM4-GCM ~230KB/s)
- **Hybrid KEX**: SM2 + ML-KEM-768 · IANA #4590 registration
- **Double Ratchet PQ**: ML-KEM-768 + P-256 hybrid handshake → multi-round message encryption ✅

### Protocol Verification

- **TLA+ Path C-2**: 7 invariants all pass, TLC EXIT 0, 101,467 states
- **K3 strong key independence**: formally proven ∀ i≠j: key[i]≠key[j]

### FPGA (Artix-7 35T)

- NTT 256×256 roundtrip verified on physical hardware
- UART debug channel operational (CH340 external adapter)
- Timing: WNS 9.869ns, WHS 0.131ns — plenty of slack

### Reproducibility

- **100 RFC 3161 TSR records** (lg-001~lg-100) — DigiCert + FreeTSA dual authority
- Every KAT, cross-validation, and release milestone timestamped
- Audit package: 258KB, 234 files, SHA256 inventory
- CI: Nightly ✅ | node-test ✅ | cross-lang ✅ | KAT smoke ✅

---

## What's NOT Claimed (read this)

| Claim | Reality |
|:---|:---|
| Security product | ❌ Engineering demonstration platform |
| Third-party audit | ❌ Self-tested, cross-validated, not externally reviewed |
| Novel cryptography | ❌ VWZ/LG are default-off research, zero security guarantees |
| Hardware security | ❌ No secure element, physical TVLA pending Q4 2026 |
| ML-KEM formal proof | ❌ TLA+ covers handshake protocol, not lattice math |

→ [security-limitations.md](docs/security-limitations.md)

---

## Quick Start (30 seconds)

```bash
git clone https://github.com/Lennonhaha/fibemate.git && cd fibemate && npm ci
node -e "
  const { generateKeypair, encapsulate, decapsulate } = require('./packages/pqc-kem');
  const kp = generateKeypair();
  const { ciphertext, sharedSecret } = encapsulate(kp.publicKey);
  const ss = decapsulate(kp.secretKey, ciphertext);
  console.log(ss.equals(sharedSecret) ? 'ML-KEM-768: PASS' : 'FAIL');
"
```

Live demo: [fibemate.net/demo](https://fibemate.net/demo/)

---

## Who This Is For

- **Crypto engineers** → wire format, cross-validation, side-channel mitigations
- **Security researchers** → TLA+ model, Path C-2 hybrid design, failure modes
- **FPGA developers** → NTT pipeline, BRAM layout, behavioral model
- **Students & learners** → architecture docs cover every layer, browser to silicon

---

## The Numbers

| Metric |  |
|:---|:---|
| ML-KEM-768 Native keygen | 103 µs |
| ML-KEM cross-validation | 20,000/20,000 (noble + liboqs) |
| NTT Barrett reduction speedup | 14× |
| SM2 software TVLA | 36/36 PASS (N=10,000) |
| TLA+ verified states | 101,467 |
| TSR evidence records | 100 |
| CI badges | ✅ all green |
| Project score | 9.3/10 |

---

## Deep-Dive Series (coming weekly after launch)

| Week | Topic |
|:---|:---|
| 1 | **Double Ratchet PQ** — ML-KEM + P-256 hybrid handshake design |
| 2 | **FPGA NTT Pipeline** — from behavioral model to UART debug |
| 3 | **SM2 Repair Log** — _fastModP dead loop, wNAF timing leak, 0.2% edge case |
| 4 | **TSR Evidence Chain** — 100 RFC 3161 timestamps, why they matter |
| 5 | **TLA+ Path C-2** — formal verification of hybrid key exchange |

---

## How to Contribute

Solo project opening up. Here's how:

1. **First issues** → [good-first-issues.md](docs/good-first-issues.md)
2. **Cross-platform testing** → Windows/macOS/Firefox/Safari matrix incomplete
3. **Security review** → found a bug? [VULNERABILITIES.md](docs/VULNERABILITIES.md)
4. **Hardware** → got a ChipWhisperer? FPGA needs physical TVLA

---

*"The post-quantum transition is not about swapping algorithms. It's about proving the chain holds."*

— FIBEMATE, v3.3, 2026-08-31
