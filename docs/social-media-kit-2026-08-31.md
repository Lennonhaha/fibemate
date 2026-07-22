# 8.31 Social Media & Community Posts

> 发布日: 2026-08-31 | 基于 `docs/launch-announcement-2026-08-31.md` 浓缩

---

## Twitter/X (280 chars version)

```
FIBEMATE v3.3.0 is now open source.

Full-stack post-quantum cryptography:
- ML-KEM-768 (FIPS 203) NTT-domain
- noble + liboqs cross-verified 20K/20K
- FPGA NTT accelerators + TLA+ formal proofs
- 95 RFC 3161 timestamped artifacts

github.com/Lennonhaha/fibemate
```

---

## Twitter/X (thread version · 4 posts)

**Post 1/4:**
```
FIBEMATE v3.3.0 is now open source.

Two years. One engineer. Full stack.

ML-KEM-768 · SLH-DSA · SM2/SM3/SM4
Browser → Node.js → FPGA
KAT 10K/10K · noble 10K · liboqs 10K
TLA+ 101,467 states · 95 TSRs

github.com/Lennonhaha/fibemate
```

**Post 2/4:**
```
What does it actually take to ship PQC end-to-end?

Not just swap algorithms. Engineer the whole stack:
- NTT-domain ML-KEM (FIPS 203 §4.3)
- Barrett reduction (14× faster, constant-time)
- SM2 k-masking against SPA
- IANA #4590 hybrid KEX

Every claim. Every test. Timestamped.
```

**Post 3/4:**
```
The honest part:

❌ Not a product — engineering demo
❌ No third-party audit (yet)
❌ Default-off research modules have NO security guarantees
❌ Pure JS has timing limitations

Full disclosure: security-limitations.md + risk-rectification.md

If you ship crypto, ship the caveats too.
```

**Post 4/4:**
```
What's next:
→ Aug 31 · v3.3.0 tag + release
→ Q4 2026 · Physical TVLA (ChipWhisperer)
→ 2027 · Constant-time C/Rust rewrite

Solo project → open source. Join us.

github.com/Lennonhaha/fibemate
#PostQuantum #Cryptography #PQC #OpenSource
```

---

## 国内技术社区 (知乎/掘金/V2EX)

**标题:** FIBEMATE v3.3.0 正式开源 — 后量子密码全栈工程平台

**摘要:**
- 两年独立开发，覆盖 ML-KEM-768、SM2/SM3/SM4 国密套件、FPGA NTT 加速器、TLA+ 形式化验证
- 95 份 RFC 3161 时间戳存证，20,000 轮交叉验证（noble + liboqs）
- 诚实声明：工程演示平台，非商用安全产品；实验模块默认关闭，无安全保证
- GPLv3 开源，欢迎贡献

**链接:** https://github.com/Lennonhaha/fibemate

---

## Hacker News (Show HN)

**Title:** Show HN: FIBEMATE — Full-stack post-quantum crypto, browser to FPGA

**First comment:**
Solo project over two years. The idea: can one person build and verify the full PQC stack end-to-end?

- ML-KEM-768 in pure JS (FIPS 203 NTT domain), cross-verified against noble and liboqs (20K/20K rounds)
- FPGA NTT accelerator on Artix-7 (256×256 roundtrip, 43/43 behavioral model)
- TLA+ formal verification of the hybrid handshake (7 invariants, 101K states)
- 95 RFC 3161 timestamped artifacts — every KAT, every cross-validation, every release

Honest about limitations: no third-party audit, experimental modules default-off, pure JS timing caveats. Full disclosure in the repo.

Not looking for customers — looking for collaborators, reviewers, and people who care about verifiable crypto engineering.
