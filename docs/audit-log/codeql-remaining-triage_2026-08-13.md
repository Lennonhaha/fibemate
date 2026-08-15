# CodeQL 剩余告警分级清单 — 2026-08-13

## 已处理（已推 main）
| commit | 内容 | 消除告警 |
|--------|------|---------|
| e6ba995c2 | 全局限流 600/15min + 登录严格 30/15min | ~57 条 missing-rate-limiting |
| c832be2fe | 原型污染防护（db 层 hasOwnProperty） | 2 条 Critical type-confusion |

CI/CodeQL/Repolinter/Scorecard 四道门禁全绿，无回归。

## 剩余待处理（按真实风险分级）

### 🔴 P1 — 前端私钥明文存储（真·敏感，重构级）
- **告警**：`#44/#45/#46 clear-text-storage` @ `www/crypto/pq-integration.js:219`、`www/zk-snarks.js:369`
- **文件位置**：**main 分支**（非实验分支！纠正此前误判"在 experimental/vwz-lg"）
- **真实内容**：`localStorage.setItem('pq_${conversationId}', { kemKeypair.secretKey, hybridSecret })` —— ML-KEM 私钥 + 混合会话密钥明文落盘
- **危害**：XSS 或本机恶意脚本可读走双棘轮私钥，破解历史会话
- **正确修法**：WebCrypto `extractable:false` CryptoKey + IndexedDB，或至少加密落盘（密钥派生自用户口令）。**非一行可改，是前端密钥管理重构**
- **工作量**：2-3 小时
- **建议**：8/20-8/25 之间专门做，不占 P0

### 🟡 P2 — backend HSTS 关闭
- **告警**：`#105/#106 insecure-helmet-configuration`
- **位置**：`backend/src/index.js:44` `hsts: false`（对比 `src/index.js` 是 `hsts: preload:true`）
- **危害**：backend 若直接暴露 HTTPS 则缺 HSTS 保护
- **需先确认**：backend 是否仅被 nginx 反代（若反代，HSTS 应在 nginx 层，风险低）
- **修法**：`hsts: { maxAge: 31536000, preload: true }` 对齐 src/index.js
- **工作量**：5 分钟

### 🟠 P2 — XSS（innerHTML 拼接）
- **告警**：`#30~#34 xss-through-dom` @ gm-chat.html / app.js / contacts.js / settings.js
- **真实内容**：`innerHTML += ...${msg}` 无 escapeHtml
- **需先确认**：这些页面是官网演示（demo）还是生产在用
- **修法**：统一 escapeHtml 工具函数 + 替换拼接点
- **工作量**：30-60 分钟

### ⚪ 低风险 — zk-snarks 存储（近似误报）
- **告警**：`#46` @ zk-snarks.js:369
- **真实内容**：存 `salt` + `commitment`（承诺值本就公开），注释已标 "encrypted in production"
- **危害**：远低于 pq-integration 的私钥
- **建议**：可 dismiss 或低优先级处理

### ⚪ 噪声/误报（建议 dismiss）
- `[doc]` 标记 HTML 内嵌 JS（~9 条）— 非生产代码
- `#463 loop-bound-injection` @ ml-kem-768.js — KEM 内部循环，非用户输入
- `#470 insecure-randomness` @ gm.js:266 — Math.random 仅拼 sessionId，密钥在 :265 用 getRandomValues
- `#104/#515 disabling-certificate-validation` — wss-test.js（测试）+ pqc-detector.js（探测工具本就该禁）
- `#4 py/insecure-temporary-file` @ tools/tsa_cn.py — 工具脚本
- `#66/#67 missing-rate-limiting` @ sms-routes.js — 已有内部 IP 限流，CodeQL 未识别

## 结论
- **8/31 不阻塞**：全部剩余告警均不阻塞开源发布
- **真正要做的只有 P1（pq-integration 私钥）**，且建议 8/20-8/25 做
- **P2 三项**（backend HSTS / XSS / zk-snarks）各有前置确认或可 dismiss
- 噪声 ~15 条建议直接 dismiss，减少 CodeQL 页面噪音
