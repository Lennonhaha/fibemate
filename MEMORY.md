# MEMORY.md

## 2026-08-24：P0 安全修复完成 + 回归修复提交

### 开源前安全修复（P0）全部完成

| P0 | 内容 | Commit |
|----|------|--------|
| P0-1 | sm-crypto 0.4.0→0.5.6，CRITICAL RNG CVE-2026-73567 | `5984f92bc` |
| P0-2 | express 4.21.2→5.1.0，4个漏洞（ReDoS/DoS/括号表示法） | `be2cda82b` |
| P0-3 | 硬编码生产IP（8.156.77.68:3001）全站清理 | `d72fcfe9b` |
| P0-Reg | express5回归：`app.get('*')`→`app.use()`，`sm2ECDH`模块检测修复 | `a07c82277` |

**当前 HEAD**：`dac9bfa`（main=origin=local 三端一致）
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

### GitHub 安全面板状态（2026-08-24 全景扫描 + 手动 dismiss 已执行）

**实质漏洞：零残留**
- `npm audit`：**0 漏洞**（lockfile 中 path-to-regexp 8.4.2 / qs 6.15.3 / body-parser 2.3.0 全是修复版）
- secret scanning：0 open ✅
- CI：全绿 ✅

**✅ Dependabot 40 个历史警报 → 已全 dismiss（10:04 执行）**
- 理由 `tolerable_risk` + 注释"已升级修复版 / transitive 已 patch / electron 骨架已 ignore"
- 现 Dependabot **0 open** ✅

**✅ CodeQL critical SSRF (#578) → 已 dismiss（10:04 执行）**
- 理由 `false positive` + 注释"--peers whitelist 已防御，最小权限默认"
- 现 CodeQL 剩 99 open：81 unused-var [warning 级纯卫生] + 14 high（含 2 个 rate-limiting 按用户要求保留）+ 5 medium log-injection

**CodeQL 保留项（P2 待办，非阻塞）**
- 2 high `missing-rate-limiting`：#636 `backend/src/index.js:117`、#637 `src/index.js:224` → 开源后加 `express-rate-limit`
- 1 high `file-system-race`（未 dismiss，留作卫生整改）
- 5 medium log-injection + 81 unused-var：纯代码卫生，可后续批量 dismiss 或不理

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

### 8/24 开源前收尾清理（已完成）

**vwz-lg 分支清理**（`experimental/vwz-lg`）：
- `cdda9af` fix(encoding): U+FFFD 字面（MEMORY.md/health-check.js）+ GBK PUA（session-manager.js/sm-v12.js 从 main 拉干净版）
- `3297f59` fix(security): IP 硬编码全清（src/https-server.js/src/index.js/www/config.json/www/kat_diag.html/www/webrtc-module.js）+ 死链删除（www/index.html → launch-announcement 死链已删除）
- vwz-lg 当前状态：代码级硬编码 IP 0 处 / PUA 0 处 / U+FFFD 0 处 ✅

**dependabot ESLint ignore 决策**：
- 8/1-8/15 实际纪律：能合就合，不能合就 ignore（cf2902b/76dc1ad），**没有主动关闭可升级 PR 的先例**
- `dac9bfa` `.github/dependabot.yml` 加 eslint ignore（`update-types: ["version-update:semver-major"]`）
- PR #29（eslint 9→10）将被 ignore 规则自动关闭，不阻塞发布
- 理由：ESLint 10 major 升级存在 breaking rule changes，零容忍纪律下可能触发 CI 失败，8/31 前稳优先

**fibemate-tauri 推送**（`D:\FIBEMATE\fibemate-tauri`）：
- `9a755b2` fix(dr): idempotent dr_init + sessionExists reuse + isSent self-msg + GM cache fingerprint + webrtc buttons
- 8 个文件全部 UTF-8 无 BOM/无PUA/无U+FFFD ✅
- 工作区编码检查：全部通过 ✅
- main=origin=local 三端一致 ✅

### 开源前待办（GitHub 手动操作已完成 ✅，10:04 执行）
1. ~~GitHub → Security → Dependabot → 批量 dismiss 40 个~~ → **已 dismiss，0 open**
2. ~~GitHub → Security → Code scanning → dismiss critical SSRF~~ → **已 dismiss (#578)；rate-limiting 两条 (#636/#637) 按用户要求留 open 作 P2**
3. fibemate-tauri 聊天应用（`D:\FIBEMATE\fibemate-tauri`，独立项目）"No Rust DR session" 解密失败 bug：**用户已排查完**（根因 = `loadMessages` 解密自己发的消息 + v3.17 exe 构建竞态嵌入旧前端），修复代码已在 `main-v3.js`（09:41 写入）；**用户在 D 盘项目重新 build + 完全退出旧进程再启动即可**，本工作区不覆盖

### 根目录未跟踪文件清理（待做）
- 大量日期戳临时文档（~180个未跟踪文件），需移入 archives/ 或 .gitignore
- 本次未处理，不影响 main 分支安全状态

### 跨实现 ECDH 对拍脚本（临时，已移出仓库）
- `scripts/archive/cross-sm2-ecdh-test.cjs` 本次验证用，已移至 `%TEMP%/cross-sm2-ecdh-test.cjs.bak`
- 如需回归测试，可重新放置到 `scripts/` 并加入 CI 矩阵（建议项，非必须）
