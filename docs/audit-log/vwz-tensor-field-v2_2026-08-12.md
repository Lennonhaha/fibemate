# VWZ 张量场 — v2 重写 & LG 概念分离

**日期**: 2026-08-12 08:05 | **URL**: https://fibemate.net/vwz-tensor/tensor-field.html

## 修正内容

| 问题 | v1 状态 | v2 修复 |
|------|------|------|
| 图层按钮 | S₂/C₅/S₃/D₄/A₄/D₆/C_Q（LG 群表示） | λ-set 1~7（VWZ 的 λ-sets） |
| legend | cf. LG: 0.56% 稀疏（对比 LG） | 仅 DENSE: 100%（不提 LG） |
| 底栏 | → LG v2.3 矩阵场 链接 | experimental/vwz-lg（无链接） |
| header | S₂→C_Q 群表示 → LG 矩阵场 链接 | 仅 Vandermonde 矩阵（多项式插值） |
| 可视化结构 | 单视图（仅柱状/球体） | 四面板：热力图 + 3D 张量场 + λ 分布 + 幂次脊 |
| k 切换 | 固定 k=8 | 可选 k=4/8/16 |
| λ-set 切换 | 无 | Set 1/2/3 下拉选择 |

## v2 四视图

1. **热力图** — 全屏 Vandermonde 矩阵，每个元素颜色 = V[i][j] 值
2. **3D 张量场** — 3 层 λ-set 的 3D 柱子堆叠（Three.js）
3. **λ 分布** — λ 值在有限域 F_3329 上映射到圆环
4. **幂次脊** — V[i][j] = λᵢʲ 的指数增长曲线，标注 Q/2 分界线

## 部署

- 路径: /opt/fibemate-repo/www/vwz-tensor/（symlink → /var/www/html/vwz-tensor/）
- Three.js: 自托管（lib/three.module.js + lib/controls/OrbitControls.js）
- 零 CDN 依赖，零 LG 引用
