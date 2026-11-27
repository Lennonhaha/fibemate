# 动作有效性考核制度（基础版 v0.1）

- 状态：草案，待评审入仓
- 日期：2026-11-27
- 适用范围：FIBEMATE 主仓与工具线四仓（fibemate / fibemate-tools / fibemate-tauri / fibemate-core）
- 来源说明：本文依据 2026-11 的实战记录起草，不是任何旧稿的复刻；案例均可回指到 run id、commit 或文件行。
- 定位：项目已有 verifact 管「文档里的数字」，本制度补的是「动作本身是否产生约束力」这一层。

---

## 1. 要解决的问题

一个动作可以「执行了」而「没有效果」，并且从记录上看不出区别。2026-11 在本项目内实际出现过五种形态，全部有据可查：

| 形态 | 表现 | 本项目实例 |
|---|---|---|
| 装饰性 | 声明存在，但从不运行，或从不红且无「能红」证据 | tauri `do-not-merge` 12 runs 全绿（2026-11-26 前） |
| 假绿 | 记录是绿的，但检查集合为空或不检查目标 | #733：workflow 缺 `types:`，51 SUCCESS 而 guard 未执行；`markdown-link-check ... \|\| true`；wrapper 末尾硬编码 `exit 0` |
| 口径漂移 | 声明与事实脱节，且无人修正（含反向） | `PROGRESS.md` 停在 08-15、`STATUS.md` 停在 08-31；core release run 红但发布成功 |
| 无增量 | 反复执行，状态与证据零变化 | 无增量却反复跑 verifact（推迟两次，无到期日） |
| 静默失败 | 接口返回成功，实际未生效 | `PATCH security_and_analysis` 返回 200，`validity_checks` 仍 disabled（2026-11-27） |

判据一句话：**不看动作有没有跑，看它能不能让目标错误变红，以及变了之后有没有留下可回读的差异。**

---

## 2. 记账制：每个动作三行

```
ACTION:   做了什么（一句话，含对象与范围）
EVIDENCE: 可回指的证据位（run id / commit / 文件:行号 / API 字段）
DELTA:    状态改变量（X → Y）；无变化写 no-op + 原因
```

- 无 `DELTA` 的动作连续两次后，第三次必须给出「预期增量的到期日」；到期未产出，动作冻结并升级人工。
- `EVIDENCE` 必须是可回读的坐标，不是结论。「已验证」不算证据，「run 45856596493 pass」才算。
- 同一动作重复执行但状态未变，记 no-op，不记成功。

---

## 3. 门禁义务（对 check 与 workflow）

### 3.1 进 required 之前必须能红

任何 check 进入 required 前，必须满足以下之一：

1. 最近 90 天内有至少一次真实 failure，且失败原因正是它要拦的东西；
2. 一次人工注入式红绿冒烟，记录两次 run id（红、绿各一）。

缺证据的 required check 标记 `DECORATIVE`，限期 7 天补证，逾期降级为非 required 或删除。

本项目的合格样例：tauri `do-not-merge`（PR #122，run `45856596493` pass → `45856637455` fail → `45856706232` pass），失败日志原文命中 `::error::This PR carries the do-not-merge label`。

### 3.2 cancelled 不是 pass

- required check 只接受 `conclusion == success`；
- `cancelled`、`skipped`、`neutral`、`stale` 一律不视为通过；
- workflow 里带 `if: cancelled()` 的 job 必须在名字或输出中标注 advisory，不得计入覆盖；
- 取消重跑后，判据取「最后一次针对该 head 的 run」，不是任意一次绿。

### 3.3 skipped 需要书面依据

每个 skipped job 必须能映射到 `paths:` filter、显式 `if:` 条件或已知的平台限制。无依据的 skip 计入假绿。skip 是要记账的动作，不是免费通道。

### 3.4 检测类必须做注入演练

crash/完整性检测类（Fuzz、KAT、evidence-immutable、编码门禁）每季度做一次注入演练：故意放入一个已知缺陷样本，证明它真能红，然后移除。演练记录写 run id 与样本摘要。

### 3.5 负向自证

新门禁必须自带一个「必须变红」的用例，且输出要点名具体对象（`UNLISTED <url>`、`DRIFT <path>`、`MISSING <context>`）。只报数字不报名单的，不可作为覆盖证据。

---

## 4. 配置变更判据：2xx 不是证据

任何对仓库设置、ruleset、分支保护、Actions 权限的写操作，按以下四步执行：

1. **写前快照**：`GET` 全文存 `.before.json`，并做前置断言（enforcement、当前项数、目标项不在其中）；
2. **只改一项**：body 只带可写字段，不带只读字段；
3. **写后回读**：重新 `GET`，逐字段 diff，输出 `added / removed / other rules identical`；
4. **不一致即判失败**：HTTP 200 但回读未变，按失败处理并记录为「静默失败」，不重试掩盖。

实例对照：

- 成功：core ruleset `28176261`，写后回读 `contexts=5 missing=[] extra=[] strict=true review=0 thread=true`；
- 失败：`validity_checks` / `non_provider_patterns` 的 PATCH 返回 200，回读仍 `disabled` —— 付费 GHAS 能力，无 license 时静默不生效。此例同时说明：**「开关没开」与「开关开不了」必须区分，前者是工程问题，后者是环境限制。**

---

## 5. 部署判据

部署脚本的 `PASS` 不等于新代码生效。以下断言必须在脚本内，且失败即拒绝部署：

1. **数据软链**：`data/` 必须是指向 `shared/data` 的 symlink，`readlink` 目标逐字比对；`users` 数不得低于下限。
   - 反例：2026-11-18～11-22，多个 release 各自启动了空库，账号全部查不到；登录 401 且耗时仅 1–5 ms（早于 bcrypt 的数百毫秒），而站点、`/health`、pm2 全绿。
2. **运行时一致性**：运行中进程的 `cwd` 与 `lsof` 指向的 db 路径必须符合预期；响应头/版本串必须等于 HEAD。
3. **脚本自 re-exec**：`git reset` 更换脚本后，bash 可能继续跑旧 inode。部署脚本必须检测自身变化并重新执行，或显式跳过该路径。
4. **黑盒判据优先于日志判据**：登录 401 的耗时可区分「查不到用户」（1–5 ms）与「密码错」（≈300–400 ms）。

---

## 6. 触发与覆盖审计（每季度）

输出一张矩阵：`workflow × 最近 90 天 run 数 × 结论分布`。

- **先按 trigger 分类，再判装饰性**：`tag` / `release` / `workflow_dispatch` 触发的发布链，低频是正常；非发布链 0-run 才是装饰性嫌疑。
- **采样窗口会造假**：只看最近 100 runs 会把长周期 workflow 误判为 0-run。本项目实测：`ledger-ci` 44 runs、`release-audit-ci` 34 runs、`interop-matrix-ci` 10 runs —— 「0-run」是窗口假象，不是空跑。
- 0-run 非发布链：补触发路径，或 `state: disabled_manually` 显式停用，不静默闲置。
- run 数 ≥1 但全绿：进入 §3.1 红绿义务评估。

---

## 7. 声明新鲜度

- 文档「最后更新」与 main 最后 commit 偏差 > 14 天，页面顶部挂 `STALE` 横幅（可并入 docs-sync 检查）。
- **反向漂移修正义务**：run 结论与事实不符时必须补一条修正记录（如 `docs/RELEASES.md` 对 v0.1.0 红色 run 的定性），禁止让误导性红/绿长期裸奔。
- 数字类声明交给 verifact；verifact 只判「文档值 vs 产出值」，不判因果。

---

## 8. 人工确认降权

凡机器可验证的事项，人工「我确认过」只作参考，不作验收证据。人工确认的合法用途只剩两类：授权（不可逆动作）、审阅（标签门禁的摘除）。

本项目实证（2026-11-26 一天内三次）：

| 人工确认 | 机器门禁结果 |
|---|---|
| 「钉 SHA，20 分钟零风险」 | 实际是 npm/pip install 未钉哈希 |
| 「PR #739 已确认无夹带」 | `pr-baseline` 抓出 `ALREADY-IN-BASE` |
| 「PR body 里写了 Signed-off-by」 | DCO 只认 commit trailer |

---

## 9. 证据与日志的注入防护

日志和注释里的不可信字符串（分支名、PR 标题、包名、用户输入）不得直接拼进机器可解析的标记：

- 机器读取的证据一律走结构化字段（JSON、API 字段），不 grep 自由文本；
- 必须用文本标记时，固定前缀 + 随机 nonce，解析端校验 nonce；
- 打印前转义换行与控制字符，防止伪造 `::error::`、伪造分隔行；
- 门禁判定取 API 的 `conclusion` / `state`，不取日志里最后一个「PASS」。

理由：一条 PR 标题里的换行就能伪造一整行「检查通过」，而 grep 无法分辨。

---

## 10. 月度指标

| 指标 | 定义 | 目标 |
|---|---|---|
| 能红覆盖率 | 有红记录（真实或冒烟）的 required checks ÷ 全部 required checks | 100% |
| 装饰性数 | 0-run 非发布链 workflow 数 | 0，或逐个显式登记 |
| skip 说明率 | 有书面依据的 skip ÷ 总 skip | 100% |
| 声明漂移 | max(now − 文档 last-updated) | < 14 天 |
| 无增量占比 | no-op 动作 ÷ 总动作 | < 20% |
| 静默失败数 | 写操作 2xx 但回读未变的次数 | 0 |

---

## 11. 奖惩口径

- 主动报告偏差 = 合规（例：删 draft 无存档的自曝、#17 缺 trailer 的自曝），后续报告不得美化或省略；
- 隐瞒、事后改写、把 no-op 包装成增量 = 唯一扣分项；
- 同类偏差首次按「流程学习」记录，重复第二次升级为缺陷；
- 授权先于执行细则到达造成的偏差，指令方与执行方各记一半。

---

## 12. 载体与节奏

1. 本文件入仓位置：`docs/EFFECTIVENESS-AUDIT.md`（评审通过后提交 PR）。
2. 月度脚本：`tools/audit-effectiveness.cjs`，用 `gh api` 计算 §10 六项指标，输出 `effectiveness-report.json`。
3. 基线快照：首次运行的 API 结果存 `evidence/`，后续月报只算 `DELTA`。
4. 季度演练：§3.4 的注入演练结果附在月报后。
5. 三个已闭环项（2026-11-26/27）作为初始基线：ruleset `28176261` 生效、tauri guard 红绿冒烟完成、tools 低频 workflow 口径澄清。

---

## 附：本制度与既有机制的分工

| 机制 | 管什么 | 不管什么 |
|---|---|---|
| verifact | 文档数字 ↔ 产出物数值 | 动作是否有约束力 |
| docs-sync | README 数字 ↔ run 记录 | 门禁能否变红 |
| pr-baseline | PR 是否夹带已入 base 的提交 | workflow 是否真的执行 |
| 本制度 | 动作有效性、门禁能红、配置回读、部署断言 | 密码学正确性（由 KAT/TVLA 负责） |

## Enforced rules (2026-11-27)

These are not aspirational. Each one names the check that fails, and where it runs.

### R1 — A crypto package cannot be published without an external anchor

- `fibemate-core` release workflow runs, before `npm publish`: the 100-record KAT corpus, the 80
  NIST ACVP cases (keyGen / encapsulation / decapsulation / key checks), and a 100-round
  differential against `@noble/post-quantum` in both directions.
- Missing file, failing case, or a skipped step fails the job, so the tag cannot produce a publish.
- Registry truth is asserted after publish: if `npm` has the version but the run reports failure, an
  issue is opened instead of the failure being believed. (2026-11-15: publish succeeded, the confirm
  step read a 404, and the run stayed red for 11 days.)

### R2 — Deployment and configuration must be measured, not assumed

- `nginx-drift` compares three tracked configs against the live host on every PR and on a nightly
  schedule; all four jobs are required checks on `main`.
- The live job holds a key whose forced command is a whitelist reader — it can read three files and
  nothing else. Before 2026-11-27 that key could only read one file, which made a three-file
  comparison silently compare one file three times.
- `deploy-apply` is `workflow_dispatch` only and therefore cannot be a required check: a required
  check that never runs blocks every PR forever. Deploy truth is enforced after the fact by the
  manifest/health alignment assertion and by registry truth in R1.

### R3 — UI regressions that only a human would see must fail in CI

- `fibemate-tauri` runs `scripts/test-client-dom.cjs` on every PR: it mounts the real 2FA and
  conversation-list modules, dispatches the click, and fails on a thrown exception or an unrendered
  badge. The job `ui-dom` is a required check, so a PR that breaks the setup flow cannot merge.
- The harness is a deliberate shim, not a browser. It covers the surfaces these modules touch; it is
  not a claim of end-to-end coverage.

### R4 — Claims and descriptions are part of the build

- `verifact` (drift) and `xdiff` (three-implementation differential) are required checks on `main`.
- `pr-body-gate` requires **Action / Evidence / Delta** in every PR description. Bots are exempt.
- The evidence-binding rate is published as measured (105/1,410 = 7.45% on 2026-11-27), not rounded
  up to "core algorithm fully bound".
