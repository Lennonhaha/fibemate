# CodeQL 253 条告警审计 + P0 修复（2026-08-15）

## 最终 HEAD：`4785b92c`（三端一致）

## 一、CodeQL 告警真实全景（推翻多轮二手快照）

用 gh API 全量分页拉取（直到 Link header 无 next），真实数据：

| 严重性 | 数量 |
|:---:|:---:|
| error | 8 |
| warning | 105 |
| note | 140 |
| **合计** | **253** |

此前会话里「25 条」「100 条」都是分页截断/筛选视图。`per_page=100` 恰好截断在 #316，漏掉编号更小的老告警。

### 8 条 error 级完整清单与判定

| # | 类型 | 位置 | 判定 |
|:---:|:---|:---|:---:|
| #578 | js/request-forgery (SSRF) | mixnet/mix-node.js:104 | ✅ 真漏洞，已修 |
| #582 | js/log-injection | mixnet/mix-node.js:100 | 低危 |
| #581 | js/log-injection | mixnet/mix-node.js:69 | 低危 |
| #580 | js/log-injection | mixnet/healthcheck.js:47 | 低危 |
| #123 | js/user-controlled-bypass | src/index.js:448 | ❌ 误报 |
| #122 | js/user-controlled-bypass | backend/src/index.js:240 | ❌ 误报 |
| #37 | js/type-confusion-through-parameter-tampering | src/index.js:997 | ❌ 误报 |
| #36 | js/type-confusion-through-parameter-tampering | backend/src/index.js:838 | ❌ 误报 |

### 误报判定依据（读了源码）

- **#123/#122 user-controlled-bypass**：WebSocket 握手 `if (msg.type !== 'auth')` 只是消息路由分支，真正的安全决策是 `jwt.verify(msg.token, SECRET)`。CodeQL 无法理解 JWT 签名验证才是信任根。
- **#37/#36 type-confusion**：`const { q } = req.query; if (!q || q.length < 2)` 之后 `q` 只用于 `String.includes()`，无 SQL/路径/命令拼接。即使 q 是数组，最坏结果也是搜索返回空。

## 二、P0 修复（已提交）

### 1. 2 个 JS 语法 bug（真 bug，非安全，导致页面 JS 中断）

| 文件 | 错误 | 修复 |
|:---|:---|:---|
| www/app.html:581 | `'window.location.origin + '/api''`（引号提前闭合） | `window.location.origin + '/api'` |
| www/settings.html:447 | `... || 'window.location.origin + '/api''` | `... || (window.location.origin + '/api')` |

根因：历史编辑把正确写法写坏成单引号包裹，`'/api'` 的内层单引号提前闭合外层字符串。

### 2. SSRF 白名单（#578，真漏洞）

`mixnet/mix-node.js` `forwardToNextHop` 原来 `nextHop` 直接来自 `req.body` 拼进 `fetch(http://${nextHop}/relay)`，零校验。

修复：正则严格匹配 `host:port` 格式 + host 必须在 `--peers` 白名单内，否则 403：

```js
const allowedHosts = new Set(PEERS.map((p) => String(p).split(':')[0]));
const hopMatch = /^([A-Za-z0-9._-]+):(\d{1,5})$/.exec(String(nextHop));
if (!hopMatch || !allowedHosts.has(hopMatch[1])) {
  return originalRes.status(403).json({ status: 'error', error: 'Invalid nextHop' });
}
```

安全设计：无 `--peers` 配置时 `allowedHosts` 为空 → 拒绝一切转发（最小权限默认）。

**不破坏 benchmark 的验证**：`mixnet/benchmark.sh` 用的是 `http://127.0.0.1:9001`（带协议前缀，走 `/health`），不触发 `/relay` 转发路径，白名单校验不影响。

## 三、剩余告警处理计划

| 类别 | 数量 | 处理 |
|:---|:---:|:---|
| missing-rate-limiting | 55 | 8/31 后加 express-rate-limit |
| syntax-error（引号 bug 已修 2，剩 tsa 存档页） | 6 | 存档页不动（历史存证） |
| log-injection（#580-582） | 3 | 低危，可选顺手修 |
| 误报 + 噪音 | ~190 | 批量 dismiss |

## 四、验证

- `node --check mixnet/mix-node.js` ✅ 通过
- 两个 html 的 `<script>` 块用 `new Function` 解析 ✅ 通过
- 文件字节 U+FFFD=0（UTF-8 干净）
- 三端 HEAD = `4785b92c`

## 五、遗留待办

1. 8/31 后：#30 noble 0.7.0 + #29 eslint 10.x 合并（见 docs/REMINDER.md）
2. 8/31 后：55 条 missing-rate-limiting 加 express-rate-limit
3. 误报批量 dismiss（#123/#122/#37/#36 及大部分 warning）
4. 服务器 origin remote 暴露的 PAT token 轮换
