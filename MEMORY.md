# MEMORY.md

## 2026-08-24：P0 安全修复完成 + 回归修复提交

### 开源前安全修复（P0）全部完成

| P0 | 内容 | Commit |
|----|------|--------|
| P0-1 | sm-crypto 0.4.0→0.5.6，CRITICAL RNG CVE-2026-73567 | `5984f92bc` |
| P0-2 | express 4.21.2→5.1.0，4个漏洞（ReDoS/DoS/括号表示法） | `be2cda82b` |
| P0-3 | 硬编码生产IP（8.156.77.68:3001）全站清理 | `d72fcfe9b` |
| P0-Reg | express5回归：`app.get('*')`→`app.use()`，`sm2ECDH`模块检测修复 | `a07c82277` |

**当前 HEAD**：`099033247`（main=origin=local 三端一致）
- `099033247` docs: record P1 SM2 ECDH interop verification (all 3 concerns resolved)
- `40d611b52` docs: MEMORY.md 更新（kat_diag 编码根因）
- `9db551da4` fix(ci): 修复 kat_diag.html BOM+PUA 乱码导致 CI 红
- `8c76c7546` docs: MEMORY.md 更新
- `db6cc9f0b` 空提交，触发 Dependabot 重新扫描
- `f5d5de137` MEMORY.md 重建（无凭证）
- `a07c82277` 回归修复（express5 + sm2ECDH）
- 本地 `npm audit` 确认 **0 漏洞**
- 本地全 CI 脚本跑通（sm2/sm3/sm4/mlkem KAT + keccak/fibemate test + lint + bom/encoding check）

### 回归修复详情（a07c82277）

**Express 5 启动崩溃**：path-to-regexp v8 不接受裸 `*`，`src/index.js` 和 `backend/src/index.js` 改为 `app.use()`

**hybrid-kem-client.js sm2ECDH**：
- `window.SM2Browser` 优先检测（浏览器端）
- Node.js：尝试 `sm-crypto/src/sm2/utils.js` 的 `getGlobalCurve`，fallback 到 jsbn 硬编码 SM2 曲线参数
- `sm2-browser.bundle.js`：暴露 `getGlobalCurve()` 和 `_BigInteger()` 供 ECDH 使用

### ✅ P1 互操作验收（2026-08-24 实测闭环）

**P1-1 SM2 KDF 两端一致性 ✅ 已闭环**
- 服务端 `src/pqc-hybrid-server.js`：`require('../sm2-bigint-ec.js')`，`sm2EcdhCompute` 返回 `shared.x`（64 hex = 32B 裸 x）
- 前端 `www/crypto/hybrid-kem-client.js` `sm2ECDH`：返回 `x.slice(0,32)`（裸 x）
- **跨实现对拍**：服务端 BigInt 实现 vs 前端 bundle `getGlobalCurve`+`_BigInteger`，ECDH 共享 x **完全一致**（`b38b9b18...3bdc`）。
- 结论：两端都是裸 x ECDH，HKDF（`mixSessionKey`，salt=TLS session id, info=`FIBEMATE_SM2_MLKEM_HYBRID_v1`）在两端相同 → session key 必然一致，「消息互通」前提成立。

**P1-2 Node 兜底分支（jsbn）✅ 死代码，不触发**
- `require('jsbn')` 仅导出 `['default','BigInteger','SecureRandom']`，**无** `ECPointFp`/`ECCurveFp` → 该兜底分支若走到必崩。
- `hybrid-kem-client.js` 先尝试 `require.resolve('sm-crypto')` → `node_modules/sm-crypto/src/sm2/utils.js`，`getGlobalCurve` 为 `function` → **走 sm-crypto 自带曲线，jsbn 兜底永不触发**。

**P1-3 HTML 加载路径 ✅ 加载的是 bundle**
- `gm-chat.html` L276：`'/crypto/sm2-browser.bundle.js'`
- `gm-test.html` L50：`{ src: '/crypto/sm2-browser.bundle.js', check: () => typeof SM2Browser !== 'undefined' }`

### MEMORY.md 安全删除
- `f1c81b58e` 已将 MEMORY.md 从仓库删除（内含 SSH 指纹/server IP，公开仓库不能放）
- 本地 MEMORY.md 同步删除重建，仅保留关键上下文，不含任何凭证

### GitHub 安全面板状态（2026-08-24 全景扫描）

**实质漏洞：零残留**
- `npm audit`：**0 漏洞**（lockfile 中 path-to-regexp 8.4.2 / qs 6.15.3 / body-parser 2.3.0 全是修复版）
- secret scanning：0 open ✅
- CI：全绿 ✅

**Dependabot 40 个历史警报（无需修复）**
- 全是历史残留未自动关闭：ignore 列表里的 electron@`tools/pqc-desktop`（未完成骨架）、path-to-regexp/qs/body-parser/brace-expansion/express（已在 ignore 且 lockfile 已是修复版）
- ignore 机制不自动关闭历史警报，需手动 dismiss（GitHub 操作，非代码修复）
- **操作**：GitHub → Security → Dependabot alerts → 批量 dismiss，理由填"已升级修复版 / 已 ignore"

**CodeQL 30 个 open alerts（需关注）**
- 1 **critical** `request-forgery` @ `mixnet/mix-node.js`：**代码已防御**（`--peers` 白名单 + 无 peers 时拒绝一切转发），8/14 修复前告警残留 → 建议 dismiss 并注明"已在 whitelist 修复"
- 14 **high**：`missing-rate-limiting`（`src/index.js:230`、`backend/src/index.js:127`）+ `file-system-race`（1 处）→ **rate-limiting 是真实 P2 待办**，开源后加 `express-rate-limit`
- 5 **medium**：log-injection + unused-var（纯代码卫生，建议开源后清理）

### GitHub 推送通道（已验证）
- `$env:GIT_SSH_COMMAND="ssh -p 22 -o StrictHostKeyChecking=no"; git push git@github.com:Lennonhaha/fibemate.git <ref>:refs/heads/main`
- Port 22 SSH 实测通，443/HTTPS 被 QMTAP 阻断

### ⚠️ CI 失败根因（已修复）
- **现象**：CI 红，bom-check + encoding-check job FAIL
- **根因**：commit `6c85ffa1b` 用 PowerShell `>`/Set-Content 方式重存文件，导致 `www/kat_diag.html` 被加了 **UTF-8 BOM (EF BB BF)** + 中文二次损坏成 **PUA 乱码 (U+E1BD 等)**
- **修复**：`git checkout d72fcfe9b -- www/kat_diag.html` 还原父版本干净字节 → Node `fs.writeFileSync` 删掉硬编码 IP 注释行 → 无 BOM 写回 → check-bom/check-encoding 通过
- **教训**：改中文文件绝不用 PowerShell `>`/Set-Content；用 `node -e "fs.writeFileSync(p, s, 'utf8')"`，'utf8' 不写 BOM

### kat_diag.html 勘误（无乱码）
- MEMORY.md 先前记录"娴嬭瘯璇婃柇 pre-existing double-encoding"是**误判**——PowerShell GBK 代码页解释 UTF-8 字节时的**显示伪影**，真实字符是「测试诊断」，文件字节正确（0 PUA，size=4403B）
- GitHub Actions CI `check-encoding.cjs` 报告 OK，**无需任何修改**

### 开源前待办（5 分钟 GitHub 操作，非代码修复）
1. GitHub → Security → Dependabot → 批量 dismiss 40 个历史警报
2. GitHub → Security → Code scanning → dismiss critical SSRF（已修复）；rate-limiting 两条留 P2
3. fibemate-tauri 聊天应用（`D:\FIBEMATE\fibemate-tauri`，独立项目）"No Rust DR session" 解密失败 bug 待落地——与 GitHub 平台仓库无关

### 根目录未跟踪文件清理（待做）
- 大量日期戳临时文档（~180个未跟踪文件），需移入 archives/ 或 .gitignore
- 本次未处理，不影响 main 分支安全状态

### 跨实现 ECDH 对拍脚本（临时，已移出仓库）
- `scripts/archive/cross-sm2-ecdh-test.cjs` 本次验证用，已移至 `%TEMP%/cross-sm2-ecdh-test.cjs.bak`
- 如需回归测试，可重新放置到 `scripts/` 并加入 CI 矩阵（建议项，非必须）
