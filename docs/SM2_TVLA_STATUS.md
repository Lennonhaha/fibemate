# SM2 TVLA 侧信道测试状态说明

> **FIBEMATE** · 教育/验证平台 · 非生产加密产品

## 摘要

SM2 在 FIBEMATE 中用于**教学演示和交叉验证**，不推荐生产环境直接使用纯 JS 实现。

## 当前实现（唯一真源）

- **真源文件**：`www/crypto/sm2-bigint-ec.js` · **v1.4**（2026-07-23）
- **标量乘算法**：wNAF(w=4) + Comb 固定基点预计算缓存
- **侧信道防护（三层）**：
  1. Scalar masking — 标量 k 加随机掩码（k' = k + r·N，不做 mod N）
  2. Projective randomization — Jacobian 坐标随机 z 起点
  3. **verify scalar blinding** — verify 阶段对 s、t 做标量盲化，抑制 wNAF 时序泄漏

> 注：v1.4 的第三层防护是 **verify scalar blinding**（commit `f163972e`），
> **不是** Montgomery Ladder。Montgomery Ladder 三层版本只在历史归档中（见下文「归档版本」）。

## TVLA 结果总表（按实现版本，数据均来自 evidence 可溯报告）

| 实现版本 | 标量乘 / 防护 | N | verify \|t\| | decrypt \|t\| | 结论 | 报告来源 |
|:---|:---|:---|:---|:---|:---|:---|
| **裸 BigInt + wNAF**（无防护） | wNAF | 5,000 | **7.42** | **3.80** | ❌ FAIL | `tvla-sm2-v4-output.txt` |
| **v1.2 masked**（两层） | binary d-a-a | 5,000 | **1.19** | **2.06** | ✅ 5/5 PASS | `tvla-sm2-masked-report.json` |
| **v1.3 Montgomery Ladder**（三层，归档平行版） | Ladder | 10,000 | **0**（order1） | **1.8151**（order1） | ✅ 20/20 PASS | `tvla-sm2-high-order-report.json` |

**说明**：
- 裸版 verify |t|=7.42、decrypt |t|=3.80 显示 wNAF 无防护时的泄漏；
- v1.2 masked 把 verify 降到 1.19、decrypt 降到 2.06（5/5 PASS）；
- Montgomery Ladder 平行版在 N=10,000 高阶矩（order 1-4）下 20/20 PASS。

> ⚠️ **诚实声明**：当前真源 v1.4 的第三层（verify scalar blinding）的 TVLA 存证情况分三层：
>
> 1. **修复前诊断（lg-097，2026-07-23）**：`scripts/tvla/gradient-results.txt` 证明 verify 有 wNAF 时序泄漏
>    （`|t|` 随 √N 增长，R²=0.956，N≈1749 处 `|t|` 越阈值 4.5）——这正是引入 verify blinding 的动机；
> 2. **修复代码 + 验证脚本（lg-098，2026-07-23）**：`scripts/fix-verify-blinding.cjs`（第三层 blinding 实现）
>    与 `scripts/verify-gradient-quick.cjs`（修复后 gradient 扫描脚本）均已 TSR 时间戳存证；
> 3. **缺失：修复后的验证运行输出未落成 JSON 报告**——`verify-gradient-quick.cjs` 跑完会输出
>    `ALL |t| <= 4.5 — verify leak CLOSED`，但该运行结果没有存盘成正式 JSON（如 evidence/tvla/ 下的报告），
>    只有脚本本体、无结果文件。
>
> 故 v1.4 的 verify blinding 属「有修复前诊断 + 有修复代码/脚本存证 + 缺修复后正式 JSON 结果」状态。
>
> **待办（P2）**：跑 `verify-gradient-quick.cjs`，把「修复后」的 verify gradient 结果落成正式 JSON 报告
> （进 evidence/tvla/，如 `tvla-sm2-v1.4-verify-blinding-report.json`，并做 TSR 存证）。

## 演化路径（修复时间线，已修正方向）

| 版本 | 标量乘算法 | verify \|t\| | decrypt \|t\| | 状态 |
|:---|:---|:---|:---|:---|
| v3 裸（无防护） | wNAF | 7.42 | 3.80 | ❌ FAIL |
| v1.2 masked | binary double-and-add | 1.19 | 2.06 | ✅ 5/5 PASS |
| v1.3 真源 | wNAF(w=4) + Comb | （保留 v1.2 防护） | （保留 v1.2 防护） | ✅ 性能优化 |
| v1.4 真源 | wNAF + verify blinding | 修复前诊断见 lg-097；修复后输出未落 JSON | 同左 | ⚠️ 缺修复后正式报告 |

**核心改进方向**（v1.2 → v1.4）：
- **v1.2**：加入 Scalar Masking + Projective Randomization，verify 7.42 → 1.19；
- **v1.3**：性能优化，binary double-and-add → wNAF(w=4) + Comb（加法轮数 256 → ~51），防护保留；
- **v1.4**：补 verify scalar blinding，抑制 wNAF 在 verify 阶段的时序泄漏。

## 归档版本（历史，非当前真源）

- `archives/sm2-versions/sm2-bigint-ec-v1.3.js`（2026-06-18）：
  **Montgomery Ladder + Scalar Masking + Projective Randomization（三重防护）**。
  这是「三层防护 + Montgomery Ladder」的完整实现，但**从未成为网站真源主线**，现已归档。
  其 TVLA 数据见上表「v1.3 Montgomery Ladder」行（high-order report，N=10,000，20/20 PASS）。

## 为什么不用 Montgomery Ladder 作主线？

- FIBEMATE 是教育/验证平台，v1.3 真源选择 wNAF+Comb 是**性能优先**（Add 256→~51，sign 3-4x，verify 2-3x）；
- Montgomery Ladder 代价是 ~3.8x 性能下降（528s for N=5,000），对教学演示场景收益有限；
- 当前 v1.4 用 verify scalar blinding 替代 Ladder 来抑制 wNAF 时序泄漏，保留了性能优势。

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

*最后更新：2026-09-24 · FIBEMATE v3.3.0 · 开源 GPL-3.0*
