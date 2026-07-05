# NTT Pipeline v1.3 — 仿真报告

## 修复内容

| 问题 | 根因 | 修复 |
|:---|:---|:---|
| 256/256 MISMATCH | FIFO 8 深溢出 (第一级 len=128 需要 128 槽) | 扩展为 128 深, 7-bit 指针 |
| 结果写回不同步 | PS_DRAIN 硬编码 7 拍 (只等第一只蝴蝶), 后续 127 只结果未到 | 改为 `fw_res == fw_addr` 同步等待 |

## 仿真结果 (iverilog, tb_ntt_compare.v)

| 指标 | 原版 ntt_core | 流水版 ntt_core_pipe v1.3 | 改进 |
|:---|:---|:---|:---|
| Forward NTT 周期 | 12,550 | 6,652 | **1.89×** |
| 每 BF 平均周期 | 49.4 | 26.2 | 47% ↓ |
| 正确性 (256 点) | ✅ | ✅ 0/256 errors | ALL MATCH |

## 加速比分析

1.89× 的瓶颈: PS_DRAIN 是 **per-group** (非 per-stage) 顺序。
Forward 7 级共 127 个 group, 每 group 有独立的 feed→drain→flush 段。

阶段分解 (Forward):
- Stage 1 (len=128, 1 group): 775 cycles
- Stage 2 (len=64, 2 groups): 782 cycles
- Stage 3 (len=32, 4 groups): 796 cycles
- Stage 4 (len=16, 8 groups): 824 cycles
- Stage 5 (len=8, 16 groups): 880 cycles
- Stage 6 (len=4, 32 groups): 992 cycles
- Stage 7 (len=2, 64 groups): 1216 cycles
- **Total: ~6,265 (+387 开销 = 6,652)**

## 进一步优化路径 (Stage 2)

若实现 **group 间流水重叠** (feed group N+1 与 flush group N 并行):
- 理论周期: 4×254 + 7×7 = **1,065** → **11.8× 加速 vs 原版**
- 需要: 双 FIFO ping-pong 或 feed/flush 独立指针
- 估时: ~3h (修改 PS_DRAIN/PS_FLUSH 并行化 + 双 FIFO bank)
