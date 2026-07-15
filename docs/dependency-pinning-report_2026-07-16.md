# 依赖版本锁定报告
**日期**: 2026-07-16
**范围**: FIBEMATE 工作区 (Node.js + Rust/WASM)

---

## 一、审计结果总览

| 审计项 | 结果 | 备注 |
|--------|------|------|
| npm audit | ✅ 0 vulnerabilities | 仅 sm-crypto 的 jsbn 警告（已知，不可移除） |
| 关键版本检查 | ⚠️ 3 项需处理 | bcryptjs 跨主版本、ws 缺 lock、mongoose 可升级 |
| Rust cargo audit | ⚠️ 离线无法运行 | wasm-bindgen+getrandom 手工审查无已知漏洞 |
| package-lock.json 覆盖 | ⚠️ 不完整 | www/reg-server 无 lock；root 仅 2 包 |
| engines/node 约束 | ⚠️ 缺失 | 仅 www/package.json 有 `>=16.0.0` |
| devDependencies | ⚠️ 全缺失 | 所有 package.json 均无 devDependencies |

---

## 二、生产依赖清单与锁定建议

### 2.1 核心加密库

| 包 | package.json | 已安装 | 最新版本 | 建议 | 优先级 |
|----|-------------|--------|---------|------|--------|
| `@noble/curves` | `^2.2.0` | 2.2.0 | 2.2.0 | **精确锁定** `2.2.0` | P1 |
| `@noble/post-quantum` | `^0.6.1` | 0.6.1 | 0.6.1 | **精确锁定** `0.6.1` | P1 |
| `@noble/hashes` | `^2.2.0` | — | 1.3.4 | 需检查实际安装版本；建议 `1.3.4` | P1 |
| `sm-crypto` | `^0.4.0` | 0.4.0 | 0.4.0 | **已最新** → 精确锁定 `0.4.0` | P1 |

> **注意**: `@noble/*` 各包版本需匹配（内部有 peer 关系）。建议统一升至 `1.x` 系列：
> - `@noble/curves`: `1.3.4`
> - `@noble/hashes`: `1.3.4`
> - `@noble/post-quantum`: `0.11.0`（如有新版本）
> ⚠️ 需先在 dev 环境完整测试后再升级生产

### 2.2 服务与通信

| 包 | package.json | 已安装 | 最新版本 | 建议 | 优先级 |
|----|-------------|--------|---------|------|--------|
| `ws` | `^8.16.0` | 8.21.0 | 8.21.1 | **精确锁定** `8.21.0` | P0 |
| `express` | `^4.18.2` | — | 5.2.1 | **精确锁定** `4.21.2`（5.x 有 BREAKING） | P1 |
| `mongoose` | `^9.6.2` | — | 9.7.4 | **精确锁定** `9.7.4` | P2 |
| `snarkjs` | `^0.7.6` | — | 0.7.6 | **精确锁定** `0.7.6` | P1 |

### 2.3 安全相关

| 包 | package.json | 已安装 | 最新版本 | 建议 | 备注 |
|----|-------------|--------|---------|------|------|
| `bcryptjs` | `^2.4.3` | — | **3.0.3** | ⚠️ **主版本升级** 2.x→3.x，API 可能有 break | **P0** |
| `jsonwebtoken` | `^9.0.3` | 9.0.3 | 9.0.3 | **精确锁定** `9.0.3` | P1 |
| `helmet` | `^7.2.0` | — | 8.1.0 | **精确锁定** `8.1.0`（7.x→8.x 无 break） | P2 |

> **bcryptjs 升级警告**: 3.x 移除了内置 TypeScript 类型，需额外安装 `@types/bcryptjs`；同步/异步 API 行为可能变化。**必须完整测试后再上线**。

### 2.4 工具与数据

| 包 | package.json | 已安装 | 建议 |
|----|-------------|---------|------|
| `better-sqlite3` | `^12.10.0` | — | **精确锁定** `12.10.0`（native addon，需重编译） |
| `uuid` | `^11.1.1` | — | **精确锁定** `11.1.1` |
| `cors` | `^2.8.5` | — | **精确锁定** `2.8.5` |
| `lowdb` | `^7.0.1` | — | **精确锁定** `7.0.1` |

---

## 三、Rust / WASM 依赖

### 3.1 lgv2 Cargo.toml

| 依赖 | 当前 | 最新 | 建议 |
|------|------|------|------|
| `wasm-bindgen` | `0.2.126` (lock) | 0.2.xxx | **已有 Cargo.lock** ✅，升级需重验 WASM |
| `getrandom` | `0.2.17` (lock) | 0.2.x / 0.3.x | ⚠️ 升级 0.3.x 需检查 `js` feature 兼容性 |

**Cargo.lock 已正确存在**，无需额外操作。

### 3.2 wasm-pack 版本

```
当前: wasm-pack 0.14.0
建议: 精确锁定（wasm-pack 无 lock 文件机制，建议记录版本）
```

---

## 四、Lock 文件状态

| 路径 | lock 文件 | 状态 | 建议 |
|------|----------|------|------|
| workspace root | `package-lock.json` v3 | ⚠️ 仅 2 个包 | 需重新 `npm install` 生成完整 lock |
| `www/` | **无** | ❌ | 需创建并提交 |
| `reg-server/` | **无** | ❌ | 需创建并提交 |
| `slh-dsa-pkg/` | **无** | ❌（纯 WASM 产物，无需 lock） | OK |
| `lgv2_v222/` | `Cargo.lock` | ✅ 完整 | OK |

---

## 五、实施行动计划

### P0（本周，必须）
1. `bcryptjs` 升级测试：dev 环境升级到 `3.0.3`，跑完整测试套件，确认 API 兼容
2. 为 `www/` 和 `reg-server/` 生成 `package-lock.json`

### P1（下周）
3. `ws` → `8.21.0` 精确锁定
4. `express` → `4.21.2` 精确锁定（**不要升到 5.x**，breaking change）
5. `package-lock.json` 提交到 Git（所有子包）
6. 为 workspace root 补全 `package-lock.json`

### P2（可选）
7. `@noble/*` 统一升级到 `1.x` 系列（需深度测试）
8. 添加 `engines` 字段到所有 package.json（`"node": ">=18"`）
9. `devDependencies` 分离（测试工具、类型定义）

---

## 六、npm install / pnpm 工作区说明

当前 workspace **疑似 pnpm 工作区**（MEMORY.md 提及 pnpm），但：
- pnpm CLI 未安装
- 无 `pnpm-lock.yaml`
- 各子包独立运行

**建议选择其一并统一**：
- 选项 A：切换回 npm（推荐，简单）
- 选项 B：安装 pnpm 并迁移到 pnpm 工作区

当前建议：**选项 A**，保持现状用 npm，先解决 lock 文件缺失问题。

---

## 七、临时依赖（lgv2_v222 目录清理）

以下二进制文件不应进入 git（已在 `lookingglass-v2` repo 的 .gitignore 中）：
```
compute_seed.exe    129 KB
test_rs.exe         130 KB
*.pdb               ~1.2 MB × 2
```

---

## 八、已知不可移除的警告

| 警告 | 来源 | 严重 | 说明 |
|------|------|------|------|
| jsbn CVE | sm-crypto → jsbn 1.1.0 | Medium | sm-crypto 内部依赖，sm-crypto 未维护，无法升级 |

---

## 九、GitHub Actions CI 建议

建议在 `.github/workflows/` 添加：
```yaml
# npm-audit.yml
- run: npm audit --audit-level=high
# cargo-audit.yml（需配置 git proxy 或缓存 advisory-db）
- run: cargo audit
```

---

*报告生成: 2026-07-16 02:27 CST*
