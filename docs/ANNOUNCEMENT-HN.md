# FIBEMATE — Hacker News Show HN 公告草稿
**版本：** v0.1 (2026-08-05)
**状态：** 草稿，待 8/30 微调后发布
**发布日：** 2026-08-31 08:00 PDT

---

## Show HN: FIBEMATE — Full-Stack Post-Quantum Cryptography Engineering Validation

Post-quantum cryptography migration is happening, but the gap between NIST standards and working code remains wide. Most resources explain PQC in theory. FIBEMATE tries to show it in practice.

**FIBEMATE** is a post-quantum cryptography engineering validation platform. Not a production library — a transparent engineering record.

### What's inside

- **ML-KEM-768** (FIPS 203): Complete NTT-domain implementation with KAT vectors and constant-time verification
- **ML-DSA-65** (FIPS 204): Reference implementation aligned with @noble/post-quantum
- **SLH-DSA-128s** (FIPS 205): Stateless hash-based signatures
- **SM2/SM3/SM4** (GB/T): Chinese national elliptic curve + hash + block cipher suite
- **FPGA NTT**: Working Verilog RTL targeting Artix-7, with BRAM simulation
- **TLS 1.3 Hybrid KEM**: X25519 + ML-KEM768 hybrid handshake (Path C-2, application-layer, active)
- **Double Ratchet PQ**: Post-quantum augmented Signal Protocol with formal TLA+ models

### 25+ interactive visualizations

Every algorithm has a live visualization: 3D key-generation flows, LWE attack terrain maps, TVLA side-channel test dashboards, TLS handshake sequence diagrams, lattice security comparisons, FPGA heatmaps, and more. All running at fibemate.net.

### 130+ time-stamped evidence records (TSR)

Every claim is backed by a runnable test + DigiCert/FreeTSA timestamped evidence. The full chain is publicly auditable at fibemate.net/docs/tsa/.

### Honest about limitations

This is an engineering record, not a product:
- ML-KEM-768 is implemented in pure JS — educational performance, not production-grade
- SM2 verification side-channel: TVLA PASS on masked implementations, but pure-JS verify is not constant-time
- LookingGlass v2.2: wreath-product recursive obfuscation engine (experimental, default off)
- Full hardware TVLA testing pending physical equipment (ChipWhisperer)

All of this is documented. No marketing gloss.

### Project facts

- **License:** GPL-3.0-only
- **Repository:** github.com/Lennonhaha/fibemate
- **Website:** fibemate.net
- **Security:** SECURITY.md + Dependabot + Private vulnerability reporting enabled
- **Release:** v3.3.0 with full evidence chain

Built as a one-person engineering project. No VC, no corporate backing. The goal was to understand PQC by building it end-to-end — from math to working code to FPGA bitstream to web visualization.

Questions, feedback, and collaboration welcome.

---

## 草稿笔记

**标题备选：**
- "Show HN: FIBEMATE — Full-Stack PQC Engineering Validation (ML-KEM + 国密 + FPGA + Formal Verification)"
- "Show HN: I built a complete post-quantum crypto platform from math to FPGA hardware"
- "Show HN: FIBEMATE — 26 interactive visualizations of post-quantum cryptography algorithms"

**发布时机：** 8/31 08:00-10:00 PDT（约北京时间 23:00-01:00+1）
**HN 评分预测：** 100-300 分（技术受众，质量导向，诚实叙事有差异化）
