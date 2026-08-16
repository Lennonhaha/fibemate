# 分支治理收尾记录（2026-08-16）

## 目标

用户要求：处理分支问题，保证 `main`（生产线）与 `experimental/vwz-lg`（研究线）不冲突、不混淆、文件不丢失。

## 诊断结论

### 分支拓扑（治理前）

本地有 4 个 remote 指向不同步：
- `origin`（HTTPS token）
- `github-ssh`（SSH 443，被 QMTAP 阻断）
- `server`（ssh://fibemate:443）
- 孤儿 ref `gh/main`（指向 8-05 旧提交 `c5c3908ca`）

main 与 experimental/vwz-lg 分叉自 `917ed3978`（2026-07-22），各自独立演进：main 领先 486 提交，experimental 领先 19 提交。

### 核心问题

1. **服务器 `experimental/vwz-lg` 落后 4 提交**（`693a18dc` vs GitHub `4188ece08`），缺 lg-v2.3 Stage-1/Stage-2 的 premix.rs/opcode.rs/vm.rs/pipeline.rs 新源码 → 研究线文件在服务器不完整
2. **服务器 4 个冗余/歧义分支**：`vwz-lg`（旧别名）、`master`（旧分支）、`origin/main`（本地分支名，非 remote-tracking）
3. **本地孤儿 ref** `gh/main`（8-05 旧提交）
4. **本地 `master` 分支**残留

### 文件完整性核验（关键）

- **不会丢失**：lg-v2.3 全套 10 源码文件、attack/ 13 脚本、visualization/ 4 文件、services/ 3 文件都在 GitHub `experimental/vwz-lg` 分支完整保存
- **根目录散落文件是旧副本**：`lg-v3-src/`（5 文件）比已跟踪 `experimental/vwz-lg/lg-v2.3/src/`（10 文件）旧，缺 Stage-2 的 4 个新文件；`lg-v3-cargo.toml` 也有 3 处落后。这些是开发中间产物，无独有内容，可安全清理
- **main 上的 vwz 文件是正确遗留**：`www/vwz-tensor/*`、`www/lg-tensor/*`、`docs/vwz-*.md` 是生产线可视化+文档，不该删

## 执行动作

1. 服务器 `experimental/vwz-lg` 同步到 `4188ece08`（用 HTTPS，443 通；SSH 22 认证失败因服务器无 GitHub key）
2. 服务器删除冗余分支：`vwz-lg`、`master`、`origin/main`（均确认被包含，0 独有提交）
3. 本地删除孤儿 ref `gh/main` + 清理 server remote 陈旧 ref（9 个）
4. 治理记录归档：`docs/audit-log/branch-discipline-violation_20260816.md` → main
5. 三个 LG 研究记录归档：`lg-stage1/lg-v2.3-stage1/lg-v2.3-stage2_20260816.md` → `experimental/vwz-lg/docs/`
6. 本地删除 `master` 分支

## 提交

```
main:
  bd4def194 docs: archive branch-discipline cleanup record (main/experimental separation)
experimental/vwz-lg:
  498a86120 docs(vwz-lg): archive LG v2.3 Stage-1/Stage-2 development records
```

## 最终三端状态

| 分支 | 本地 | GitHub | 服务器 |
|:---|:---|:---|:---|
| main | `bd4def194` | `bd4def194` | `bd4def19` |
| experimental/vwz-lg | `498a86120` | `498a86120` | `498a8612` |

本地分支只剩 `main` + `experimental/vwz-lg` 两个，工作区干净。

## 遗留观察（非阻塞，8/31 后处理）

- 服务器仍有 18 个 untracked 文件（`.branch-switch-backup/`、`rust/`、`www/papers/`、`www/FUNDING.yml` 等），是之前记录的「磁盘先行」部署产物，与分支治理无关
- experimental 分支工作区根目录散落大量 untracked 文件（旧 lg-v3 副本 + 200+ 临时脚本），不影响 git 跟踪的规范版本，8/31 后统一清理
- 服务器 origin 是 HTTPS 带 PAT token（`gho_Lau7...`），之前 REMINDER 已记录需轮换，仍未处理
