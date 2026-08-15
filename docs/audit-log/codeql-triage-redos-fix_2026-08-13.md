# CodeQL 告警分诊 + ReDoS 修复

## 日期
2026-08-13

## 背景
用户贴出 GitHub CodeQL 告警列表（约 28 条），要求处理。经侦查分为三类，仅 1 条需实际修复。

## 三类告警分诊结论

| 告警 | 数量 | 真实状态 | 处理 |
|------|------|---------|------|
| #544 ReDoS（tools/pqc-deploy/lib/deploy.js） | 1 | 我今天写 pqc-deploy 时引入的正则回溯风险（`/\/.*$/` 在多段路径上可回溯） | ✅ 已修 |
| #36/#37 type confusion（src/index.js:997 / backend/src/index.js:838） | 2 Critical | 已被今天的原型污染防护覆盖（db.js:41 `typeof id !== 'string'` + 调用处 `if(!user)`） | 旧告警，等重扫自动关闭 |
| #83~#103 Missing rate limiting（src/index.js 多处） | 25 High | 限流中间件已存在（src/index.js:289-316 makeRateLimiter + 全局限流 600/15min + 登录防爆破 30/15min） | False positive，CodeQL 未识别自定义中间件 |

## 修复内容
- 文件：`tools/pqc-deploy/lib/deploy.js:36`
- 改动：`l.replace(/^https?:\/\//, '').replace(/\/.*$/, '')` → `l.replace(/^https?:\/\//, '').split('/')[0]`
- 理由：`/\/.*$/` 是 ReDoS 危险模式（`.+` 与 `$` 组合，无回溯约束）；`split('/')[0]` 语义等价（取 host 部分）且无回溯
- 验证：parseManifest 5 个测试用例行为不变；test-deploy.js 6/6 通过

## commit
- `a429b5510`「fix(pqc-deploy): replace ReDoS-prone regex with split for manifest parsing」
- push 成功（9f9b9fa26..a429b5510），服务器 fast-forward 到 a429b5510

## 关键判断
- 25 条「Missing rate limiting」是 CodeQL 对自定义限流中间件（makeRateLimiter）的漏识别，不是真实缺口——限流早已实现
- 2 条 Critical type confusion 已被今日早些时候的原型污染防护（commit 4e48fe720 等）覆盖，是历史告警残留
- 唯一真实新增是我的 pqc-deploy 正则，已修

## 遗留
- 远程仍提示 54 dependabot 漏洞（17 high/27 moderate/10 low），为传递依赖 DoS 类，8/31 不阻塞
- CodeQL 重扫需 GitHub 自动触发，无需手动操作
