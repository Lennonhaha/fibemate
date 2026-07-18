# 📘 FIBEMATE 技术全景白皮书

**版本**：v3.3-preview | **日期**：2026-07-17 | **状态**：生产就绪 · 持续演进

---

> **摘要**：FIBEMATE 是一个全栈后量子密码学工程验证平台，融合 NIST FIPS 203/205 标准算法、国密 SM2/SM3/SM4、FPGA 硬件加速、TLA+ 形式化验证和实验性混淆研究。本文档是项目的完整技术白皮书，覆盖密码学实现、系统架构、安全验证、性能基准、部署运维和研究路线图。

---

## 目录

1. [项目愿景与定位](#1-项目愿景与定位)
2. [密码学核心](#2-密码学核心)
3. [系统架构](#3-系统架构)
4. [安全验证体系](#4-安全验证体系)
5. [性能基准](#5-性能基准)
6. [部署与运维](#6-部署与运维)
7. [研究线：LookingGlass & VWZ](#7-研究线lookingglass--vwz)
8. [路线图与未来工作](#8-路线图与未来工作)
9. [附录](#9-附录)

---

## 1. 项目愿景与定位

### 1.1 使命

> **为下一代互联网提供可验证、可部署、可演进的后量子密码学基础设施。**

FIBEMATE 不是一个单一算法实现，而是一个**全栈工程验证平台**，目标是：
- 证明后量子密码学可以在真实生产环境中部署
- 为国密算法（SM2/SM3/SM4）提供抗量子升级路径
- 为学术界和工业界提供可复现的参考实现和验证数据

### 1.2 三条技术线

| 技术线 | 内容 | 状态 |
|--------|------|------|
| **标准 PQC** | ML-KEM-768 (FIPS 203) + SLH-DSA (FIPS 205) | ✅ 生产就绪 |
| **国密混合** | SM2/SM3/SM4 + ML-KEM (IANA #4590) | ✅ 双轨上线 |
| **前沿研究** | LookingGlass v2.2 + VWZ 签名 | 🔬 实验分支 |

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **可验证优先** | 所有密码学实现经过 KAT、TVLA、TSR 三验证 |
| **纵深防御** | L1-L9 多层防御（密码学 → 运行时检测 → 硬件防护） |
| **双轨互不干扰** | 经典客户端自动降级，PQC 客户端使用混合加密 |
| **透明演进** | 公开记录成功、失败、修正全过程 |

---

## 2. 密码学核心

### 2.1 ML-KEM-768 (FIPS 203)

**定位**：后量子密钥封装机制（KEM），NIST 安全等级 3（等效 AES-192）。

| 属性 | 值 |
|------|-----|
| 算法 | CRYSTALS-Kyber (FIPS 203) |
| 公钥大小 | 1184 字节 |
| 私钥大小 | 2400 字节 |
| 密文大小 | 1088 字节 |
| 共享密钥 | 32 字节 |
| 安全等级 | 128-bit 后量子 |

**实现**：
- C Native Addon（AVX2 优化）
- 纯 JavaScript 参考实现
- WASM（Rust 编译，63KB raw / 27KB gzip）

**验证**：
- KAT 10,000/10,000 ✅
- TVLA N=10,000 20/20 ✅

### 2.2 SLH-DSA (FIPS 205)

**定位**：后量子数字签名，基于哈希（SPHINCS+）。

| 属性 | 值 |
|------|-----|
| 算法 | SPHINCS+ (FIPS 205) |
| 签名大小 | 7,856 字节 |
| 公钥大小 | 32 字节 |
| 私钥大小 | 64 字节 |
| 安全等级 | 128-bit 后量子 |

**实现**：WASM（浏览器兼容）

### 2.3 国密算法栈 (SM2/SM3/SM4)

| 算法 | 类型 | 用途 | 验证 |
|------|------|------|------|
| **SM2** | 椭圆曲线 ECC | 密钥协商、签名 | TVLA N=10,000 20/20 ✅ |
| **SM3** | 哈希 | 完整性、密钥派生 | HMAC-SM3 TVLA 8/8 ✅ |
| **SM4** | 分组加密 | 批量数据加密 | 10/10 PASS ✅ |

**SM2 性能优化**（5 阶段）：

| 阶段 | 优化 | 加速比 |
|------|------|--------|
| Stage 1 | Native BigInt 域运算 | 7.33× |
| Stage 2 | Jacobian 投影坐标 | 消除模逆 |
| Stage 3 | 256 点预计算表 | 2.6× |
| Stage 4 | wNAF 窗口算法 (w=4) | 1.16× |
| Stage 5 | Comb G 表全局缓存 | sign 3.1×, verify 2.0× |

### 2.4 混合密钥交换（双路径）

| 路径 | 层面 | 方案 | IANA | 状态 |
|------|------|------|------|------|
| **Path A** | TLS 1.3 握手层 | X25519MLKEM768 | 4588 | ✅ Active (oqs-provider) |
| **Path C-2** | 应用层 | SM2+ML-KEM-768 | 4590 | ✅ 已上线 (E2E 5/5, p95=78.5ms) |

**Path C-2 协议流程**：
```
客户端                                              服务器
  │                                                    │
  ├── GET /api/pqc-hybrid/init ──────────────────────┤
  │   ← pk (ML-KEM-768 公钥) + tlsSessionId          │
  │                                                    │
  ├── ML-KEM-768 Encaps(pk) → ct                      │
  ├── POST /api/pqc-hybrid/finalize ─────────────────┤
  │   { ct, tlsSessionId }                            │
  │                                                    │
  │   HKDF(TLS_Exporter || ML-KEM_SS) → sessionKey    │
  │   ← sessionKey                                    │
  │                                                    │
  └── sessionKey 用于 SM4-αGCM 加密数据 ──────────────┤
```

---

## 3. 系统架构

### 3.1 网络拓扑

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  阿里云 ECS (8.156.77.68)                              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  nginx stream (SNI 路由)                         │   │
│  │  监听 :443 (HTTPS/SSH 复用)                       │   │
│  └─────────────────────────────────────────────────┘   │
│       │                                    │            │
│       ▼                                    ▼            │
│  ┌─────────────────┐              ┌─────────────────┐   │
│  │  nginx (HTTPS)  │              │  SSH (:22)       │   │
│  │  监听 :8443     │              │  (Workbench 备用) │   │
│  │  X25519MLKEM768 │              └─────────────────┘   │
│  │  oqs-provider   │                                    │
│  └─────────────────┘                                    │
│       │                                                 │
│       ▼                                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Node.js 服务 (PM2 管理)                         │   │
│  ├─────────────┬────────────────┬──────────────────┤   │
│  │  主 API     │  reg-server    │  WebSocket       │   │
│  │  :3001      │  :3080 (WS)   │  :3081 (health)  │   │
│  │  ML-KEM-768 │  IANA #4590   │  E2E 握手        │   │
│  └─────────────┴────────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 端口映射

| 端口 | 服务 | 外部可达 | 说明 |
|------|------|----------|------|
| 443 | nginx stream (SSH/HTTPS SNI) | ✅ | SSH over 443 |
| 8443 | nginx HTTPS | ❌ (仅本地) | TLS 1.3 + X25519MLKEM768 |
| 80 | nginx HTTP (重定向到 443) | ✅ | Let's Encrypt 验证 |
| 3001 | 主 API (noir-backend) | ❌ | ML-KEM-768 KEM |
| 3080 | reg-server WebSocket | ❌ | IANA #4590 E2E 握手 |
| 3081 | reg-server Health Check | ❌ | 健康检查 |
| 22 | SSH (备选) | ❌ (Workbench) | 运维通道 |

### 3.3 服务清单

| 服务 | 路径 | 端口 | 语言 | 说明 |
|------|------|------|------|------|
| 主 API | `/opt/fibemate-full/src/index.js` | 3001 | Node.js | ML-KEM-768 KAT + 研究 API |
| reg-server | `/opt/fibemate-full/reg-server/server.js` | 3080/3081 | Node.js | IANA #4590 混合 KEX |
| 前端 | `/opt/fibemate-full/www/` | 8443 (nginx) | HTML/JS | 官网 + 密码学演示 |
| TLS 混合 | oqs-provider + OpenSSL 3.0.13 | 443 | C | X25519MLKEM768 |
| LG v2.2 | `/opt/fibemate-full/www/crypto/lgv2/` | WASM | Rust | 实验性混淆（默认关闭） |
| FPGA | Artix-7 xc7a35t | UART | Verilog | NTT 加速（UART 未通） |

### 3.4 协议栈

```
┌─────────────────────────────────────────────────────────┐
│  Layer 8: 时间戳存证 (TSR) 76 份                        │
│    └──────────────────────────────────────────────────┘ │
│  Layer 7: 密钥生命周期管理 (PBKDF2 + AES-GCM-256)       │
│    └──────────────────────────────────────────────────┘ │
│  Layer 6: 零知识认证 (Bulletproofs + Schnorr)           │
│    └──────────────────────────────────────────────────┘ │
│  Layer 5: 流量混淆 (泊松塑形 + 随机填充)                │
│    └──────────────────────────────────────────────────┘ │
│  Layer 4: 双棘轮 (Double Ratchet + ML-KEM-768)          │
│    └──────────────────────────────────────────────────┘ │
│  Layer 3: 应用层混合加密 (SM2 + ML-KEM-768, IANA #4590) │
│    └──────────────────────────────────────────────────┘ │
│  Layer 2: TLS 1.3 混合握手 (X25519MLKEM768, IANA 4588)  │
│    └──────────────────────────────────────────────────┘ │
│  Layer 1: 传输层 (TCP/IP, nginx, systemd)               │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 安全验证体系

### 4.1 三线测试套件

| 测试轨道 | 覆盖范围 | 状态 |
|----------|----------|------|
| Track 1: 正式验证 | KAT (9/9)、代数恒等式、IND-CPA、隐式拒绝 | ✅ 22/22 |
| Track 2: 跨语言互操作 | JS ↔ WASM 自洽性 | ✅ 15 passed, 2 预期差异 |
| Track 3: FIPS 140-3 | POST、PCT、完整性、自锁 | ✅ 6/6 |

### 4.2 确定性可重现性

| 测试项 | 循环数 | 结果 |
|--------|--------|------|
| JS keygen reproducibility | 200/200 | ✅ |
| WASM keygen reproducibility | 200/200 | ✅ |
| JS encap reproducibility | 100/100 | ✅ |
| WASM encap reproducibility | 100/100 | ✅ |
| JS round-trip | 100/100 | ✅ |
| WASM round-trip | 100/100 | ✅ |

### 4.3 TVLA 侧信道验证

| 模块 | 样本量 N | 结果 |
|------|----------|------|
| ML-KEM-768 C Native | 10,000 | 核心操作恒定时间 ✅ |
| SM2 v1.3 Montgomery Ladder | 5,000 | 7/7 全 PASS (verify 0.10, decrypt 0.16) |
| SM2 高阶 TVLA (1-4 阶矩) | 5,000 | 20/20 全 PASS |
| HMAC-SM3 | 2,000 | 8/8 全 PASS |
| SM4-αGCM | 10/10 | 功能验证 PASS |

### 4.4 时间戳存证 (TSR)

| 指标 | 值 |
|------|-----|
| 总存证 | 76 份（lg-001~071 + lg-074~078） |
| 缺失 | lg-072, lg-073, lg-075（从未生成） |
| 签发机构 | DigiCert + FreeTSA (RFC 3161) |
| 跨度 | 2026-06-25 ~ 2026-07-17 |

### 4.5 L4 形式化验证 (TLA+)

| 指标 | 值 |
|------|-----|
| 协议 | Path C-2 (SM2+ML-KEM-768) |
| 不变量 | 7 条（TypeOK, K1~K5, K3_StrongKeyIndependence） |
| 状态数 | 101,467 states |
| 违例 | 0 |
| 死锁 | 0 |
| TSR | lg-078 |

---

## 5. 性能基准

### 5.1 ML-KEM-768

| 操作 | C Native Addon (AVX2) | 纯 JavaScript | WASM |
|------|----------------------|---------------|------|
| keygen | 48 µs | ~1.3 ms | ~1.87 ms |
| encaps | 51 µs | ~1.8 ms | — |
| decaps | 105 µs | ~2.5 ms | — |

**KAT 10,000 轮**：~2.9s（C Native）

### 5.2 SM2 性能（Node.js v22, Intel Xeon Ice Lake）

| 操作 | jsbn (ms) | BigInt+优化 (ms) | 加速比 |
|------|-----------|------------------|--------|
| 密钥生成 | 11.654 | 1.460 | **7.98×** |
| 签名 | 30.151 | 4.868 | **6.19×** |
| 验签 | 28.359 | 8.998 | **3.15×** |
| 加密 | 23.134 | 2.757 | **8.39×** |
| 解密 | 11.698 | 1.386 | **8.44×** |
| 公钥派生 | 11.408 | 1.325 | **8.61×** |

### 5.3 TLS 混合握手 (oqs-provider)

| 操作 | 混合 (X25519MLKEM768) | 经典 (X25519) | 比值 |
|------|:---:|:---:|:---:|
| KeyGen | 9.50 ms/op | 5.97 ms/op | 1.59× |
| Encaps | 2.78 ms/op | — | — |
| Decaps | 2.79 ms/op | — | — |
| ECDH Derive | — | 5.66 ms/op | — |

> **注**：以上为 openssl CLI 测量（含进程 fork 开销）。ML-KEM Encaps 比经典 ECDH 快 2×，混合握手总开销增加约 3.5ms。

### 5.4 FPGA NTT (Artix-7 xc7a35t)

| 指标 | 值 |
|------|-----|
| NTT 256 系数变换 | 256/256 匹配 ✅ |
| INTT 256 系数逆变换 | 256/256 匹配 ✅ |
| Round-trip | 256/256 全匹配 ✅ |
| WNS | +0.204ns ✅ |
| WHS | +0.049ns ✅ |
| LUT | ~13,000 |
| FF | ~10,000 |
| DSP48E1 | 2 |
| BRAM | 1 |

---

## 6. 部署与运维

### 6.1 部署架构

```bash
/opt/fibemate-full/
├── src/                  # 主 API (noir-backend)
│   └── index.js          # Express, ML-KEM-768 KAT
├── reg-server/           # IANA #4590 混合 KEX
│   ├── server.js         # WebSocket + HTTP
│   └── hybrid-kem-client.js
├── www/                  # 前端 + 文档
│   ├── index.html        # 官网
│   ├── crypto/           # 浏览器密码模块
│   ├── docs/             # 技术文档
│   └── tsa/              # TSR 存证文件
├── addon/                # C Native ML-KEM-768
├── rtl/                  # FPGA Verilog
├── package.json
└── ecosystem.config.js   # PM2 配置
```

### 6.2 关键配置（systemd override）

```bash
# /etc/systemd/system/nginx.service.d/override.conf
[Service]
Environment="LD_LIBRARY_PATH=/opt/oqs/liboqs-install/lib"
Environment="OPENSSL_CONF=/opt/oqs/openssl.cnf"
```

```ini
# /opt/oqs/openssl.cnf (关键片段)
[ssl_sect]
system_default = system_default_sect

[system_default_sect]
Groups = X25519MLKEM768:prime256v1:x25519
```

### 6.3 监控与告警

| 监控项 | 工具 | 阈值 |
|--------|------|------|
| 链接可用性 | `health-check.js` | 任一关键链接 ≥400 |
| 内容完整性 | `check-content.ps1` | 缺失关键词 |
| 证书过期 | OpenSSL | 到期前 15 天 |
| 响应时间 | `curl -w` | 首屏 >3s |

### 6.4 已知限制

| 限制 | 说明 | 缓解 |
|------|------|------|
| UART 未通 | FPGA 与 CPU 通信未闭环 | 不影响功能结论 |
| TLS 混合回退 | 浏览器不内置 oqsprovider | Path C-2 应用层混合已上线 |
| TSR 缺口 | lg-072/073/075 从未生成 | 已从序列中剔除 |

---

## 7. 研究线：LookingGlass & VWZ

### 7.1 LookingGlass v2.2

**定位**：实验性代码混淆与运行时检测层，默认关闭，不接入生产加密。

**核心原理**：
- 七层互不等价不可约群表示（舒尔引理保证层间不可合并）
- 三层工程加固（仿射偏移、层序随机化、稀疏偏移）
- L8/L9 运行时检测（哈希链、时序异常、秩不守恒）

| 验证项 | 结果 |
|--------|------|
| 逆向成本提升 | 5-12 倍 |
| 七层互不等价性 | 21/21 PASS |
| L8/L9 集成 | 43/43 PASS |
| WASM 大小 | 25.7KB (gzip 22.2KB) |
| TSR | lg-076, lg-078 |

**v2.3 增强（2026-07-17）**：
- 10 种动态不透明谓词（AlwaysTrue/False, TimeBased, StackAddressBased, PidBased, ArithmeticIdentity, PolynomialIdentity, MemoryLayoutBased, CpuCycleBased, Composite）
- 36/36 全绿

### 7.2 VWZ 签名

**定位**：独立研究分支——基于 Vandermonde 结构的格-张量混合签名方案。

| 指标 | 值 |
|------|-----|
| 签名大小 | 68 字节 (k=16, NIST-1 128-bit) |
| 公钥压缩 | 64.5× (19,074B → 296B) |
| 归约证明 | VMQ-SPARSE → EUF-CMA (148/148) |
| 状态 | 默认关闭，不部署生产 |

### 7.3 LookingGlass v3.1（已归档）

**结论**：球面投影在 Z3329 离散有限域中不提供密码学安全保证，已归档为纯理论探索。

| 工程验证 | 结果 | 数学判定 |
|----------|------|----------|
| 浮点版 | ❌ 往返误差 ~93702 | 连续几何与有限域不兼容 |
| 定点版 | ✅ 200/200 PASS | ❌ 不提供安全保证 |

---

## 8. 路线图与未来工作

### 8.1 近期目标（1-3 个月）

| 任务 | 优先级 | 预估 |
|------|--------|------|
| TLS 1.3 混合握手形式化验证（QROM 证明引用） | P1 | 1 周 |
| `openssl speed` 基准测试补全 | P1 | 1 天 |
| 部署文档 `docs/tls-hybrid-deployment.md` | P1 | 1 天 |
| 浏览器实测（Chrome/Firefox） | P2 | 2 天 |

### 8.2 中期目标（3-6 个月）

| 任务 | 优先级 | 预估 |
|------|--------|------|
| 第三方安全审计（NLNet 资助） | P0 | 1-2 月 |
| LookingGlass v2.2 独立开源库 | P1 | 1 周 |
| ePrint 论文预印本 | P1 | 2-4 周 |
| SM4 恒定时间实现（位切片 S-box） | P2 | 4-5 周 |
| npm 包发布 `@fibemate/ml-kem` | P2 | 1 周 |

### 8.3 长期目标（6-12 个月）

| 任务 | 说明 |
|------|------|
| 开源发布会（2026-08-31） | 所有核心代码 GPLv3 |
| Python/Go SDK 绑定 | 扩大开发者生态 |
| Kubernetes Helm Chart | 生产部署增强 |
| FPGA UART 调通 | 硬件加速闭环 |

---

## 9. 附录

### 9.1 关键文件清单

| 文件 | 路径 | 说明 |
|------|------|------|
| README.md | `/` | 主文档（英文） |
| README.zh-CN.md | `/` | 中文文档 |
| BUILD.md | `/` | 构建与部署指南 |
| LICENSE | `/` | GPLv3 |
| SECURITY.md | `/` | 安全策略 |
| formal-verification-L4_2026-07-14.md | `/` | TLA+ 形式化验证报告 |
| fpga-l8l9-43-tests_2026-07-15.md | `/` | L8/L9 测试清单 |
| MEMORY.md | `/` | 项目记忆 |

### 9.2 TSR 存证清单

| 编号 | 内容 | 签发机构 | 日期 |
|------|------|----------|------|
| lg-001~071 | 核心密码学模块 | DigiCert/FreeTSA | 2026-06-25~07-16 |
| lg-074 | L8/L9 43 tests | DigiCert | 2026-07-15 |
| lg-076 | LookingGlass v2.2 四模块 | FreeTSA | 2026-07-16 |
| lg-077 | 四模块量化评测 | DigiCert | 2026-07-16 |
| lg-078 | OPK TLA+ 形式化规范 | DigiCert | 2026-07-16 |

### 9.3 致谢

- **NIST PQC 标准化项目** — ML-KEM (FIPS 203), SLH-DSA (FIPS 205)
- **Open Quantum Safe** — liboqs, oqs-provider
- **中国国家密码管理局 (OSCCA)** — SM2/SM3/SM4 国家标准
- **FreeTSA / 联合信任** — 时间戳存证
- **NLnet 基金会** — 开源资助

---

> **FIBEMATE — Post-Quantum Cryptography, Engineered.**
>
> 官网：[fibemate.net](https://fibemate.net)
> GitHub：[Lennonhaha/fibemate](https://github.com/Lennonhaha/fibemate)
> 开源计划：2026-08-31
> 许可证：GNU GPLv3

---

**文档版本**：v3.3-preview | **最后更新**：2026-07-17 | **下一版本**：v3.3.0 (开源发布)
