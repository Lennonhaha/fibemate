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
- TSR：`364 份 .tsr（2026-11-19，git ls-files '*.tsr' | wc -l），其中 256 个不同 basename、93 个 lg-NNN 令牌（sha256 去重）、108 份为逐字节副本`
- TLA+：`generated 133,891 / distinct 26,115`（两个数必须成对出现，禁止只写其一）
- Scorecard：`8.1（2026-11-14 api.securityscorecards.dev 实测，commit <sha>）`

**第十一条【合成数据必须自曝】**
凡使用合成/种子数据集的演示，对外必须标注 `synthetic`，不得表述为"实测分布/实测覆盖"。判据：数据集 README 中 `synthetic: true` 字样。

**第十二条【第三方代笔对账】**
外部 AI / 顾问撰写的材料，发布前由技术负责人逐字对账：状态词（已/待/计划）、数字口径、PR 状态（merged/open）、开源边界。转发卡片不构成授权，也不构成事实。

---

## 增补纪律 N1–N5（2026-11-14 生效）

本节五条源自 2026-10-25 → 2026-11-14 的复盘（`deliverables/retrospective-2026-11-14.md`）。生效即约束，不设过渡期。

**N1【结论必须落单】——日志不算闭环**
任何"结论级"发现（一个缺陷、一个口径错误、一个失效假设），必须落到 **Issue 号**或 **CI 门禁步骤** 之一。只有 memory/聊天记录的，视为**未闭环**，不得在后续材料中引用为"已知问题"。
- 判据：被引用时能给出 issue 链接或 workflow 步骤名。
- 反例：2026-10-25 已确认"KAT 75/75 测的是 noble"，仅写入日志；2026-11-14 又当新发现报了一次 —— 20 天内同一结论被发现两次。

**N2【官方向量直测本实现】——缺则该模块 CI 红**
每个密码原语必须有针对**本仓库实现**的 KAT。测试文件内必须写明**被测对象**（函数或模块名）；引用第三方库的 KAT 只能作为对照，不能替代。缺该测试的模块，CI 判定为红。
- 判据：测试文件内出现被测函数名；且替换实现会使其失败（可变异验证）。
- 反例：`scripts/kat-verify.mjs` 长期把 NIST 向量喂给 `@noble/post-quantum`，从未测过本实现，"KAT 75/75"只证明参考实现正确。

**N3【数字单一源】——由 `docs/metrics.json` 生成或校验**
对外数字只能来自 `docs/metrics.json`。每条必须携带 **值 + 口径(scope) + 日期 + 可复现命令** 四要素。文档中的数字要么由脚本生成，要么由 `scripts/check-metrics.cjs` 校验；git 可复算的条目由该脚本每次 CI 重算比对。新增对外数字而未登记 = 红。
- 判据：`node scripts/check-metrics.cjs` 退出码 0；同一个数字在仓库内不存在两个不同取值。
- 反例：`267 / 260 / 201,467 / 101,467 / 133,891` 曾在一周内互相矛盾并同时挂在活页上。（`metrics-gate:allow-retired`：本行是禁用名单的说明文本，不是引用。）

**N4【写入前查存在性】——覆盖已有文件前必须 diff**
写任何文件前先判断**是否已存在**：已 tracked 的文件先 `git ls-files --error-unmatch <path>` 与 `git diff`；未 tracked 的先 `Test-Path`。覆盖他人已有内容视为事故，**新建文件优于覆盖同名文件**。
- 判据：覆盖类操作在提交说明或 PR 描述中给出被覆盖文件的 diff 摘要。
- 反例：2026-11-14 用 `Copy-Item` 覆盖仓库根 `GOVERNANCE.md`（既有 2,306 B 英文治理文档），靠 `git checkout` 才恢复。

**N5【历史截断声明】——早于 git 下限的断言必须标注**
引用早于本地 git 可考范围的事实，必须写成"**可取证下限 + 推断**"两段。禁止把推断写成结论。仓库为浅克隆时，须在材料中写明下限日期。
- 判据：历史断言的句式包含"至少 N 天（某日 commit 可考）"或"可取证下限 / 推断"字样。
- 反例：把"解码器缺陷存在四个月"当结论 —— 本地 git 仅回溯至 2026-10-28，四个月是推断。

---

## 增补纪律 N6–N9（2026-11-15 生效）

**N6【CI 红先定位步骤，再下结论】**
报告"某个 job 红了"之前，必须先给出**红在第几步**与日志末行。同一个 job 里"测试会话死掉"与"覆盖率低于地板"是两种完全不同的事故，处置相反。
- 判据：结论中带 step 名 + 关键日志行；时长异常（远快于正常）本身即为线索。
- 反例：2026-11-15 把 `coverage` 红读成"覆盖率跌了"，实际是第 5 步 `Run the merged coverage session` 失败（`no report written`），没走到阈值判定；同一 commit 的下一个 commit 反而绿，说明不是覆盖率问题。

**N7【配置默认值不得吞掉显式零】**
`x = cfg.x || DEFAULT` 会把 `0` / `''` / `false` 当"没传"，使配置**无法表达关闭**。默认值一律用 `??`，或 `typeof === 'number' && Number.isFinite(...)` 判型；概率夹紧 `[0,1]`，区间保证 `max >= min`。
- 判据：新增回归测试必须能区分"传 0"与"不传"，且抽样次数足以暴露残留概率（例：残留 2% 时抽 500 次，期望失败约 10 次）。
- 反例：`traffic-shaping.js` 传 `dropProbability: 0` 仍按 0.02 丢包，隐匿至 #493；暴露它的是错误信息里的 `0.02` 与构造参数 `0` 不一致。

**N8【"检查项全绿"不等于"可合并"】**
`check-runs` 与 `merge API` 是两套门禁，不能互相代证。合并被拒时**先读 API 正文**，不要只看计数。
- 判据：`mergeable_state` 与 `check-runs` 双清 + 合并请求返回 2xx；405 正文含 `A conversation must be resolved` 时，走 GraphQL 查 `reviewThreads{isResolved}` 并逐条 resolve。
- 反例：2026-11-15 PR #491 的 bad=0、状态 `clean`，首次合并仍 405；根因是 CodeQL bot 的 thread 未解决，**修掉告警不会自动 resolve**（thread 变 `outdated=true` 仍 `isResolved=false`）。

**N9【Required check 不得配 `paths:` 过滤】**
被设为必需的门禁，其 workflow **不得**在 `pull_request` 上加 `paths:` 过滤；并且它上报的 context 名必须是**这个 workflow 一定会在每个 PR 上产出的那个名字**。
- 机制：`paths:` 不匹配 → workflow 不触发 → 必需检查永远 "expected" → 该仓库**所有** PR 永久 BLOCKED（merge API 返回 405 `Required status check "X" is expected.`）。
- 正解：去掉过滤，新增一个**总是运行**的汇总 job（`if: always()`，`needs:` 全部重 job），由它在无密码学改动时直接报成功、有改动时汇总重 job 结果；scope job 无法判断时**必须报红**（fail-closed），不得升级为结果未知即放行。
- 判据：`gh api repos/{o}/{r}/commits/{sha}/check-runs` 里能看到**该 context 本身**；且在一个只改 `docs/` 的 PR 上也在数十秒内出现且为绿。
- context 名匹配规则：job 有 `name:` 则用 `name:`，无 `name:` 则用 job id；**顶层 `name:` 不会替四个子 job 生成同名 context**。
- 反例：2026-11-15 把 `KAT-Regression` 设为必需，但 `kat-regression.yml` 的四个 job 分别叫 `mlkem-kat` / `fml-dsa-kat` / `gm-standards` / `integrity-and-keccak`，且带 `paths:` 过滤 → 文档 PR #496 被永久锁住（实测四个 commit 的 check-runs 均无此名）。

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

## 附录 B：口径登记表

**数字唯一来源：`docs/metrics.json`。** 本附录不再列数值，避免两处漂移（N3）。

- 查看当前值：`node -e "console.log(require('./docs/metrics.json').metrics)"`
- 校验一致性：`node scripts/check-metrics.cjs`（CI 已在 `node-test` 三平台执行）
- 改数字的流程：先改 `docs/metrics.json`（带 scope/date/command），再让派生文档引用它；禁止直接在 Markdown 里改数字。

| 指标名 | 说明 |
|:---|:---|
| `tsr.files` / `tsr.uniqueTokens` | RFC 3161 `.tsr` 文件数与 sha256 去重后的唯一令牌数 |
| `tsq.files` / `tsq.uniqueTokens` | `.tsq` 同上 |
| `tla.c2.generated` / `tla.c2.distinct` | TLC 实跑状态数；两个数必须成对引用 |
| `scorecard.score` | OpenSSF Scorecard 官方 API |
| `openssf.silverMUST` | Best Practices Silver 已举证的 MUST 条数 |

---

## 附录 C：CodeQL 代码注入告警处置记录（2026-11-15）

> 记录目的：证明"高危类别告警"在本仓是**修掉**而非 dismiss 掉的，且修法可复现。

**告警**：`js/code-injection` @ `.github/workflows/release-verify.yml:61`（PR #488 引入时被 CodeQL 拦下，CI 显示 BLOCKED 而非 fail，需读 check-run annotations 才看到真因）。

**形态**：`run:` 块内直接插值 `${{ github.event.workflow_run.head_branch }}`。该字段来自外部（分支名/tag 名可由任何有推送权的人构造），而该 job 持有 `issues: write`，等价于把外部字符串送进 shell。

**修法（三层）**：
1. 事件值一律经 `env:` 传入，在 bash 内以 `"$REF"` 引用，`run:` 块内 `${{` 命中数 **0**；
2. `package` / `version` 再过字符集白名单（`^[a-z0-9][a-z0-9._-]*$` 一类），拒绝路径穿越与元字符；
3. 解析逻辑抽成 `resolve.sh`，可脱离 Actions 单独跑。

**验收（负向为主）**：`resolve.sh` 四场景 —— 正规 tag `v0.1.0-fml-dsa` → `fml-dsa/0.1.0`；非 tag ref（`main`）回落 `package.json` 版本；dispatch 显式输入；**恶意 ref 与恶意 version 均被拒（rc=1）且无注入产物**。另：YAML 用 js-yaml 解析通过、文件 5,977 B 无 BOM。

**同批处置**：`js/unused-local-variable`（`keygen.js:13` 的 `decompose`）同样**直接删除**，不 dismiss；删除后 `origin/main` 上 `code-scanning/alerts?state=open` = **0**。

**固化规则 R-CI-1**：`${{ }}` 只允许出现在 `env:` / `with:` / `if:`；**禁止出现在 `run:` 块内**。新增或修改 workflow 时必须人工核一次（`grep -n '\${{' <workflow> | grep -A0 'run:'` 不足以判，须按 step 逐块看）。

---

## 20. 平台开关、门禁契约与生成物（2026-11-19）

这一节是一次结算：一小时内连续出现「API 显示已开、行为没有」「门禁全绿、文案还错」「生成物说 374、树里 364」。共同点不是谁不仔细，而是**把"读到的东西"当成了"发生的事"**。

### 20.1 开关显示 enabled 不等于生效

`fibemate-core` 的 `secret_scanning` 与 `secret_scanning_push_protection` 回读均为 `enabled`，open alerts 为 0。随后三次真实推送全部成功、未产生任何 alert：

| 探针 | 内容 | 结果 |
|:---|:---|:---|
| 1 | `AKIA` 形态假 AWS key | 推送成功 |
| 2 | 手写 `-----BEGIN RSA PRIVATE KEY-----` 块 | 推送成功 |
| 3 | `crypto.generateKeyPairSync` 生成的结构合法 RSA-2048 PKCS#1 | 推送成功 |

**判据**：安全开关必须做**行为验证**，回读字段只能证明"设置被保存"，不能证明"策略被执行"。

**反向教训同样重要**：探针本身必须可被检出。前两次的假 key 校验和/结构不合法，即使 push protection 正常工作也不会拦——若只用它们就下结论，会得出错误的"未生效"。所以第三次换成结构合法的私钥。**测试无效与功能无效必须分开证明。**

现状记 `unbound (behaviour not confirmed)`：public 仓、无 GHAS 门槛、开关为 enabled，但既不拦也不告警，根因未定位。

### 20.2 HTTP 200 可能是空操作

对 8 个仓 PATCH `secret_scanning_validity_checks` 与 `secret_scanning_non_provider_patterns`：**HTTP 200**，回读仍为 `disabled`；换成完整 JSON body 复测，结果相同。

**纪律**：写操作一律"写后回读断言"，不一致即 `NOT IN EFFECT`，不得以状态码当成功。这与「部署假绿」同族——脚本 PASS 不等于新代码生效。

### 20.3 计数器输出的字段名是下游门禁的契约

给 `count-tsr.cjs` 增加内容分类时，把 `files` 改名为 `raw`。结果 `check-tsr-copy.cjs` 报 17 条 `DRIFT: found 374, expected undefined`——**门禁没坏，契约被破坏了**。

**纪律**：改输出 schema 前先跑依赖它的门禁，并确认它**仍能点名报错**；保留旧字段作为别名比"改干净"安全。

### 20.4 门禁通过不等于覆盖完整

删掉 10 个非令牌、数字全部改成 364 之后，文案门禁是绿的；但 `git grep` 还有 **6 处**仍在用旧数字：

```
N 个 `.tsr` / N 份</strong> RFC 3161 / <strong>N</strong> 份 RFC 3161
N 份 TSR / N 份存证文件 / N 行，与本节同口径
```

原规则只认"份 + .tsr"一种形态。补 8 条规则后，负向控制是把 README 改回 374，门禁必须变红并点名 `files-zh-个-dot-tsr`。

**纪律**：数字门禁要按**文案形态**而非"数字本身"建规则；新增规则必须附一次必红的负向控制。

### 20.5 门禁自测的 fixture 不得硬编码被测数值

`check-tsr-copy.cjs --self-test` 的 fixture 写着 374/261/113/222：数字一改，**改对了反而红**，此时最容易发生的事就是为了消红去放宽断言。

**修法**：fixture 从计数器取值；legacy 用例**故意**用 basename 数冒充令牌数（那正是它要模拟的 bug）。

### 20.6 生成物必须对"树"校验

`docs/tsa/timestamp-manifest.json` 自 2026-09-04 起冻结在 256 行，无人发现；删掉 10 个文件后门禁才报 `dead rows: 10`。

**纪律**：删除或新增 tracked 文件后必须重生成 manifest；门禁要断言 `rows == tracked`，而不是只断言"文件存在"。

### 20.7 先定位"哪一层拦的"，再改那一层

`fibemate.link` 的 443 被重置，第一假设是 stream 的 SNI map 缺条目。实测推翻：

```
nginx -T             → map 中有 fibemate.link → 127.0.0.1:8443
服务器本机 :443       → 证书链完整、TLS1.3 建立
服务器 → 公网 IP:443  → 同样正常
客户端 HTTP :80       → 403, Server: Beaver, title: Non-compliance ICP Filing
```

**结论**：阿里云备案拦截，不是 nginx。`.link` 不在可备案后缀范围内，改 map 永远不会修好——正解是换域、前置 CDN，或迁出大陆节点。

**纪律**：跨越"客户端 / 中间设备 / 服务端"三段取证，禁止用一端的证据给另一端定性；先证明在哪一层被拦，再动那一层的配置。
