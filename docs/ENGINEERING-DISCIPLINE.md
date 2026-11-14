# FIBEMATE 工程与合规防假绿制度（v1.1）

- **性质**：`GOVERNANCE.md` 的**工程执行附件**（治理模型、角色、决策、继承仍以 `GOVERNANCE.md` 为准）
- **制定**：2026-11-14（v1.0 由参谋长起草；v1.1 经六条补丁与三条硬约束修订）
- **适用**：核心开发、运维、行政、对外披露全流程
- **宗旨**：不假装完整，不掩盖错误；用机器约束机器，用证据约束言论
- **效力**：与本文件冲突的口头/聊天记录一律无效；本文件与 `TOOLS.md` 冲突时，操作细节以 `TOOLS.md` 为准，原则以本文件为准
---

## 第一章 代码与供应链

**第一条【依赖升级审批】**
Dependabot PR 一律不点一键 Merge / 一键 Fix。
1. 升级前查版本跨度（major/minor/patch）与**可达性**：以 `package-lock.json` 的 `dev` 字段为准，**不以工具提示或截图为准**。
2. 传递依赖被上游锁死时，允许 `tolerable_risk` dismiss，但备注必须含三要素：**上游无已发布补丁 + 可达性判据 + 复评条件**。
3. **硬约束 A**：`dismissed_comment` 上限 **280 字符**（超出返回 422）。写理由前先本地计数，含换行也算 1 字符。
4. 禁止使用 `dev-only` 作为默认措辞——它会被 lockfile 直接反证。构建/CLI 期执行的包，写 `transitive via <toolchain>, not the app runtime`。

**第二条【SBOM 双副本铁律】**
动 `package.json` / `package-lock.json` / `Cargo.toml` 后：
```bash
node scripts/gen-sbom.js sbom.cdx.json
cp sbom.cdx.json www/docs/sbom.cdx.json
git add sbom.cdx.json www/docs/sbom.cdx.json
```
三件缺一即红。CI 的 `sbom` job 是**两步**校验：根 SBOM 与**已发布副本**分别比对；失败特征是 `generated=N committed=N` 但 +/− 明细不同。禁止 `--no-verify` 或强行 push 绕过。

**第三条【形式化验证准入】**
1. 时序性质必须写进 `.cfg` 的 `PROPERTY` 行，并绑定 CI 门禁（`TLA+ model change`）。
2. **硬约束 B**：只有 CI 日志出现 `Checking N branches of temporal properties` 才算真跑过；看不到这一行 = 没跑。
3. 抓出的假不变式，必须把**根因 + 反例 + 修正后实测**归档进 `ASSURANCE_CASE.md`，包括**我们第一次给出的错误根因**。

---

## 第二章 研发流程

**第四条【零上下文审查】**
核心协议、密码学接口、状态机设计，必须经过与作者**不同源**的审查：
- 首选确定性工具（TLA+/TLC、CodeQL、KAT、形式化检查器）；
- 次选隔离的零上下文 AI 窗口（只给产物，不给设计者意图）；
- **不得**用"再问同一个模型同一段上下文"充当独立审查。

**第五条【CI 不可控因素】**
runner 排队取消、第三方 API 波动导致的 `cancelled` / 基础设施报错：
- **禁止**为了迎合报错改业务代码或删测试；
- 标准动作：记录 `attempt` 次数与各 attempt 的 job 结论，原样 rerun；
- 事故记录必须区分 `cancelled` 与 `failed`，并写出真实耗时（禁止"2 秒通过"这类未核实的形容词）。

**第六条【合并顺序与 rebase】**
PR 落后 base 导致 `mergeable_state=behind` / required checks 无法落位时：
1. worktree 内 `git rebase origin/main` → `git push --force-with-lease`；
2. **禁止** GitHub UI「Update branch」（生成无 signoff 的 merge commit，DCO 必挂）；
3. 重放后三查：commit 数不变、`--stat` 与 PR 元数据一致、逐 commit DCO trailer 仍在。

---

## 第三章 合规与行政

**第七条【政务系统闭环即离场】**
商标、软著等：提交后不许直接关页面。必须拿到 ①扣费成功回执 ②流水号/短信。未缴费一律视为作废单。
台账：软著 `2026R11L4045265` / `2026R11L4044433`（待受理）；商标重报进度入内部日历提醒。

**第八条【主体与权属】**
公司知识产权：法人签字 + 经办人签字 + 公章三要素，缺一不提交。
**提交前 30 秒必查**：申请表"著作权人/申请人"字段是否为公司全称（历史事故：旧清单仍写个人，差点照抄提交）。

---

## 第四章 对外披露

**第九条【事实即链接】**
对外材料（BP/PPT/HTML/进展稿）：
1. 凡写"已完成"，必须能当场点开证据：merged PR / npm 包 / API 数值 / 官方回执。
2. 未闭合事项一律写"推进中"，**不得出现"已"字**。
3. 禁语：官方认证 / 官方合作伙伴 / 高危（除非有 CVSS）/ 已拿下 / 实测全覆盖 / 未开源内核（当实际已开源时）。

**第十条【数字口径三要素】**
任何数字必须同时给出：**口径 + 生成日期 + 可复现命令**。示例：
- TSR：`372 份 .tsr（2026-11-14，git ls-files '*.tsr' | wc -l），其中 261 个唯一令牌（sha256 去重）、111 份为逐字节副本`
- TLA+：`generated 133,891 / distinct 26,115`（两个数必须成对出现，禁止只写其一）
- Scorecard：`8.1（2026-11-14 api.securityscorecards.dev 实测，commit <sha>）`

**第十一条【合成数据必须自曝】**
凡使用合成/种子数据集的演示，对外必须标注 `synthetic`，不得表述为"实测分布/实测覆盖"。判据：数据集 README 中 `synthetic: true` 字样。

**第十二条【第三方代笔对账】**
外部 AI / 顾问撰写的材料，发布前由技术负责人逐字对账：状态词（已/待/计划）、数字口径、PR 状态（merged/open）、开源边界。转发卡片不构成授权，也不构成事实。

---

## 罚则与纠错

- **主动纠错豁免**：非主观造假，且 24 小时内自查并公开更正 → 不追责，记入案例库。
- **红线**：故意用无证据的"已完成"对外陈述，或绕过 CI 强推假绿 → 收回仓库写权限并记录。
- **同罪**：明明写着"不得虚报"，却让错误数字继续挂在官网 → 与虚报同等处理（制度与事实不一致 = 新的假绿）。

---

## 附录 A：六次失败（纠正版）

| # | 事项 | 事实（已核） | 教训 |
|---|---|---|---|
| 1 | PR #448 macOS 取消 | attempt 1/2 各有一个 macOS job 排队约 **15 分钟**后被 `cancelled`；attempt 3 **整体 30 秒**全绿（单 job 23–25 秒） | 区分 cancelled/failed；禁止"2 秒通过"式表述 |
| 2 | PR #450 SBOM | 第一次只改根 SBOM，红在 `Verify the published SBOM copy matches`；补 `www/docs/` 副本后过；因 #449 先合需 rebase | 一份内容两个落点 |
| 3 | PR #452 假不变式 | `L_Handshake` 违反根因是 `~>` 语义（`[](A => <>B)`），**首次归因"客户端先 close"是错的** | 自己的根因判断也会错，必须实跑取证 |
| 4 | mobile Dependabot | 3 条告警 `dev=false`（经 `@expo/*` 传递），dismiss 理由须写 build/CLI 期执行 | "dev-only"会被 lockfile 反证 |
| 5 | 对外数字虚高 | 267 为 2026-10-29 口径，后经 #399 镜像归档增至 372 文件 / 261 唯一令牌；"未开源内核"不成立（源码/数据/页面全公开） | 数字会随提交漂移，必须带日期与命令 |
| 6 | 行政线 | 软著主体/盖章、商标超时的真实代价；流水号 ≠ 登记号 | 闭环才算数 |

## 附录 B：口径登记表（随提交更新）

| 指标 | 当前值 | 口径 | 日期 |
|---|---|---|---|
| TSR 文件 | 372 | `git ls-files '*.tsr' \| wc -l` | 2026-11-14 |
| TSR 唯一令牌 | 261 | 上述文件 sha256 去重 | 2026-11-14 |
| TSQ | 240 / 133 唯一 | `git ls-files '*.tsq'` | 2026-11-14 |
| TLA+ C2 | 133,891 generated / 26,115 distinct | TLC 2.19，depth 17 | 2026-11-14 |
| Scorecard | 8.1 | api.securityscorecards.dev | 2026-11-14 |
| OpenSSF | Silver（自认证，44/44 MUST） | bestpractices.dev 13695 | 2026-11-10 |
