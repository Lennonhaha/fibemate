# FIBEMATE 测试体系总览

> 版本: v3.3 | 最后更新: 2026-07-22

## 测试矩阵

| 测试类型 | 规模 | 状态 | 文件 |
|:---|:---|:---|:---|
| **NTT roundtrip** | 200/200 | ✅ | `packages/pqc-kem/src/ml-kem-768.js` 自检 |
| **KEM 自洽** | 10,000/10,000 | ✅ | `scripts/kat-10000.js` |
| **KAT 验证** | NIST 向量 | ✅ | `scripts/kat-diag.js` |
| **Noble 交叉验证** | 200/200 | ✅ | 内嵌于 kat 脚本 |
| **liboqs 交叉验证** | 10,000/10,000 双向 | ✅ | `scripts/noble-liboqs-xcross.mjs` |
| **TVLA 侧信道** | N=10,000 SM2 | ✅ | `scripts/test-sm2-node-fix.js` |
| **FPGA 测试** | 43/43 PASS | ✅ | `scripts/fpga-l8l9-43-test.js` |
| **VWZ 签名** | 148/148 | ✅ | `scripts/vwz-148-test.js` |
| **CI 持续集成** | GitHub Actions | ✅ | `.github/workflows/ci.yml` |
| **Nightly** | 每日 06:00 UTC | ✅ | `.github/workflows/nightly.yml` |

## CI/CD 流水线

### CI (push/PR)

```yaml
触发: push, pull_request
任务:
  - lint: ESLint 静态分析
  - test: 核心单元测试
  - build: Tauri 编译检查
```

### Nightly (daily)

```yaml
触发: 每日 06:00 UTC (14:00 CST) + workflow_dispatch
任务:
  - cross-lang: JS vs WASM 等价性
  - kat-smoke: KAT 套件完整性
  - stm32-build: STM32 C 框架编译
```

### Release

```yaml
触发: tag push v*.*.*
任务:
  - build: Tauri 生产构建
  - release: GitHub Release 自动创建
```

## 运行测试

### 快速自检

```bash
npm test                           # 所有单元测试
node -e "require('./packages/pqc-kem/src/ml-kem-768.js')"  # 模块加载
```

### ML-KEM 完整验证

```bash
node scripts/kat-10000.js          # KAT 10,000 轮自洽
node scripts/noble-liboqs-xcross.mjs  # liboqs 交叉验证
```

### 硬件 & 侧信道

```bash
node scripts/fpga-l8l9-43-test.js  # FPGA 行为模型
node scripts/test-sm2-node-fix.js  # SM2 TVLA
```

### E2E 协议

```bash
node reg-server/e2e-test.js        # WebSocket 端到端
node reg-server/wss-test.js        # 安全 WebSocket
```

## 测试覆盖

| 模块 | 覆盖率 | 说明 |
|:---|:---|:---|
| ML-KEM-768 | ~93% 行 / ~92% 函数 | 已记录于 MEMORY.md |
| SM2/SM4 | ~85% | k-masking 加固路径全覆盖 |
| LookingGlass v2 | 独立仓库 | `lookingglass-v2/` |
| VWZ | 148/148 | 包括压缩/解压/密钥/签名/验证 |

## 未覆盖项目

| 项目 | 优先级 | 说明 |
|:---|:---|:---|
| **物理 TVLA (ChipWhisperer)** | P1 | 硬件侧信道 — 计划 Q4 2026 |
| **Fuzz 测试** | P2 | OSS-Fuzz 集成 — 开源后 |
| **跨平台矩阵** | P2 | Windows/Linux/macOS — 开源后 |
| **覆盖率 ≥ 95%** | P3 | c8 + nyc 仪表化 |

## 维护节奏

| 频率 | 动作 |
|:---|:---|
| 每次变更 ML-KEM | `kat-10000.js` + `noble-liboqs-xcross.mjs` |
| 每日 | 检查 GitHub Actions CI/Nightly 状态 |
| 每周 | 检查 Dependabot PR |
| 每月 | 更新 TSR 存证（如有代码变更） |
| 每季度 | 检查 TVLA 测试环境 + FPGA 行为模型 |

---

> 当前: 无失败测试。所有核心验证通过。待外因解锁（审计、开源、Bus Factor）。
