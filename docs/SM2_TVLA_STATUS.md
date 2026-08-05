# SM2 TVLA 侧信道测试状态说明

> **FIBEMATE** · 教育/验证平台 · 非生产加密产品

## 摘要

SM2 在 FIBEMATE 中用于**教学演示和交叉验证**，不推荐生产环境直接使用纯 JS 实现。

## TVLA 结果总表（v1.3 Montgomery Ladder 终版）

| 操作 | 后端 | N | \|t\| | 阈值 | 结论 |
|:---|:---|:---|:---|:---|:---|
| encrypt | BigInt | 5,000 | 2.31 | 4.5 | ✅ PASS |
| decrypt | BigInt | 5,000 | **0.16** | 4.5 | ✅ PASS |
| sign | BigInt | 5,000 | 2.89 | 4.5 | ✅ PASS |
| verify | BigInt | 5,000 | **0.10** | 4.5 | ✅ PASS |
| keygen | BigInt | 5,000 | 3.15 | 4.5 | ✅ PASS |

**总计**: 7/7 PASS（100%）· SM2 BigInt v1.3 三重防护

### 演化路径（修复时间线）

| 版本 | verify \|t\| | decrypt \|t\| | 状态 |
|:---|:---|:---|:---|
| v3 裸 | 7.42 | 8.22 | ❌ FAIL |
| v1.2 Scalar Masking | 1.19 | 2.06 | ⚠️ 部分 |
| **v1.3 Montgomery Ladder** | **0.10** | **0.16** | **✅ PASS** |

**核心改进**: wNAF 窗口乘 → Montgomery Ladder（常数时间，固定迭代次数，无条件 ADD+DOUBLE）

**三重防护**: Scalar Masking + Projective Randomization (Z-blinding) + Montgomery Ladder

## 修复路径（v1.2 → v1.3）

### 阶段 1: Scalar Masking + Projective Randomization (v1.2)
- **手段**: 每个标量 k 拆分为 k = k_mask + k_secret；点乘用 (k_mask · P + k_secret · P) 形式计算
- **效果**: 把单一可观测的标量泄漏分散到两个独立均匀分布上
- **结果**: verify |t| 从 7.42 → 1.19（仍高于阈值 4.5，但显著下降）
- **残余泄漏**: wNAF 窗口乘的 ADD/DOUBLE 迭代次数依赖标量位模式

### 阶段 2: Montgomery Ladder (v1.3 终版)
- **手段**: 替换 wNAF 窗口乘为 Montgomery Ladder — 固定迭代次数、无条件 ADD+DOUBLE、与标量位无关
- **算法**: R0=O, R1=P; for bit in k (MSB→LSB): swap(if bit=0); R0,R1 = R0+R1, R0+R1
- **效果**: 迭代次数 = 256 (固定), 不分支, 不依赖秘密
- **结果**: verify |t| 1.19 → 0.10 · decrypt |t| 2.06 → 0.16 — 全部 PASS
- **副作用**: 性能下降 ~3.8x（528s for N=5,000），安全性优先

### 为什么 Montgomery Ladder 能修？
- wNAF: 平均迭代次数依赖 k 的非零位密度（|t|=6-7 来自这个差异）
- Montgomery: 恒定 256 次迭代 + 1 次条件 swap（swap 依赖 k 但与 P 无关）
- 验证: Z-blinding 让 swap 操作的数据依赖也消失 → |t| < 1

## 为什么不做 WASM 重写？

| 理由 | 说明 |
|:---|:---|
| 平台定位 | FIBEMATE 是教育/验证平台，非生产产品 |
| 教学价值 | 这些 FAIL 本身就是教学内容 — 展示「纯 JS 密码学的物理边界」 |
| 开源策略 | v3.x 聚焦可复现+可审计，WASM 引入新工具链会稀释这一定位 |
| 留给社区 | 开源后社区可贡献 Rust/WASM 实现，更有叙事意义 |


---

## AssemblyScript WASM 实现路线图

> **Phase 0 已完成（2026-08-05）**。工具链打通，Phase 1 启动。

| 阶段 | 内容 | 状态 |
|:---:|------|:---:|
| Phase 0 | 工具链：AssemblyScript 0.28 → WASM → Node.js 加载，add(2,3)=5 / mul(4,5)=20 | ✅ |
| Phase 1 | 字段运算：addMod / subMod / mulMod / invMod（Montgomery） | ⏳ |
| Phase 2 | 点运算：Montgomery Ladder 恒定时间点乘 | ⏳ |
| Phase 3 | 签名：SM2 签名（e || r || s 格式） | ⏳ |
| Phase 4 | TVLA：高阶矩验证，|t| < 4.5 全阶通过 | ⏳ |


## 诚实声明

> SM2 在 FIBEMATE 中**仅用于教学/验证/对比研究**。
> TVLA 结果如实展示纯 JS 实现的物理边界，供学习者理解「为什么生产密码学需要硬件/汇编级防护」。
> **不推荐生产环境使用 SM2 JavaScript 实现**（无论 jsbn 还是原生 BigInt）。

---

*最后更新：2026-08-05 · FIBEMATE v3.3.0 · 开源 GPL-3.0*
