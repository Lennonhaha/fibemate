# VWZ 画像卡 v2.1 优化要点

## 截图问题诊断

点 ML-DSA-65 后右下面板（代价地图）4 项全红（-77% 到 -797%），下半部大片空白。

## 根因

1. **fml-dsa 数据是 noble fallback**（bench-fml-dsa.mjs 第 7 行明确：`Phase 1: noble-backed stubs`），92 sign/s、405 verify/s 是 noble 性能而非自研实现
2. **用 medians 中位数对比** → ML-DSA-65 在 noble 后端下必然 4 项全差
3. **右下面板只渲染条形图**，4 个短条下方 2/3 空间完全浪费

## 修复

### 已落地（commit 18d5b4694）

- ✅ 添加 **scheme detail 卡**（右下面板底部），显示：
  - 类型 / 安全等级 / 特征
  - **数据来源**（诚实标注"via noble fallback"）
  - ⚠ 警告（如 ML-DSA-65 Phase 1 / FALCON 厂商基准）
- ✅ 填充右下面板空白，给用户更完整的方案画像
- ✅ 6 方案全部有 note，点击切换时联动更新

### 关键设计原则

```
诚实 > 美观
```

ML-DSA-65 数据不去掉，但加 ⚠ "noble fallback 阶段" 标注。这是 Phase 1 stub 的真实情况，不是 bug。

## 长期路径（8/31 后）

fml-dsa 纯 JS 自研实现实装后，ML-DSA-65 数据会更新——届时 note 自动显示"Phase 2 纯 JS"。

## 经验教训

| 教训 | 说明 |
|------|------|
| 中位数对比有陷阱 | 小样本（n=6）时中位数不稳定，ML-DSA-65 一个 outlier 就拖垮全部 |
| 数据来源必须标注 | noble fallback vs 厂商基准 vs 本仓库实测，三者意义完全不同 |
| 视觉空白的对策 | 加 detail card 比强行塞数据更诚实 |

---

*生成: 2026-08-12 09:30 · commit 18d5b4694*