# FIBEMATE 维护路线图 (Roadmap)

> 版本: v3.3.0 | 创建: 2026-08-12 | 周期: 未来 12 个月
> 产品化衍生方向见 [`docs/PRODUCT-ROADMAP.md`](docs/PRODUCT-ROADMAP.md)
> 工程缺口见 [`docs/DEVELOPMENT-GAP-ANALYSIS.md`](docs/DEVELOPMENT-GAP-ANALYSIS.md)

## 项目定位

FIBEMATE 是**后量子密码学全栈工程验证平台** (PQC executable textbook, GPLv3)。
不是生产库, 不是商业产品 — 用于理解 PQC 如何工作。

核心差异: NIST PQC + 国密 SM2/3/4 + 双棘轮 PQ + FPGA 源码 + 200+ TSR 证据链。

## 时间线

| 时间 | 里程碑 | 状态 |
|:---:|:---|:---:|
| 2026-08-31 | **开源发布** (v3.3.0, GPLv3) | 🟪 完成 (2026-08-31 00:21 public, 3 repos + CI) |
| 2026-Q4 | 硬件安全审计 (物理 TVLA / ChipWhisperer) | ⏳ 规划 |
| 2027-Q1 | 跨平台扩展 (Python/Rust 原生绑定) | 📋 规划 |
| 2027-Q2 | 形式化安全审计 (第三方机构) | 📋 规划 |
| 2027-2028 | 社区成长 (FALCON 等新标准支持) | 📋 规划 |

## 发布前 (8/31 前) — 必做

| 优先级 | 项目 | 状态 |
|:---:|---|:---:|
| P0 | GitHub 2FA 启用 | ✅ 已完成 |
| P0 | ESLint 零警告 (CI `--max-warnings 0`) | ✅ 已完成 |
| P0 | CI / Nightly / CodeQL 全绿 | ✅ 已完成 |
| P1 | Dependabot 25 告警清理 | ⏳ 进行中 |
| P1 | SSL 续期配置 (renewal conf → dns-aliyun) | ⏳ 待 10 月 |
| P2 | 开源公告 (ANNOUNCEMENT.md) 定稿 | ⏳ |
| P2 | 发布渠道确认 | ⏳ |

## 发布后 — 维护计划

### 必做 (Won't drop)

- [ ] 第三方安全审计 (2027 Q2)
- [ ] 物理 TVLA 硬件侧信道测试 (Q4 2026)
- [ ] 持续 CI/CD 健康 (每周 Dependabot 审查)
- [ ] TSR 证据链持续固化 (新提交/测试/文档)

### 规划中 (Maybe)

- [ ] Python / Rust 原生绑定 (2027 Q1)
- [ ] KMS / 证书管理 / 吊销轮换模块
- [ ] FALCON / 其他 PQC 标准支持
- [ ] OpenSSF Silver → Gold 升级 (当前 Bronze 5.2)

### 明确不做 (Won't do)

- [ ] **不**将实验组件 (VWZ / LookingGlass) 默认开启或进入生产路径
- [ ] **不**提供 SLA / 商业支持 (除非独立产品化)
- [ ] **不**声称密码学正确性未经第三方审计
- [ ] **不**在冻结期内 (8/31 前) 触碰主分支代码逻辑

## Bus Factor 风险

当前 Bus Factor = 1 (单维护者)。
OpenSSF Silver 的多贡献者要求排除 AI, 短期无解。
缓解: 开源后通过 Good First Issues + Discussions 招募贡献者 (见 [`CALL-FOR-COLLABORATORS.md`](docs/CALL-FOR-COLLABORATORS.md))。

## 治理

- **GOVERNANCE.md** — 决策流程
- **CONTRIBUTING.md** — 贡献指南 (含 Contributor Tiers)
- **MAINTAINERS.md** — 维护者列表
- **SECURITY.md** — 漏洞报告流程
- **CODEOWNERS** — 代码所有权

---

*本路线图是维护计划, 非承诺。所有时间节点可能因资源/优先级调整。*
