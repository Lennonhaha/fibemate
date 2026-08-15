# MEMORY.md 灾难性损坏发现（2026-08-14 10:45）

## 现状（紧急，无自动修复）

**MEMORY.md（AI 长期记忆文件）从 2026-07-15 起在 committed history 中持续损坏，已推到 GitHub main。**

### 扫描结果（196 个 .md 文件在 HEAD）
- 仅 **MEMORY.md** 损坏（GBK double-misdecode）
- 其他 195 个 .md 文件全部干净

### 时间线（git log MEMORY.md）
| 提交 | 日期 | 大小 | 状态 |
|------|------|-----:|:---:|
| `c52320d8` | 2026-07-14 21:53 | 37406 b | ✅ 干净（最后一次干净） |
| `a585af4e` | 2026-07-14 21:37 | 37216 b | ✅ 干净 |
| `f4a7f5c5` | 2026-07-14 21:16 | 36967 b | ✅ 干净 |
| `baa0ded5` | 2026-07-15 00:07 | 42828 b | ❌ GBK |
| `7c69e687` | 2026-07-15 02:41 | 42829 b | ❌ GBK |
| ... 22 个后续提交 ... | 2026-07-15 ~ 08-05 | 45429→74783 b | ❌ GBK |
| `7b7a2b37` | 2026-08-05 08:28 | 74783 b | ❌ GBK（最新损坏） |

**损坏起点：2026-07-15 00:07 的 `baa0ded52a09` 提交**——同日稍早 `f4a7f5c5` (21:16) 还干净。

### 工作树 vs HEAD 差异
- HEAD MEMORY.md: 74783 b, GBK=true, **含未解决冲突标记 `<<<<<<<`/`=======`/`>>>>>>>`**
- 工作树 MEMORY.md: 88596 b (+13813 b), GBK=true, **含 U+FFFD**
- 这意味着工作树还有"工作树级额外损坏"叠加在已损坏的 HEAD 之上

### 根因（基于 MEMORY.md 自身的 D-14 教训）
- D-14（2026-08-14）已建立的防范：`scripts/check-encoding.cjs` 测 U+FFFD/NUL/无效UTF-8
- **但触发污染的会话比 D-14 防范机制更早**——2026-07-15 那个提交时 CI 没有这个 guard
- `b12757d2b` 修复脚本（08-14）只覆盖新写入，**未修复已 committed 的历史**

### 已知风险
1. **MEMORY.md 是 AI session 唯一长期记忆来源**——损坏会导致 session 间完全失忆
2. **恢复路径单一**：最后干净版本是 `c52320d85` (2026-07-14 21:53)
3. **D-14（8/14）的 8 个 AI turn 之后的全部历史都没了**（fml-dsa KAT/Nightly 2FA/CodeQL/UTF-8 修复等）
4. **直接 git reset 会丢失 24 个 commits**（含 OpenSSF/ROADMAP/2FA 等重要里程碑文档）
5. **已 pushed 到 GitHub**（refs/remotes/origin/main = e8955b170 = HEAD 含损坏）

## 选项（等用户决策，不动）

### 方案 A：接受现状，8/31 开源前不动
- 优点：不动代码、不动历史、不违反冻结纪律
- 缺点：MEMORY.md 仍坏；session 间失去长期记忆能力

### 方案 B：用 `c52320d85` 的干净版本覆盖 MEMORY.md，新增"恢复记录"段
- 优点：MEMORY.md 立即恢复干净；保留大部分历史（commit messages + D-14 之后的 commits）
- 缺点：MEMORY.md 本身失去了损坏期内的事件细节（除非手工回填 D-15~D-19 重要节点）
- 风险：需新 commit，可能要在 8/31 提交之外做

### 方案 C：保留 24 个损坏 commits（不动 main），但重建本地 MEMORY.md 为工作树版本 + 加注释"恢复自 c52320d85 + 摘要"
- 优点：保留历史 commit，MEMORY.md 独立恢复
- 缺点：MEMORY.md 内容与 git log 不一致，需要管理两套真相

### 方案 D：用交互式 rebase 把 24 个损坏的 MEMORY.md 改动逐个 revert 但保留其他文件改动
- 优点：MEMORY.md 历史回到干净状态，代码/其他文档改动保留
- 缺点：rebase 复杂（24 commits）、需强制 push、rebase 后 main 与 origin/main 分叉、可能引发更多问题

## 紧急建议（不强制）
**最稳的路径**：方案 B + 手动重写 D-14 后的关键事件（MEMORY.md 是 AI 记忆，不是用户文档，可重写）：
1. `git checkout c52320d85 -- MEMORY.md`（恢复干净基线）
2. 手工追加"D-15~D-19 关键事件摘要"段（用我之前的 lossless summary fold 内容）
3. 提交："fix(memory): restore MEMORY.md from c52320d85 + append D-15~D-19 summary"
4. 推送

**但用户应先决定，因为：**
- 这本质是"重写 AI 自己的记忆"，权限上需要明确批准
- 8/31 冻结期内是否破例需要确认
- 强制 push 会改写已发布的 GitHub 历史（违反 GitHub 最佳实践，但本项目为单维护者，影响有限）