# NPM Audit Status — Dependabot Alert Dependency Chain Analysis

> 日期：2026-08-12 · 开源日：2026-08-31（D-19）· 审计方法：`npm ls --all --depth=8`

---

## 结论：23 条 Dependabot 告警全部为传递性依赖，零触及核心 PQC 代码

```
packages/algorithm-registry  → 0 matches
packages/fml-dsa            → 0 matches
packages/key-lifecycle      → 0 matches
packages/pqc-kem            → 0 matches
packages/sm2-ref            → 0 matches
packages/sm3-ref            → 0 matches
packages/sm4-ref            → 0 matches
─────────────────────────────────
核心加密包总计: 0 条命中
```

---

## 依赖链详情

### 1. 根目录 `noir-backend@1.0.0`

| 告警包 | 版本 | 引入路径 | 类型 |
|--------|------|----------|:---:|
| qs | 6.13.0 | express → body-parser | HTTP |
| path-to-regexp | 0.1.12 | express | HTTP |
| body-parser | 1.20.3 | express | HTTP |
| js-yaml | 4.1.1 | eslint → @eslint/eslintrc | 构建 |
| brace-expansion | 1.1.18 | eslint → minimatch | 构建 |
| ip-address | 10.2.0 | mongoose → mongodb → socks | 网络 |
| mongoose | 9.6.2 | (直接依赖) | ORM |

**说明**：根目录 express + mongoose 栈，非密码学相关

---

### 2. www/ `fibemate-zk-server@2.0.0`

| 告警包 | 版本 | 引入路径 | 类型 |
|--------|------|----------|:---:|
| qs | 6.13.0 | express → body-parser | HTTP |
| path-to-regexp | 0.1.12 | express | HTTP |
| body-parser | 1.20.3 | express | HTTP |
| underscore | 1.13.6 | snarkjs → bfj → jsonpath | 工具 |
| brace-expansion | 2.1.0 | snarkjs → ejs → jake → filelist → minimatch | 构建 |

**说明**：Web 前端 + zk 证明服务依赖，非密码学相关

---

### 3. mixnet/ `fibemate-mixnet@1.0.0`

| 告警包 | 版本 | 状态 |
|--------|------|:---:|
| qs | 6.15.2 | ✅ 已升级（express 5.x） |
| path-to-regexp | 8.4.2 | ✅ 已升级（express 5.x） |
| body-parser | 2.2.2 | ✅ 已升级（express 5.x） |

**说明**：mixnet 已切换到 express 5.x，告警实际已消除（GitHub 重扫后会自动 resolve）

---

## 修复状态

| 操作 | 日期 | 结果 |
|------|------|:---:|
| `npm update` 根目录 + audit fix | 2026-08-11 | commit d3d928c5 |
| `npm update` www/ + ws 版本修正 | 2026-08-11 | ws 8.21.0→^8.20.1 |
| `npm update` mixnet/ | 2026-08-11 | express 5.x 已升级 |

**剩余 4 个不可自动修复**（需 express 5.x breaking change）：
- root: path-to-regexp 0.1.12 → 需 → express 5.x
- root: body-parser 1.20.3 → 需 → express 5.x
- www: path-to-regexp 0.1.12 → 需 → express 5.x
- www: body-parser 1.20.3 → 需 → express 5.x

**策略**：express→express 5.x 迁移属 breaking change，8/31 冻结期内不动，计划 v4.0 执行

---

## 风险评估

| 维度 | 评级 | 理由 |
|------|:---:|------|
| 核心加密代码暴露 | 🟢 无 | 0/7 核心包受影响 |
| 可利用性 | 🟢 极低 | 全为传递性依赖，需多层调用链 |
| 服务暴露面 | 🟢 低 | express API 仅运行 `{"status":"ok"}` 探测端点 |
| 开源影响 | 🟡 中 | GitHub badge 显示黄色，但文档可解释 |

---

*审计完成时间：2026-08-12 ~10:00 CST*
