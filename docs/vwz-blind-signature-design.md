# VWZ 盲签名：Fischlin 框架适配方案

**版本**: v1.0-draft | **日期**: 2026-08-12 | **状态**: 8/31 前设计阶段  
**分支**: `experimental/vwz-lg` | **方向**: 后量子盲签名（双线 A）

---

## 0. 动机

VWZ 的签名尺寸在所有后量子签名方案中最小（68B @ k=16），而盲签名通常比普通签名**成倍膨胀**（Fischlin 框架下，Σ-协议重复次数 N 导致签名增长 O(N)）。

**核心问题**：VWZ 的紧凑尺寸优势能否在盲签名中保留？

---

## 1. 竞争格局

| 方案 | 基础假设 | 盲签名尺寸 | 标准化状态 |
|------|----------|-----------|:---:|
| HAETAE-blind | MLWR (NIST) | ~10KB+ | 研究阶段 |
| Dilithium-blind (Banse et al.) | MLWE | ~50KB+ | 学术原型 |
| CFS-blind (code-based) | Syndrome Decoding | ~20KB | 学术原型 |
| **VWZ-blind (本方案)** | **VMQ-SPARSE** | **目标 <5KB** | 实验探索 |

> VWZ 起跑优势：基础签名 68B → Fischlin N≈50-70 → 盲签名 ≈ 3.4-4.8KB（理论下界）

---

## 2. Fischlin 框架快速回顾

**输入**：一个 EUF-CMA 安全的 Σ-协议（承诺-挑战-响应）

**变换**：Fischlin 通用变换将 Σ-协议转为盲签名，核心步骤：

1. 用户（盲化方）向签名者发送盲化挑战 c' = H(commit, msg, blind)
2. 签名者返回响应 r
3. 用户去盲化，验证 (commit, c, r) 是否有效
4. 重复 N 次（N 由安全参数决定，通常 50-80）
5. 最终签名 = N 个有效 (commit, c, r) 三元组

**安全性**：ROM 下，如果 Σ-协议具有诚实验证者零知识 (HVZK) + 特殊健全性 + 不可预测承诺，则 Fischlin 变换给出 EUF-CMA 安全的盲签名。

---

## 3. VWZ → Σ-协议转换

### 3.1 VWZ 的天然 3-流结构

VWZ 签名算法隐含一个 3 轮 Σ-协议：

```
承诺 (Commit):  w = H(sk, nonce)  →  pk 的 Vandermonde 子空间承诺
挑战 (Challenge): c = H(pk, w, msg)
响应 (Response): r = w + c · sk (mod q)  →  验证 V·r ≡ pk + c·challenge_point
```

这一结构天然适配 Fischlin 框架。

### 3.2 需要的安全属性

| 属性 | VWZ 现状 | 盲签名需求 | Gap |
|------|:---:|:---:|------|
| 完整性 (Completeness) | ✅ 148/148 | ✅ 同 | 无 |
| 特殊健全性 (Special Soundness) | ⚠️ 隐含 | ✅ 需要证明 | 需从 VMQ-SPARSE 归约 |
| HVZK | ⚠️ 未形式化 | ✅ 需要 | 需构造模拟器 |
| 不可预测承诺 | ⚠️ 未分析 | ✅ 需要 | 需分析 w 的熵 |
| EUF-CMA | ⚠️ ROM 未完整证明 | → Fischlin 后自动获得 | 在 Fischlin ROM 下 |

### 3.3 关键挑战

**挑战 1：HVZK 模拟器**

标准 Σ-协议的 HVZK 模拟器：给定挑战 c，生成 (commit', c, r') 使得验证通过。VWZ 中这要求能够从 c 逆向构造一个"假"承诺 w'。

VWZ 的验证方程：V·r ≡ pk + c·challenge_point (mod q)

给定 c，可以：
1. 随机选 r' ∈ F_q^M
2. 计算 commit' = V·r' - c·challenge_point
3. (commit', c, r') 通过验证 → HVZK ✅

> **这恰好成立**，因为 V 是可逆 Vandermonde 矩阵，给定 (c, r') 可唯一确定 commit'。HVZK 模拟器的存在是直接的——这是 VWZ 结构的天然优势。

**挑战 2：特殊健全性 → VMQ-SPARSE**

两个不同挑战 c₁ ≠ c₂ 对同一承诺 w 的成功响应 r₁, r₂ 给出了：

V·r₁ ≡ pk + c₁·P
V·r₂ ≡ pk + c₂·P

→ V·(r₁ - r₂) ≡ (c₁ - c₂)·P
→ V·((r₁ - r₂)/(c₁ - c₂)) ≡ P

这恢复了一个有效的 VMQ-SPARSE 原像 → 特殊健全性等价于 VMQ-SPARSE。

**挑战 3：盲签名尺寸估计**

```
每条三元组: |commit| + |challenge| + |response|
           = (2k+1) + 32 + (k+1) 个 F_q 元素  (k=16)
           = 33 + 32 + 17 = 82 个 F_q 元素
           = 82 × 2 bytes = 164 bytes

N=50:  50 × 164 = 8,200 bytes
N=70:  70 × 164 = 11,480 bytes
```

| k | 基础签名 | N=50 盲签名 | N=70 盲签名 | 对标 HAETAE-blind |
|---|---------|-----------|-----------|:---:|
| 8 | 36B | ~2.3KB | ~3.2KB | 胜 ✅ |
| 16 | 68B | ~8.2KB | ~11.5KB | 持平/略优 |
| 32 | 132B | ~20.5KB | ~28.7KB | 劣 ❌ |

> **k=8 是盲签名的最优甜点**：~73-bit 安全 + ~2.3KB 盲签名 = 所有 PQ 盲签名中最紧凑。

---

## 4. 适配方案

### 4.1 核心协议

```
┌─ 签名者 (Signer) ─┐         ┌─ 用户 (User) ────────────┐
│ sk = VMQ-SPARSE 原像│         │ pk, msg                     │
│                     │         │                             │
│  for i = 1..N:      │         │  for i = 1..N:              │
│    w_i = H(sk, n_i) │         │    blind_i ←$ F_q           │
│    ── w_i ─────────────→    │    c_i' = blind(c_i, blind_i) │
│    c_i = H(pk,w_i,T) │         │    c_i = H(pk,w_i,msg)      │
│    r_i = w_i + c_i·sk│         │    ── c_i' ────────────→   │
│    ←── r_i ──────────────    │    r_i = response(c_i', sk)  │
│                     │         │    check V·r_i ≡ pk + c_i·P │
│                     │         │    unblind(r_i, blind_i)     │
│                     │         │                             │
│                     │         │  σ = {(w_i, c_i, r_i)}_N   │
└─────────────────────┘         └─────────────────────────────┘
```

### 4.2 实现阶段

| 阶段 | 任务 | 产出 |
|:---:|------|------|
| **P1** | Σ-协议 HVZK 证明（本文 §3.3） | 数学草稿 |
| **P2** | Fischlin 变换完整安全性证明 | ROM 归约 |
| **P3** | Rust 原型实现 | `blind-sign/src/` |
| **P4** | 性能基准（vs HAETAE-blind / CFS-blind） | benchmark |
| **P5** | WASM 编译 + 演示页面 | `blind-sign/www/` |

### 4.3 时间线

| 时间 | 里程碑 |
|------|--------|
| 2026-08-12 | 本文档 (设计阶段) |
| 2026-09 | P1 + P2 安全证明完成 |
| 2026-10 | P3 Rust 原型实现 |
| 2026-11 | P4+P5 基准 + WASM |

---

## 5. 风险与限制

| 风险 | 等级 | 缓解 |
|------|:---:|------|
| VMQ-SPARSE 归约未完成 | 🔴 | 盲签名安全性继承自 VMQ-SPARSE，不新增假设 |
| Fischlin N 过大 → 签名膨胀 | 🟡 | 选 k=8 保持 ≤3KB |
| 盲化操作与 Vandermonde 结构冲突 | 🟡 | 需验证盲化后的线性保持性 |
| 无标准化路径 | 🟢 | 研究探索，8/31 前不做产品承诺 |

---

## 6. 参考文献

- Fischlin (Crypto 2006) "Round-Optimal Blind Signatures in the Random Oracle Model"
- HAETAE-blind (2024) "Blind Signatures from Module Lattices"
- Banse et al. (2024) "BlindOR — Blind Signatures from Dilithium"
- [VWZ 基础方案] `docs/vwz-security-analysis-framework.md` (v2.0)
- [VWZ API 设计] `docs/vwz-service-api-design.md`
