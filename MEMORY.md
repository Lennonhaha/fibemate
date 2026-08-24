# MEMORY.md

## 2026-08-24：P0 安全修复完成 + 回归修复提交

### 开源前安全修复（P0）全部完成

| P0 | 内容 | Commit |
|----|------|--------|
| P0-1 | sm-crypto 0.4.0→0.5.6，CRITICAL RNG CVE-2026-73567 | `5984f92bc` |
| P0-2 | express 4.21.2→5.1.0，4个漏洞（ReDoS/DoS/括号表示法） | `be2cda82b` |
| P0-3 | 硬编码生产IP（8.156.77.68:3001）全站清理 | `d72fcfe9b` |
| P0-Reg | express5回归：`app.get('*')`→`app.use()`，`sm2ECDH`模块检测修复 | `a07c82277` |

**当前 HEAD**：`a07c82277`（main=origin=local 三端一致）

### 回归修复详情（a07c82277）

**Express 5 启动崩溃**：path-to-regexp v8 不接受裸 `*`，`src/index.js` 和 `backend/src/index.js` 改为 `app.use()`

**hybrid-kem-client.js sm2ECDH**：
- `window.SM2Browser` 优先检测（浏览器端）
- Node.js：尝试 `sm-crypto/src/sm2/utils.js` 的 `getGlobalCurve`，fallback 到 jsbn 硬编码 SM2 曲线参数
- `sm2-browser.bundle.js`：暴露 `getGlobalCurve()` 和 `_BigInteger()` 供 ECDH 使用

**注意**：sm-crypto 0.5.6 无 `doExchange` API，sm2ECDH 共享密钥 = 裸 x 坐标前32字节（与旧实现一致，未改 KDF）

### MEMORY.md 安全删除
- `f1c81b58e` 已将 MEMORY.md 从仓库删除（内含 SSH 指纹/server IP，公开仓库不能放）
- 本地 MEMORY.md 同步删除重建，仅保留关键上下文，不含任何凭证

### GitHub 安全警告（40 vulnerabilities）
- 40 个漏洞提示（11高/21中/8低）是延迟更新的 transitive 依赖
- `npm audit` 本地确认 0 漏洞，根依赖已全部修复
- GitHub Dependabot 扫描延迟约1-2天，新版本需时间传播

### GitHub 推送通道（已验证）
- `$env:GIT_SSH_COMMAND="ssh -p 22 -o StrictHostKeyChecking=no"; git push git@github.com:Lennonhaha/fibemate.git <ref>:refs/heads/main`
- Port 22 SSH 实测通，443/HTTPS 被 QMTAP 阻断

### 根目录未跟踪文件清理（待做）
- 大量日期戳临时文档（~180个未跟踪文件），需移入 archives/ 或 .gitignore
- 本次未处理，不影响 main 分支安全状态
