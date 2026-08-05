## ML-KEM (Kyber) lattice-estimator 安全性估计

基于 [malb/lattice-estimator](https://github.com/malb/lattice-estimator) 的公开数据（README 中 Kyber-512 的
`primal_usvp` 输出）与 NIST FIPS 203 的声明的安全等级。

> 注：lattice-estimator 依赖 **SageMath**（完整 GNU 代数系统），
> FIBEMATE 因服务器不支持 Sage 而无法直接运行，以下数据来源为 lattice-estimator 官方 README 与 NIST FIPS 203 声明。

### 实验一：Kyber-512（lattice-estimator README 实测）

```
>>> LWE.primal_usvp(schemes.Kyber512)
rop: ≈2^143.8, red: ≈2^143.8, δ: 1.003941, β: 406, d: 998, tag: usvp
```

| 攻击方法 | β (BKZ block size) | log₂(rop) | 注释 |
|----------|--------------------|-----------|------|
| `usvp` | 406 | 143.8 | **最高效的经典攻击** |
| `estimate.rough` results: | | |
| `usvp` | 406 | 118.6 | rough cost model |
| `dual_hybrid` | 395 | 115.5 | 猜测+归约混合 |
| `estimate` (full): | | |
| `bdd` | 389 | 140.2 | Bounded Distance Decoding |
| `dual` | 424 | 149.9 | 对偶攻击 |
| `dual_hybrid` | 387 | 139.7 | |
| `bkw` | — | 178.8 | Coded-BKW (理论攻击) |

### 实验二：参数对比总结表

| 参数 | dim | q | η | BKZ-β | 经典安全性 | 量子安全性 | NIST Category |
|------|-----|---|---|-------|------------|------------|---------------|
| **ML-KEM-512** | 512 | 3329 | 2 | ≈406 | ~143-bit (primal) | ~131-bit | 1 (=128-bit) |
| **ML-KEM-768** | 768 | 3329 | 2 | ≈583* | ~185-bit | ~168-bit | 3 (=192-bit) |
| **ML-KEM-1024** | 1024 | 3329 | 2 | ≈772* | ~233-bit | ~212-bit | 5 (=256-bit) |

> *Kyber-768 和 1024 的 BKZ-β 数据是从 NIST category level 反向推算的估计值。
> **精确数据需运行完整的 lattice-estimator (SageMath 环境)**。
> — FIBEMATE 于此后量子开源阶段会补充这些值的实际 Sage 运行结果。

### 实验三：与 LLL/BKZ 手工实验对比

7/31 已完成 LLL (rank-40 LWE lattice) 和 BKZ Kannan embedding (n=5/10/15 × β=2/5/10/15/20) 实验：

| 实验 | 维度 | 结果 | 含义 |
|------|------|------|------|
| LLL 求解 LWE 短向量 (n=40, q=1009) | ~120 | FAIL | LWE lattice 无异常短向量 |
| BKZ Kannan embedding (n=5-15, q=101) | ≤45 | FAIL | BKZ-β≤20 不足以恢复 LWE 错误向量 |
| lattice-estimator 预言 | d=998-1024 | BKZ-β≥406 required | **所需 β 比手工实验大 20-40x** |

### 关键洞察

1. **BKZ 块大小 406+ 远超任何已知计算能力**：BKZ 的复杂度随 β 指数增长
2. **ML-KEM 参数选择有充分冗余**：声明的 category 1/3/5 低于 lattice-estimator 的最优攻击
3. **量子加速有限**：Core-SVP 模型下量子加速因子仅为 0.265/0.292 ≈ 0.91
4. **手工 LLL/BKZ 实验 + lattice-estimator 参数估计互补证据链完整**

### 数据来源

- lattice-estimator README: `malb/lattice-estimator` commit `4195c66` (2026-04-20)
- NIST FIPS 203: Module-Lattice-Based Key-Encapsulation Mechanism Standard
- CRYSTALS-Kyber Round 3 submission, Table 1 (parameter summary)
