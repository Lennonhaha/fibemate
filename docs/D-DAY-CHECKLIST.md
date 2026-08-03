# FIBEMATE 开源发布 D-Day 检查清单（D-DAY-CHECKLIST）

> **目标日期**：2026-08-31
> **创建日期**：2026-08-04
> **版本**：v1.0
> **适用**：开源发布当日（D-Day）及前 28 天准备期
>
> **原则**：开源前不碰任何代码 / 可视化 / 研究轨道。本清单是唯一允许产出的发布准备工作。

---

## 🗓️ 28 天准备期节奏

| 阶段 | 时间 | 任务 | 状态 |
| :--- | :--- | :--- | :--- |
| **准备期** | 8/4 ~ 8/10 | 写本清单、预演流程、打磨文案、定发布渠道 | ✅ 清单已生成 |
| **冷却期** | 8/11 ~ 8/25 | 完全静置，不碰任何文件 | ⏳ 待执行 |
| **冲刺期** | 8/26 ~ 8/30 | 最后检查链接/页面/文档正常 | ⏳ 待执行 |
| **D-Day** | 8/31 | 执行下方 4 步 + 发布 | ⏳ 待执行 |

---

## ✅ D-Day 当天 4 步（约 10 分钟）

### 步骤 1：GitHub 仓库 Public 切换
- [ ] 进入 `Settings → General → Danger Zone → Change repository visibility`
- [ ] 选择 `Make public`，确认仓库名 `Lennonhaha/fibemate`
- [ ] 勾选确认框，点击 `I understand`
- ⏱️ 预计 2 min

### 步骤 2：LICENSE 确认
- [ ] 确认仓库根目录存在 `LICENSE` 文件，内容为 **GPL-3.0-only**
- [ ] 确认 GitHub 右侧 `About` 面板已显示 License 徽章
- [ ] 若缺失：上传标准 GPL-3.0 文本（注意用 `GPL-3.0-only` 而非 `GPL-3.0-or-later`）
- ⏱️ 预计 2 min

### 步骤 3：Topics 标签确认（20 个已设）
- [ ] 确认 Topics：`chinese-cryptography, crypto-agility, fips203, fips205, formal-verification, fpga, hardware-security, hybrid-kem, lattice-crypto, ml-kem, nist-fips, ntt, post-quantum-cryptography, pqc, pqc-migration, slh-dsa, sm2, sm3, sm4, tla-plus`
- [ ] 若缺失：在 `About → Edit repository details → Topics` 补全
- ⏱️ 预计 1 min

### 步骤 4：Release Notes 发布
- [ ] 进入 `Releases → Draft a new release`
- [ ] Tag：`v3.3.0`（已存在，复用）
- [ ] Title：`FIBEMATE v3.3.0 — Post-Quantum Cryptography Engineering Validation Platform`
- [ ] 正文：粘贴 `docs/ANNOUNCEMENT.md` 内容
- [ ] 勾选 `Set as the latest release`
- [ ] 点击 `Publish release`
- ⏱️ 预计 5 min

---

## 📢 发布渠道（冲刺期确认）

| 渠道 | 说明 | 负责人 | 状态 |
| :--- | :--- | :--- | :--- |
| GitHub Release | 主发布位 | 自动 | ✅ 文案已备 |
| Hacker News | Show HN 帖子 | TBD | ⏳ 待定稿 |
| V2EX | 中文社区 | TBD | ⏳ 待定稿 |
| Twitter / X | 英文线程 | TBD | ⏳ 待定稿 |
| 邮件列表 | pqc / crypto 相关 | TBD | ⏳ 待定稿 |

---

## 🔍 发布后验证（D-Day + 30 min）

- [ ] 确认 `https://github.com/Lennonhaha/fibemate` 公开可访问
- [ ] 确认 `https://fibemate.net` 首页 + 14 可视化页面 HTTP 200
- [ ] 确认 CI 状态徽章全绿（GitHub Actions 页面）
- [ ] 确认 `docs/ANNOUNCEMENT.md` 与 Release Notes 一致
- [ ] 在社交媒体发布后，监控首批 issue / discussion 反馈

---

## ❌ 严禁在 28 天内做的事

| # | 不要做 | 原因 |
|---|--------|------|
| 1 | 碰任何代码 | 已全绿，改了可能引入 bug |
| 2 | 碰任何可视化页面 | 已全绿，改了可能引入 bug |
| 3 | 启动研究轨道任务 | 已归档（见 `RESEARCH-ROADMAP.md`），post-8/31 |
| 4 | 碰实验性组件（VWZ / LookingGlass v2） | post-8/31 |
| 5 | 大规模重构 | 风险太高，时间不够 |

---

*本清单为开源发布准备文档，不属于研究轨道。任何与发布无关的代码/文档修改均应在 8/31 之后进行。*
