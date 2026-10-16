# FIPS 203 ML-KEM-768 — FIBEMATE 实现声明

**版本**: v1.0  
**日期**: 2026-05-19 ｜ **修订**: 2026-10-16（更正 KAT 来源措辞）  
**状态**: 🟡 仓内可复现：自产确定性向量 + 逐向量门禁 + 与 `@noble/post-quantum` 交叉互操作（2026-10-16 修正重生成）。**NIST 官方向量未入库、不在 CI** ⇒「已通过 NIST 中间值 KAT」在**仓内不可复现**（见下方「仓内测试来源」）。

---

## 实现概述

FIBEMATE 集成了 **FIPS 203 ML-KEM-768** 作为后量子密钥交换的核心算法。该实现派生自 `pq-crystals/kyber-768`（Kyber Round 3），并已完成从 Kyber Round 3 到 FIPS 203 标准的正式对齐。

**ML-KEM-768** 是 NIST 于 2024 年 8 月 13 日正式发布的第一个后量子密码学标准之一，安全等级为 Category 3（等效 AES-192）。

## 验证状态

| 检查（仓内可复现，2026-10-16） | 结果 |
|----------|----------|
| KAT 逐向量结构（FIPS 203 §7.1：`dkPKE@0 / ek@1152 / H(ek)@2336 / z@2368`） | ✅ 100/100 |
| KAT `decapsulate(dk, c) == k` 逐向量 | ✅ 100/100 |
| 独立公式 `k = SHA3-512(m ‖ SHA3-256(ek))[:32]` | ✅ 100/100 |
| 与 `@noble/post-quantum@0.7.1` 双向互操作（只比 final `K`） | ✅ 200/200 |
| KeyGen 定值：同 `(d,z)` 下 `ek` 逐字节一致 | ✅ |
| native(C) / JS / noble 三方 `sk` 逐字节一致 | ✅（2026-10-16 修复 native `kem.c` 布局后实测） |

**仓内测试来源**: `packages/pqc-kem/test/kat/mlkem-768-KAT.rsp` —— **本仓自产**的确定性向量（生成器 `packages/pqc-kem/scripts/generate-nist-kat.js`；2026-10-16 重生成，两次再生逐字节相同），由 `scripts/ci-mlkem-kat.cjs` 逐向量校验（500 断言）。

**关于 NIST 官方向量（重要更正）**: 本仓**不含** NIST `PQC Intermediate Values` 的 `.txt` 向量文件（全仓 + 全历史检索 0 命中）。历史上确实用过该目录，但它在**服务器**上（`/opt/fibemate-full/public/test-vectors/intermediate-2023/PQC Intermediate Values/`，见 `docs/mlkem1024-kat-verified.md`），**未随仓入库 ⇒ 在仓内不可复现**。仓内另有 ACVP 官方向量脚本（`packages/pqc-kem/test/acvp-kat.test.cjs`、`acvp-encapDecap.test.cjs`），但向量需外部落到 `%TEMP%\acvp\...`，且**不在 CI**（`.github/workflows/native-build.yml:75` 留有 `if: false  # TODO: replace with ACVP-based KAT for C addon`）。

## 算法参数

| 参数 | 值 |
|------|-----|
| 安全等级 | Category 3 (AES-192 等效) |
| 多项式环 | Z_q[X]/(X^256 + 1), q = 3329 |
| 维度 k | 3 |
| 公钥大小 | 1184 字节 |
| 私钥大小 | 2400 字节 |
| 密文大小 | 1088 字节 |
| 共享密钥 | 32 字节 |

## 技术细节

- **NTT**: 优化的数论变换，使用 Montgomery 约简
- **CBD 采样**: 中心二项分布 (η₁=2, η₂=2)
- **哈希**: FIPS 202 SHAKE-128/SHA3-512
- **领域分隔**: `G(d)` (32B) 而非 Kyber R3 的 `G(d || 0x03)` (33B)
- **polyvec 压缩**: 4 系数/块 → 5 字节 (10 bits/coefficient)，符合 FIPS 203 位布局

## 对齐日志

详见 [`docs/kyber-to-fips203.md`](./kyber-to-fips203.md)。

---

**免责声明**: 本实现已通过**仓内自产确定性 KAT**、逐向量门禁、独立公式校验，以及与 `@noble/post-quantum` 的**跨实现互操作**验证；**尚未**在仓内与 NIST 官方中间值 / ACVP 向量比对（官方向量未入库），亦未经第三方安全审计。生产部署前建议先完成官方向量比对、形式化验证与安全审计。