# TVLA 原始轨迹数据说明

## 当前状态

本仓库的 TVLA 报告（`www/docs/tvla/*/`、`evidence/tvla/*/`）仅包含统计结果（均值、方差、Welch's t 值、置信区间），**不包含逐次采样的原始轨迹数据**。

## 原因

TVLA 生成脚本（`scripts/tvla/tvla_9of9_corrected.js`、`scripts/tvla/tvla_sm2_v3.js` 等）的设计模式是：

1. 在内存中构建 `Float64Array(N_SAMPLES)` 保存每次测量的时序值
2. 计算 `mean()` 和 `variance()` 得到 Welch's t 统计量
3. 将统计量写入 JSON 报告
4. JavaScript GC 回收原始数组（从未写入磁盘）

这是纯软件 TVLA 的常见模式：N=10,000 × 9 个 operation 的原始数据约 720KB（Float64），体积小但在生成脚本中未预留写盘出口。

## 独立复现

任何人均可使用以下步骤生成自己的 TVLA 报告并验证一致性：

```bash
# 环境要求：Node.js v22+, 8+ core CPU, Linux/macOS/Windows
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
node scripts/tvla/tvla_9of9_corrected.js   # ML-KEM-768 9/9 操作
node scripts/tvla/tvla_sm2_v3.js           # SM2 WNAF+Jacobian
node scripts/tvla/tvla_sm2_high_order.js   # SM2 高阶矩
```

> **注意**：由于 JavaScript JIT 编译的固有不确定性，不同硬件/Node 版本下的具体 `|t|` 值可能有 ±0.1 的偏差，但 pass/fail 判定应一致。

## 原始轨迹补充计划

| 事项 | 时间 | 说明 |
|------|------|------|
| 修改生成脚本 | 8.31 前 | 为 `tvla_9of9_corrected.js` 添加 `--save-raw` flag，同步写入原始轨迹 |
| 生成 raw dataset | 8.31 前 | 在统一环境重新运行 N=10,000，生成 `evidence/tvla/raw/*.json.gz` |
| TSR 存证 | 开源时 | 对 raw dataset 和 README 做 RFC 3161 时间戳 |

## 已知局限

- **纯软件 TVLA**：测试在 Node.js V8 JIT 环境中进行，非硬件采集，无法捕获电磁侧信道
- **非恒定时间实现**：纯 JS SM2/SM4 使用 BigInt，其时序随操作数变化（项目中已声明）
- **统计有效性**：Welch's t-test |t| < 4.5 是常见阈值，但 δ 阈值在密码工程中尚无共识

---

*最后更新：2026-07-29 · N=2,000 (SM2/HMAC) / N=10,000 (ML-KEM)*
