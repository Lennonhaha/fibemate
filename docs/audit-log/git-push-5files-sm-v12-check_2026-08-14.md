# 5 文件推送 + sm-v12 重复性确认（2026-08-14 10:32 CST）

## 结论
1. **5 个编码修复文件已推送到 GitHub**，本地 == 远端 == `e8955b170`。
2. **sm-v12.js 与 session-manager.js 不是重复副本**（大小与哈希均不同），按选 A 保留现状。

## 关键发现（执行前现场核验，纠正了此前认知）

### 提交早已存在
- 5 个文件（double-ratchet-pq.js / TIMESTAMP-MANIFEST.md / FAQ.html / sm2-frontend-verification.html / timestamps/index.html）**早已在本地提交**，commit = `e8955b170`。
- `git diff HEAD -- <5 files>` 为空 → 无未提交改动；`git status` 里这 5 个文件根本不在改动列表。
- 所以「待提交」是误判——实际是「已提交但未推送」。

### 远端确实落后
- GitHub 线上 main 指向 `b12757d2b`（上一条 ci 提交）。
- `git merge-base --is-ancestor e8955b170 b12757d2b` → NO，即 `e8955b170` 未在远端。
- 本地领先远端恰好 1 个提交：`b12757d2b..HEAD = e8955b170`。

### 推送路径（沿用 TOOLS.md 已验证通道）
- 环境坑：`origin` 是带 token 的 HTTPS 别名、`github-ssh` 别名强制映射 443（`ssh://git@github.com:443/...`），而 QMTAP 虚拟网卡阻断 443。
- 用端口 22 显式覆盖成功：
  ```powershell
  $env:GIT_SSH_COMMAND = "ssh -p 22 -o StrictHostKeyChecking=no"
  git push ssh://git@github.com/Lennonhaha/fibemate.git main
  ```
- 结果：`b12757d2b..e8955b170 main -> main`。
- PowerShell 把 stderr（dependabot 45 漏洞提示）当 RemoteException 报 exit 1，但 `main -> main` 那行证明推送成功——与 TOOLS.md 记录的「误报」一致。
- 复核：`git ls-remote origin main` = `e8955b170...` ✅ 三端一致。

## sm-v12.js 重复性核验
| 文件 | 大小(字节) | MD5 |
|------|-----------|-----|
| www/sm-v12.js | 22534 | 1332F9EFE9A1F5E720B5A0A345445B4F |
| www/session-manager.js | 26631 | 841A84D9FD7E26D43D26785C8420F05C |

- **结论：不同文件**，大小差 ~4KB、哈希不同。
- sm-v12.js 更可能是 session-manager.js 的旧版/变体，但**非精确副本**。
- 两个不可逆文件（中文注释乱码但功能正常）维持选 A：保留现状，不删除不覆盖。

## 后续待办（提醒）
- 两个不可逆文件若将来要「判断是否删除」，需进一步 diff 内容确认 sm-v12.js 是否被 session-manager.js 完全取代（本次仅确认非副本，未做功能覆盖分析）。
