# FIBEMATE · NIST CSF 2.0 差距分析（SP 800-53 映射）

> **用途**：8/31 开源后的治理改进依据。冻结期（8/31 前）不触发任何动作。
> **配套文档**：[`DEVELOPMENT-GAP-ANALYSIS.md`](DEVELOPMENT-GAP-ANALYSIS.md)（实践缺口，互补：本文是框架对照，彼文是工程缺口）。
> **数据基准**：2026-08-07，main `80e44fcb`。TSR 数字已校正为实查值（manifest 216 条 / `.tsr` 225 个，lg-001~101）。

---

## 一、总体评分

| 维度 | 数值 |
|------|------|
| **整体 CSF 覆盖率** | **86%** |
| Strong Evidence (Score 2) | 3 项 |
| Partial Evidence (Score 1) | 16 项 |
| Critical Gaps (Score 0) | 3 项 |

---

## 二、三个 Critical Gaps（Score 0）

| 控制项 | 说明 | 当前状态 |
|--------|------|----------|
| **GV.RR** — Roles & Responsibilities | Bus Factor = 1（单人维护），无正式安全角色分工 | 单人维护，职责未书面化 |
| **PR.IR** — Awareness & Training | 无正式安全意识培训计划 | 缺失 |
| **RC.RP** — Recovery Plan | 无正式恢复计划或连续性方案 | 缺失 |

---

## 三、PQC 特定差距

| 控制项 | 状态 | 说明 |
|--------|:---:|------|
| **PL-8** — PQC Transition Plan | ❌ Gap | 无正式 PQC 迁移计划，当前为临时行为 |
| **CM-8** — Crypto Inventory | ⚠️ Partial | CBOM 存在但未正式化 |
| **SC-13** — Crypto Module Validation | ❌ Gap | 无 FIPS 140-3 或 NIST CAVP 认证 |
| **GV.RR** — Bus Factor | ❌ Gap | 单人维护，迁移计划存在单点风险 |

---

## 四、强项（Score 2）

| 维度 | 说明 |
|------|------|
| **DE.CM** — 持续监控 | CI 24/24 全绿，TVLA 36/36，Nightly CI 常态化 |
| **RC.CO** — 证据链 | TSR **216 条 manifest / 225 个 `.tsr` 文件**（lg-001~101），DigiCert + FreeTSA 双源 RFC 3161 存证 |
| **PR.AT** — 密码技术 | ML-KEM-768 (FIPS 203) / fml-dsa ML-DSA-65 (FIPS 204) / SLH-DSA-128s (FIPS 205) / 国密 SM2·SM3·SM4 + FPGA NTT + TLA+ 形式化验证 |
| **GV.SC** — 供应链可见性 | 147 npm 依赖 100% 分类，CBOM 已生成 |

---

## 五、结论

| 维度 | 状态 |
|------|------|
| 技术实现 | ✅ 强（PR.AT, DE.CM, RC.CO）|
| 治理 / 规划 | ❌ 弱（GV.RR, PL-8, SC-13）|
| **整体评估** | **技术强，治理弱。差距在组织 / 流程，不是技术缺陷。** |

---

## 六、与 OpenSSF Silver 缺口重合

本分析的治理缺口与 OpenSSF Best Practices **Silver**  badge 缺口高度重合：

- **Bus Factor**（单人维护）→ 需外部 Collaborator 降低单点风险
- **贡献者数量** → 与 [`CALL-FOR-COLLABORATORS.md`](CALL-FOR-COLLABORATORS.md) 招募计划联动

---

## 七、8/31 后治理路线图（建议，非冻结期动作）

| 优先级 | 控制项 | 动作 |
|:---:|--------|------|
| 高 | GV.RR | 书面定义安全角色与职责边界（即使单人，也明确责任划分）|
| 高 | RC.RP | 编写恢复 / 连续性方案（备份、回滚、事故响应）|
| 中 | PL-8 | 发布 PQC 迁移计划文档（时间线 + 算法退役策略）|
| 中 | CM-8 | 将 CBOM 正式化（CI 生成、版本化、公开）|
| 低 | SC-13 | 评估 FIPS 140-3 / NIST CAVP 认证路径（长期，非发布阻塞）|
| 持续 | GV.RR / Bus Factor | 通过招募 Collaborator 降低单点风险 |

---

## 八、数据校正记录

- 原始 NIST CSF 页面引用 **TSR 131 份**（旧统计）。
- 2026-08-06 实查：`docs/tsa/timestamp-manifest.json` 记录 **216 条**，全仓库 **225 个 `.tsr` 文件**，lg 编号至 **lg-101**。
- 本文已采用校正后真实值。
