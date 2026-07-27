> 本文件为中文翻译副本，仅供国内用户参考。权威版本为英文原文件 `docs/openssf-roadmap.md`。
> This file is a Chinese translation for reference only; the authoritative version is the English file.

<!-- OpenSSF project 13695 passing since 2026-07-21; this file discloses AI/contributor boundary for Silver planning -->

# FIBEMATE OpenSSF 冲银/金路线图

> 基于 OpenSSF Best Practices 2026 版 passing → silver → gold 硬杠
> 冻结日期：2026-07-27 · 当前级别：passing（13695）

---

## 重要认知声明（AI 贡献与 OpenSSF 评分边界）

FIBEMATE 的开发过程中大量使用了 AI 辅助工具（代码生成、测试编写、文档补全、Review 辅助）。
但在 OpenSSF Best Practices 的评分体系中，**AI 不作为"独立贡献者（Contributor）"被计数**，原因如下：

| 层面 | AI 能做什么 | AI 不能做什么 |
|------|-----------|-------------|
| 代码贡献 | 生成 PR、写测试、补文档、修 Bug | 不能作为独立法律实体签署 CLA/DCO |
| 审查参与 | 辅助 Review、找漏洞、提建议 | 不能作为"独立身份 Contributor"被 OpenSSF 计数 |
| 决策参与 | 分析、建议、模拟讨论 | 不能承担安全决策的法律责任 |

OpenSSF 要求"多贡献者"的核心是：
- **人类身份**（不同组织 / 独立自然人）
- **防止单点故障**（Bus Factor > 1）
- **法律可追溯性**（CLA、签名提交、真实身份）

### 当前 FIBEMATE 的 Bus Factor 现状

| 角色 | 人类（Lennonhaha） | AI 辅助 |
|------|-------------------|---------|
| 代码作者 | ✅ | 辅助 |
| 安全决策 | ✅ | 辅助 |
| 密码学审查 | ❌（待引入） | 辅助 |
| 第三方审计 | ❌（计划中） | — |
| 基础设施维护 | ✅ | 辅助 |

**结论：FIBEMATE 当前 Bus Factor = 1（仅 Lennonhaha 一名真人核心维护者）。**

因此，冲 OpenSSF **Silver** 级别的"多贡献者"要求，必须通过引入**真人外部 Contributor**（而非 AI）来实现。

> 💡 **OpenSSF 评分小贴士**
> 本项目已获 OpenSSF Best Practices Passing 认证（project 13695），该认证基于工程卫生自评，不要求多贡献者。
> Silver / Gold 级别中的"多贡献者"要求明确排除 AI 身份。在评估本项目进度时，请勿将 AI 辅助活动计入 Contributor 数量。

---

## 一、Silver 级增量缺口（距 passing 的断点）

| 条目 | passing 现状 | silver 要求 | FIBEMATE 缺口 | 优先级 | 预估工时 |
|------|-------------|-------------|---------------|--------|----------|
| 多贡献者知晓安全设计 | 单主用 justification 过 | ≥2 名不同组织/独立身份贡献者参与安全决策 | ❌ 单 contributor | P0 | 社交动作 |
| Branch protection | 未核验 | 主分支禁 force-push + PR 审查 + 状态检查必过 | ❌ 无保护 | P0 | 0.5 天 |
| 依赖更新自动化 | 有 lockfile | Dependabot/Renovate 启用且近期有成功 PR | ❌ 无 dependabot.yml | P1 | 10 分钟 |
| SAST 覆盖 | ESLint（非安全向） | CodeQL/Semgrep 对 C/JS/Verilog 有规则集 | ❌ 无 CodeQL | P1 | 1 小时 |
| 模糊测试持续化 | fuzz/ 目录存在 | OSS-Fuzz 注册或 CI 内持续 fuzz ≥ 定期跑 | ❌ 未接 OSS-Fuzz | P1 | 1 天 |
| 漏洞响应 SLA | SECURITY.md 有策略 | 7 天确认/90 天修复 + 历史响应记录 | ⚠️ 有策略无历史 | P2 | — |
| 文档接口完备 | README 有 | 独立 API 文档站可链接 | ⚠️ JSDoc 73% 未出 html | P2 | 0.5 天 |
| 构建可重现 | 有 Dockerfile | Reproducible Build 声明 + 跨环境哈希一致 | ❌ 未做 | P2 | 0.5 天 |
| 贡献者行为准则签署 | CODE_OF_CONDUCT 有 | 近 12 个月有非作者提交 | ❌ 0 外部提交 | P2 | — |

**Silver 结论：** 差 5~6 条硬杠，核心在"多贡献者 + branch protection + CodeQL + OSS-Fuzz + Reproducible Build"。8-31 开源后若引入 2~3 个外部 reviewer、开分支保护、挂 CodeQL，**2027 H1 可冲**。

---

## 二、Gold 级增量缺口（在 silver 基础上）

| 条目 | silver→gold 增量 | FIBEMATE 现状 | 可行性 |
|------|------------------|---------------|--------|
| 独立安全审计 | 第三方密码学/基础设施审计 + 公开报告 | ❌ 计划 Q2 2027，未做 | 2027 可能 |
| CII 深度条目 | 全职维护者 / 资金透明 | ❌ 个人项目无基金会 | 难 |
| 威胁模型文档 | publish threat model + 资产/信任边界 | ⚠️ Security Model 粗描 | 可补 |
| 供应链 SLSA | SLSA L2+（provenance 生成） | ❌ 无 SLSA | 2027+ |
| 多平台安全测试 | CI 覆盖 Win/macOS/Linux + 交叉编译 | ⚠️ 主要 Linux CI | 可扩 |
| 密钥管理/签名发布 | Sigstore/cosign 签名发布产物 | ❌ 未做 | 2027+ |
| 历史漏洞 0 未决 | 无 open critical/high 超 60 天 | N/A（未审计） | — |

**Gold 结论：** 第三方审计 + SLSA + Sigstore + 多维护者四条零基础。个人单主项目冲 gold 极难，**需并入基金会（CNCF/OSSF 宿主）或获长期资助**。

---

## 三、Silver 级：多贡献者要求（实操说明）

根据 OpenSSF 官方解释，满足 Silver 级"multiple contributors"的典型方式包括：

### 1. 非安全类贡献（可被计数）
- 外部开发者提交文档修复、测试用例、CI 改进、非密码学代码重构
- 学生/实习生在指导下提交 PR 并签署 DCO

### 2. 安全相关决策（需真人参与）
- 邀请 OQS / liboqs 社区成员 Review 一次 ML-KEM / SM2 相关 PR
- 邀请国内 PQC 研究者（如铜锁 / Tongsuo 团队）对 KDF / TVLA 设计进行非正式评审

> ⚠️ **注意**：AI 生成的 PR、AI 辅助的代码审查，**不计入** OpenSSF 要求的"多贡献者"统计。
> 项目页面（13695）中相关条目的 justification 必须如实说明当前贡献者结构。

### 短期可执行动作（8-31 开源后）
- [ ] 邀请至少 1 名外部真人 Contributor 提交非安全类 PR（文档 / 测试）
- [ ] 邀请至少 1 名具有密码学背景的真人 Reviewer 对核心算法 PR 进行 Review
- [ ] 在 CONTRIBUTING.md 中明确区分"AI 辅助"与"人类 Contributor"的角色

---

## 四、最小冲 Silver 动作包（8-31 后可执行）

按性价比排序：

1. **开 branch protection**（main 禁 force-push、PR 需 1 review、CI 必绿）— 0.5 天
2. **加 dependabot.yml** — 10 分钟
3. **加 codeql.yml**（JS+C+Python）— 1 小时
4. **fuzz/ 接 OSS-Fuzz** 或 nightly CI 跑 harness — 1 天
5. **邀请 2 个外部 reviewer**（OQS 社区/国内 PQC 群）review ML-KEM PR — 社交动作
6. **出 JSDoc HTML 站** 链 README — 0.5 天
7. **Reproducible build 声明** + npm ci 锁哈希归档 — 0.5 天

**做完这 7 条 → 13695 项目页翻 Met → silver 自动变。**

---

## 五、三档对照速查表

| 维度 | passing ✅ | silver 🥈 | gold 🥇 |
|------|-----------|-----------|---------|
| 贡献者 | 1 人 justification | ≥2 独立身份 | 多维护者+基金会 |
| 分支保护 | 无硬性要求 | 强制 PR+审查+CI | 同 silver |
| SAST | ESLint | CodeQL/Semgrep | 同 silver |
| 模糊测试 | 有 harness | OSS-Fuzz/持续 | 同 silver |
| 安全审计 | 无 | 无 | 第三方+公开报告 |
| 供应链 | 无 | 无 | SLSA L2+ |
| 签名发布 | 无 | 无 | Sigstore/cosign |
| 资金透明 | 无 | 无 | CII 要求 |

---

## 六、与评级卡的关系

> **OpenSSF 徽章升级不反向提升密码学维评分。**

| 徽章级别 | 工程卫生维 | 密码学正确性维 | RTL 透明度维 |
|----------|-----------|---------------|-------------|
| passing ✅ | B+ | B-（不变） | C+（不变） |
| silver 🥈 | A- | B-（不变） | C+（不变） |
| gold 🥇 | A | B-（不变） | C+（不变） |

维度一（ML-KEM 字节级/NIST rsp/TVLA 原始/RTL 全量）仍按 **8-31 开源工件** 定。

---

## 七、一句话收口

**FIBEMATE 是 "OpenSSF passing 自认证卫生达标、silver 五道杠待补、gold 需基金会背书" 的 B 级 PQC 全栈原型。AI 辅助开发 ≠ OpenSSF contributor，Bus Factor = 1 是需诚实面对的真实状态。**
