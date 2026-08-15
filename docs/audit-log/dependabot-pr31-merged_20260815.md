# Dependabot PR 处理：合并 #31 better-sqlite3，暂缓 #30/#29

**日期**：2026-08-15
**最终 HEAD**：`aa10efb60`（本地 = GitHub = 服务器三端一致）

## 决策结论

| PR | 依赖 | 版本变化 | 决策 | 理由 |
|:---:|:---|:---:|:---:|:---|
| #31 | better-sqlite3 | 13.0.2→13.0.3 | ✅ **已合并** | patch 安全补丁，零风险 |
| #30 | @noble/post-quantum | 0.6.1→0.7.0 | ⏳ 8/31 后 | 无 breaking，但需 KAT 跨库验证，冻结期不引入 |
| #29 | eslint | 9→10 | ⏳ 8/31 后 | major 版本，规则变更风险 |

## #31 合并执行记录

- `gh pr merge 31 --merge --delete-branch` → merge commit `aa10efb60`
- CI 全绿（CodeQL 3 路 + node-test/mlkem-kat/gm-crossval 各 4 平台×2 版本 + lint/bom-check/docs-check/repolinter）
- diff 干净：仅 `package.json` + `package-lock.json` 版本号 13.0.2→13.0.3
- 三端同步：本地 `git fetch origin main`（HTTPS token remote）→ reset → 服务器 `git reset --hard FETCH_HEAD`

## #30 @noble/post-quantum 0.7.0 兼容性核查（已做，供 8/31 后用）

核查结论：**无 API breaking，纯内部实现优化**。

1. **exports 结构完全一致**：8 个子路径（`./` `./utils.js` `./falcon.js` `./hybrid.js` `./ml-dsa.js` `./ml-kem.js` `./slh-dsa.js` `./_crystals.js`）无增删。
2. **fml-dsa 依赖的符号** `genCrystals`/`XOF128` 在 0.7.0 签名不变（`genCrystals = (opts) =>` 解构参数 `newPoly/N/Q/F/ROOT_OF_UNITY/brvBits/isKyber` 完全一致）。
3. **核心 diff = NTT 性能优化**：
   - `isKyber:true`（ML-KEM）路径 add/sub 从 `%` 改为条件修正（`r >= Q ? r-Q : r`），约 20% 提速。
   - `bitsCoder` 增加 carry 形状校验 + `& 0xff` 替代 `getMask(bufLen)`。
4. **fml-dsa 走 `isKyber:false`**（Dilithium，Q=8380417），使用 `mod()` 通用路径，**完全不受 NTT 优化影响**。

8/31 后合并 #30 时需：合并 → `npm install` → 重跑 fml-dsa 全量测试 + KAT 跨库验证（`packages/fml-dsa/test/kat-verify.mjs` + `noble-oracle.test.js`）。

## 环境坑提醒

- `github-ssh` remote 是 443 端口（QMTAP 阻断），fetch/push 用 `origin`（HTTPS token）或 SSH 22 端口。
- 服务器 remote `origin` 配置的 token 已暴露在 `git remote -v` 输出中，8/31 后建议轮换该 PAT。

## 剩余待办

- 8/31 后：#30（noble 0.7.0）+ #29（eslint 10.x）合并
- Dependabot 剩余 45 漏洞 auto-resolve 跟踪
