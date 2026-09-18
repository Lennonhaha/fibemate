# 死代码 AST 复核（A4）— knip 实测 + 误报分类

> 建立：2026-09-18（台账 A4，knip v5 实测）
> 状态：本地扫描证据，未 push，待人工确认删留

## 执行环境
- 主仓 `D:\FIBEMATE\fibemate` @ `4681aec`，git status clean（仅 `?? NUL` 伪条目）
- 装 `knip@5`（devDep，33 包，0 漏洞，本地未 push）
- 新增 `knip.jsonc`（限定 Node 部分：src/index.js + test + scripts + tools；排除 www/dist/fpga/mixnet/reg-server 等）
- 命令：`npx knip --no-exit-code --reporter compact`

## 实测结果分类

### ✅ 真冗余（建议处置）
| 类 | 项 | 说明 |
|---|---|---|
| Unused dependency | `package.json` 列 `pqc-kyber` | 主仓根 npm 代码**不依赖** pqc-kyber；它在 `fibemate-tauri/src/crypto/crypto/pq-wasm` 子 crate（Cargo 依赖），非 npm。根 package.json 的 pqc-kyber 是**历史残留**（与 A3 呼应）。可安全移除根 deps 中的 pqc-kyber |
| Unused dependency | `node-addon-api` | 疑似原生插件残留，主仓根无 .node 构建引用，待确认 |
| Unused dependency | `@noble/curves` | ⚠️ 需复核——主仓可能经 `packages/*` 间接用，若仅根列而实际在子包用则属 misplace，非真冗余 |

### ⚠️ 待人工确认（knip 报 unused file，但可能为误报）
以下被判 unused 但**可能是真实后端模块未接入口 / 被前端动态引用**：
- `src/db.js`、`src/lib/jwt-helper.js`、`src/tls-hybrid-extension.js`
- `src/crypto/bloom-filter.js`、`src/crypto/traffic-shaping.js`、`src/crypto/ws-padding.js`
- `src/opk-server.js`、`src/pqc-hybrid-server.js`、`src/sms-service.js`
- 大量 `packages/fml-dsa/src/core/*`、`packages/key-lifecycle/*`、`packages/sm2-multisig/*`、`packages/pqc-kem/test/*`
> 这些多为 **config 边界误报**：fml-dsa/key-lifecycle 的 test 入口未列入 knip entry；www/ 前端调用被 exclude。不能直接删。

### 🚫 误报（config 边界，非真死代码）
- **Unresolved imports (17)**：scripts 引用 `/opt/fibemate-full/...`、`../www/crypto/...` 等绝对/跨目录路径，knip 解析不了（指向生产服务器或前端），属分析范围外
- **Unlisted dependencies (4)**：scripts 用 js-sha3/electron 未列 deps（dev 工具遗漏，非死代码）
- **Unused exports (9)**：algorithm-registry/index.js 等导出被 www/ 前端消费（已 exclude），属误报
- **Unlisted binaries (1)**：native-build.yml 用 node-gyp（CI 工具，非死代码）

## 结论
- eslint 现有范围（pqc-kem/src + test）= **0 问题**，核心 KEM 代码干净
- knip 全仓扫出 **38 unused files + 1 unused dep 组**，但混合仓（Node+前端+生产路径）下**绝大多数为 config 误报**
- **唯一明确可处置项**：根 `package.json` 的 `pqc-kyber`（与 A3 同源，主仓 npm 不依赖）→ 可移除
- `node-addon-api` / `@noble/curves` 需进一步定位是否真冗余

## 后续动作（不擅自删）
- [ ] 复核 `pqc-kyber` / `node-addon-api` / `@noble/curves` 是否真不在主仓 npm 依赖图 → 若是，开 PR 移除根 deps
- [ ] 补 knip entry（fml-dsa/key-lifecycle test 入口 + www 前端入口）→ 重跑降误报
- [ ] `src/db.js` 等 9 个"真实后端模块 unused"需逐文件确认是否接入口（可能漏接 / 死代码）
- [ ] 用户拍板：是否接受 knip config 进仓（作为 CI 死代码门禁雏形）
