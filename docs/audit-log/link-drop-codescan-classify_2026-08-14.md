# .link 域名下线 + Code Scanning 60 条 error 精确分类

日期：2026-08-14

## 一、fibemate.link 下线（已完成，commit 8cd83b84c）

**决策**：fibemate.link 未备案，被阿里云 ICP 备案墙拦截（外网 TLS 握手 RST），放弃该域名，全站只保留 fibemate.net。

**改动的对外发布文件（10 个，+15/-15）**：
- www/index.html、www/docs/index.html — slogan「written in the whois record of fibemate.link」→ .net
- www/disclaimer.html / disclaimer-en.html — 域名列表删 .link
- www/docs/FIBEMATE-STATUS-20260527.md — 域名表删备用域名
- www/LICENSE.txt — 项目网址 .link → .net
- docs/VULNERABILITY-DISCLOSURE.md — 适用范围 + 服务端配置 2 处
- server/pqc-probe-api.js — ALLOWED_ORIGINS 删 'https://fibemate.link'
- www/privacy-layers/mix-config.js — 3 个 wss:// 备用地址 .link → .net
- www/docs/API.html — 3 处示例邮箱 alice@fibemate.link → .net

**保留不动（历史记录/备份，非对外发布）**：
- 事故记录、证书路径、renewal 待办（事实陈述，不改）
- www/index.html.*.bak / .webapp 等历史备份文件
- pqc-deployment-checker/（整个目录被 .gitignore 忽略，本地副本不随 git）

**三端同步**：本地 commit 8cd83b84c → GitHub main → 服务器 pull，首页 slogan 已确认 .net。

## 二、Code Scanning 60 条 open error 精确分类

### 真 bug（需修复）

**1. js/overwritten-property 26 条 — migration-priority.html 24 条 + nexus-community.js 2 条**

migration-priority.html 的每个算法对象里 `directFiles` 和 `indirectFiles` 被写两次：
```
directFiles: 71,        // 数字（新格式）
indirectFiles: 32,
...
directFiles: [],        // 空数组（旧格式残留，覆盖了上面的数字）
indirectFiles: []
```
历史重构残留：旧版用「文件名数组」，新版改成「数字」，但旧两行没删。前端 L491 `a.directFiles = bd.directFiles || []` 实际拿到的是空数组 `[]`（旧行覆盖），导致文件数显示丢失。共 12 个算法对象受影响。

**注意**：这是静态对象字面量重复属性，CodeQL 报 error 是对的，但「运行时影响」有限——L491 会用 BLOOM_DATA 重新赋值覆盖。需清理 12 处重复的 `directFiles: [], indirectFiles: []` 行（保数字，删空数组）。

**2. js/shift-out-of-range 14 条 — bloom-filter.js 4 条真代码**

bloom-filter.js 的 MurmurHash3 实现里 `h[0] >>> 33`、`k1[0] + (Math.imul(...) / 0x100000000) >>> 0` 等移位。JS 里 `>>> 33` 等价于 `>>> 1`（mod 32），是合法但可疑的写法。实际是 64-bit 哈希的 32-bit 拆解，`>>> 33` 大概率是笔误（应为 `>>> 1` 或 `>>> 33` 本意就是取高 31 位）。**需人工核对语义**，非纯误报。

### 误报（可 dismiss）

**3. js/shift-out-of-range wasm-sm2 10 条 — 生成代码**

wasm-sm2/assembly/field.ts、sm2.ts 是 AssemblyScript 源，`t[7] >> 32`、`hi == 1` 等是 AS 的 u64 移位语义（AS 编译到 WASM 有明确语义），CodeQL 用 JS 规则误判。标 generated-code。

**4. js/user-controlled-bypass 2 条（#122/#123）— 已核查误报**

src/index.js:448 与 backend/src/index.js:240 的 `authed = true` 只在 `jwt.verify()` 成功后才设置，失败 throw。鉴权逻辑正确。

**5. js/type-confusion-through-parameter-tampering 2 条（#36/#37）— 已修复**

db.js 已有 `typeof id !== 'string'` 原型污染防护（今天早些时候修复），等重扫自动关。

**6. js/variable-use-in-temporal-dead-zone 1 条（#527）— 误报**

www/js/sm3_implementation.js:64 已有 `// codeql[...]` 注释 + class method 上下文，`this.messageExpand` 在 class 方法里定义，非 TDZ。可 dismiss。

### 需人工核实（log-injection 15 条）

src/index.js、backend、opk-server、dingtalk-alert、websocket-manager 等的 `console.log('[SEND] userId=' + userId)`、`req.path` 直接拼日志。**JS 的 console.log 不是日志注入面**（不写文件、不执行 shell），CodeQL 报 warning→error 是过度。但需确认：是否有任何 `console.log` 输出会进 syslog/文件（若走 winston/pino 且数据可控则真）。当前看是纯 stdout 调试日志，**大概率全部误报**，但需确认无日志采集管道。

## 三、结论与下一步

- 真修复：migration-priority.html 12 处重复属性（1 个文件）、bloom-filter.js 移位语义核对（1 个文件）
- 可 dismiss：wasm-sm2 AS 生成代码 10 条 + 鉴权/type-confusion/TDZ 5 条
- 待核实：log-injection 15 条（大概率误报，需确认无日志采集）
- 建议：先修 migration-priority.html（明确真 bug、影响展示），bloom-filter 移位与 log-injection 一并核实后批量处理
