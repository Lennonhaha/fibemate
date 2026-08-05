# FIBEMATE v3.3 — 后量子密码学全栈工程验证平台 · 正式开源

**2026-08-31 · GPL-3.0 · [github.com/Lennonhaha/fibemate](https://github.com/Lennonhaha/fibemate)**

---

## 一句话

FIBEMATE 是全球首个**从浏览器到 FPGA** 全栈贯通的后量子密码学教育验证平台——NIST PQC 三算法全实现 + 国密 SM2/3/4 + 14 个 3D 可视化分析工具 + 100+ 份时间戳存证。

---

## 为什么需要 FIBEMATE？

NIST 在 2024 年完成了后量子密码学标准化（FIPS 203/204/205）。到 2035 年，所有依赖 RSA/ECDH 的系统必须迁移。但 PQC 的工程落地面临三个断层：

| 断层 | 现状 | FIBEMATE 做了什么 |
|:---|:---|:---|
| **理解断层** | liboqs/openHiTLS 是生产工具箱，不解释"为什么" | 每一行代码可读、可单步、可审计 |
| **融合断层** | NIST PQC 与国密 SM2 混合部署无参考实现 | ML-KEM-768 + SM2 双棘轮 + IANA #4590 |
| **可视化断层** | PQC 安全评估依赖命令行工具 | 14 个 3D 交互式仪表盘，浏览器即用 |

**FIBEMATE 不是又一个密码库。它是可执行教科书。**

---

## 技术全景

### 算法栈（12 种）

```
              ┌──────────────────────────────────────┐
              │          FIBEMATE v3.3               │
              │           算法注册表                   │
              ├────────────┬────────────┬────────────┤
              │   NIST PQC  │   国密 GM   │   经典      │
              ├────────────┼────────────┼────────────┤
              │  ML-KEM-768 │  SM2 (EC)   │  NIST P-256 │
              │  ML-KEM-1024│  SM3 (Hash) │  SHA-256   │
              │  ML-DSA-65  │  SM4 (Block)│  AES-256-GCM│
              │  SLH-DSA-128s│            │            │
              ├────────────┴────────────┴────────────┤
              │  NTT (FPGA) · Double-Ratchet · TLA+  │
              └──────────────────────────────────────┘
```

### 全栈覆盖

```
  ┌─ 前端 ──────────────────────────────────────┐
  │  14 个 3D 可视化 (Three.js)                  │
  │  WASM: ML-KEM 1.87ms / ML-DSA / SLH-DSA     │
  │  registry npm 包 (12 算法元数据)              │
  ├─ 服务端 ────────────────────────────────────┤
  │  Express + PostgreSQL/MySQL/better-sqlite3   │
  │  TLS 混合模式 · 路径 A (oqs-provider)        │
  │  路径 C 应用层 KEX (gm.js 能力协商)           │
  │  pqc-hybrid-server · WebSocket 安全会话       │
  ├─ 验证 ──────────────────────────────────────┤
  │  TLA+ 形式化验证 (10 不变式 · 101K states)    │
  │  TVLA 侧信道测试 (31/36 PASS)                │
  │  KAT 10,000 轮零偏差                          │
  │  100+ TSR 时间戳存证链                        │
  ├─ 硬件 ──────────────────────────────────────┤
  │  FPGA NTT (Artix-7, WNS 9.755ns)            │
  │  BRAM/DSP 资源热力图                          │
  └─────────────────────────────────────────────┘
```

### 17 个交互式可视化（含 ML-KEM 密钥封装流程动画、ML-DSA 签名验证流程动画、

| 类别 | 工具 | 说明 |
|:---|:---|:---|
| 🎯 评分卡 | CARS 五维雷达 | 算法敏捷性 · 密钥生命周期 · 协议耦合 |
| 🎯 评分卡 | IBM 七维雷达 | 接口抽象 · 格式耦合 · 可观测性 |
| 🎯 评分卡 | CARS vs IBM 双雷达 | 双框架并排对比 |
| 📊 仪表盘 | PQC 就绪度 | 算法覆盖率 · KAT · TVLA · 风险矩阵 |
| 📊 仪表盘 | 性能基准柱状图 | 4 后端 · 对数刻度 · µs→s |
| 📊 仪表盘 | 双后端对比 | C Native vs 纯 JS |
| 📊 仪表盘 | 经典 vs PQC | 8 维度并排 |
| 🔬 分析 | TVLA 状态看板 | 5 算法 · 31/36 PASS |
| 🔬 分析 | 供应链依赖风险图 | 12 节点 · 21 边 · 370 文件 |
| 🔬 分析 | 交互式依赖下钻 | 点击 → 全维度详情面板 |
| 🔬 分析 | FPGA 资源热力图 | LUT/FF/BRAM/DSP |
| 📈 趋势 | 评分时间轴 | CARS 62→75 / IBM 39→63 |
| 📈 趋势 | 项目演进螺旋 | 25 里程碑 · 4 阶段 |
| 🗺️ 全景 | 算法族谱树 | 18 节点 · 6 分支 · 径向布局 |
| 🗺️ 全景 | PQC 安全等级对比 | 10 算法 · 4 指标 |

---

## 评分卡（2026-08-03）

| 框架 | 综合分 | 各维度 |
|:---|:---|:---|
| **CARS** | **78.50** | 加密资产盘点 90 · 算法敏捷性 61 · 密钥生命周期 82 · 协议耦合 73 · 组织准备度 78 |
| **IBM 七维** | **63.70 HIGH** | D1 接口抽象 60 · D2 配置外部化 50 · D3 版本管理 90 · D4 格式耦合 55 · D5 协议协商 60 · D6 替换成本 50 · D7 可观测性 92 |

---

## 工程成熟度

| 维度 | 状态 |
|:---|:---|
| CI/CD | GitHub Actions · 24 jobs · 4 平台 · 全绿 |
| 依赖 | npm audit · dependabot 自动更新 · 0 Ghost |
| 安全 | CodeQL · OpenSSF Scorecard Passing · Repolinter |
| 治理 | 11 份安全文档 (GDPR/LGPD/IRP/BCP/密码法) |
| 可复现 | lockfiles · .nvmrc · reproduce-build.sh |
| CBOM | CycloneDX 1.5 · 12 算法 · 370 文件依赖 |

---

## 开源承诺

1. **可审计**：每一行代码可读、可单步、有 KAT 验证
2. **可复现**：`npm install && npm test` 就过
3. **无造假**：100+ FreeTSA/DigiCert TSR 证据链
4. **教育优先**：不追求性能极致，追求理解深度
5. **诚实透明**：SM2 纯 JS 的 TVLA FAIL 如实展示，标注"纯 JS 物理边界"

---

## 快速开始

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm install
npm test
```

浏览器打开 `www/docs/pqc-dashboard.html` 即可探索全部可视化。

---

## 路线图

| 版本 | 时间 | 重点 |
|:---|:---|:---|
| v3.3 | 2026-08-31 | 开源首发 · 14 可视页 · CARS 78.50 |
| v3.4 | 2027 Q1 | 第三方安全审计整合 |
| v4.0 | 2027 Q2 | Rust/WASM SM2 恒定时间实现 |

---

## 联系

- 网站：[fibemate.net](https://fibemate.net)
- 邮箱：[support@fibemate.net](mailto:support@fibemate.net)
- GitHub：[github.com/Lennonhaha/fibemate](https://github.com/Lennonhaha/fibemate)

---

*「不更快，但更清楚。」——FIBEMATE 灵魂定位*

*© 2026 FIBEMATE · GPL-3.0-only*
