# FIBEMATE v3.3-preview — Open Source Launch Announcement

> Draft · 2026-07-22 · Release date: 2026-08-31
> Status: DRAFT — for review and refinement over the next 40 days

---

## Opening (GitHub Discussions — pinned post)

**FIBEMATE v3.3-preview is now open source.**

Two years of solo engineering. One question: *What does it actually take to ship post-quantum cryptography end-to-end?*

Not just swap algorithms. **Engineer the entire stack** — browser to FPGA, KAT vectors to formal verification, national standards to IANA registrations.

FIBEMATE is the answer. It's not a product. It's an engineering proof that the full chain works.

---

## What This Is

A **post-quantum cryptography full-stack engineering platform** covering three tracks:

| Track | What's in it | Status |
|:---|:---|:---|
| **Standard PQC** | ML-KEM-768 (FIPS 203) + SLH-DSA (FIPS 205) — NTT domain, WASM, TLS 1.3 Hybrid KEX | ✅ Production Ready |
| **National Crypto Hybrid** | SM2/SM3/SM4 + ML-KEM — IANA #4590 application-layer verification | ✅ Dual-Track Live |
| **Hardware (FPGA)** | NTT accelerator on Artix-7 35T — 256×256 roundtrip, behavioral model 43/43 PASS | ✅ Simulation Verified |

Plus experimental research (default-off, no security guarantees): VWZ tensor signatures, LookingGlass v2 algebraic obfuscation.

---

## Why This Exists

The post-quantum migration isn't a paper problem. It's an **engineering problem**. The standards exist (FIPS 203, FIPS 205). The libraries exist (liboqs, noble). But stitching them together — from browser WebCrypto to FPGA BRAM, from SM2 legacy systems to ML-KEM hybrids, from unit tests to TLA+ formal models — that's where the real work lives.

FIBEMATE answers: *Can one person build the entire stack, verify every layer, and timestamp the evidence?*

Spoiler: yes. With caveats.

---

## What's Been Verified

### Cryptographic Correctness

- **ML-KEM-768**: FIPS 203 NTT domain · noble cross-validation 10,000/10,000 ✅ · liboqs cross-validation 10,000/10,000 ✅
- **SM2**: GB/T 32918 compliant · k-masking against SPA · software TVLA N=10,000 36/36 PASS
- **SM3/SM4**: KAT vectors · constant-time S-box · αGCM mode
- **Hybrid KEX**: SM2 + ML-KEM-768 · IANA #4590 · Path C-2 5/5 E2E PASS

### Protocol Security

- **TLA+ formal verification**: Path C-2 hybrid handshake · 7 invariants · 101,467 states · TLC EXIT 0
- **K3 strong key independence**: ∀ sessions sᵢ ≠ sⱼ: keyᵢ ≠ keyⱼ (formal proof)

### Side-Channel Mitigations

- Barrett reduction (constant-time, 14× faster than BigInt)
- SM2 scalar masking (k' = k + r·N, 64-bit random r)
- Decaps failure handled via bitwise mask (no early return)

### Reproducibility

- **95 RFC 3161 timestamped artifacts** (lg-001~lg-095) — DigiCert + FreeTSA dual authority
- Every KAT, every cross-validation, every release milestone has a TSR in the repo
- Audit package: 258KB, 234 files, SHA256 inventory

---

## What's NOT Claimed

Be honest or don't ship:

- ❌ **Not a security product** — engineering demonstration platform
- ❌ **No third-party audit** — self-tested, cross-validated, but not externally reviewed
- ❌ **No novel cryptography** — VWZ/LookingGlass are default-off research, no security guarantees
- ❌ **No hardware security** — FPGA has no secure element, physical TVLA pending (Q4 2026)
- ❌ **No formal ML-KEM proof** — TLA+ covers the handshake protocol, not the lattice math

Full disclosure: [security-limitations.md](docs/security-limitations.md) · [risk-rectification.md](docs/risk-rectification.md)

---

## Quick Start

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm ci
node -e "
  const { generateKeypair, encapsulate, decapsulate } = require('./packages/pqc-kem');
  const kp = generateKeypair();
  const enc = encapsulate(kp.publicKey);
  const ss = decapsulate(kp.secretKey, enc.ciphertext);
  console.log('KEM roundtrip:', Buffer.compare(ss, enc.sharedSecret) === 0 ? 'PASS' : 'FAIL');
"
```

Live demo: [fibemate.net/demo](https://fibemate.net/demo/)

---

## Who This Is For

- **Crypto engineers** implementing PQC in production — see the wire format, cross-validation approach, and side-channel mitigations
- **Security researchers** exploring hybrid KEX architectures — see the TLA+ model, Path C-2 design, and what breaks
- **FPGA developers** working on lattice hardware — see the NTT pipeline, BRAM layout, and behavioral model
- **Students & learners** — the architecture docs walk through every layer from browser to silicon

---

## The Numbers

| Metric | Value |
|:---|:---|
| ML-KEM-768 KEM/s (pure JS, 2 vCPU) | 107/s |
| ML-KEM KAT verification | 10,000/10,000 |
| Cross-validation (noble + liboqs) | 20,000/20,000 |
| FPGA NTT roundtrip | 256/256 |
| TLA+ states verified | 101,467 |
| TSR evidence records | 95 |
| Test coverage (crypto core) | 93.91% |
| SPICE — didn't drink any | ✅ |

---

## What's Next (Roadmap)

| Deadline | Item |
|:---|:---|
| **2026-08-20** | Compile-time isolation of experimental modules (Feature Flag) |
| **2026-08-20** | Deprecated TLS Path A cleanup |
| **2026-08-25** | ML-KEM cross-validation CI gate finalized |
| **2026-08-31** | **Open source launch** — tag v3.3.0, GitHub Release |
| **Q4 2026** | Physical TVLA (ChipWhisperer) · Bus Factor ≥ 2 |
| **2027** | Constant-time C/Rust rewrite · HSM integration |

---

## How to Contribute

This is a solo project opening up. Here's how to help:

1. **First issues**: Check [good-first-issues.md](docs/good-first-issues.md)
2. **Cross-platform testing**: Windows/macOS/Firefox/Safari — the matrix is incomplete
3. **Security review**: Found a bug? → [VULNERABILITIES.md](docs/VULNERABILITIES.md)
4. **Documentation**: Translations, tutorials, architecture deep-dives
5. **Hardware**: Got a ChipWhisperer? The FPGA needs physical TVLA

---

## FAQ (Anticipated)

**Q: Is this production-ready?**
A: No. It's an engineering demonstration with verified components. Use for research, education, and as a reference — not for protecting real secrets. See our [security limitations](docs/security-limitations.md).

**Q: Why pure JavaScript for crypto?**
A: It's the universal runtime — browser, Node.js, edge. JS isn't ideal for constant-time code, but cross-validation against liboqs (C) and noble covers arithmetic correctness. Barrett reduction mitigates the worst timing leaks.

**Q: What's with the timestamps?**
A: Every milestone in this project is RFC 3161 timestamped — 95 artifacts from the first `ml-kem-768.js` to the latest audit package. Crypto claims without evidence are just stories. TSRs are our evidence.

**Q: VWZ / LookingGlass — should I use them?**
A: **No.** They're default-off research. LookingGlass is an algebraic obfuscation experiment. VWZ is a novel tensor signature with no security reduction to standard assumptions. Read the code, learn from the design, don't encrypt anything with them.

**Q: Solo project? Really?**
A: Really. Two years, one person, three tracks. The [MEMORY.md](MEMORY.md) has the full development log. Open source means this stops being a solo project.

---

## Links

| Resource | URL |
|:---|:---|
| **Repository** | https://github.com/Lennonhaha/fibemate |
| **Live Site** | https://fibemate.net |
| **Demo** | https://fibemate.net/demo/ |
| **PQC Readiness** | https://fibemate.net/docs/pqc-readiness.html |
| **ePrint (VWZ)** | https://eprint.iacr.org/2026/110618 |
| **OpenSSF Best Practices** | https://www.bestpractices.dev/projects/13695 |

---

*"The post-quantum transition is not about swapping algorithms. It's about proving the chain holds."*

— FIBEMATE, v3.3-preview, August 2026
