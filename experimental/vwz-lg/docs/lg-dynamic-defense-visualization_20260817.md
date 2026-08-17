# LG v2.4-dynamic 运行态防御可视化 — 交付记录

日期：2026-08-17
分支：`experimental/vwz-lg`（研究线，不进 main）
提交：`e1223c8eb` → rebase 后 `4b34d81e8`（基于远程最新 `f2afd1b3` 之上）

## 背景与方向校正

外部 AI 提出「代码结构可视化（LLVM CFG 对比）」+「运行态可视化」两方向。经核实：

- **否决 LLVM CFG 对比**：LG v2.4-dynamic 是 **Rust 源码级混淆 + WASM 编译目标**，编译过程**没有 LLVM IR 层**，拿不到 CFG 来做混淆前后对比。该方向对 LG 架构不成立。
- **采纳运行态可视化**：三条贴合真实代码。

## 交付物

`experimental/vwz-lg/visualization/lg-dynamic-defense.html`（单文件，18KB，自包含无外部依赖）

三个 Canvas 可视化面板 + 交互控制台，**全部对应真实源码**：

| 面板 | 对应源码 | 真实 API/常量 |
|---|---|---|
| ① 反调试状态机 | `defense.rs` | `lgv3_defense_configure(level,flags)`、`MODE_NORMAL/MODE_POISONING`、`BASELINE_MIN_SAMPLES=4`、`DEFAULT_POISON_AFTER=3` |
| ② dynamic_path 轨迹 | `wreath.rs` | `dynamic_path_mode(session_key, li)` 逐层 Standard/Substitute，XorShift64 复现逐层选择 |
| ③ ChaCha8 密封层熵值 | `chacha8.rs`/`seal.rs` | `CHACHA_ROUNDS=8`、`lgv3_sealed_obfuscate()` |
| 交互控制台 | — | `lgv3_defense_status()`、`lgv3_session_diff_ratio()` |

交互：正常运行 / 模拟调试附加（timing 异常）/ 模拟内存篡改（FNV-1a mismatch），演示「异常累积 → 达 poison_after 阈值 → 静默投毒（mode 0→1，输出损坏但不崩溃）」。

## 诚实声明（页面顶部固定）

LookingGlass 是混淆引擎，**不提供密码学安全保证**，不增强 LWE 格硬度，默认关闭、永不进入生产加密路径。

## 技术要点

1. **git 提交坑**：`.gitignore` 裸规则忽略 `experimental/`，新文件必须 `git add -f` 强制跟踪（同 Stage-1 `premix.rs` 漏提交教训）。
2. **分支分叉处理**：推送时发现远程有外部 AI（monkeycode-ai）推的 `f2afd1b3`（diffuse GF(256) 查表优化 4.4x），与本地可视化提交改不同文件，无冲突，`git rebase FETCH_HEAD` 干净变基。
3. **推送通道**：SSH 22 端口（`GIT_SSH_COMMAND="ssh -p 22"`），exit 1 是 GitHub dependabot 45 漏洞提示误报，实际 `f2afd1b3b..4b34d81e8` 已推上。
4. **MEMORY.md stash**：rebase 前 stash 了 MEMORY.md 的行尾符差异（内容等价），rebase 后 pop 冲突，确认内容已包含后 drop 掉，无信息丢失。

## 验证

- JS 语法：`new Function` 验证 OK
- 编码：U+FFFD = 0（中文完好，无 GBK 损坏）
- 三端：本地 HEAD `4b34d81e8` == GitHub 远程 `4b34d81e8`（服务器不部署研究线）

## 待办（冻结期 8/31 后）

- 可视化暂为静态演示，未接真实 WASM 绑定；8/31 后若需「动起来」，接入 `www/noble-pq-bundle` 或 lg-v2.3 编译产物
- 不进入 main，仅研究线展示用
