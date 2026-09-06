# SPDX-License-Identifier: GPL-3.0-only
# 平台层 PQC 迁移工程化工具链

> 本文档衔接「工程验证」(docs/pqc-readiness.md) 与「可操作迁移参考」——把密码配置
> 变成可扫描、可审计、可门禁的资产。新增内容均为**增量**, 不改变现有生产运行。

## 工具链总览

```
┌─────────────────────────────────────────────────────────────────┐
│  运行态配置 (服务器)          仓库模板/工具 (本仓, CI 可跑)        │
│                                                                 │
│  /etc/nginx/*          ──┐                                     │
│  pm2 jlist              ──┼─▶ tools/scan-crypto-assets.cjs     │
│  /etc/letsencrypt/*     ──┘        │                            │
│                                    ▼                            │
│                          crypto-assets.json (运行态资产清单)     │
│                                    │                            │
│                                    ▼                            │
│                          tools/check-crypto-policy.cjs         │
│                          (Policy as Code: P1 TLS / P2 混合组    │
│                           / P3 证书强度 + 基线 diff 漂移检测)     │
│                                    │                            │
│                                    ▼                            │
│                          .github/workflows/pqc-migration-verify │
│                          .yml (CI 场景验证: 门禁真的会拦)         │
└─────────────────────────────────────────────────────────────────┘
```

## 与既有能力的关系 (不重复, 只补层)

| 既有 (已上线) | 新增 (本目录/tools) | 互补关系 |
|---|---|---|
| `tools/build-cbom.cjs` — **源码静态** CBOM (算法出现频次) | `scan-crypto-assets.cjs` — **运行态**资产清单 (nginx/pm2/证书) | 构建时 vs 运行时, 合起来才是完整密码资产视图 |
| `docs/pqc-readiness.md` 路径 A — 平台层混合 TLS 评估 | `pqc-nginx-hybrid.conf.example` + `pqc-deploy.sh` (带门禁) | 把评估固化成可执行模板 + 安全启用脚本 |
| 应用层混合 KEX (路径 C-2, IANA #4590, 已上线) | 平台层混合 KEX (路径 A, 待 OpenSSL 升级) | 纵深防御两层, C-2 现役, A 是目标态 |
| 手动 deploy 流程 | `check-crypto-policy.cjs` 漂移检测基线 | 部署前 diff, 配置漂移自动化拦截 |

## 服务器现状 (2026-09-06 实测) 与门禁结论

| 项 | 值 | 含义 |
|---|---|---|
| nginx | 1.30.1 | 新, 支持可选组前缀 |
| nginx 链接 OpenSSL | **3.0.13** | **< 3.5, 无 ML-KEM 混合组** |
| `ssl_ecdh_curve X25519MLKEM768` 直配 | → emerg 拒启 | 必须带 `?` 前缀 + 版本门禁 |
| 应用层混合 KEX | 路径 C-2 已上线 | 现役 PQ 保护不依赖平台层 |

**结论**: 平台层 PQ 启用的前置 = OpenSSL 升 3.5+ (或换含 PQ 的 nginx 构建)。
升级属系统级变更, 需单独排期 (建议先在 staging 验证), 不并入本次增量提交。

## 使用

### 服务器 (Linux, 有 nginx/pm2/证书)
```bash
# 1. 生成运行态资产清单
node tools/scan-crypto-assets.cjs --nginx /etc/nginx --pm2 --certs /etc/letsencrypt/live

# 2. 策略校验 (exit 0 = 合规)
node tools/check-crypto-policy.cjs --baseline crypto-assets.json

# 3. 生成基线 (首次) → 之后每次部署前 diff
node tools/check-crypto-policy.cjs --gen-baseline --out crypto-policy-baseline.json
```

### 平台层 PQ 启用 (OpenSSL 3.5+ 后)
```bash
bash deploy/pqc-deploy.sh --check     # 环境就绪度 (现服务器会被门禁拦截 exit 3, 预期)
bash deploy/pqc-deploy.sh --apply     # 应用 (先人工精简模板为纯配置)
bash deploy/pqc-deploy.sh --rollback  # 回滚
```

### 本地/CI 演练 (无服务器依赖)
```bash
node tools/scan-crypto-assets.cjs --out /tmp/crypto.json   # 自动降级, 仍输出 PQ 探测
node tools/check-crypto-policy.cjs --baseline /tmp/crypto.json
```

## 关联文档
- [docs/pqc-readiness.md](../docs/pqc-readiness.md) — 抗量子就绪状态总表 (路径 A/C-2 演进)
- [docs/openssf-roadmap.md](../docs/openssf-roadmap.md) — OpenSSF passing→Silver→Gold
- [docker/nginx-fibemate.conf](../docker/nginx-fibemate.conf) — 容器内站点配置 (8080)
