# FIPS 203 ML-KEM-768 — FIBEMATE 实现声明

**版本**: v1.0  
**日期**: 2026-05-19  
**状态**: ✅ 通过 NIST 中间值 KAT 验证

---

## 实现概述

FIBEMATE 集成了 **FIPS 203 ML-KEM-768** 作为后量子密钥交换的核心算法。该实现派生自 `pq-crystals/kyber-768`（Kyber Round 3），并已完成从 Kyber Round 3 到 FIPS 203 标准的正式对齐。

**ML-KEM-768** 是 NIST 于 2024 年 8 月 13 日正式发布的第一个后量子密码学标准之一，安全等级为 Category 3（等效 AES-192）。

## 验证状态

| 测试向量 | 验证结果 |
|----------|----------|
| Key Generation | ✅ ek (1184 字节) 完全匹配 |
| Encapsulation | ✅ 共享密钥 K (32 字节) 完全匹配 |
| Decapsulation | ✅ 解密 K 完全匹配 |
| KEM 闭环 | ✅ 加密-解密往返通过 |

**测试来源**: NIST PQC Intermediate Values KAT（`Key Generation -- ML-KEM-768.txt`, `Encapsulation -- ML-KEM-768.txt`, `Decapsulation -- ML-KEM-768.txt`），2023 年 10 月发布。

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

**免责声明**: 本实现已通过 NIST 中间值 KAT 验证，但尚未经过第三方安全审计。生产部署前建议完成完整的形式化验证和安全审计。