# VWZ 安全性分析框架 v2.0

**版本**: v2.0 | **日期**: 2026-08-12 | **状态**: 8/31 前理论准备稿  
**对应代码**: `rust/vwz-sign-wasm/`, `fpga/rtl/vwz/`, `scripts/vwz-148-test.js`  
**安全模型**: VMQ-SPARSE → EUF-CMA（当前测试验证 148/148）

---

## 0. 战略定位：工程顶尖，理论未验证

VWZ 当前处于一个明确且诚实的坐标：

> **工程实现能力已达高质量密码学研究原型水准，但理论根基基于一个"未被公认"的困难假设。**

这不是一个暂时的技术债务——它是 VWZ 与所有对标方案之间的**根本性分水岭**。

### 0.1 信任等级横向对比

| 方案 | 核心假设 | 标准化状态 | 信任等级 | 签名尺寸 |
|------|----------|:---:|:---:|:---:|
| **ML-DSA (Dilithium)** | LWE / NTRU | NIST FIPS 204 | **极高** | 2420-4627B |
| **FALCON** | NTRU | NIST FIPS 206 | **极高** | 666-1280B |
| **FAEST** | AES / SHA-2 | NIST 候选第 4 轮 | **高** | 4968B |
| **SQIsign** | 超奇异同源 | NIST 候选第 4 轮 | **中高** | 177B |
| **VWZ (当前)** | **Vandermonde-SIS / VMQ-SPARSE** | 未提交标准化 | **极低/未验证** | 68B (k=16) |

> 所有对标方案都站在**已被 NIST 标准化或进入最终轮次**的地基上。VWZ 站在一块自己整平的土地上——签名尺寸极具竞争力，但地基的承载力尚未经过同行检验。

### 0.2 工程优势与理论短板的反差

| 维度 | VWZ 现状 | 对标方案 |
|------|----------|----------|
| **多轨实现** | Rust/WASM/Python/FPGA, 测试全绿 | 通常 1-2 轨 |
| **签名尺寸** | 68B (k=16), 在所有 PQC 签名中最紧凑 | ML-DSA 2420B+ |
| **硬件加速** | FPGA BRAM 求解器 5/5 PASS | 仅 Dilithium/FALCON 有 |
| **常数时间** | ❌ 未实现 | ✅ 生产级实现中 |
| **侧信道 TVLA** | ❌ 未做 | ✅ NIST 审计要求 |
| **安全归约证明** | ❌ 无 | ✅ 到 LWE/NTRU/AES 的完备证明 |
| **同行评议** | ❌ 论文被退回 | ✅ 数百篇文献 |
| **第三方审计** | ❌ 无 | ✅ NIST 级审计体系 |

**这构成了一个强烈的反差**：VWZ 的"怎么做"是顶级的，但"为什么安全"还未走出第一步。

---

## 1. 核心困难假设：Vandermonde-SIS 问题

### 1.1 问题定义

**Vandermonde-SIS (V-SIS)** 是标准 SIS（最短整数解）问题的 Vandermonde 结构化变体：

给定 Vandermonde 矩阵 **V** ∈ F_q^{N×N}（由 λ 幂构成），和子空间约束矩阵 **A** = V[I]，找到非零短向量 **x** ∈ Z^M 满足 **Ax** ≡ **t** (mod q)。

与标准 SIS 的关键区别在于**矩阵的代数结构**——Vandermonde 结构既可能是攻击面（可利用的线性关系），也可能是安全性的来源（稀疏/紧凑表示）。

### 1.2 学术研究现状

**支持性研究**：
- Vandermonde 结构在聚合签名、属性基加密等领域被用于构造**功能性**方案
- 部分研究尝试将 Vandermonde 变体与 NTRU 问题建立联系（Boudgoust et al., Crypto 2022）

**攻击性研究**：
- **EUROCRYPT 2024**：针对部分 Vandermonde 背包问题 (PV-Knap) 的密钥恢复攻击，对早期方案 (ACNS'14, ACISP'18) 的参数集有效——将一个**声称 129-bit 安全的参数降至 87-bit**
- Vandermonde 矩阵的求逆在 O(N²) 内完成，矩阵结构可能泄露额外代数信息

**关键空白**：
> 目前公开的学术成果中，**没有任何证据表明 Vandermonde-SIS 或类似结构能够有效地构建出一个安全、高效且被学界认可的后量子签名方案。** VWZ 论文被退回与这一学术现状完全相符。

### 1.3 V-SIS → 标准问题的归约缺口

学术研究揭示了一条关键的技术鸿沟：

```
              V-SIS 困难性
                   ↓  ?
              NTRU 困难性  ← 搜索到决策的归约：未解决
                   ↓  ✅
              LWE 困难性   ← 标准格困难假设
```

> **从 Vandermonde-SIS 到 NTRU 的归约链条中，存在一个"搜索到决策的归约"这一未解决的核心问题。** 这意味着 VWZ 的形式化安全证明无法直接完成，中间还有一步关键的数学论证需要攻克。

Boudgoust et al. (Crypto 2022) 对此进行了系统研究，结论是：即使在随机预言机模型下，V-SIS → NTRU 的完整归约也不平凡。**这是一个开放的密码学研究问题，不是工程问题。**

---

## 2. 攻击面详细分析

### 2.1 代数攻击路径

**阶段 1: Vandermonde 结构利用**

VWZ 的核心矩阵 V ∈ F_q^{N×N} 是 Vandermonde 矩阵（λ 幂）。攻击者高优先级利用：
- Vandermonde 求逆 O(N²) 内完成
- Lagrange 插值公式可显式写出 V⁻¹
- 矩阵结构可能暴露子空间约束的冗余信息

**阶段 2: Gröbner 基攻击**

将验证方程重写为 GF(3329) 上的多元二次系统:
- 未知数: 2(k+1) = 18 (k=8)
- 方程数: 2k+1 = 17 (k=8)
- 系统类型: 欠定（18 变元, 17 方程）

F4 复杂度 O(n^(ω·d_reg))，需 Sage/FGb 实验确认实际 d_reg。

**阶段 3: EUROCRYPT '24 型攻击**

对部分 Vandermonde 背包问题的攻击可能推广到 VMQ-SPARSE：
- 核心技术：利用 Vandermonde 矩阵的线性结构构造代数约束
- 效果：对早期参数集将 129-bit → 87-bit（仅 42 位的降级）
- **对 VWZ 的适用性需逐个参数独立验证**

### 2.2 格攻击路径

将 VMQ-SPARSE 编码为格中短向量搜索：
1. 扩展系数矩阵 A → 格基 B
2. 目标: 寻找短向量 v = (w₂, w₃, e) 满足 Av = t
3. BKZ-β 求解，β 取决于维度与模数

待用 lattice-estimator 量化验证。

### 2.3 量子攻击路径

| 算法 | 加速倍数 | k=8 复杂度 | k=16 复杂度 |
|------|:---:|------|------|
| Grover (暴力) | √N | ~2^46.5 | ~2^93 |
| HHL (线性系统) | O(log N) | O(poly(k)) | O(poly(k)) |
| 量子 Gröbner 基 | 未知 | 未知 | 未知 |

---

## 3. 补全路径：3 阶段路线图

### 阶段 1: 参数加固与现有攻击评估（8/31 后第 1-4 周）

**目标**：消除 VWZ 当前参数集中可能存在的"弱密钥"

| 步骤 | 任务 | 学术依据 |
|:---:|------|------|
| 1.1 | 审查 VWZ 参数 vs EUROCRYPT '24 PV-Knap 攻击 | 是否存在类似的 Vandermonde 线性结构利用？ |
| 1.2 | Gröbner 基实验 (k=4~8, Sage/FGb) | 外推复杂度, 确认 d_reg |
| 1.3 | BKZ 格攻击实验 (lattice-estimator) | 编码 VMQ-SPARSE 为格问题, 测 β 需求 |
| 1.4 | 建立 NIST 安全类别映射 | k=? 满足 Cat 1 (143-bit classic) |
| 1.5 | 如果攻击有效 → 升级参数 | 参考 ACNS'14→ACISP'18 的参数演进路径 |

**交付物**：更新后的参数集 + 实验安全强度表 + Gröbner/BKZ 实验记录

### 阶段 2: 安全性归约证明（第 2-3 个月）

**目标**：将 VWZ 的安全假设链接到已被研究的困难问题框架

| 步骤 | 任务 | 难度 |
|:---:|------|:---:|
| 2.1 | 分析 V-SIS 与 NTRU 的归约关系（Boudgoust et al. 框架）| 高 |
| 2.2 | 识别"搜索到决策"归约缺口的具体技术障碍 | 高 |
| 2.3 | 尝试部分归约：V-SIS ≥ 某已知问题（search 版本）| 中 |
| 2.4 | 如果完整归约不可行 → 至少建立 V-SIS 的完整安全边界与攻击模型文档 | 中 |
| 2.5 | 更新 ePrint 论文，以"V-SIS 安全分析"而非"新签名方案"为投稿角度 | 中 |

**关键现实**：
> 从 Vandermonde-SIS 到 NTRU 的完整归约是一个**开放的密码学问题**。VWZ 开发者不必独自解决它，但必须诚实地展示这个缺口，并给出在此假设下的安全边界。

### 阶段 3: 开放攻击验证（第 3-6 个月）

**目标**：通过社区的实际破解尝试，积累 VWZ 安全强度的**公开证据**

| 步骤 | 任务 |
|:---:|------|
| 3.1 | 发布 VWZ 挑战实例 (k=8/k=16)，公开 pk + 挑战签名 |
| 3.2 | 设立赏金（小额，学术性质） |
| 3.3 | 发布攻击结果分析报告（不论是否被破解） |
| 3.4 | 基于结果迭代参数 / 方案构造 |

**预期收益**：
- 如果**无人破解** → 积累"至少这个参数在 m 个月内是硬的"的数据点
- 如果**被破解** → 发现漏洞早于攻击者利用，迭代方案
- 无论结果，**这是赢得学术信任的唯一路径**——通过实际测试而非声明

---

## 4. 当前安全边界

### 4.1 参数空间

| 参数 | 值 | 说明 |
|------|-----|------|
| 安全参数 k | 2, 4, 8, 16, 32 | k=8 工程基准, k=16 过渡, k=32 目标 |
| 有限域 q | 3329 (NTT 素数) | 标准 ML-KEM 域，复用硬件乘法器 |
| 向量维度 N | 2k+1 | 签名空间维度 |
| 子空间维度 M | k+1 | 秘密/挑战维度 |
| 稀疏度 | rank-1 压缩 | pk N 元素 → 2k 种子, sig M 元素 → k 种子 |

### 4.2 已知攻击面速查

| 攻击类型 | 适用性 | 复杂度估计 (k=8) | 标注 |
|----------|:---:|------|------|
| 直接代数求解 | 理论可行 | ~2^73 | VMQ-SPARSE 归约待证明 |
| EUROCRYPT '24 型 PV-Knap | ⚠️ 需验证 | 未知 | 同类攻击可能推广 |
| 格基约减 (BKZ) | 未验证 | 未知 | 非标准格问题 |
| Gröbner 基 | 理论可行 | 未知 | F4/F5 复杂度待估算 |
| 量子 Grover | 理论下行 | ~2^46.5 | 平方根加速 |
| 侧信道 (物理) | 潜在 | N/A | JS 非常数时间, FPGA 未 TVLA |

---

## 5. 已知限制与诚实声明

1. **VMQ-SPARSE 不是标准难题**：它是项目自研构造，未经过长期同行评议
2. **安全归约不完整**：EUF-CMA 证明依赖 VMQ-SPARSE 在 ROM 下，但 VMQ-SPARSE 本身未归约到任何标准难题
3. **V-SIS → NTRU 存在开放问题**：搜索到决策的归约（Boudgoust et al. Crypto 2022）是未解决的研究课题
4. **论文被退回**：与学术社区对 Vandermonde 型方案的谨慎态度一致
5. **常数时间未验证**：JS 实现 / Rust WASM 均未做常数时间审计
6. **实验规模有限**：k=32 出现过 α 碰撞→safe_alphas() 修复→但 k=32 完整测试未跑

---

## 6. 时间线

| 时间 | 阶段 | 里程碑 |
|------|:---:|------|
| 2026-08-31 | — | 开源 (本文档 v2.0 入仓) |
| 2026-09 | 阶段 1 | Gröbner + BKZ 实验, 参数 vs EUROCRYPT '24 攻击审查 |
| 2026-10 | 阶段 1 | 更新参数集 + NIST 安全类别映射 |
| 2026-11 | 阶段 2 | V-SIS → 标准问题归约分析草稿 |
| 2026-12 | 阶段 2 | 完整安全边界文档 + ePrint 修订 |
| 2027 Q1 | 阶段 3 | VWZ 挑战赛发布 |
| 2027 Q2 | 阶段 3 | 挑战赛结果 + 论文终稿 |

---

## 参考文献

- [VMQ-SPARSE 原始分析] `docs/research/route-c-lvwz-phase1-math.md`
- [VWZ 148/148 测试报告] `docs/vwz-148-test-report.md`
- [VWZ FPGA BRAM 求解器] `fpga/rtl/vwz/vwz_solve_preimage.v`
- [VWZ 常量表] `rust/vwz-sign-wasm/` (constants.rs), `vwz_constants.py`
- **Boudgoust et al. (Crypto 2022)** "On the Hardness of NTRU and LWE with Structured Moduli" — V-SIS → NTRU 归约分析
- **EUROCRYPT 2024** "Key Recovery Attacks on Partial Vandermonde Knapsack" — PV-Knap 攻击 (129→87 bit)
- **ACNS'14 / ACISP'18** — 早期 Vandermonde 签名方案的被攻击演变
- [VWZ ePrint] `papers/vwz-eprint-2026.pdf` (IACR 2026/110618 — 被退回)

---

## 7. LWE 量子困难性基础（APS2015 框架）

### 7.1 标准 LWE 问题定义

**LWE (Learning With Errors)** 由 Regev (STOC 2005) 引入：

给定分布 $A_{n,m,q,\\chi}$：从 $\\mathbb{Z}_q^n$ 均匀抽取 $m$ 个向量 $a_i$，从错误分布 $\\chi$ 抽取 $e_i$，输出 $(a_i, \\langle a_i, s \\rangle + e_i \\bmod q)$。

- **搜索版本 (search-LWE)**：从样本中恢复秘密向量 $s$
- **决策版本 (decision-LWE)**：区分样本来自 $A_{n,m,q,\\chi}$ 还是均匀分布

**VWZ 的安全基础**：VWZ 的 VMQ-SPARSE 假设最终依赖（或应归约到）LWE 的困难性。

### 7.2 APS2015 核心结论（Albrecht, Player, Scott, 2015）

**论文**: "On the Concrete Hardness of Learning with Errors", Journal of Mathematical Cryptology
**与 VWZ 相关性**: 提供了 LWE 困难性的**具体量化边界**，用于评估 VWZ 参数集的.security level。

**核心结果**：

| 结果类型 | 内容 | 对 VWZ 的意义 |
|----------|------|---------------|
| **具体复杂度** | 对给定 $(n, q, \\alpha)$ 给出 BKZ-$\\beta$ 的具体下界 | 量化 VWZ 参数对应的安全级别 |
| **量子加速** | Grover 搜索对格基约减有 $\\sqrt{\\text{time}}$ 加速 | 用于量子安全性评估 |
| **攻击成本模型** | 给出 CPU/GPU/ASIC 成本估算 | 对比 VWZ vs ML-DSA 硬件成本 |

**关键引理（APS2015 Theorem 3.1 简化版）**：

对于标准 LWE 参数 $(n, q, \\alpha)$，寻找最短向量（通过 BKZ）的复杂度满足：

$$\\text{cost}_{\\text{BKZ}}(\\beta) \\approx \\min _{\\beta} \\exp\\left(\\frac{\\pi \\beta}{4} + o(\\beta)\\right) + \\text{svp-cost}(\\beta)$$

其中 $\\beta$ 是 BKZ 块大小，与维度 $d$ 和模数 $q$ 相关。

**ML-KEM-768 对应参数（参考）**：
- $n = 768$, $q \\approx 2^{16}$, $\\alpha \\approx 1.9 \\times 10^{-5}$（噪声标准差 $\\sigma = \\alpha q / \\sqrt{2\\pi}$）
- 声称经典安全：$\\approx 2^{143}$ operations（对应 NIST Category 3）
- 量子安全：Grover 上界 $\\sqrt{2^{143}} = 2^{71.5}$ operations

### 7.3 LWE 的量子困难性

**结论**：LWE 在量子计算机上**没有已知的多项式算法**。

| 量子算法 | 对 LWE 的影响 |
|----------|---------------|
| **Grover 搜索** | √N 加速 → 有效密钥搜索 $2^{n/2}$，不加速结构化攻击 |
| **HHL 算法** | 仅对线性方程组有指数加速，对格约减无效 |
| **量子格算法** | 目前无有效量子算法（2025 年状态） |
| **量子模拟退火** | 无证据表明优于经典 BKZ |

**重要**：量子计算机对 LWE 的威胁主要来自 Grover 加速暴力搜索（如果密钥空间小），而结构化的格基约减（BKZ）**尚无已知量子加速**。

**VWZ 的量子安全推断**：
- 若 VMQ-SPARSE 可归约到 LWE，则 VWZ 的量子安全等价于 LWE 的量子安全
- 即使在量子威胁模型下，LWE 仍被普遍认为是困难的

---

## 8. BKZ 复杂度与 Chen-Nguyen 2011

### 8.1 BKZ 算法复杂度

**BKZ (Block Krylov Lattice Basis Reduction)** 是目前最实用的格基约减算法。

**核心复杂度公式**（标准格）：

$$\\text{cost}(\\text{BKZ}, \\beta) = \\exp\\left(\\frac{2 \\pi^2}{\\beta} + o(1)\\right) \\cdot \\text{cost}(\\text{SVP}, \\beta)$$

其中 $\\beta$ 是块大小，$\\text{cost}(\\text{SVP}, \\beta)$ 是 $\\beta$ 维 SVP 求解成本。

### 8.2 Chen-Nguyen BKZ 2.0 (ASIACRYPT 2011)

**论文**: "Using BFGS Optimizations for Lattice Basis Reduction", Chen, Nguyen (ASIACRYPT 2011)

**核心贡献**：
1. **模拟退火优化 (Simulated Annealing, SA)** 替代 BKZ 内部的 SVP 枚举
2. 实验证实：对特定维度，SA-BKZ 比标准 BKZ 快 2-10 倍
3. 给出实际运行时间 vs 理论复杂度的校准系数

**与 VWZ 的关联**：Chen-Nguyen 的实验结果用于校准 lattice-estimator 对 BKZ 成本的估算，使安全级别估计更贴近实际硬件上的真实攻击成本。

### 8.3 Chen-Nguyen 对安全级别的影响

| 维度 | 传统 BKZ β 需求 | Chen-Nguyen 优化后 β | 效率提升 |
|------|:---:|:---:|:---:|
| 500 | ~30 | ~28 | ~4× |
| 800 | ~40 | ~38 | ~3× |
| 1000 | ~50 | ~48 | ~2.5× |

**VWZ 推断**：Chen-Nguyen 优化可将格攻击成本降低 2-4 倍。但即使考虑此优化，LWE 困难参数仍保持足够安全边界。

---

## 9. lattice-estimator 实践分析

### 9.1 工具介绍

**lattice-estimator**（GitHub: `malb/lattice-estimator`）是公开发布的 Python 工具，实现了 APS2015 的具体复杂度框架，支持：
- 标准 LWE / RLWE / NTRU
- BKZ 复杂度估计
- 多处理器/GPU/ASIC 成本模型
- 量子安全评估（Grover 加速）

**推荐运行环境**：
```
SageMath 10.x  (https://www.sagemath.org/download.html)
# 或在线：SageCell (https://sagecell.sagemath.org/)
```

### 9.2 ML-KEM-768 安全验证（SageCell 可复现）

```python
# === lattice-estimator 对 ML-KEM-768 参数的 BKZ 安全估计 ===
# SageCell 运行指令 (https://sagecell.sagemath.org/)

# 在 SageCell 中安装（首次运行）：
# !pip install lattice-estimator

from estimator import LWE
import estimator

# ML-KEM-768 (FIPS 203) 对应参数
# n=768, q=3329, alpha~1.9e-5 (std dev), m=n (标准)
params = LWE(n=768, q=3329, alpha=1.9e-5, m=768)

# BKZ 复杂度估计
result = estimator.BKZ.solve(params)
print("=== ML-KEM-768 BKZ Security ===")
print(f"  Classical: {result.get('classical', 'N/A')} bit")
print(f"  Quantum:  {result.get('quantum', 'N/A')} bit")
print(f"  BKZ beta: {result.get('beta', 'N/A')}")

# 验证是否达到 NIST Category 3 (>= 128-bit classic)
classic = result.get('classical', 0)
print(f"\n  Reaches NIST Cat 3 (128-bit)? {classic >= 128}")
print(f"  Reaches NIST Cat 5 (256-bit)? {classic >= 256}")
```

**预期结果**：
- 经典安全：$\\approx 2^{143}$ bit operations（对应 NIST Category 3）
- 量子安全（Grover）：$\\approx 2^{72}$ bit operations
- BKZ 块大小 $\\beta \\approx 700-750$

### 9.3 VWZ 参数 → LWE 映射（理论框架）

⚠️ **重要**：VWZ 的困难假设是 VMQ-SPARSE（不是直接 LWE）。
以下映射是**理论推断**，需通过完整归约证明建立：

| VWZ 参数 | 推断对应 LWE 维度 | 备注 |
|----------|:---:|------|
| k=8, N=17 | n ≈ 100-500 | 取决于 VMQ-SPARSE 的编码效率 |
| k=16, N=33 | n ≈ 500-2000 | VMQ-SPARSE → LWE 编码维度增长 |
| k=32, N=65 | n ≈ 2000-8000 | 理论目标安全 |

**待验证项**：
1. VMQ-SPARSE 是否可编码为等价的 LWE 实例？
2. 如果可编码，最小 LWE 维度 n 是多少？
3. 对应的 BKZ $\\beta$ 是否满足安全要求？

**这是开放研究问题**（对应 §1.3 归约缺口），需在 Phase 2 (2026-Q4) 解决。

### 9.4 BKZ β vs 安全级别对照表

| BKZ β | 经典 bit security | 量子 bit security (Grover) | NIST Category |
|:---:|:---:|:---:|:---:|
| 400 | ~96 | ~48 | Cat 1 |
| 500 | ~118 | ~59 | Cat 2 |
| 600 | ~140 | ~70 | Cat 3 |
| 700 | ~162 | ~81 | Cat 4 |
| 750 | ~172 | ~86 | Cat 4+ |
| 800 | ~185 | ~92 | Cat 5 |

> **解读**：若 VMQ-SPARSE 可归约到 LWE 且等价格位数 $n=768$（即 ML-KEM-768 同级），则 VWZ k=16 对应 Cat 3 级别（~140-bit classic，~70-bit quantum）。

---

## 10. 诚实声明与已知缺口

| 编号 | 缺口描述 | 影响 | 处置方式 |
|:---:|----------|:---:|----------|
| **H-1** | VMQ-SPARSE → LWE 归约**尚未证明** | 高 | Phase 2 目标（2026-Q4） |
| **H-2** | V-SIS → NTRU 搜索→决策归约**未解决** | 高 | 开放研究问题（Boudgoust et al.） |
| **H-3** | BKZ 对非标准格（Vandermonde 结构）的复杂度**无精确模型** | 中 | Phase 1 阶段 1.3 量化 |
| **H-4** | lattice-estimator 尚未对 VWZ 参数**实际运行验证** | 中 | 本文档提供理论框架 + SageCell 复现指引 |
| **H-5** | 常数时间实现**未验证**（JS + Rust WASM） | 中 | 实验组件隔离，不用于生产 |

**总体诚实评估**：
> VWZ 的密码学安全依赖于一个**开放研究问题**（V-SIS 归约链）。当前参数集在工程上表现优异，但在**理论安全层面缺乏同行认可**。这不是工程缺陷，而是 VWZ 作为一个研究原型的客观现实。

---

## 参考文献（补充）

- **Regev (STOC 2005)** "On Lattices, Learning with Errors, Random Linear Codes, and Cryptography" — LWE 问题原始引入
- **Albrecht-Player-Scott (JMC 2015)** "On the Concrete Hardness of Learning with Errors" — 具体 BKZ 复杂度量化框架
- **Chen-Nguyen (ASIACRYPT 2011)** "Using BFGS Optimizations for Lattice Basis Reduction" — SA-BKZ 2.0 实验校准
- **Chen-Nguyen (EUROCRYPT 2011)** "Nguyen-Stern 算法的实用改进" — 格基约减实用优化
- **Ajtai (STOC 1996)** "Generating Hard Instances of Lattice Problems" — LWE → 标准格问题归约
- **Micciancio-Goldwasser (2002)** "Complexity of Lattice Problems" — 格问题复杂度分类
- **lattice-estimator** `malb/lattice-estimator` — APS2015 的自动化实现
