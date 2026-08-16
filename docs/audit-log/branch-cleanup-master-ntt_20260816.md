# 分支治理收尾：删除 master + ntt-optimization 分支（2026-08-16）

## 背景

用户发现 GitHub 上有 6 个分支（含 master 残留），要求「不丢失文件」的前提下清理。

## 核实结果

| 分支 | 性质 | 处置 |
|:---|:---|:---|
| `main` | 生产线（权威） | ✅ 保留 |
| `experimental/vwz-lg` | 研究线（VWZ/LG） | ✅ 保留 |
| `master` (18d5b46) | 落后 main 92、领先 0，`git diff main...master` 空 | ❌ 删除 |
| `experimental/ntt-optimization` (388673b) | 领先 main 2 提交，内容已被吸收但 GOVERNANCE.md 中文详细版独有 | ❌ 删除（先归档） |
| `dependabot/*`（2 个） | PR 自动分支 | 自动清理 |

## 关键发现：ntt 分支 GOVERNANCE.md 是独有内容

- ntt 分支 `GOVERNANCE.md` = 474 行 / 5880 字符 / 中文详细版（愿景/定位/组织结构/决策流程/继任/紧急接管/冲突解决）
- main 分支 `GOVERNANCE.md` = 40 行 / 1329 字符 / 英文精简版（BDFN 模型）
- 两者是**同一文件的不同版本**（main 是后来有意重写的英文精简版）
- 3 个治理文档（INCIDENT_RESPONSE_PLAN / PQC_MIGRATION_PLAN / RECOVERY_PLAN）内容完全一致，只是路径不同（ntt 用 `docs/`，main 用 `www/docs/`）

## 执行动作

1. **删除 GitHub master 分支** — 用 SSH 22 端口（HTTPS 443 被 QMTAP 阻断）
2. **归档中文版 GOVERNANCE.md** → `docs/GOVERNANCE.zh-CN.detailed.md`（commit `0dac87c6f`）
3. **删除 GitHub ntt-optimization 分支**
4. **服务器同步 + prune** — `git fetch origin --prune` 清理已删除的 remote-tracking

## 最终状态（三端一致）

| 端 | main | experimental/vwz-lg |
|:---|:---|:---|
| 本地 | `0dac87c6f` | `c001031b8` |
| GitHub | `0dac87c6f` | `c001031b8` |
| 服务器 | `0dac87c6` | `c001031b` |

GitHub 分支清单（最终 4 个）：
- `main`
- `experimental/vwz-lg`
- `dependabot/npm_and_yarn/eslint-10.8.1`（#29 自动）
- `dependabot/npm_and_yarn/noble/post-quantum-0.7.0`（#30 自动）

## 教训

1. 删除分支前必须 `git diff main...<branch>` 确认 0 独有内容（master 通过）
2. 实验分支可能藏着「同名文件的不同版本」（GOVERNANCE.md），需逐个文件核对内容而非只看路径
3. PowerShell `-eq` 比较数组（`git show` 多行输出）会误报「内容有差异」，需用 node 脚本精确比对
4. HTTPS 443 被 QMTAP 阻断时，push/delete 一律走 SSH 22（`$env:GIT_SSH_COMMAND="ssh -p 22 ..."`）
