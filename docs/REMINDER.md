# REMINDER — 8/31 开源发布后待办

> 本文件记录 **8/31 开源发布（v3.3.0 tag）之后** 需要处理的收尾事项。
> 冻结期（8/31 前）不引入代码变更，以下均为「发布后」动作。

---

## 1. Dependabot PR 合并（发布后）

| PR | 依赖 | 版本变化 | 说明 |
|:---:|:---|:---:|:---|
| #30 | @noble/post-quantum | 0.6.1 → 0.7.0 | 无 API breaking，已核查，见下 |
| #29 | eslint | 9.39.5 → 10.8.1 | major 版本，规则变更需单独评估 |

### #30 合并步骤（已核查无 breaking）

兼容性核查结论（2026-08-15 完成）：
- exports 8 个子路径完全一致（无增删）
- fml-dsa 依赖的 `genCrystals`/`XOF128` 签名不变
- 核心 diff = NTT 性能优化（`isKyber:true` 路径 `%`→条件修正，约 20% 提速）
- fml-dsa 走 `isKyber:false`（Dilithium，Q=8380417），**不受影响**

合并后必跑验证：
```bash
npm install
cd packages/fml-dsa && npm test
node packages/fml-dsa/test/kat-verify.mjs        # KAT 跨库验证
node packages/fml-dsa/test/noble-oracle.test.js  # noble 交叉基准
```

### #29 合并步骤（eslint major）

- 先查 eslint 9→10 的 breaking change 列表（rules/parser 变更）
- 跑 `npx eslint` 看新增报错，逐条评估（配置对齐，勿盲目 `--fix`）
- CI 的 lint job 有 `--max-warnings 150`，升级后可能触发新 warning，需同步调整

---

## 2. 安全凭据轮换（发布后）

- **服务器 `origin` remote 暴露 PAT token**：`git remote -v` 可见明文 `gho_...`
  - 在 GitHub → Settings → Developer settings → Personal access tokens 撤销该 token
  - 服务器重新配置 remote（用 SSH key 或新 token）
  - 本地 `origin` remote 若也用同一 token，需同步更新

---

## 3. Dependabot 漏洞收尾（发布前按既定策略，发布后确认）

- 剩余 45 个漏洞（12 high / 23 moderate / 10 low）
- 已知归类：依赖传递 DoS（underscore/ws/qs 等，零触及）+ sm-crypto@0.4.0 critical
- sm-crypto critical 处理方案 A：声明延期标注，8/31 后升级到 0.5.5（不阻塞发布）
- 发布后重扫确认 auto-resolve 情况

---

## 3.5 CodeQL 告警收尾（发布后）

2026-08-15 全量审计：**253 条 open 告警**（8 error + 105 warning + 140 note）。
P0 已修（commit `4785b92c`）：#578 SSRF 白名单 + 2 个 JS 引号语法 bug。

发布后处理：

| 类别 | 数量 | 处理方式 |
|:---|:---:|:---|
| missing-rate-limiting | 55 | 加 `express-rate-limit` 中间件（`src/index.js` + `backend/src/index.js`） |
| log-injection（#580/#581/#582） | 3 | 低危，`console.log` 拼用户输入 → 脱敏或删除（`mixnet/mix-node.js` + `mixnet/healthcheck.js`） |
| 误报（#123/#122/#37/#36） | 4 | Dismiss：`user-controlled-bypass` 实为 JWT 验证守卫；`type-confusion` 下游仅 `String.includes()` |
| 噪音 + 其余 warning | ~190 | 批量 dismiss（unused-variable / trivial-conditional 等） |

> 误报判定依据：
> - #123/#122 `js/user-controlled-bypass`：`if (msg.type !== 'auth')` 只是路由分支，信任根是 `jwt.verify(msg.token, SECRET)`。
> - #37/#36 `js/type-confusion`：`q` 只用于 `String.includes()`，无 SQL/路径/命令拼接。

---

## 4. 发布后其他待办（来自 MEMORY.md / 会话记录）

| 事项 | 说明 |
|------|------|
| 2 个不可逆文件 | `session-manager.js` + `sm-v12.js`（GBK 双重误解码损坏，8/31 后处理） |
| 工作区清理 | ~60+ 未跟踪 `*_2026-08-*.md` 工作记录归档（建议 `docs/audit-log/`）+ `wasm-sm2/` 实验目录 |
| VWZ 优化研究线 | `verify_batch` + `PublicKey` 惰性缓存（`experimental/vwz-lg` 分支，本地不存在仅远程） |
| 可视化数量口径 | 权威数字拍板 + 批量改 facts.md/README/ARCHITECTURE/announcement/viz-index |
| 证明链全景 | 已存档 `docs/visualization-designs/07-proof-chain-panorama.md`，开源后 P1 |

---

## 附：已完成的 8/31 前动作（供对照）

- ✅ CARS 分数全站统一 77.30（commit `82139d19e`）
- ✅ Dependabot #31 better-sqlite3 13.0.3 合并（commit `aa10efb60`）
- ✅ CodeQL P0 修复：SSRF 白名单 + 2 个 JS 语法 bug（commit `4785b92c`）
- ✅ 仓库 dependabot.yml 引用的 3 个缺失标签已创建（dependencies/npm/ci）
- ✅ MEMORY.md GBK 损坏修复与恢复
- ✅ 全仓库 UTF-8/GBK 编码损坏修复 + 防范机制
