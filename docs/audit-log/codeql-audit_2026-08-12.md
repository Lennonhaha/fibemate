# CodeQL 告警审计 — 2026-08-12

## 触发
用户贴出 GitHub "Code scanning CodeQL is reporting warnings" 通知的 Critical + High 子集，要求处理。

## 关键纠正（推翻早期记忆）
会话早期总结曾写「CodeQL 13 open、全 Warning 级、零 Critical/High、#515 已加抑制注释无害」——**错误**。

Live API 实测（`_codeql-hi.js`，gh auth token + https 直连 GitHub REST）真实状态：

| security_severity_level | 数量 |
|------|------|
| critical | 2 |
| high | 90 |
| medium | 22 |
| （无级别，note 为主） | 377 |
| **合计 open** | **491** |

原因：之前把「`rule.severity` = error/warning/note 三档」误当「security_severity_level = critical/high/medium/low」；且只抽查了 2 条就下"全清"结论，未跑全量。

## 92 条 Critical+High 分层

### 第一层：真实安全缺陷（少量，需评估修复）
- #36/#37 **type-confusion-through-parameter-tampering** (2 Critical) — `src/index.js` + `backend/src/index.js`，`req.params.userId` 类型混淆
- #105/#106 **insecure-helmet-configuration** (2) — Helmet 中间件配置不安全
- #122/#123 **user-controlled-bypass** (2)
- #126/#127 **remote-property-injection** — `src/db-sqlite.js`
- #44/#45/#46 **clear-text-storage-of-sensitive-data** (3) — `zk-snarks.js`、`pq-integration.js` 明文存敏感数据
- #28 **tainted-format-string**
- #30~#34 **xss-through-dom** (5 非 doc) — gm-chat/app/ui-contacts/settings

### 第二层：缺限流（约 50 条，同一根因）
#47~#103 **missing-rate-limiting**，集中 `src/index.js` + `backend/src/index.js` + `src/sms-routes.js`。一条 express-rate-limit 全局中间件可消掉大半。

### 第三层：噪声/误报/已知无害
- `[doc]` 标记（HTML 内嵌 JS）约 9 条
- #463 **loop-bound-injection** @ ml-kem-768.js:108 — 误报，XofShake.absorb 内部循环，数据流为 KEM 内部派生，非用户输入
- #470 **insecure-randomness** @ gm.js:266 — Math.random 仅用于 sessionId（非密钥），密钥在 :265 用 crypto.getRandomValues
- #104/#515 **disabling-certificate-validation** — wss-test.js（测试）+ pqc-detector.js（探测工具，已加抑制注释）
- #4 **py/insecure-temporary-file** @ tools/tsa_cn.py

## 我造成的告警（诚实记录）
#540~#542 unused-local-variable @ `scripts/test-native-hardened.cjs` — 今天早上违规 push 的硬化测试引入。仅 note 级，但确为我所造成。

## 处置建议（8/31 前，冻结纪律下需用户破例）
1. 真缺陷（type-confusion/helmet/clear-text/xss）→ 建议修，需用户明确破例范围
2. 缺限流 → 一条中间件，低风险高收益
3. 噪声 → dismiss 或标注 reason

## 工具产物
- `_codeql-check.js`（全量 491 条）
- `_codeql-hi.js`（Critical+High 92 条分级）
