# VWZ 张量场 — LG 引用清理 & 命名确认

**日期**: 2026-08-12 08:00 | **状态**: ✅ 已完成

## 清理内容

| 位置 | 移除 | 原因 |
|------|------|------|
| 页面 header | `S₂→C_Q 群表示 → LG 矩阵场` 链接 | VWZ 张量场不提 LG |
| 图例 | `cf. LG: 0.56% 稀疏 (矩阵场)` | 同上 |
| 底部 note | `→ LG v2.3 矩阵场` 链接 | 同上 |
| console.log | `NOT group representations (that is LG)` | 开发者注释也有 |
| 图层按钮 | `S₂ (1D)/C₅ (1D)/...` → `λ-set 1/2/...` | 群表示是 LG，不是 VWZ |

## 当前页面仅含

- 标题: 🧮 VWZ Vandermonde 张量场
- 7 组 λ-sets 按钮
- 数学基础: Vandermonde 矩阵（多项式插值）
- DENSE = 100% 非零
- 柱状/球体双模式
- 底部仅标注 `experimental/vwz-lg`（无链接）
