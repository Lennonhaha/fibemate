# VWZ 张量场 3D 可视化 — 创建记录

**日期**: 2026-08-12 07:40 GMT+8 | **状态**: ✅ 完成  
**分支**: `experimental/vwz-lg`（研究线，不合并 main）  
**URL**: https://fibemate.net/vwz-tensor/tensor-field.html

---

## 目标

在 `experimental/vwz-lg` 分支创建 VWZ 的 Vandermonde 张量场 3D 可视化，与 LG v2.3 矩阵场并列，同为研究线可视化。

## 数学基础

| 属性 | 值 |
|------|-----|
| 结构 | Vandermonde 矩阵 V[i][j] = λ_i^j mod q |
| 模数 | Q = 3329 (NTT 素数) |
| 安全参数 | k = 8, N = 2k+1 = 17 |
| 张量层数 | 7 |
| 稀疏性 | **100% 密集** (vs LG 0.56%) |
| λ-sets | 7 组互异非零值，SplitMix64 PRNG |

## 可视化特性

- 柱状模式：高度正比于 V[i][j] 值（Q 映射到 MAX_H=8）
- 球体模式：透明度 + 发光强度正比于值
- 7 层独立开关（S₂/C₅/S₃/D₄/A₄/D₆/C_Q）
- 层间 Vandermonde 脊线连接
- 悬停显示 λ, row, col, value, 模占比
- 颜色编码：蓝→琥珀→红→紫（Q/4→Q/2→3Q/4→Q）
- 自托管 Three.js（共享 lg-tensor/lib/）

## 部署方案

- 静态文件放 `/var/www/html/vwz-tensor/`（git 分支无关）
- nginx 通过 symlink `www/vwz-tensor → /var/www/html/vwz-tensor` 服务
- 利用已有 nginx root `/opt/fibemate-repo/www`，无需额外 location 块

## 首页更新

- 新增 🧮 VWZ 张量场卡片（绿 #10b981 边框，区分 LG 紫 #f368e0）
- 工程可视化工具 27→28

## 命名纠正

- **VWZ 张量场**：Vandermonde 张量（本文件） — 今日创建
- **LG v2.3 矩阵场**：Kronecker 矩阵 + 有限群表示 — 今日增强（连接线/中文标注/步骤动画）
- 此前 artifact 中"张量场 v2 增强"属命名混淆，已纠正为"矩阵场 v2 增强"

## Commits

| SHA | 内容 | 分支 |
|------|------|------|
| b5f6bbb2 | feat(vwz): add VWZ Vandermonde tensor field 3D visualization | experimental/vwz-lg |
| 5e302395 | feat(homepage): add VWZ Vandermonde tensor field card (27→28) | main |

## 合规

| 维度 | 状态 |
|------|:---:|
| 分支隔离 | ✅ experimental/vwz-lg |
| 触碰 main | 仅首页卡片（纯 HTML，无代码逻辑） |
| 8/31 前合并 | ❌ 不 |
| 进入加密路径 | ❌ 不（可视化页面，非密码代码） |
