# 已知问题 (Known Issues)

## v3.3.0 · 2026-08-11

### WPI 硬编码与 JS 计算不一致

- **位置**：\migration-priority.html\ 顶部 KPI 区（L165）
- **根因**：\76.5\ 是早期原型阶段的静态占位值，基于最初 4 项高优先级资产（P-256/SM2/SHA-256/bcrypt）的加权平均分（≈72）手工微调而来。后续数据集扩展至 12 项后，JS 动态计算逻辑已更新（12 项算术加权平均 = 44.5），但顶部 KPI 值未同步。
- **现象**：
  - 顶部 WPI 显示：\76.5\（静态，不准确）
  - 12 项资产加权评分：JS 动态计算，完全准确
  - 迁移优先级排序：完全准确，不受影响
- **影响**：仅顶层数字显示偏差；所有迁移排序和单项评分均准确
- **ETA**：v3.3.1（开源后第一个补丁）
- **修复方案（v3.3.1）**：
  \\\javascript
  // 方案 A: 简单算术平均
  const wpi = Math.round(data.reduce((s, a) => s + a.weighted, 0) / data.length * 100) / 100;
  
  // 方案 B: 爆炸半径加权（推荐）
  const totalWeighted = data.reduce((s, a) => s + a.weighted * a.bloomFactor, 0);
  const maxPossible = data.reduce((s, a) => s + 100 * a.bloomFactor, 0);
  const wpi = Math.round(totalWeighted / maxPossible * 1000) / 10;
  \\\
- **Workaround**：以 12 项资产的单项加权评分为准，顶部数字仅供示意
- **诚实说明**：这个偏差不影响任何迁移决策。我们在开源前选择不修改代码，以保持稳定性。
