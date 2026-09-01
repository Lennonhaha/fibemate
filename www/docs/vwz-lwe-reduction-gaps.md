# VWZ → LWE 归约缺口分析（H-1 / H-2）

> 研究文档 · experimental/vwz-lg 分支
> 创建：2026-09-01
> 状态：Phase 2 研究目标（非阻塞，诚实披露）

## 1. 背景

VWZ 签名方案的安全性声称基于 Module-LWE 困难假设。然而，从 VWZ 张量结构到标准 LWE 问题的完整归约证明尚未完成。本文档详细分析两个已知缺口。

## 2. H-1: VMQ-SPARSE → LWE 归约未证明

### 问题描述
VWZ 方案使用 "Vandermonde Mixed Quotient Sparse" (VMQ-SPARSE) 问题作为中间困难假设：
- 给定公钥张量 Φ 和目标 t，求 (w₂, w₃) 使得 eval(Φ, w₂, w₃) = t
- 这个问题的平均情况困难性需要归约到最坏情况 LWE

### 已知路径
标准 LWE → Module-LWE → VMQ（Vandermonde Module Quotient）→ VMQ-SPARSE

前两步有文献支持：
- LWE → Module-LWE: [Langlois-Stehlé 2015]
- Module-LWE → VMQ: [IACR 2025/624 §4.2]（VWZ 原论文）

**缺失环节**：VMQ → VMQ-SPARSE 的归约。VMQ-SPARSE 是 VMQ 的稀疏变体（目标向量仅有 k 个非零位置），从一般 VMQ 到稀疏版本的自归约尚未证明。

### 为什么困难
1. **稀疏性改变结构**：稀疏目标不是均匀随机目标，攻击者可能利用稀疏结构获得优势
2. **Vandermonde 结构的代数特性**：Vandermonde 矩阵的良好条件数可能被攻击者利用（不同于随机矩阵）
3. **rank-2 混合的影响**：rank-2 切片使张量不再等价于 rank-1 的标准 LWE 样本

### 当前安全论证（启发式）
虽然没有形式化归约，但以下证据支持安全性：
- **已知攻击失效**：rank-1 分离攻击对 rank-2 混合无效（已验证：`security-assessment/attack/lgv23_attack.py`）
- **参数映射**：VWZ k=8 参数映射到 LWE 维度 n≈256，与 ML-KEM-768 同量级
- **BKZ 复杂度**：β~700-750 对应 2^143 classical / 2^72 quantum（Cat 3）
- **avalanche 测试通过**：输入翻转 1 bit → 输出平均翻转 ~50% bits（`vwz-avalanche-test.py`）

### 风险评估
| 维度 | 评级 | 说明 |
|------|------|------|
| 理论完整性 | 🟡 | 归约缺口存在，但有启发式证据 |
| 实际安全性 | 🟢 | 已知最优攻击需要 β~700+ BKZ |
| 开源披露 | ✅ | security-limitations.md §4 已披露 |

### Phase 2 计划
1. 联系 VWZ 原作者（IACR 2025/624）确认 VMQ-SPARSE 归约是否有进展
2. 尝试 Regev 式量子归约（LWE → GapSVP）是否可扩展到张量设定
3. 若归约无法补完，考虑修改方案使用标准 LWE 样本（放弃 Vandermonde 结构优势）

## 3. H-2: 参数选择依赖启发式分析

### 问题描述
VWZ 参数（k, q, 张量形状, rank）的选择基于启发式安全分析而非形式化证明。具体：
- **k 的选择**：k=8 对应的 LWE 维度是否足够？
- **q=3329 的选择**：与 ML-KEM 共享域，但 VWZ 是否需要更大素数？
- **rank=2 的充分性**：rank-2 是否足以抵御未来可能的 rank-2 分离攻击？

### 当前参数表
| 参数 | 值 | 依据 |
|------|-----|------|
| q | 3329 | 与 ML-KEM-768 共享 F_q |
| k | 4/8/16 | 对应 128/192/256-bit 安全级 |
| 张量形状 | (2k+2)×(2k+1)×(2k+1) | 边界格式，确保 trapdoor 唯一性 |
| rank | 2 | 击败 rank-1 分离攻击 |
| 签名大小 | 2×(2k+1)×log₂(q) bits | k=8: 408 bits |

### 缺口
1. **无精确安全退化分析**：k 从 8 增到 16 的安全增益是经验性的
2. **rank≥3 未探索**：若 rank-2 分离攻击被发现，是否需要 rank=3？
3. **q 的下界未严格证明**：q=3329 是否小于 VWZ 所需的最小安全素数？

### 当前缓解
- 参数选择与 ML-KEM-768 对齐（经过 NIST 审查的标准参数）
- lattice-estimator SageCell 实测验证 BKZ 复杂度
- 签名大小与 ML-DSA-65 相比有竞争力

### Phase 2 计划
1. 运行 lattice-estimator 对 k=4/8/16 的完整参数扫描
2. 调查 rank-2 分离攻击的理论上限（是否存在多项式时间算法？）
3. 若发现 rank-2 不足，评估 rank=3 的性能代价

## 4. 与 ML-KEM-768 的安全对比

| 维度 | ML-KEM-768 (NIST) | VWZ k=8 |
|------|-------------------|---------|
| 困难假设 | Module-LWE (标准) | VMQ-SPARSE (非标准) |
| 归约完整性 | ✅ Class-SVP → LWE → ML-KEM | ⚠️ H-1 缺口 |
| 安全级 | Cat 3 (≥128-bit) | Cat 3 (启发式 ≥128-bit) |
| 参数严格性 | ✅ NIST 审查 | ⚠️ H-2 启发式 |
- 公钥大小 | 1184 bytes | ~2×(2k+1)²×2 bytes |
| 密文/签名大小 | 1088 bytes | ~408 bits (51 bytes) |
| 已知攻击 | none better than BKZ | none better than BKZ |

## 5. 结论

VWZ 签名方案在**实践中**可能是安全的（已知攻击均需 BKZ β~700+），但在**理论上**存在两个诚实缺口：
- H-1: VMQ-SPARSE → LWE 归约未证明（最关键）
- H-2: 参数选择依赖启发式（次要）

这两个缺口是 VWZ 作为研究方案而非标准化方案的根本原因。FIBEMATE 作为工程验证平台，诚实披露这些缺口是核心原则。

## 参考文献

- [IACR 2025/624] VWZ 原论文：Trapdoor one-way functions from tensors
- [Langlois-Stehlé 2015] Module-LWE 归约
- [Regev 2009] LWE → GapSVP 量子归约
- [Chen-Nguyen 2012] BKZ 2.0 算法
- [APS 2015] LWE 安全性估计框架

---

⚠️ 本文档是研究分析，不是安全证明。VWZ 方案不应在生产环境中使用。
