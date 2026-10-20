# 🛠️ FIBEMATE 共建者指南（CONTRIBUTORS-GUIDE）

> **致未来的共建者：**
> 欢迎来到 FIBEMATE。这不是一个普通的 CRUD 项目，而是一个**后量子密码全栈工程验证平台**。在这里，我们拒绝"差不多就行"，只认证据和机器校验。如果你热爱底层密码学、喜欢极其严谨的工程体系，这里是你最好的靶场。
>
> 本指南是邀请函的工程版：[`CALL-FOR-COLLABORATORS.md`](CALL-FOR-COLLABORATORS.md) 讲我们是谁，本指南讲你来了之后怎么一起干活。规则总则见 [`CONTRIBUTING.md`](../CONTRIBUTING.md)。

**仓库地图**（多仓结构，认准再动手）：

| 仓库 | 内容 |
|---|---|
| `fibemate` | 主仓：协议核心、KAT/TVLA 验证、官网、VWZ 研究线文档 |
| `fibemate-mobile` | Expo 移动端（SM2/SM3/SM4 + ML-KEM/SLH-DSA 混合） |
| `fibemate-react-native` | RN CLI 端 |
| `fibemate-tauri` | Rust/Tauri 桌面端（cargo-deny、CodeQL、Scorecard 三条工作流；分支保护允许单维护者直接合并，无必需检查） |
| `fibemate-tools` | 工具集（verifact 事实哨兵、cbom-tools、crypto-time-ledger） |

---

## 🎯 1. 为什么选择 FIBEMATE？

### 顶配的基建底座

这里的自动化不是装饰品，是门禁。当前实数（2026-10-20 复核）：

- **无假绿测试**：mobile 仓有 **61 条** node:test 用例（4 个文件，静态计数 12/9/34/6），含源码级静态守卫——修复被后续改动悄悄回退，测试会红。（注：61 是源码静态计数，不是 CI 实跑日志的取证结果。）
- **零浮标供应链**：Action 引用钉死 40 位 commit SHA 的实测比数（按仓逐个扫 `.github/workflows/*.yml`）——fibemate **91/0**、mobile **11/0**、tauri **41/0**、tools **26/0**、RN **9/0**（前为钉死数，后为浮标数）。其中 tools 仓原有的 4 处浮标（`codeql.yml` 的 `actions/checkout@v4` 与 `github/codeql-action/{init,autobuild,analyze}@v3`）已钉到具体 SHA。Dependabot 对钉死的 SHA 做生态跟踪，升级必须人工过目。
- **CodeQL 状态如实分仓报**：fibemate、mobile、tools、tauri 当前开放告警均为 **0**（2026-10-20 实测）。RN 仓**尚未启用 CodeQL**（API 返回 `no analysis found`）——这是「没有分析」，不是「没有告警」，不并入 0 的行列。
- **依赖 advisory 门禁**：cargo-deny 在 PR / push / 每周三处触发，vulnerability 一律失败；`deny.toml` **没有 ignore 列表**，靠作用域控制——`unmaintained = "workspace"` / `unsound = "workspace"`，即只对本 workspace 的直接依赖失败。当前 2 条残留（RUSTSEC-2024-0370 proc-macro-error、RUSTSEC-2024-0429 glib）全部来自 tauri 固定的 `gtk ^0.18` 传递依赖，上游无已发布补丁；改成 `all` 模式实测会失败 17 条（2026-10-17 实测），其中 10 条是 gtk-rs GTK3 家族。
- **Scorecard 8.1/10**（2026-10-20T09:26Z，commit `36e0788`，scorecard v5.6.0）。满分项：Maintained、SAST、Fuzzing、CI-Tests、Dangerous-Workflow、Token-Permissions、Security-Policy、Vulnerabilities、Dependency-Update-Tool、License。**失分项如实挂出**：Code-Review **0**（0/28 有审批的变更集）、Branch-Protection **4**（main 未要求审批人 / 未启用 stale review dismissal）、Contributors **3**（仅 1 个贡献组织）、Packaging **-1**（未检测到发布工作流）、Binary-Artifacts **8**（仓库内有两个二进制：`c-stm32/test_tensor_tvla`、`www/crypto/lgv2/lgv2_3_bg.wasm`）、Pinned-Dependencies **8**（Action 全钉死，失分来自 npm/pip/容器镜像层未按 hash 固定）、Signed-Releases **8**（3/3 发布有签名，但缺 provenance）、CII-Best-Practices **5**。不粉饰。

你不需要把精力浪费在修补脆弱的依赖和假装存在的测试上，可以直接切入核心技术。

### 前沿的探索空间

从国密（SM2/SM3/SM4）与 PQC（ML-KEM / ML-DSA / SLH-DSA）的混合协议，到 VWZ 签名方案的形式化验证，再到 FPGA NTT 硬件加速、TVLA 侧信道分析、CBOM 资产盘点——每条线都有足够的深度，且都有已跑起来的验证基线等着你推进。

CBOM 现状要分清两条线：`fibemate-tools/cbom-tools` 已有通过官方 CycloneDX 1.6 schema 校验的产物（27 组件）与官方库交叉验证的 CI；主仓 `scripts/build-cbom.js` 已重写为可复现生成器（路径相对化、9 个密码原语组件、自定义字段走 `fibemate:` 命名空间），产物经 `tools/validate-cbom.cjs` 对官方 1.6 schema 校验通过（旧产物曾有 51 条 schema 错误：字段层级错位 + primitive 大写枚举）。接入 CI 与 release 制品的那一版在 **PR #284** 里，尚在评审——别把「已提 PR」读成「已上线」。

### 证据文化

FIBEMATE 的每条结论都挂在可复现的产物上：测试输出、benchmark 数据、RFC 3161 时间戳（TSR）、完整性清单。写进文档的数字，默认应该有人能按文档里的命令重跑一遍。

---

## 📍 2. 新手村：认路

提 PR 之前，先读这三处，对齐工程基因：

1. **[`CONTRIBUTING.md`](../CONTRIBUTING.md)** —— 规则总则：Issue 格式、AI 辅助贡献的边界（欢迎，但与人工代码同标准，人类贡献者负全责）、review 流程。
2. **[`SECURITY-NOTES.md`](https://github.com/Lennonhaha/fibemate-mobile/blob/main/SECURITY-NOTES.md)**（mobile 仓）—— 安全边界的"诚实纠错簿"。典型样本：对"sm-crypto 静默回退 `Math.random`"的假设被代码级取证推翻（它的行为是抛错；真因是 RN 运行期没有 `getRandomValues`），推翻过程连同证据一起留档。**诚实是这份文档的底色，也是本项目的底色。**
3. **[`docs/adr/`](https://github.com/Lennonhaha/fibemate-tauri/tree/main/docs/adr)**（tauri 仓）—— 架构决策记录：Tauri over Electron、混合后量子密钥协商、双棘轮各自的选择与代价。VWZ 研究线的决策沉淀在义务分级审计（**56 条引理 / 12 条 sorry**，按 T0–T3 分层）与形式化计划文档里。

**工具反常识记录**（每条都是实测踩出来的，省你半天）：目前散落在三处锚点——Workflow 文件头注释（如 `exit 0` 只结束 step 不结束 job）、`deny.toml` 头部（17 条 advisory 的实测口径与取舍）、`docs/deployment.md` §6（`chattr` 双层锁与 `git pull` unlink 失败）。统一的 `TOOLS.md` 汇总中，欢迎认领。

---

## ⚠️ 3. 护城河：不可破坏的机制与纪律

密码学容不得半点沙子和假象。以下红线没有例外：

- **禁止假绿**。所有测试必须真实运行。`passWithNoTests`、"no tests yet -> pass" 这类占位形态是反面教材——mobile 仓曾有一个 432 行的安全测试文件躺了数月没有任何 workflow 在跑，绿灯外形、零门禁实质，已根除。新测试必须接进 CI 并实跑。
- **零浮标（Zero Floating Tags）**。Workflow 里的 Action 引用必须钉死 40 位 commit SHA，`@v4` 这类浮标签禁入。理由：浮动标签的内容可以被推送方随时改写，等于把生产密钥交给一个不可信的变量。
- **供应链两车道，都不许蒙**。运行时依赖的例行升级：CI 全绿 + `dependencies` + `automerge` 双标签齐备，才允许自动合并（job 级门控，step 级 `exit 0` 那种自欺形式已修）。github-actions / SHA 类供应链更新：**禁用自动合并**，必须人工过目。两条车道的目的只有一个——投毒进不来。
- **源码级守卫**。关键安全模块的行为由测试里的断言锁死：比如加密入口 polyfill 必须位于应用入口第一位、熵源模块不得出现无 CSPRNG 的降级路径。这些断言直接读源码断言行文，改动安全加载顺序会让测试变红，不是靠 review 盯。
- **可变状态必须现查**。权限、Secret、分支保护这类状态，不能用几小时前的抽查解释当下的运行结果。
- **判据本身也要被核**。`git cherry` 单独不够、`--short` 给 7 位而非 8 位、`lsattr -R` 输出掺空行——本项目的大多数误判，最后都落在探针自己身上。下结论前先问一句：这个判据本身验证过吗。

---

## 🚀 4. 破冰任务：当前最具价值的贡献方向

按"能立刻上手 × 真实缺口"排序：

1. **VWZ 形式化验证（硬核重头戏）**。证明义务已按 T0–T3 分层，当前实测 **56 条引理 / 12 条 sorry**：T0 纯形式 **17/0**、T1-A 代数公理 **16/0**、T1-D 定义相关义务 **5/2**、T2 线性代数 **10/6**、T3 安全概率 **8/4**（前为引理数，后为 sorry 数）。基线已就绪：Isabelle2025-2 Windows 原生跑通，烟测引理全部构建通过，负向对照（`neg/` 一条假命题）按设计构建失败——证明检查器不是橡皮图章，有机器证据。域表示选型已定：A 层用 `ZMod 3329`（环公理免费），表示层用 `int mod q`。下一步：主攻 T2 的 6 条 sorry（矩阵代数：`mat_mult` 结合律与行变换保可逆是承重墙），再收 T3 的 4 条。
2. **KAT 覆盖补齐（#242 的剩余半句）**。公共 API 已透传 FIPS 204 的 `context` / `extraEntropy`（`8dacb6b`），并用行为对照验证了域分离；但 ACVP 的 `sigGen` / `sigVer` 向量尚未经公共 API 跑过（现有 75/75 只覆盖 KeyGen）。把向量级 KAT 接到 `packages/fml-dsa` 的公共入口，是验收标准明确的贡献。
3. **RN 仓测试门禁（首个 PR 的好起点）**。mobile 仓的 node:test 模式已跑通，RN 仓的 `test` 脚本目前只有 `jest`（无测试文件时是否会静默通过尚待实测）。把 mobile 的测试骨架与 CI 接法搬到 RN 仓，就是一个有明确验收标准的首个贡献。
4. **工具链拓展**。verifact（事实哨兵，发稿前把稿里每条硬数字追到源仓库）、cbom-tools（CBOM 资产盘点）、CARS 引擎（口径统一中）——工具线欢迎新想法与接入。
5. **外部 code review（最被需要的贡献）**。Scorecard 的 Code-Review 检查当前 0/28——单维护者仓库的硬伤，只能靠外部评审补。你的每一个实质性 review，直接变成榜上分数。安全敏感改动请带上超越 AI 输出的人工分析。

---

## 🤝 5. 我们的相处之道

1. **用代码和文档说话**。遇到分歧，甩测试用例或基准数据，不靠争论音量。
2. **容忍错误，但不容忍掩盖**。开源免不了试错；在 FIBEMATE，发现 Bug、或者用证据推翻旧结论，本身就是一种嘉奖——参见 SECURITY-NOTES.md 里被推翻的假设。
3. **先跑证据，再下结论**。包括对"我们一直这么做"的怀疑。

**准备好一起搞点硬核的东西了吗？去提交你的第一个 Issue 或 PR 吧。**
