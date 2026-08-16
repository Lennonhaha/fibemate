# 官网回退事件记录（2026-08-16）

## 事件概述

官网 `fibemate.net` 内容一度「滚动回 7 月 21/22 日」的旧版本，用户发现后排查修复。

## 根因

服务器 `/opt/fibemate-repo`（nginx root = `www/`）的 git 工作区被切到了 `experimental/vwz-lg` 研究线分支，而该分支从 `2026-07-22 17:32` 分叉，其 `www/index.html` 停留在 `2026-07-22 16:14` 的旧版本。nginx 直接服务了研究线分支的旧 `www/` 内容。

## 时间线（服务器 reflog 实证，+0800）

| 时间 | 事件 | 官网状态 |
|:---|:---|:---|
| 08-16 06:28:59 | `checkout main → vwz-lg` | ⚠️ 回退至 7-22 旧版 |
| 08-16 06:34:33 | `checkout vwz-lg → main` | ✅ 恢复（短暂） |
| 08-16 08:56:27 | `checkout main → experimental/vwz-lg` | ⚠️ 再次回退 |
| 08-16 08:56:29 | `pull` 研究线分支（fast-forward → c001031b） | ⚠️ 停留在研究线 |
| 08-16 09:09:12 | `checkout → main` + `reset origin/main` | ✅ 恢复最新 |

**持续暴露时长约 13 分钟**（08:56 → 09:09）。此前 06:28 还有一次约 6 分钟的短暂回退。

## 修复

```
git checkout main
git reset --hard origin/main   # → ada13019
```

验证：服务器分支=main、HEAD=ada13019（与本地/GitHub 一致）、官网首页含 CARS 77.30 + 8/31 倒计时。

## 教训

1. **生产服务器（nginx root）做完分支切换实验后，必须显式 `git checkout main` 并确认 `git branch --show-current` 输出为 main**，不能假设上一个动作已切回。
2. 生产服务器的分支状态，应与本地/远程仓库一样纳入「三端一致」检查。
3. 触发背景：昨天到今天早上做 LG v2.3 测试 + VWZ 文件归位时，在服务器反复切分支，最后一次 checkout 研究线分支后忘记切回。
