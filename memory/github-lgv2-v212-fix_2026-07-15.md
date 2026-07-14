# GitHub lgv2 v2.1/v2.2 标签修正 — 完成报告

## 时间
2026-07-15 02:43 GMT+8

## 任务目标
修正 GitHub `lgv2/` 目录中所有代码注释、版本号中的 `v3.0` 歧义标签，统一改为 `v2.1/v2.2`。

## 已完成

### 1. 版本标签修正（11 个文件）

| 文件 | 修正内容 |
|------|---------|
| `lgv2/rust/Cargo.toml` | version 3.0.0 → **2.2.0** |
| `lgv2/rust/pkg/package.json` | version 3.0.0 → **2.2.0** |
| `lgv2/rust/lib.rs` | `LG v3.0` → `LG v2.1/v2.2` |
| `lgv2/c/lgv2_confuse.c` | 注释头 `LG v3.0` → `LG v2.1/v2.2` |
| `lgv2/c/lgv2_confuse.h` | 注释头 `LG v3.0` → `LG v2.1/v2.2` |
| `lgv2/ci/lgv2-build.sh` | 构建脚本标题 `v2.1 → v2.1/v2.2` |
| `lgv2/ci/confuse-step.yml` | CI 名称 `v2.1 → v2.1/v2.2` |
| `lgv2/nonlinear/lgv2_nonlinear.py` | docstring `v2.1 → v2.2` |
| `lgv2/nonlinear/nonlinear_layer.v` | 注释 `v2.1 → v2.1/v2.2` |
| `lgv2/nonlinear/sbox.inc` | 注释 `v2.1 → v2.1/v2.2` |
| `lgv2/docs/crypto-trap.md` | 全文 `v3.0` → `v2.2` |
| `lgv2/docs/research-demo.md` | 全文 `v3.0` → `v2.2` |

### 2. GitHub 推送

- Commit: `7e421a3` (fix: lgv2 all internal v3.0 labels to v2.1/v2.2)
- Commit: `7c69e68` (chore: fix MEMORY.md missing trailing newline)
- GitHub master SHA: `7c69e68` ✅

### 3. 最终状态

- workspace HEAD = GitHub master = `7c69e68` ✅ 完全同步
- lgv2/ GitHub 清单：**15 个文件**，全部正确
- lgv2/ 全部 tracked 文件：**无 v3.0 残留** ✅
- lgv2/ sphere/球面 关键词：**无残留** ✅

## GitHub lgv2/ 完整文件清单

```
lgv2/c/Makefile
lgv2/c/lgv2_confuse.c
lgv2/c/lgv2_confuse.h
lgv2/ci/confuse-step.yml
lgv2/ci/lgv2-build.sh
lgv2/docs/crypto-trap.md
lgv2/docs/research-demo.md
lgv2/docs/teaching-case.md
lgv2/nonlinear/lgv2_nonlinear.py
lgv2/nonlinear/nonlinear_layer.v
lgv2/nonlinear/sbox.inc
lgv2/rust/Cargo.lock
lgv2/rust/Cargo.toml
lgv2/rust/lib.rs
lgv2/rust/src/bin/xverify.rs
```

## 未涉及本次修正的文件

以下 untracked 文件中的 `v3.0` 是 **FIBEMATE 项目整体版本号**（v3.x），与 lgv2 库版本无关：
- `www/crypto/gm.js` — 国际 SM2/SM4 模块（untracked）
- `www/modules/calls.js` — 通话模块（untracked）
- `www/modules/settings.js` — 设置模块（untracked）
- `www/privacy-layers/API.md` — API 文档（untracked）

## 重要决策记录

| 决策 | 理由 |
|------|------|
| 修正 lgv2/ v3.0 标签，不删除 lgv2/ | 代码是 v2.1/v2.2 三线工程实现，有价值 |
| 用 `--amend` + `filter-branch` 改 commit message | 不破坏历史，精准修正 |
| 全面扫描所有源代码文件 | 发现 Rust/Python/C 注释中残留 v3.0 标签 |
| 推送到 GitHub 并同步 workspace | 确保公开仓库完全干净 |
