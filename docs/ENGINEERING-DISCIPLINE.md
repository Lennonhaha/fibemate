# FIBEMATE 工程与合规防假绿制度（v1.1）

- **性质**：`GOVERNANCE.md` 的**工程执行附件**（治理模型、角色、决策、继承仍以 `GOVERNANCE.md` 为准）
- **制定**：2026-11-14（v1.0 由参谋长起草；v1.1 经六条补丁与三条硬约束修订）
- **适用**：核心开发、运维、行政、对外披露全流程
- **宗旨**：不假装完整，不掩盖错误；用机器约束机器，用证据约束言论
- **效力**：与本文件冲突的口头/聊天记录一律无效；本文件与 `TOOLS.md` 冲突时，操作细节以 `TOOLS.md` 为准，原则以本文件为准
---

## 总纲：四条判据（2026-11-20 立）

这四条不是四件事，是同一个错误在四个层面上的名字：**把"看起来对"当成"证明过"**。

**一、缓存不是事实。**
一个 404、一个旧百分比、一个变红的徽章，可能来自 CDN 或浏览器缓存里的负响应。判据不是"我打开看到什么"，而是响应头（`X-Cache`、`Age`、`ETag`）加一次带 `?v=<ts>` 的破缓存复测。两者不一致时，以破缓存后的那一份为准，并把缓存行为本身当成待排查对象。（D24，§20.11）

**二、易腐字段不是证据。**
提交数、覆盖率、检查项数量、日期、"published at commit …"这类字段，写进对外文案的那一刻就开始过期。对外只能做相对表述（"截至最近一次发布记录"），或由 CI 从唯一数据源渲染。硬编码的数字不是证据，是需要维护的负债。（D25，§20.12）

**三、合并不是部署。**
PR 合进 main、CI 全绿、release 打包成功，都不等于线上在跑这段代码。判据有三层：进程内一致（`/health` 的 build 与 served 相同）、树一致（served 是 runtime head 的祖先）、以及"这一版真的服务了流量"。任何一层缺证据，就只能说"已合并"，不能说"已部署"。（D26，§20.13）

**四、报告不是现状。**
巡检报告、看板、issue 列表，都是某个时刻的快照。把它们当成现在的状态，就会把已完成的事报成待办、把别人的提交算进自己的窗口、把 7 个仓当成全部 23 个仓。判据：每个状态字段现取、时间窗半开且写清边界、仓库集合动态枚举并交叉核对、失败计数写明是 run 还是 job。（D27，§20.14）

---

**四条共同的判据**：动手判断之前，先写下**"验的是哪个对象、哪个时刻、哪个集合"**。写不出这三个坐标的验证，红绿都不算数。

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

### 20.8 数字要锚定语境，裸数字会误伤（部署前置检查的来历）

部署 24dd535 时前置检查写的是"新树里不得出现 374"：

```
new_tree 364_hits=17 374_hits=4
ABORT: new tree homepage numbers wrong
trap: rc=1
ROLLBACK -> 686131c
rolled back and reloaded
```

4 个命中全是真的合法内容：DOI `zenodo.23637405`（两处）、一段 sha256 里的 `...cb374e`、一个 DigiCert 序列号 `...E3743A1`。数量本身是对的，判据错了。

改成锚定计数短语 `/364\s*份/` 后通过（`364-fen=15 374-fen=0`）。

**纪律**：凡是"某数字不得出现"的检查，必须写成"该数字+它的语境"（`364 份`、`374 份`），不许裸匹配数字。裸匹配的假红比漏检更糟——它会训练人跳过红灯。此次价值在于：**检查失败时自动回滚，证明部署链不是盲发**。

### 20.9 日期是会漂移的第三类（数字对、时点错）

#595 把公开数字全改成 364，门禁全绿；同一天线上英文 meta 仍写 `measured 2026-11-17`。门禁比数字，不比日期。

修法不是"人工记得改"，而是 `scripts/check-measured-date.cjs`：任何**同时**满足"提到 TSR 计数"且"日期紧贴 `实测` / `measured`"的行，其日期必须等于 `docs/metrics.json` 的 `updated`。

写这条规则时踩了两个坑，两个都写进了它的自测（8 例）：

1. **第一版比对"该行所有日期"→ 4 处假阳性**：一行里既有 `2026-11-19 实测`，又有 TSA 签发日 `2026-06-26`；另一行是 `最后更新：2026-11-16` 状态栏；还有 lg-069 的审计日 `2026-07-14`。历史事实必须保留自己的日期。
2. **所以判据只能是"与限定词相邻的日期"**，不是"这一行里出现的日期"。测试里专门放了两条互为对照的用例：历史日期+正确测量日 → 放行；历史日期+过期测量日 → 必须报红。

**纪律**：一条门禁的"不报错范围"和"报错范围"同样需要被测试覆盖。只测"该红的红了"，很容易得到一个把历史数据也判红的门禁，然后大家去加豁免标记，直到什么都不检查。

### 20.10 计划不是产出（2026-11-19）

一次真实的自我记录：在对话里报出一份"已完成的复盘台账"，章节、字节数、纪律编号都说得出来，
但文件从未写盘。用户照那份描述表扬，复核时才发现产出是零。

**判据**：一个交付只有三种可核状态，三者必居其一——
1. **文件存在且可读**：给出路径 + 字节数 + 行数，且字节数是读出来的（`fs.readFileSync(...).length`），不是估的；
2. **命令已执行**：给出退出码，以及输出里的关键一行；
3. **远端已改变**：给出 PR 号 / comment id / commit SHA。

三者都没有的，一律记 **unbound**，不许记"完成"。

**配套三条**：
- 报"已写入"前回读一次，四项都要有值：字节数、行数、BOM、U+FFFD 计数；
- 报"已提交"前跑 `git rev-parse --short HEAD`；报"已发送"前拿到返回 id；
- 同一份材料里"计划"和"产出"必须分开写，标题里带"计划"的段落不得出现在交付清单里。

**同族**：报 CI 红绿不写 SHA 与事件、`?per_page=1` 取 `length`（分母错觉）、
只看配置不看行为（20.1）、只看退出码不看门禁自己的裁决行（假红）。共同点是一句话：
**用脑子里的结构替代了可复现的事实**。

### 20.11 测量工具同化陷阱：全表同一个答案，先怀疑工具（2026-11-19）

排查 #578 的签发者时，第一版脚本直接对 `.tsr` 跑 `openssl pkcs7 -print_certs`，
364 个令牌**全部**返回"无签名证书"。当时差点写成一条结论：仓库里 263 个令牌都不带证书。

实际是解析失败。这里的 `.tsr` 是 TimeStampResp（外层 PKIStatusInfo + 内层 token），
不是裸 ContentInfo，`pkcs7` 报 `wrong tag` 后退出，脚本把空输出当成"没有证书"：

```
openssl ts -reply -in <file> -token_out -out token.der   # 先解套
openssl pkcs7 -inform DER -in token.der -print_certs -noout
```

修正后的分布是 83 FreeTSA / 18 DigiCert / 263 无内嵌证书，与第一版的"364 全无"完全不是一回事。

**三条判据**：

1. **同一答案 ≠ 一致数据**。一个测量对全部输入给出同一个值（尤其"全部零""全部缺失"），先当成**测量坏了**，
   用一条已知正例做对照（本例：取一个 DigiCert 签发的 lg-090，若它也报"无证书"，工具必然有问题）。
2. **未知 ≠ 否定**。分布表里写 "0"，必须写清是"测得零"还是"读不出来"。前者支持"不存在"，后者只支持"不知道"，
   两者在结论上方向相反。评论 7002435987 第一版写成 "tsa.cn = 0"，已被自己 PATCH 成"无令牌携带 tsa.cn 证书； <!-- tsa-claim-exempt: quotes the pre-fix comment verbatim -->
   263 个签发者不可读"。
3. **解套步骤要留痕**。凡是"格式 XX 解析失败"的路径，把中间产物的字节数打进日志（本例 `token.der` 的大小）；
   没有中间产物大小，"解析成功但内容为空"和"根本没解析"在日志里长得一模一样。

**同族**：分母错觉（20.2）、门禁零覆盖 exit 0、`git grep` 不搜 untracked、
PowerShell 显示层判乱码。共同点是：**工具的输出被当成了事实，而不是被当成了工具的输出**。

**同族判例（HTTP 层，2026-11-19）：缓存过的负响应不是事实。**
OpenSSF Scorecard 徽章地址 `https://api.securityscorecards.dev/projects/github.com/Lennonhaha/fibemate/badge` 在浏览器里显示红色 `invalid repo path`。直接 `curl -I` 得到 **HTTP 404**，但响应头同时是 `X-Cache: HIT` / `Age: 21461`；同一地址加一个破缓存参数（`?v=<timestamp>`）后返回 **200**。仓库没有消失，URL 也没有写错，是 CDN 把此前的一次负查询缓存了六个小时。

**判据**：同一输入在不同时间或不同缓存键下给出相反答案时，先怀疑缓存层，而不是被测量对象。取证要带上 `X-Cache` / `Age` / `ETag`，并用查询参数破缓存复测；只报"404"会把缓存命中写成事实。与 20.11 同族：这一次工具的输出（404）被当成了仓库的状态。

### 20.12 对外文案不得硬编码易腐字段（D25，2026-11-19）

README、站点与 PR 描述里的"published <timestamp> at commit <sha>"每 push 一次就漂移一次。它不是证据，是负债：读者无法判断它对应哪一版树，维护者每次改动都要记得同步。

**判据**：对外文案只写相对表述（例如 `as of the latest published record`），或由 CI 从 `docs/metrics.json` / 上游 API 动态渲染；确需引用某一次具体测量时，把时间与 SHA 放进证据文件或 CI 产物，正文只链接它。

**自检**：`git grep -nE 'published 20[0-9]{2}-[0-9]{2}-[0-9]{2}T|at commit [0-9a-f]{7,40}' -- README.md 'docs/*.md'` 应为 0 命中；历史归档与变更日志需显式 allowlist，且 allowlist 要打印命中数，防止静默增长。

## 20.13 部署对齐门禁（D26，2026-11-20）

"合并了"与"部署了"是两件事，"部署了"与"nginx 服务的是这一版"是第三件。PR #610 让部署脚本自己保证内部一致（`/health` 的 build 与 served 必须相同，否则回滚）；本节管的是外部一致：`/health` 报的提交，是否已经包含部署分支上最新的运行时改动。

**为什么不是"落后 0 就红"**：`prod == PR head` 时 PR 尚未合并，永不可能已部署，恒红；`prod == origin/main` 时合并即违约，文档 PR 也被卡。门禁能约束的是债务上限，不是零落后，故 `N=1` 起步（后按实测上调为 2，理由见下），由自动部署把常态压到 0 之后再收紧。

**规则**

1. `R = git log -1 --format=%H origin/main -- src packages www`。这三个路径必须与 `deploy-release.sh` 的 `verify-tree-sha.cjs --tree` 完全一致，门禁与部署读同一处定义。
2. 判据是祖先关系，不是相等：对齐当且仅当 `git merge-base --is-ancestor "$R" "$SERVED"`。相等判据在中间夹了文档提交时恒红。
3. 债务计数必须带路径过滤：`git rev-list --count "$SERVED".."$R" -- src packages www`。不带过滤会把文档提交记到运行时头上（分母错觉）。
4. 四态，且只有 DRIFT 允许红：`ALIGNED`（debt=0）、`BEHIND`（debt 在预算内，退 0 但日志留痕）、`DRIFT`（debt 超预算）、`UNKNOWN`（传输失败、响应不可解析、SERVED 不属于本仓、两端已分叉）。UNKNOWN 不阻断合并，否则一次生产重启会冻结整个仓库。
5. 读取 `/health` 必须破缓存：加 `?v=<ts>`，并在响应带 `X-Cache: HIT` 或 `Age` 时判 UNKNOWN、重试。缓存过的负响应与缓存过的旧 JSON 都会制造假红或假绿（D24）。
6. 不把当日的 SHA 写进纪律（D25）。本节只写命令，实测值进证据文件或 PR。

**预算现为 2（当日由 1 上调，理由见下）**：main 领先生产一个 commit 是可见债务，不是"绿 = 没问题"。上调的直接原因：一个只改 `www/` 静态页面的合并（`docs/security-limitations.html`）落在 `R` 的 `--tree src packages www` 内，把 debt 从 1 推到 2，门禁按设计变红。这不是回归，是"文档也进 www"这一事实第一次被真正度量到。上调承认的是一类提交（一个 www 改动），不是"落后多少都行"：此后每多一个运行时提交仍会红。设 `--max-debt=0` 的前提依旧是自动部署就位。**手敲 `deploy-release.sh` 在这一条上被明确禁止**：把债务归零的唯一合规路径是 #617 的四步 rollout，不得因为一次变红就提前动生产。判据始终是"债务是否被记录"，不是"灯是否绿"——`BEHIND` 必须打印 `served`、`R`、`debt`、`budget` 四项，缺一项就退化成又一个绿灯。**另一条证据纪律**：本节的 workflow 在 `pull_request` 上跳过，PR 期间全绿只证明"跑过的检查绿"；合并后的 push run 才是第一次真实测量，PR 绿 ≠ 合并后绿，被 skip 的检查等于没证据（D24 的延伸）。
**刻意区分两件事**：内部一致性（build == served）由部署脚本自检；外部一致性（served == R）由本节的门禁测量。两者都要，但不能用同一个检查表达。

**为何推翻"live 检查不 gate PR"**：`nginx-drift.yml` 的既有决定是"生产抖动不能把文档 PR 弄红"，防的是可用性问题变成开发阻塞；本节防的是已合并未部署的运行时债务。共存条件是四态里的 UNKNOWN 不阻断、先非 required 跑一段时间、负向控制证明它会红。在自动部署存在之前设 required，等于把部署债务改写成合并阻断。

**自检**：`node scripts/check-deploy-alignment.cjs --self-test` 必须以 5/5 退出 0，且其中 "a docs commit is not counted as runtime debt" 一条的 debt 必须小于未过滤时的提交数；对真实状态分别跑「低于当前 debt 的预算」与「覆盖当前 debt 的预算」，两者必须给出不同结论（DRIFT 与 BEHIND），否则说明预算参数没有生效。

## 20.14 巡检报告的三种漂移（D27，2026-11-20）

同一天的两份巡检报告，时间线、CI、合并数都对，但有三处状态是错的。三处错误没有一个是「算错」，全部是**读错了对象**：读缓存、读闭区间、读一份写死的仓库清单。

**1. assignee 读缓存 = 把已完成的事报成待办。**
报告 #2 在 19:59 写「#547/#569/#584/#590 无 assignee」，而这四条在 15:51 就已指派完毕。判据：assignee、labels、state 一律用 `gh api` 现取，报告首行必须写 `as of <timestamp>`；任何「上轮缓存 / 上次快照」都不得作为状态来源。**状态类字段的缓存，等于把历史当成现状。**

**2. 窗口必须是半开区间 `[start, end)`。**
报告 #1 把 #610 计入「窗口内 3 PR」，同时自己注明该 PR 合并于右边界后 28 秒。既然越界，就不该计入；要提，就放进单列的「窗口后新增」。判据：`t >= start && t < end`，两端都不含糊；边界外事件另起一节，不混入统计分母。

**3. 仓库必须动态枚举，且枚举本身要被核对。**
报告写「7 个仓」，实际账号下 23 个（10 产品 / 6 fork / 4 归档 / 3 无关 private）。写死清单的后果不是漏报一次，而是**下次它们红了也看不见**。三条实现事实：

- 本账号是 **user 不是 org**，`/orgs/<name>/repos` 直接 404；退到 `/users/<name>/repos` 又会**静默漏掉 private 仓**（`fibemate-vwz` 是 private + archived，正是在这条路径上消失的）。
- 正确入口是 **`/user/repos?affiliation=owner&visibility=all`**，返回 23。
- 枚举完必须与 `gh repo list <name>` 交叉核对，少一个就要红；不能靠「看起来齐了」。

归档仓单列一节、标 `ARCHIVED`，不计入「健康」。把已归档仓标 ✅ 会让人以为还在维护。

**4. 失败计数要说清是 run 还是 job。**
一次真实失败会以两张红牌出现（工作流本身 + 下游 coverage），而一个工作流的多个 job 失败又只算一个 run。报告写「3 个 CI 失败」、按 run 数只有 2 个，两者都不算错，但必须写明口径，否则同一件事会被当成两件事去查。

**自检**

```
node scripts/gh-patrol.cjs --self-test        # 14 条，含三个负向控制
node scripts/gh-patrol.cjs --hours 10         # 实时出报告，exit 1 = 有人要看
```

负向控制必须能证明它会红：把判定从 `t < endMs` 改成 `t <= endMs`，自检必须从 14/14 掉到 13/14 并 exit 1。做不到这一点的自检，只是装饰。

**同族**：20.11（测量工具同化）、20.12（禁硬编码易腐字段）。共同点还是一句话——**先写清「验的是哪个对象、哪个时刻」，再谈红绿**。


## 20.15 加密与密钥交互变更的发版门禁：两台设备，缺一不发（D28，2026-11-22）

3.3.8 的包在本机启动正常、能登录、控制台无异常，但对端发来的消息全部是 `⚠ 解密失败`。根因不在密码学，而在预密钥上传死锁（见 20.16）。真正能证明故障的两条证据，恰好都在**单端看不见**的地方：服务端 `POST /api/auth/update-keys` 计数为 0，服务端保存的 `hybridKeyId` 仍是 2026-10-09 的旧键，而客户端手里是一小时前生成的新键。

**规则**：凡改动密钥的产生、上传、协商或会话建立（预密钥 bundle、KEM、KDF、DR 初始化、会话复用判定），打 tag 前必须完成一次**两台不同设备 + 两个不同账号 + 双向各发一条**的联调，并以服务端状态为客观证据。

**单机双账号不算数**：同机两个实例共享 `device.key`、`sessions.json`、`identity_map.json`，且会触发 `Ignoring self-initiate (peerId === myUid)`。那测的是同一份状态自己跟自己，不能作为跨端证据。

**证据三条，缺一不发**：

1. 两侧 `POST /api/auth/update-keys` 均为 200（服务端访问日志，不是客户端 console）；
2. 服务端存的 `hybridKeyId` 与各自客户端缓存的 keyId 逐字相同（`sqlite3` 查 `users.raw_json`，对照 localStorage）；
3. 双向消息均无 `AEAD decrypt failed`，且会话建立后有实际收发达成。

**顺序门禁**：本地包可以先做，tag 不能早于双端验证。「界面能点发送」「启动没报错」「单机自测通过」都不构成发版依据。发版检查表里必须有这一项，未勾不得打 tag。

## 20.16 单飞 Promise 重入死锁：单端永远测不出来（D29，2026-11-22）

**形态**：去重（single-flight）缓存的持有者 `await` 了一个会回调自己的外部钩子，钩子为了组装完整结果又回来取同一个 Promise，于是双方互等，永远不结束。

```
getMyPreKeyBundle()
  -> ensureHybridPreKey()            单飞 promise 占位，尚未 settle
     -> await _maybeUploadHybridKey()
        -> await 上传回调(entry)      回调由主程序注册
           -> await getMyPreKeyBundle()
              -> ensureHybridPreKey() -> 返回同一个未 settle 的 promise
```

**为什么单端必绿**：没有抛错、没有超时提示、密钥照常生成、界面照常渲染。失败形态是「某件事从未发生」——上传 0 次、标记字段恒为 null。没有外部对照物（服务端计数、数据库字段），它永远是绿的。

**判据**：任何 single-flight / 去重缓存，必须能回答「重入者拿到的是**结果**还是**等待**」。重点审查重入路径上每一个 `await`；只要钩子可能回取同一入口，就不要在持有 promise 时 `await` 它。

**修法优先级**：让重入者不等待（fire-and-forget，或直接把结果作为参数传下去）> 加锁串行 > 超时兜底。去重守卫（如 `_publishingBundle`）只能当第二道保险，不能当主修法——它防的是重复执行，不解除循环等待。

**探针（标准动作）**：用 `Promise.race([调用, N 秒超时])` 把「能返回」本身变成一条断言，再配一条外部计数器（服务端请求数、数据库字段）作对照。两者都绿才算过；只有前者绿，可能只是一次成功的空操作。

**同族**：这是假绿的第六型——失败不是**报错**，而是**没有发生**。与 20.11（工具同化）、20.14（读错对象）同源：先写清「验的是哪个对象、哪个时刻」，再谈红绿。

**自检**：拿本次实测当回归样本——3.3.8 上 `getMyPreKeyBundle()` 在 8 秒内必须不返回、`uploaded` 标记为 `null`、服务端 `update-keys` 计数为 0；3.3.9 上三条必须同时反转（立即返回、标记为当前 keyId、计数 > 0）。只反转其中一条，说明探针本身没验到点上。


## 20.17 乱码扫描器必须自带正负向控制（D30，2026-11-22）

一次乱码巡检里，判定脚本把 CJK 范围写宽，把大量正常中文判成乱码（当轮记录 1686 条误报）；另一版只认 PUA 与 U+FFFD，又会漏掉「整行被二次解码」的损伤。两次都不是扫错文件，而是**判据本身没被验证**。

**规则**：任何「检出某类坏字节」的脚本，落地前必须跑三组控制，缺一组不得引用其结论。

1. **正向控制**：手工注入一个已知坏样本（U+FFFD、行中 U+FEFF、GBK 往返损伤各一），必须被**点名**报出（文件:行号 + 码点）。
2. **负向控制**：一批正常中文与正常符号（`—`、`§`、`ρ`、`é`、全角标点）必须 **0 误报**；扫全仓时误报数就是这条控制的读数。
3. **边界控制**：只应在指定位置命中。例如「行首 BOM」不得把「文件头 BOM」算进去；反过来，允许文件头 BOM 的检查不得因此放过行首 BOM。

**口径**：判定一律走字节，不走终端显示。GBK 显示层会把 BOM 的最后一个字节与相邻 `#` 拼成一个假字符，肉眼看到 `##`，实际是 `BOM + ###`——本轮三处标题正是这样被误读的。

**输出要求**：报「文件:行号 + 具体码点/字节序列」，只给总数的报告不可采信（20.14 同款问题）。

**修法纪律**：能还原就不改写。先去历史里找干净原文（`git log -S`、逐版本比对），确认不可逆才重写措辞，并在 PR 里写明。

**同族**：20.11（工具同化）、20.14（读错对象）。共同点仍是那句——**判据本身也要被检验，否则红绿都不算数**。


## 20.18 多字节文本只走字节通道（D31，2026-11-22）

两个显示层陷阱，同一天各踩一次，两次都差点让人改错东西。

**1. PowerShell 的 `>` 与 `Out-File` 默认写 UTF-16LE。** 用 `gh api ... --jq .body > body.txt` 取回正文，文件里其实是 `h\0e\0` 这种双字节序列；交给严格 UTF-8 读者，立刻报出 8 个 U+FFFD——**全部是管道自己造的**，远端根本没有这么多。判据：先看首字节（`FF FE` 为 UTF-16LE、`EF BB BF` 为 UTF-8 BOM、其他为裸 UTF-8），再谈内容。

**2. GBK 控制台会吞掉 BOM 后的第一个字符。** `BOM + ###` 显示成 `锘?##`：BOM 的最后一个字节 `0xBF` 与后面的 `#`（`0x23`）拼成一个双字节字符，`#` 被吃掉。于是 diff 看上去是「删掉 BOM 后少了一个 `#`」，实际是「恢复成三个 `#`」。按显示判断会得到完全相反的结论——本轮标题数 `143 → 146` 才是正确方向。

**规则**：

1. **写**：`fs.writeFileSync(p, s, 'utf8')`。必须经过 PowerShell 时用 `[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))`，不要用重定向。
2. **读**：`execFileSync(cmd, args, { encoding: 'buffer' })` 配 `new TextDecoder('utf-8', { fatal: true })`。宽容解码会把非法字节悄悄换成 U+FFFD，等于替源数据撒谎。
3. **判**：只用计数与码点——字节数、U+FEFF / U+FFFD / NUL 计数、首三字节、标题或锚点计数。终端显示只服务人眼，不得作为结论依据。
4. **自证**：同一份正文用两种方式各存一次，读者必须在 UTF-16 那份报出 FFFD、在 UTF-8 那份报 0。做不到这一点的读者，不能用来判断别人有没有乱码。

同一句中文（`刘天赫 <research@fibemate.net> — provenance check`）三种写法实测：

```
默认重定向  100 B  首字节 ff fe  严格解码 THROW   宽容解码 5 个 U+FFFD
Out-File -Encoding utf8   62 B  首字节 ef bb bf  严格解码 ok      0 个 U+FFFD
[IO.File]::WriteAllText   57 B  首字节 e9 8d 92  严格解码 ok      0 个 U+FFFD
```

差异全部来自编码，不来自文本。第一行就是「我读到 8 个假乱码」的来源。

**同族**：D30（扫描器先自证）、20.11（工具同化）。共同点是——**先证明「我读到的是数据本身」，再谈数据对错**。
