# VWZ 编码理论移植：可行性分析

**版本**: v1.0-draft | **日期**: 2026-08-12 | **状态**: 8/31 前设计阶段  
**分支**: `experimental/vwz-lg` | **方向**: 数学移植（双线 B）

---

## 0. 动机

VWZ 的紧凑结构（稀疏 Vandermonde 矩阵 + 二次型）不是格密码特有的。格密码中 Vandermonde 矩阵出现是因为 NTT（数论变换）的自然结构，但代数编码理论中同样存在大量基于特定矩阵结构的方案。

**核心问题**：VWZ 的紧凑骨架（短签名、稀疏公钥、Vandermonde 嵌入）能否移植到编码理论框架下，使得安全性基于**已被更广泛认可的困难问题**（如 Syndrome Decoding）？

---

## 1. 编码理论困难问题速览

| 问题 | 描述 | 信任等级 | 最短签名 |
|------|------|:---:|------|
| **Syndrome Decoding (SD)** | 给定 H, s, 找 e 满足 He^T = s (|e|≤w) | **高** (CFS/Courtois-Finiasz-Sendrier 2001) | ~200B? (CFS) |
| **Rank Syndrome Decoding (RSD)** | SD 在秩度量下的变体 | **高** (RQC/Rollot) | ~4KB |
| **Goppa 码区分** | 区分随机矩阵与 Goppa 码校验矩阵 | **高** (McEliece, NIST) | ~100KB+ (Classic McEliece) |
| **QC-MDPC** | 准循环 MDPC 码的 SD 问题 | **中高** (BIKE, NIST 候选) | ~3KB |

---

## 2. VWZ → 编码理论映射

### 2.1 结构对照

| VWZ (当前) | 编码理论类比 |
|------------|------------|
| Vandermonde 矩阵 V | **校验矩阵 H** 的某个结构化子矩阵 |
| 签名向量 (w₂, w₃) | **错误向量 e**，具有稀疏性/低重量 |
| 验证方程 V·r ≡ pk + c·P | **Syndrome 方程** H·e^T = s |
| 稀疏性 (rank-1 压缩) | **低重量约束** (e 的 Hamming 重量 ≤ w) |
| 二次型展开 (vandermonde 幂) | **Goppa 码的多项式求值** 结构 |

### 2.2 关键相似性

**Vandermonde 矩阵 = Goppa 码的"求值矩阵"**

Goppa 码定义：给定 Goppa 多项式 g(x) 和支持集 L = {α₁, ..., α_n}，校验矩阵 H 的元素为：

H[i][j] = α_j^i / g(α_j)

当 g(x) = 1（最简单的 Goppa 码）时，H 退化为**纯 Vandermonde 矩阵**：

H[i][j] = α_j^i

这与 VWZ 的 Vandermonde 矩阵 V[i][j] = λ_i^j 在代数结构上**完全一致**。

> **核心洞察**：VWZ 的 Vandermonde 矩阵就是 Goppa 码校验矩阵的最简形式。如果 V 被编码理论社区认可为 Goppa 码的特例，则 VMQ-SPARSE 的安全性可以从"自研假设"变为"Goppa 码特例上的变体 SD 问题"。

### 2.3 (U, U+V) 码框架

(U, U+V) 构造：给定两个线性码 C₁, C₂，构造新码：

C = { (u, u+v) : u ∈ C₁, v ∈ C₂ }

在 VWZ 的上下文中：
- U = Vandermonde 子空间（前 N 维中的活跃部分）
- V = 偏移向量（sparse offset）
- 签名 = U 部分 + V 部分的组合

与 VWZ 的 (w₂, w₃) 结构的对应关系：
```
w₂ → U 分量（活跃 48 维）
w₃ → V 分量（sparse offset）
签名 = (w₂, w₃) → (U, U+V) 码字
```

### 2.4 移植路径

| 步骤 | 内容 | 难度 |
|:---:|------|:---:|
| 1 | 将 VWZ 验证方程重写为 Syndrome Decoding 形式 | 低 |
| 2 | 证明 VMQ-SPARSE ≥ 某编码理论难题（如某类 Goppa 码的 SD） | 中 |
| 3 | 如果归约成功 → VWZ 的安全性继承自编码理论 | 中 |
| 4 | 如果归约不成功 → 至少定位"为什么 VWZ 不同于编码理论" | 低 |
| 5 | 分析 CFS 签名的代数结构攻击是否适用于 VWZ | 中 |

---

## 3. CFS 签名对比

**CFS 签名** (Courtois-Finiasz-Sendrier, 2001) 是最经典的基于编码理论的签名方案。

| 维度 | CFS | VWZ |
|------|-----|-----|
| 困难问题 | Syndrome Decoding | VMQ-SPARSE |
| 校验矩阵 | Goppa 码 (结构化) | Vandermonde (结构化) |
| 稀疏性 | 错误向量重量 ≤ w | rank-1 压缩 |
| 签名尺寸 | ~200B (理论) / ~20KB (实际) | 36-132B |
| 密钥尺寸 | ~100KB+ (McEliece 公钥) | 468B-6.3KB |
| 代数攻击 | 结构攻击 (Faugère et al.) | 未评估 |
| 签名速度 | 极慢 (counter-based) | 快 (~10μs FPGA) |

> **VWZ 的显著优势**：签名尺寸 (~36B) vs CFS (~200B+)，密钥尺寸 (~468B) vs McEliece (~100KB+)。**如果 VMQ-SPARSE 能归约到 SD，VWZ 将成为已知最紧凑的基于编码理论的签名方案。**

---

## 4. 主要障碍

### 4.1 Goppa 码 =/= 纯 Vandermonde

真正的 Goppa 码校验矩阵元素为 α_j^i / g(α_j)，分母 g(α_j) 引入了额外的代数结构。纯 Vandermonde（g=1）在实际 Goppa 码中从不使用——因为 g=1 的码纠错能力退化。

**这意味着**：VMQ-SPARSE 归约到"Goppa 码的 SD"是不精确的——VWZ 用的是 Goppa 码的退化形式。

### 4.2 CFS 的代数攻击教训

CFS 方案因代数结构攻击而实际参数远大于理论最优：
- Faugère et al. (2010): 利用 Goppa 码的代数结构加速区分攻击
- 高码率 Goppa 码的 SD 实例比随机码的 SD 弱得多

**对 VWZ 的启示**：Vandermonde 矩阵的结构化程度比 Goppa 码更高（g=1），代数攻击面可能更大。

### 4.3 编码理论社区对新假设的态度

| 方案 | 假设 | 社区接受度 |
|------|------|:---:|
| Classic McEliece | Goppa 码不可区分 (40年) | 极高 |
| BIKE | QC-MDPC SD | 高 |
| HQC | QC 码 SD | 高 |
| CFS | 高码率 Goppa 码 SD | 中等（因代数攻击） |
| **VWZ → code-based** | **Vandermonde-结构 SD** | **待验证** |

---

## 5. 推荐路径

### 5.1 低风险路径：仅作为"问题对比研究"

| 步骤 | 产出 |
|:---:|------|
| 1 | 论文/技术报告形式发表 "VMQ-SPARSE and Syndrome Decoding: A Structural Comparison" |
| 2 | 在 SageMath 中实现 VWZ 的 SD 编码，实验比较 |
| 3 | 不做"安全性继承"声明，仅做"问题结构相似性分析" |

**收益**：建立 VWZ 与编码理论社区的桥梁，获得审查；**不承担**"我们已经把 VMQ-SPARSE 归约到 SD"的过度声明。

### 5.2 中风险路径：尝试归约证明（学术合作）

| 步骤 | 产出 |
|:---:|------|
| 1 | 与编码理论领域学者合作 |
| 2 | 形式化分析 VWZ 验证方程与 SD 问题的关系 |
| 3 | 如果归约成功 → 发表 ePrint；如果失败 → 发表"为什么 VMQ-SPARSE ≠ SD" |

### 5.3 不做：直接移植到编码理论

| 原因 | 说明 |
|------|------|
| 本质不同 | VWZ 用的是 Vandermonde 矩阵乘以向量的二次型展开，编码理论 SD 用的是线性校验矩阵 |
| 归约缺口 | 目前没有证据表明 VMQ-SPARSE 等价于/归约到任何已知的编码理论难题 |
| 过度承诺 | "基于编码理论的 VWZ"会给出错误的安全预期 |

---

## 6. 最小可行产品

**8/31 前交付**：

| 产出 | 内容 |
|------|------|
| 本文档 v1.0 | 可行性分析 (✅ 进行中) |
| `docs/vwz-vs-coding-theory.md` | VMQ-SPARSE 与 SD 问题的形式化结构对比 |
| SageMath 脚本 | k=4 小规模 VWZ 实例的 SD 编码与求解实验 |

**8/31 后**：

| 时间 | 产出 |
|------|------|
| 2026-09 | ePrint 草稿: "On the Relationship Between Vandermonde-SIS and Syndrome Decoding" |
| 2026-10 | 学术合作 outreach |
| 2026-11 | 基于实验结果的修订版 |

---

## 7. 参考文献

- McEliece (1978) "A Public-Key Cryptosystem Based on Algebraic Coding Theory"
- CFS (2001) "How to Achieve a McEliece-Based Digital Signature Scheme"
- Faugère et al. (2010) "Algebraic Cryptanalysis of McEliece Variants with Compact Keys"
- BIKE (2022) NIST PQC Round 4 submission
- Classic McEliece (2022) NIST PQC Round 4 submission
- [VWZ 安全分析] `docs/vwz-security-analysis-framework.md` (v2.0)
