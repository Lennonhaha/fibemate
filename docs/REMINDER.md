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

2026-08-15 全量审计（11:37 重扫）：**182 条 open 告警**（9 error + 91 warning + 82 note）。
P0 已修（commit `4785b92c`）：#578 SSRF 白名单 + 2 个 JS 引号语法 bug。

发布后处理：

| 类别 | 数量 | 处理方式 |
|:---|:---:|:---|
| missing-rate-limiting | 55 | 加 `express-rate-limit` 中间件（`src/index.js` + `backend/src/index.js`） |
| log-injection（#624/#623/#581/#580） | 4 | error 级，`console.log` 拼用户输入 → 脱敏或删除（`mixnet/mix-node.js` + `mixnet/healthcheck.js`） |
| 误报（#123/#122/#37/#36） | 4 | Dismiss：`user-controlled-bypass` 实为 JWT 验证守卫；`type-confusion` 下游仅 `String.includes()` |
| 误报（#543/#28/#579） | 3 | Dismiss：见下方 warning 误报判定 |
| #124 missing-origin-check | 1 | 理论正确，同源专用 Worker 无跨域风险；可选加 `e.origin` 校验一行 |
| 噪音 + 其余 warning | ~100 | 批量 dismiss（unused-variable / whitespace / duplicate-property 等） |

> error 级误报判定依据：
> - #123/#122 `js/user-controlled-bypass`：`if (msg.type !== 'auth')` 只是路由分支，信任根是 `jwt.verify(msg.token, SECRET)`。
> - #37/#36 `js/type-confusion`：`q` 只用于 `String.includes()`，无 SQL/路径/命令拼接。
>
> warning 级误报判定依据：
> - #543 `js/remote-property-injection`（src/db-sqlite.js:300）：L298 已显式拒绝 `__proto__`/`constructor`/`prototype`，L300 用 `Object.prototype.hasOwnProperty.call()` 白名单访问，已是标准防御写法。
> - #28 `js/tainted-format-string`（www/websocket-manager.js:123）：JS 模板字符串非 printf，`${...}` 插值不会把字符串当格式符执行，C 威胁模型套 JS 误报。
> - #579 `js/file-system-race`（scripts/daily-audit.js:173）：单进程同步 CLI，`readFileSync`↔`writeFileSync` 之间无异步窗口，TOCTOU 不成立。

> ⚠️ 注：#624 log-injection 是 8/15 上午修 SSRF 时在拒绝分支新增的 `console.error(...${nextHop})` 引入，属同一处收尾。

---

## 4. 发布后其他待办（来自 MEMORY.md / 会话记录）

| 事项 | 说明 |
|------|------|
| 2 个不可逆文件 | `session-manager.js` + `sm-v12.js`（GBK 双重误解码损坏，8/31 后处理） |
| 工作区清理 | ~60+ 未跟踪 `*_2026-08-*.md` 工作记录归档（建议 `docs/audit-log/`）+ `wasm-sm2/` 实验目录 |
| VWZ 优化研究线 | `verify_batch` + `PublicKey` 惰性缓存（`experimental/vwz-lg` 分支，本地不存在仅远程） |
| 可视化数量口径 | 权威数字拍板 + 批量改 facts.md/README/ARCHITECTURE/announcement/viz-index |
| 证明链全景 | 已存档 `docs/visualization-designs/07-proof-chain-panorama.md`，开源后 P1 |
| 重放保护缺口 | `THREAT_MODEL.md:65,131-132` 已登记。**方案已定（2026-08-15）**：跳过「注入式一期」（只发 UUID 不校验，零收益），8/31 后直接做校验式二期——客户端传 `X-Request-Id`，服务端查已见缓存拒绝重复（425 `REPLAY_DETECTED`），缓存用 Redis 或 `lru-cache`（自动 TTL，避免 `setInterval`+`Date.now()` 时钟回拨）。覆盖：API 端点 nonce+时间窗、Mixnet `mix-node.js` 已见 nonce 缓存（L34-35/L175-176 已有字段缺检测） |
| Slaman × FIBEMATE 哲学文档 | 设计阶段已放弃（不在代码/参数层面引入），**如需作为叙事素材**：仅作哲学类比（标注「非技术方案·灵感来源」），不进安全声称。具体落地方式待确认（进 `docs/philosophy/` 或桌面存档均待定） |
| 护盾页集合论注脚 | 暂不引入（保持页面纯净，后续如有哲学文档再链接） |

---

## 5. 8/31 后研究类待办

> **2026-08-15 新增**（来自 Slaman 概念层研究 + 用户确认）

### 5.1 LWE 量子困难性研究（P1）

**背景**：ML-KEM 的安全性基础是 LWE 问题。量子计算机对 LWE 的威胁是否比经典计算机更大？是否存在类似 Shor 对 RSA 的指数级量子加速？（目前**未知**，是活跃研究领域）

**核心文献**：
- Albrecht-Player-Scott 2015：`Estimate_all_the_DATA - On the hardness of LWE and Ring-LWE with small error`（ePrint 2015/046）
  - 给出量子 BKZ 对 ML-KEM-768 的复杂度估计：2^{128+}
  - 文档：`docs/security/lwe-quantum-bkz-literature.md` 已建立
- Regev 2009：LWE 困难性到 GapSVP/SIVP 的量子归约
- Peikert 2016：`A decade of Lattice Cryptography`（FoT 2016）

**行动项**：
- [ ] 细读 Albrecht-Player-Scott 2015 全文，提取对 ML-KEM-768 的具体量子安全估计
- [ ] 对比 Chen-Nguyen 2011 BKZ 校准与 FIBEMATE 现有参数文档
- [ ] 整理 Ducas 等人量子格攻击综述（2020+ 新结果）
- [ ] 更新 `docs/security/` 中的量子安全性说明

### 5.2 BKZ 算法复杂度细化（P1）

**背景**：ML-KEM-768 参数选择基于 BKZ 约化算法复杂度估计。更精确的 BKZ 复杂度模型可支撑参数文档更新。

**核心文献**：
- Chen-Nguyen 2011：`BKZ 2.0: Better lattice security estimates`（ASIACRYPT 2011）
  - 通过实验给出 BKZ 实际运行时间与块大小 β 的精确关系
  - NIST PQC 安全级别定义的主要实验依据之一
- Schnorr-Euchner 1994：BKZ 前身（HKZ 约化算法）
- Albrecht-Player-Scott 2015：量子 BKZ 复杂度（见 §5.1）

**行动项**：
- [ ] 对比 Chen-Nguyen BKZ β→复杂度表与 FIBEMATE 现有安全参数说明
- [ ] 梳理 ML-KEM-768 的具体 β 值与对应安全级别
- [ ] 更新 `docs/security/` 中的 BKZ 复杂度参数表（附注：量子 vs 经典）

### 5.3 Slaman 设计哲学文档（待确认落地方式）

**2026-08-15 用户确认**：继续研究 Slaman × FIBEMATE 设计哲学（**仅哲学类比，非技术方案**）。

**背景**：
- Theodore A. Slaman（加州大学伯克利分校，1954-）是递归论/可计算性理论专家
- 2024 年论文：*Extending Borel's Conjecture from Measure to Dimension*
  - 证明在 Laver 宇宙（满足 ZFC 但否定 CH）中，强维数定理不成立
  - 核心思想：**不同公理宇宙给出不同的数学结论**（CH 宇宙 vs Laver 宇宙）
- Hamkins 的集合论多元宇宙（Multiverse View）与 Slaman 的工作**无关**（归因错误，已纠正）

**对 FIBEMATE 的可能类比**：
| Slaman 的数学 | FIBEMATE 的工程 | 备注 |
|:---|:---|:---|
| 力迫法（forcing）在特定公理宇宙中构造新集合 | TLA+ 形式化验证在特定状态空间中证明性质 | 哲学类比，非技术实现 |
| 反射原理（reflection） | TLC 模型检查 | 同上 |
| CH 宇宙 vs Laver 宇宙 | 经典安全 vs 后量子安全 | 威胁模型不同，安全结论不同 |
| Borel 猜想的宇宙依赖性 | 从单算法验证到全栈验证的必要性 | 同上 |

**明确边界**：
- ❌ **不能**写为"安全假设可以切换宇宙"——安全假设是计算复杂度假设，不可切换公理
- ❌ **不能**写为"基于 Slaman/Hamkins 数学宇宙的安全增强"——两者均不提供密码学工具
- ✅ **可以**作为叙事框架（解释"为什么 FIBEMATE 做全栈验证"），严格标注"哲学类比·灵感来源"
- ✅ **可以**引用 Slaman 论文作为数学诚实性旁注（数学真理的公理依赖性 ↔ 工程假设的明确声明）

**落地方式待确认**（2026-08-15 待用户拍板）：
- A：写入 `docs/philosophy/slaman-fibemate-analogy.md`（进 git，对外可见）
- B：桌面存档（本地，不推送 GitHub）
- C：仅做内部参考笔记，不形成文档

---

## 附：已完成的 8/31 前动作（供对照）

- ✅ CARS 分数全站统一 77.30（commit `82139d19e`）
- ✅ Dependabot #31 better-sqlite3 13.0.3 合并（commit `aa10efb60`）
- ✅ CodeQL P0 修复：SSRF 白名单 + 2 个 JS 语法 bug（commit `4785b92c`）
- ✅ 仓库 dependabot.yml 引用的 3 个缺失标签已创建（dependencies/npm/ci）
- ✅ MEMORY.md GBK 损坏修复与恢复
- ✅ 全仓库 UTF-8/GBK 编码损坏修复 + 防范机制
- ✅ Slaman vs Hamkins 概念层研究完成（`slaman-hamkins-research_20260815.md`）
- ✅ LWE 量子困难性 + BKZ 文献参考文档建立（`docs/security/lwe-quantum-bkz-literature.md`）
