# FIBEMATE 系统架构

> 版本: v3.3 | 最后更新: 2026-07-22

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    用户接入层                         │
│   Web (fibemate.net)  │  Tauri Desktop (v2)  │  CLI  │
└────────────┬────────────────────────────────────────┘
             │
     ┌───────▼────────┐
     │   前端安全层     │  ML-KEM-768 WASM | SM2/SM4 JS | IndexedDB
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │   消息加密层     │  MessageCrypto: Hybrid E2EE
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │   传输层        │  WebSocket (reg-server) | TLS 1.3
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │   密钥管理层     │  KeyStorage (IndexedDB) | OPK Pool
     └────────────────┘
```

## 核心模块

### 1. 密码学原语层 (packages/)

| 模块 | 路径 | 说明 |
|:---|:---|:---|
| ML-KEM-768 | `packages/pqc-kem/src/ml-kem-768.js` | FIPS 203 NTT 域实现 |
| SM2 | `packages/sm2/src/sm2.js` | 国密椭圆曲线, k-masking 加固 |
| SM3 | `packages/sm3/src/sm3.js` | 国密哈希 |
| SM4 | `packages/sm4/src/sm4.js` | 国密分组密码 |
| VWZ | `rust/vwz-sign-wasm/` | 后量子签名实验方案 (k=8) |
| LookingGlass v2 | `lookingglass-v2/` | 等变 LWE 混淆层 (独立仓库) |

### 2. 消息加密层 (www/crypto/)

| 模块 | 文件 | 说明 |
|:---|:---|:---|
| 混合加密 | `message-gm.js` | SM2-SM4 & ML-KEM+SM4 hybrid E2EE |
| 密钥存储 | `key-storage.js` | IndexedDB 持久化密钥管理 |
| SM2 BigInt | `sm2-bigint-ec.js` | SM2 标量蒙哥马利阶梯实现 |

### 3. 传输层 (reg-server/)

| 模块 | 文件 | 说明 |
|:---|:---|:---|
| Registration Server | `reg-server/server.js` | WebSocket 协议, IANA #4590 |
| E2E Test | `reg-server/e2e-test.js` | 端到端协议测试 |
| WSS Test | `reg-server/wss-test.js` | 安全 WebSocket 测试 |

### 4. 前端 (www/)

| 页面 | 文件 | 说明 |
|:---|:---|:---|
| 官网首页 | `www/index.html` | 产品主页, TSR 状态 |
| PQC Readiness | `www/pqc-readiness.html` | PQC 迁移技术架构 |
| GM Demo | `www/gm-test.html` | 国密算法测试页 |
| TLS Hybrid Demo | `www/tls-hybrid-demo.html` | 混合 TLS 演示 |

### 5. 硬件 (rtl/)

| 模块 | 路径 | 说明 |
|:---|:---|:---|
| NTT Core | `rtl/ntt/` | FPGA NTT 加速器 |
| VWZ Solver | `rtl/vwz/` | FPGA BRAM 签名求解器 |
| STM32 | `c-stm32/` | Cortex-M4 C 框架 |

## 数据流

### E2EE 消息流 (ML-KEM 握手)

```
Alice                           Reg Server                      Bob
  │                                 │                              │
  │── generateKeypair() ──┐        │                              │
  │                       │        │                              │
  │── fetch-opk(Bob) ────▶│───────▶│ (返回 Bob 的 OPK)            │
  │◀──────────────────────│◀───────│                              │
  │                       │        │                              │
  │── encapsulate(pkB) ──┐│        │                              │
  │  → (ct, ss)          ││        │                              │
  │── e2e-init(ct) ──────▶│───────▶│── decapsulate(skB, ct)       │
  │                       │        │  → ss (32B 共享密钥)          │
  │                       │        │                              │
  │── e2e-msg(enc(data,ss))──▶────▶│── decrypt(data, ss)          │
  │                       │        │                              │
```

### 密钥生命周期

```
生成 → 注册 (reg-server) → 上传 OPK → 握手 (ML-KEM) → 派生对称密钥 → 加密通信
  │                                                        │
  └── IndexedDB 持久化 ←───────────────────────────────────┘
```

## 安全边界

```
     不可信网络              可信本地                可信硬件 (未来)
  ┌─────────────┐    ┌────────────────┐    ┌───────────────┐
  │  TLS 1.3    │    │  IndexedDB     │    │  FPGA NTT     │
  │  WebSocket  │    │  KeyStorage    │    │  STM32 安全元件│
  │  中间人     │    │  内存加密      │    │  物理 TVLA    │
  └─────────────┘    └────────────────┘    └───────────────┘
```

详见 [THREAT_MODEL.md](./THREAT_MODEL.md)

## 技术决策

| 决策 | 原因 | 记录 |
|:---|:---|:---|
| NTT 域实现 | 对齐 FIPS 203, 避免 time-domain 兼容问题 | `docs/kyber-to-fips203.md` |
| 默认关闭实验模块 | 安全隔离, 合规则 | `docs/design-decisions.md` |
| Noble 参考实现 | 审计级 JavaScript PQC 库 | `README.md` §交叉验证 |
| 不宣称 LWE 硬度增益 | 诚实工程, 避免安全误导 | `MEMORY.md` 2026-06-28 |

## 部署架构

```
                     Internet
                        │
                 ┌──────▼──────┐
                 │   Nginx     │  TLS 1.3 (Let's Encrypt)
                 │   :443      │
                 └──┬──────┬───┘
                    │      │
            ┌───────▼──┐ ┌─▼──────────┐
            │ 静态文件  │ │ reg-server  │
            │ /www     │ │ :3080 (WS)  │
            └──────────┘ └────────────┘
```

详见 [deployment.md](./deployment.md)

---

> 最后更新: 2026-07-22 | 重构版 (NTT 域)
