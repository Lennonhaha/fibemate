# 3 条真实 high 告警深入核查结果

## 日期
2026-08-13 19:06

## 核查对象
1. user-controlled-bypass ×2（src/index.js:448 / backend/src/index.js:240）
2. clear-text-storage ×1（www/crypto/crypto/pq-integration.js:219）

## 结论

### ① user-controlled-bypass（2 条）→ 误报 / 低风险
- 代码：WebSocket 连接 `wss.on('connection')` 里 `let authed = false`，在 `if (!authed)` 分支里用 `jwt.verify(msg.token, CONFIG.JWT_SECRET)` 验证后设 `authed = true`
- CodeQL 误判原因：`authed` 标志位由 `msg.token` 的 JWT 验证结果控制，CodeQL 认为「用户提供的值控制敏感条件」
- 实际情况：`authed = true` 只在 `jwt.verify` 成功、且 `msg.type === 'auth'` 时才设置；验证失败会 throw，不会走到设 authed。鉴权逻辑正确
- 判定：**误报**，无需改动。JWT 签名校验是权威鉴权点，`authed` 只是防重入的状态标志

### ② clear-text-storage（1 条）→ 死副本残留，非活跃代码
- 告警位置 `www/crypto/crypto/pq-integration.js:219` 用 `localStorage.setItem` 明文存 secretKey/hybridSecret
- **关键发现**：存在两个 pq-integration.js 副本：
  - `www/crypto/pq-integration.js`（14622B）— **主副本，已改用 AES-GCM + IndexedDB 加密存储**（`_getWrapKey` + `crypto.subtle.encrypt` + `_idbPut`，第 176-314 行），无 localStorage 明文残留
  - `www/crypto/crypto/pq-integration.js`（11318B）— **旧死副本**，仍是 localStorage 明文
- `www/crypto/crypto/` 目录：git 未跟踪（`git status` 空），且全仓库**无任何活跃页面引用 `crypto/crypto/` 路径**（4 个引用都是 `www/docs/*.html` 里的 `crypto/crypto/` 相对路径，指向的是 `www/docs/crypto/crypto/` 不存在路径，属于死链接）
- 判定：**死副本残留**。真正被 ml-kem-768-wrapper.js 引用的是主副本 `www/crypto/pq-integration.js`（已加密）。

## 处理建议
1. **user-controlled-bypass**：无需改代码，等 CodeQL 重扫或 dismiss（可选）。鉴权逻辑正确。
2. **clear-text-storage**：删除死副本 `www/crypto/crypto/` 目录（2 个文件：ml-kem-768-wrapper.js 6235B + pq-integration.js 11318B）。这是历史遗留的重复副本，主副本已是加密版。
   - 注意：该目录 git 未跟踪，删除不进入 git 历史，纯磁盘清理。
   - 服务器是否也有此目录需同步检查。

## 待用户确认
- 是否删除 `www/crypto/crypto/` 死副本目录（本地 + 服务器）
