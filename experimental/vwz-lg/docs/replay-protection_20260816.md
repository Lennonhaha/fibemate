# 重放保护中间件实施记录（2026-08-16）

## 目标

在 `experimental/vwz-lg` 研究线分支实现服务端重放保护，不触碰 main（冻结期红线）。

## 决策（A-A-B）

| 问题 | 决策 |
|:---|:---|
| 依赖方案 | A：手写 Map（零新依赖，与现有 `rateLimitMiddleware` 一致） |
| 保护范围 | A：只保护写操作（POST/PUT/DELETE/PATCH） |
| X-Request-Id 来源 | B：强制客户端提供，缺失即 400 |

## 关键核实（动手前）

1. **`lru-cache` v11 是 ESM-only**，项目是 CommonJS（`require`），直接装会报 `require() of ES Module`。改用项目已有的 Map 模式。
2. **`src/index.js` 已有 `rateLimitMiddleware`**（Map 版限流，ip→count）。重放保护是不同语义（requestId→timestamp），可共存。
3. **路径修正**：`mixnet/mix-node.js` 真实存在（非 `entry/server.js`），nonce 在 `req.body.nonce`（非 header）。
4. **文件编码**：`src/index.js`（57576B）和 `mixnet/mix-node.js`（4785B）都是纯 UTF-8 无 BOM，中文注释完好。之前 `git show` 乱码是 PowerShell 显示层 GBK 误读。

## 实现

### src/index.js（+34 行）

- `replayProtection` 中间件：手写 `seenRequestIds` Map + `setInterval` 清理（5 分钟 TTL）
- 只保护写操作，GET 放行
- 缺失 X-Request-Id → 400 MISSING_REQUEST_ID
- 重复 → 425 REPLAY_DETECTED
- 挂载 `app.use('/api/', replayProtection)`，位置在 `replayProtection` 定义后、第一个 `/api/*` 路由（`app.post('/api/auth/refresh'`）前

### mixnet/mix-node.js（+25 行）

- `seenNonces` Map + `setInterval` 清理（10 分钟 TTL）
- `isNonceReplayed(nonce)`：空 nonce 不拦截（向后兼容）
- `/relay` 路由开头检查，重放 → 425 REPLAY_DETECTED

## 验证

- `node --check src/index.js` → 通过
- `vm.Script` 语法检查两文件 → OK
- 编码检查：U+FFFD = 0（无损坏）
- 逻辑测试 `_test_replay_logic.js`：10/10 通过（重放检测、写操作过滤、TTL、空 nonce 兼容）

## 提交

- `0efb56905`：feat(security): add replay protection middleware (write ops) + mixnet nonce cache
- 分支：`experimental/vwz-lg`，已推送（`67b1a81b9..0efb56905`）

## 后续（8/31 后合并 main）

- 重放保护属于服务端安全增强，不涉 PQC 核心，8/31 后评估是否合并 main
- 注意：全局 `app.use('/api/', replayProtection)` 要求所有写操作客户端提供 X-Request-Id，合并前需确认上游网关/客户端已注入该 header，否则会 400
- 生产环境建议：Map 是内存态，多实例部署需换成 Redis 等共享存储（当前单实例够用）
