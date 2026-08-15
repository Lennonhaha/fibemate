# 01/02/05 三个核心工具实现完成（2026-08-13 凌晨）

## 背景
用户 02:45-02:47 批准「11 份产品设计文档实现」，先做核心 3 个（01/02/05），不推送、本地+服务器验证。

## 完成情况

### 01 pqc-migrate CLI（已完成，上一轮）
- 零运行时依赖，`tools/pqc-migrate/`
- 11/11 单元测试通过 + 端到端跑通（扫 FIBEMATE 仓库 257 依赖，识别 3 HIGH + 1 MEDIUM + 8 LOW）

### 02 tsr-verify CLI（本轮完成）
- `tools/tsr-verify/`，复用现有 verify-tsr.js 核心
- **发现并修复 2 个真 bug**：
  1. **OOM 根因**：`checkSequenceGaps` 把文件名里的年份/日期（如 `lg-101-phase0-20260805` 的 `20260805`、路径里的 `2026-07-18`）误当序号，导致 gap 数组展开成 **2026 万个元素**撑爆 V8 heap。修复：只匹配 `lg-XXX` 纯序号 + 大 gap 防爆（差值 >1000 用负数区间标记，不展开）。
  2. **验证逻辑错误（关键）**：原设计文档假设「TSR imprint 命中 .sha256 清单里列出的源文件哈希」，实际是错的。真实关系：**TSR 时间戳的对象是 `.sha256` 清单文件本身**，`imprint = sha256(.sha256 文件内容)`，不是清单里列出的源文件哈希。已实测证实：`sha256(lg-080.sha256)` = `a478e7dc...` = TSR imprint 完全一致。
- 修正后完整跑通：**138 个 TSR，129 有效（93%）**，正确区分两类问题：
  - 4 个「源文件哈希不匹配」= 真·文件在存证后被改（pqc-readiness.html、README.md 等）
  - 5 个「清单文件哈希与 imprint 不一致」= `.sha256` 在 TSR 后重新生成过
- 9/9 单元测试通过（checkSequenceGaps 防爆 + extractImprint + detectAuthority）

### 05 kat-verifier npm 包（本轮完成）
- `tools/kat-verifier/`，`@fibemate/kat-verifier`
- 支持两种格式：JSON 数组（fml-dsa ACVP）+ .rsp 文本（NIST ACVP）
- 常量时间 buffer 比较（bufEq，XOR 累加）
- 9/9 单元测试通过
- 端到端：ML-DSA-44 75 向量、ML-KEM-768 100 向量全解析通过

## 关键发现（数据质量问题，非工具 bug）
ML-KEM-768 的 `.rsp` KAT 文件里 `dk` 字段末尾有大量垃圾数据（内存栈残留，`0000...696e7465726e616c2f73747265616d...`），是 C addon 生成 KAT 时的 `get_buf` 边界 bug（与之前 randombytes 空壳问题同源）。KAT 向量本身有数据质量问题，待 8/31 后修 C 层。

## 状态
- 三个工具全部完成、测试通过，**均未 commit 未 push**（遵守纪律）
- 05 的实际算法一致性验证（用真实实现跑 keygen/encaps）尚未接，目前只验证了「向量可解析 + 框架正确」——算法一致性需要接真实实现函数，属 8/31 后工作
