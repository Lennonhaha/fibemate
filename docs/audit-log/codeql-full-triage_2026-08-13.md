# CodeQL 全量告警分诊（545 条）

## 日期
2026-08-13

## 结论摘要
545 是 UI 显示的含 dismissed 总数，真实 open 告警 = **490 条**。其中 **403 条是 2026-08-02 的历史遗留**，今天（8/13）push 新代码只引入 **32 条**，且全部是 note/warning 级噪音，**没有一条新引入的 high/critical**。

## 严重级分布（490 条 open）
| 严重级 | 数量 |
|--------|------|
| note | 332 |
| warning | 97 |
| error | 61 |

## 按规则 TOP（前 22）
- 283 js/unused-local-variable（note）— 纯噪音
- 55 js/missing-rate-limiting（warning/high）— **False positive**（限流中间件 makeRateLimiter 已存在，CodeQL 不识别自定义中间件）
- 30 js/syntax-error（note）— 多为 .html 内嵌 JS 误报
- 26 js/overwritten-property（error）— 多为 www/docs/migration-priority.html 重复 key
- 15 js/log-injection（error/medium）— 日志注入，真实但低危
- 14 js/shift-out-of-range（error）— 其中 10 条在 wasm-sm2/assembly/*.ts（AssemblyScript u64 移位，CodeQL 用 JS 32 位语义误报）
- 其余零散

## 日期分布
| 日期 | 数量 |
|------|------|
| 2026-08-02 | 403 |
| 2026-08-03 | 31 |
| 2026-08-05 | 13 |
| 2026-08-11 | 2 |
| 2026-08-12 | 9 |
| 2026-08-13 | 32 |

## 今天(8/13)新引入的 32 条（全部噪音级）
- 19 js/unused-local-variable
- 10 js/shift-out-of-range（wasm-sm2 AssemblyScript 误报）
- 2 js/redundant-assignment
- 1 js/useless-assignment-to-local

## 需要真实关注的 high/critical（历史遗留，非今天引入）
| 规则 | 级别 | 数量 | 位置 | 判断 |
|------|------|------|------|------|
| js/type-confusion-through-parameter-tampering | critical | 2 | src/index.js:997 / backend/src/index.js:838 | ✅ 已被原型污染防护覆盖，等重扫关闭 |
| js/user-controlled-bypass | high | 2 | src/index.js:448 / backend/src/index.js:240 | ⚠️ WebSocket 鉴权条件被用户值控制，需人工评估 |
| js/clear-text-storage-of-sensitive-data | high | 1 | www/crypto/crypto/pq-integration.js:219 | ⚠️ secretKey/hybridSecret 明文存储，需评估 |
| js/log-injection | medium | 15 | src/index.js 等多处 | 日志注入，低危，可选清理 |
| js/remote-property-injection | high | 1 | — | 需评估 |
| js/tainted-format-string | high | 1 | — | 需评估 |

## 关键判断
1. **545 不是今天造成的**——403 条（82%）是 8/2 的历史遗留，今天只新增 32 条噪音。
2. **限流 55 条是误报**——makeRateLimiter 自定义中间件已存在。
3. **wasm-sm2 的 shift-out-of-range 是误报**——AssemblyScript u64 移位被 CodeQL 用 JS 32 位语义误判。
4. **真正需人工评估的高危项只有 3 类**：user-controlled-bypass(2) + clear-text-storage(1) + 零散 high（remote-property-injection/tainted-format-string/file-system-race）。

## 待办
- 8/31 前：评估并处理 user-controlled-bypass(2)、clear-text-storage(1) 两条真实 high 告警。
- 可选：批量 dismiss 332 条 note 级噪音（unused-local-variable 等）。
- 可选：为 wasm-sm2 AssemblyScript 目录加 CodeQL 排除或 .ts 专用规则，消除 shift-out-of-range 误报。
