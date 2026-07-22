# FIBEMATE 质量保障体系架构

> 版本: v3.3 | 最后更新: 2026-07-22
> 地位: 架构蓝图 — 定义完整七层目标架构及设计原理
> 执行手册: 参见 [`docs/testing.md`](./testing.md) (当前四层实施)

## 概述

FIBEMATE 作为后量子密码全栈工程平台，代码安全与运行稳定性占项目可信度的 **65%**（其余 35% 为架构设计、文档、硬件原型等非代码资产）。本架构定义七层递进式质量保障管线，从开发者本机到生产发布逐级收紧，每层不通过则禁止流入下一层。

## 设计原则

1. **分层门禁** — 越靠近发布，测试强度越高；低级门禁不通过，禁止流入下一阶段
2. **证据可追溯** — 所有关键测试产出日志哈希，重要证据通过 RFC3161 TSR 固化纳入审计材料
3. **实验隔离** — 未充分验证的模块 (VWZ/LookingGlass) 通过 Feature Flag 默认关闭，不污染可信密码路径
4. **跨实现交叉验证** — 任何密码核心逻辑变更必须通过 noble + liboqs 双端交叉验证，杜绝"仅内部自测通过"的孤岛实现
5. **安全与稳定性加权决策** — 当二者冲突时，优先保证稳定性 (权重 0.6)，安全性次之 (权重 0.4)

---

## 七层递进式质量管线

| 层 | 名称 | 触发时机 | 核心工具 | 阻断能力 | 状态 |
|:---|:---|:---|:---|:---|:---|
| **L1** | 格式规范化 | `git commit` | Prettier | 阻止格式违规 | ✅ 已部署 |
| **L2** | 静态代码分析 | `git commit` | ESLint | 阻止高危模式 (eval、隐式全局) | ✅ 已部署 |
| **L3** | 基础冒烟测试 | `git commit` | `test/smoke-crypto.js` | 阻止核心崩溃 | ✅ 已部署 |
| **L4** | 单元与集成测试 | push / PR | KAT + cross-validation + CI | 阻止逻辑缺陷 | ✅ 已部署 |
| **L5** | 夜间全量回归 | 每日 06:00 UTC | Nightly CI | 阻止性能退化、内存泄漏 | ✅ 已部署 |
| **L6** | 端到端验收测试 | Release tag | Demo + Browser Matrix | 阻止跨环境断裂 | ⚠️ 部分手动 |
| **L7** | 发布准入审计 | Release publish | 第三方审计 + TSR 全链核验 | 阻止未审计发布 | ⏳ 待外因 |

### L1 — 格式规范化

在 `git commit` 时自动触发，统一代码风格，消除因格式不一致导致的 code review 噪音。

```
工具: Prettier + trailing-whitespace + end-of-file-fixer
覆盖: .js / .mjs / .json / .md / .yaml
策略: 自动修复；无法自动修复则阻断
```

### L2 — 静态代码分析

在 `git commit` 时与 L1 并行执行，拦截高危 JavaScript 模式和安全敏感模式。

```
工具: ESLint (strict rule set)
检测: eval / new Function / 隐式全局 / 未捕获 Promise / 不安全类型转换
策略: 阻断高危项；warning 可提交但产生日志
```

### L3 — 基础冒烟测试

在 `git commit` 时串行执行 (L2 通过后)，验证密码核心模块未被提交的代码彻底破坏。

```
工具: test/smoke-crypto.js
覆盖: ML-KEM-768 keygen→encaps→decaps 闭环；SM2 签名→验签→篡改拒绝
策略: 任意失败 → 阻断 commit；目标 < 2 秒
```

### L4 — 单元与集成测试

在 push / PR 时由 CI 自动触发。PR 合并的**强制门禁**，不允许跳过。

```
稳定性：
  - 全量单元测试套件
  - 基础 KAT 向量验证 (ML-KEM 100 组)
  - Node.js 18 / 22 基础运行校验
  - 制品构建 (JS 打包 / WASM 编译) 无报错

安全：
  - ESLint 全量扫描通过
  - 简易畸形输入冒烟 fuzz
  - 禁止硬编码密钥 / token / URL

门禁规则:
  任意失败 → PR 禁止合并
  密码核心逻辑变更 → 必须追加人工评审
```

### L5 — 夜间全量回归

每日 06:00 UTC (14:00 CST) 自动执行，承载 PR 阶段无法快速完成的**重型测试**。

```
稳定性：
  - 完整 KAT 测试 (ML-KEM 10,000 组)
  - 长时间压力测试 (数万次 KEM，监控内存泄漏)
  - 跨库互操作性验证 (ML-KEM ↔ noble + liboqs 双向 10,000 轮)
  - 跨平台编译矩阵 (Linux / Windows / macOS)

安全：
  - 模糊测试 (byteEncode / byteDecode / decapsulate 入口)
  - ASAN / UBSAN (C 原生扩展)
  - 软件 TVLA 侧信道统计 (SM2 定时执行)
  - 构建产物扫描 (Feature Flag 隔离验证)

硬件 (独立夜间流水线):
  - FPGA 行为仿真回归 (L8/L9 43 项)
  - 时序静态分析 (WNS 监控)
```

### L6 — 端到端验收测试

在 Release tag 推送时触发，或手动触发。验证**完整业务流程**在真实环境中运行无误。

```
测试项：
  - 完整跨浏览器 Demo 验证 (Chrome / Firefox / Safari)
  - 性能基准复测，对比历史基线无退化
  - Path C-2 混合 KEX 完整 E2E 场景
  - reg-server 客户端 ↔ 服务端完整握手
  - 版本向前/向后兼容矩阵
```

### L7 — 发布准入审计

在正式公开发布前执行，为最高层级门禁。**任意高危项不通过则推迟发布**。

```
安全准入：
  - 汇总近期 fuzz 结果，确认无高危崩溃
  - Feature Flag 人工复核 (生产构建默认关闭实验模块)
  - 漏洞台账核查 (全部修复，无遗留)
  - 依赖安全扫描 (npm audit — 无高危)
  - 第三方安全审计结论 (待外因)

审计产出：
  - 完整审计材料清单 (scripts/make-audit-package.sh)
  - 全量 TSR 证据链核验
  - 制品 SHA256 清单
  - 新增 TSR 证据签发
```

---

## 安全与稳定性加权决策

FIBEMATE 在安全性和稳定性不可同时满足时，采用加权决策机制：

| 维度 | 权重 | 理性 |
|:---|:---|:---|
| **稳定性** | 0.6 | 不稳定 → 用户直接感知 (通信中断、往返失败)；稳定是安全的前提 |
| **安全性** | 0.4 | 安全缺陷通常静默发生；可通过审计和交叉验证覆盖 |

**实施规则**:
- 实验组件 (VWZ、LookingGlass) 默认关闭，不进入生产加密路径
- 密码核心修改必须通过跨库交叉验证 (Noble + liboqs)
- 安全缺陷即使不影响稳定性，也必须修复后再发布

---

## 与执行手册的关系

| 维度 | 架构蓝图 | 执行手册 |
|:---|:---|:---|
| **文件** | `docs/quality-assurance.md` (本文) | `docs/testing.md` |
| **层级** | 七层完整设计 | 四层当前实施 (L1-L3 合并为"本地开发预检查") |
| **定位** | 目标架构 — 为什么这样设计 | 当前操作 — 怎么做 |
| **更新频率** | 架构变更时 | 每次 CI/测试配置变更时 |

执行手册将七层中的 L1-L3 合并为 "本地开发预检查" 一层（因为它们在同一触发时机执行），并向用户呈现 L4-L7 的当前实际执行方式。两文档互补，不重复。

---

## 按模块的测试策略

| 模块 | 语言 | L1-L3 | L4 | L5 | L6-L7 |
|:---|:---|:---|:---|:---|:---|
| ML-KEM-768 | JS | ✅ smoke | ✅ KAT+交叉 | ✅ 万轮+fuzz | ✅ Demo |
| SM2/SM3/SM4 | JS | ✅ smoke | ✅ KAT | ✅ TVLA | ⏳ |
| C 原生扩展 | C | — | ✅ 编译 | ✅ ASAN/UBSAN | ⏳ |
| Rust WASM (VWZ) | Rust/WASM | — | ✅ clippy | ✅ cargo fuzz | ⏳ |
| FPGA RTL | Verilog | — | — | ✅ 仿真 | ✅ 时序 |
| Path C-2 KEX | JS | — | ✅ E2E | ✅ 并发 | ✅ 矩阵 |

---

> 本文定义的是完整七层架构目标。当前实施状态参见 [`docs/testing.md`](./testing.md)。
> 原则: "Build the system you need, not the system you can imagine — but document the vision so you know where you're going."
