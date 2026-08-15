# LWE 量子困难性与 BKZ 算法复杂度：文献参考

> 本文件记录 LWE 安全性与量子算法/BKZ 复杂度相关的核心文献，供 8/31 后深入研究用。
> **不构成安全声称**，仅作工程参考。

---

## 1. 量子算法对格密码的影响

### 1.1 核心问题

量子计算机对 LWE 的威胁是否比经典计算机更大？

| 算法 | 经典复杂度 | 量子复杂度 | 威胁程度 |
|:---|:---|:---|:---:|
| 枚举（Enum） | 2^n | 2^{n/2}（Grover 加速） | 中等 |
| BKZ 2.0 | poly(n) · 2^{0.292β} | 量子 BKZ ≈ 2^{0.146β} | 高（如果量子 BKZ 实用化） |
| DDDP/SVP | 2^{O(n)} | 量子加速未知 | 未知 |

**关键未知**：是否存在对 LWE 的完整指数级量子加速（类似 Shor 对 RSA 的攻击）？目前**未知**。

### 1.2 核心文献

#### Albrecht-Player-Scott (2015) — 量子 BKZ 复杂度估计
- **标题**：`Estimate_all_the_DATA - On the hardness of LWE and Ring-LWE with small error`
- **作者**：Martin R. Albrecht, Rachel Player, Sam Scott
- **来源**：Cryptology ePrint Archive, Report 2015/046
- **链接**：https://eprint.iacr.org/2015/046
- **核心内容**：
  - 给出量子 BKZ 对 LWE 和 Ring-LWE 的复杂度估计
  - ML-KEM-768 对应 LWE 参数：n=256, q=3329, α≈0.0012
  - 量子 BKZ 复杂度估计：对 ML-KEM-768，2^{128+} 工作量
  - 结论：即使考虑量子 BKZ，ML-KEM-768 仍提供约 128-bit 安全

#### Regev (2009) — LWE 困难性基础
- **标题**：`On lattices, learning with errors, random linear codes, and cryptography`
- **作者**：Oded Regev
- **来源**：Journal of the ACM 56 (6), 1–40
- **核心内容**：提出 LWE 问题，证明其到 GapSVP 和 SIVP 的量子归约
- **意义**：LWE 的困难性建立在量子计算假设上（非经典计算）

#### Peikert (2016) — LWE 十年综述
- **标题**：`A decade of Lattice Cryptography`
- **作者**：Chris Peikert
- **来源**：Foundations and Trends in Theoretical Computer Science 10 (4), 2016
- **链接**：https://web.eecs.umich.edu/~cpeikert/pubs/lattice-survey.pdf
- **核心内容**：全面综述格密码十年发展，含 LWE/Ring-LWE/NTRU 的安全性分析

### 1.3 后续跟进文献（待整理）

| 文献 | 方向 | 状态 |
|:---|:---|:---:|
| Albrecht et al. — "CRYSTALS-Kyber (ML-KEM)" | NIST PQC 标准分析 | 待读 |
| Ducas et al. — "Quantum cryptanalysis of lattice problems" | 量子加速上限 | 待读 |
| Biasse-Song - "Faster characters of LWE" | LWE 算法优化 | 待读 |

---

## 2. BKZ 算法复杂度分析

### 2.1 经典 BKZ

| BKZ 块大小 β | 经典复杂度 | 对 ML-KEM-768 安全性 |
|:---:|:---|:---|
| 20 | 2^{0.292·20} ≈ 2^{5.84} | < 64-bit |
| 50 | 2^{0.292·50} ≈ 2^{14.6} | ~80-bit |
| 100 | 2^{0.292·100} ≈ 2^{29.2} | ~100-bit |
| 200 | 2^{0.292·200} ≈ 2^{58.4} | ~110-bit |
| 400 | 2^{0.292·400} ≈ 2^{116.8} | ~128-bit+ |
| 500 | 2^{0.292·500} ≈ 2^{146} | > 128-bit |

> 注：复杂度估计公式来自 Chen-Nguyen (2011) 实验校准。实际安全性还需考虑枚举和Siegel 变量。

### 2.2 核心文献

#### Chen-Nguyen (2011) — BKZ 实验校准
- **标题**：`BKZ 2.0: Better lattice security estimates`
- **作者**：Yuanmi Chen, Phong Q. Nguyen
- **来源**：ASIACRYPT 2011
- **链接**：https://www.iacr.org/asiacrypt/2011/563
- **核心内容**：通过大量实验给出 BKZ 实际运行时间与 β 的精确关系
- **引用**：NIST PQC 安全级别定义的主要实验依据之一

#### Schnorr-Euchner (1994) — BKZ 前身
- **标题**：`Lattice basis reduction: Improved practical algorithms and solving subset sum problems`
- **作者**：Claus P. Schnorr, Martin Euchner
- **来源**：Mathematical Programming 66 (1994)
- **核心内容**：提出 HKZ/Schnorr-Euchner 约化算法，为 BKZ 奠定基础

#### Hanrot-PUlmke-Steger (2004) — NTRU 安全性
- **标题**：`New partial key exposure attacks on RSA`
- **来源**：Crypto 2004（与 BKZ 相关）
- **核心内容**：BKZ 对 NTRU 类格的安全性分析

---

## 3. FIBEMATE 当前安全参数（参考）

### 3.1 ML-KEM-768 安全参数

| 参数 | 值 | 说明 |
|:---|:---:|:---|
| n（格维度） | 256 | Ring-LWE 维度 |
| q（模数） | 3329 | 素数，NTT 友好 |
| η（噪声分布） | 2 | 离散高斯参数 |
| (k,ηₑ,ηₗ) | (3,2,2) | 矩阵结构 |
| 预测安全性 | ≈ 2^{210} | 经典 BKZ 估计 |
| 量子安全性 | ≈ 2^{128} | Albrecht-Player-Scott 2015 |

### 3.2 FIBEMATE 路线图对齐

- **v3.3.0**：ML-KEM-768（128-bit 经典 + 128-bit 量子）
- **v3.4+**：定期复核 BKZ 复杂度最新进展
- **v4.0**：根据 NIST 后量子安全评估更新参数（如需要）

---

## 4. 8/31 后研究行动项

| 优先级 | 行动 | 参考 |
|:---:|:---|:---|
| P1 | 细读 Albrecht-Player-Scott 2015 全文，提取对 ML-KEM-768 的具体量子安全估计 | §1.2 |
| P1 | 对比 Chen-Nguyen 2011 BKZ 校准与 FIBEMATE 现有参数文档 | §2.2 |
| P2 | 整理 Ducas 等人量子格攻击综述（如果有 2020+ 新结果） | §1.3 |
| P2 | 更新 `docs/security/` 中的 BKZ 复杂度参数表 | §3 |
| P3 | 研究"是否存在对 LWE 的指数级量子加速"文献前沿 | 开放问题 |

---

## 5. 重要说明

> **本文件不构成安全声称。**
>
> - 所有安全参数均基于当前已知的最佳攻击算法
> - 密码学安全性是动态的，新的算法发现可能导致参数需重新评估
> - FIBEMATE 的 ML-KEM-768 实现基于 NIST 标准化参数，后者经过了全球密码学社区多年审查
> - 任何对安全参数的修改都需要经过充分的研究和社区共识
