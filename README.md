# FIBEMATE - 后量子密码通信协议

**v3.3-preview** | 2026-07-17
TSR 序列: lg-001 ~ lg-078 | 许可证: GNU GPLv3
[fibemate.net](https://fibemate.net) | [PQC Readiness](https://fibemate.net/docs/pqc-readiness.html)

---

## 项目概述

FIBEMATE 是一个全栈后量子密码学工程验证平台，聚焦三条技术线：

| 路线 | 内容 | 状态 |
|------|------|------|
| **标准 PQC** | ML-KEM-768 (FIPS 203) + SLH-DSA (FIPS 205) - KAT、WASM、TLS 1.3 混合握持 | 生产就绪 |
| **国密混合** | SM2/SM3/SM4 + ML-KEM - IANA #4590 应用层验证 | 双轨路上线 |
| **前沿研究** | LookingGlass v2 (群表示代数实验)、VWZ 格-张量签名、FPGA v5 硬件防护 | 实验分支 |

> **注意**: 所有研究组件 (LookingGlass, VWZ) **默认关闭**，不提供密码学安全保证。

### 生产环境

- **TLS 1.3 混合后量子握手** - 路径 C-2 (SM2 + ML-KEM-768 应用层混合 KEX，IANA #4590) 零 5/5 E2E，p95=78.5ms，lg-053/lg-057
- **双轨道路由不干扰** - 普通客户端自动降级至经典 ECDH

---

## 核心模块

| 模块 | 说明 | 验证 |
|------|------|------|
| **ML-KEM-768** | C Native + WASM 双实现，FIPS 203 合规 | KAT 10,000/10,000 |
| **SLH-DSA** | pqc_sphincsplus WASM (FIPS 205)，签名 7,856B | WASM 集成 |
| **SM2 ECDH** | BigInt 标量掩码 + 射影随机化，常量时间 | TVLA 5/5 PASS (N=10,000) |
| **SM4-aGCM** | a=7.5 认证加密 | 10/10 PASS |
| **SM3 Hash** | GB/T 32905 合规 | KAT PASS |
| **TLS 1.3 混合** | 路径 C-2 (SM2+ML-KEM-768) 应用层 零 | 5/5 |
| **OPK 预密钥** | X3DH 异步握手 | 7/7 PASS |
| **LookingGlass v2** | 代数群表示二元混淆工具 | v2.1 WASM 37/37 |
| **VWZ 签名** | Vandermonde-Wang-Zhang 格-张量方案 (k=16) | WASM 7/7 · 归约 148/148 |
| **FPGA v5** | NTT 流水线 + LFSR PRNG + 故障保护 | Artix-7 综合 · WNS=9.755ns 零 · ILA+L4 闭环 |
| **L4 形式化验证** | TLA+ 状态机 路 路径 C-2 路 7 不变式 路 101,467 states 路 TLC EXIT 0 路 DigiCert TSR lg-069 | 工程验证 |

---

## CI/CD 流水线

### CI (Push / PR)
- **Node.js 单元测试**: test-keccak.js, test-fibemate.js
- **Markdown 格式检查**: markdownlint + dead link 检查

### Nightly (每日 06:00 UTC)
- **跨语言 KAT 验证**: JS + Rust (ML-KEM-768 KAT 10,000)
- **WASM 编译验证**: lgv2 Rust to WASM cargo test

### Release (发布时触发)
- **npm publish**: @fibemate/* 包发布到 npm

> **构建注意**: 优先使用 npm ci 而非 npm install（基于 lockfile 确保跨平台一致）。Windows 下 Node.js __dirname 在 ESM 模块中为当前脚本目录。

---

## 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9
- Git

### 构建

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm install

# Compile C Native addon (ML-KEM-768, NTT)
cd addon && npm install && cd ..

# Verify core crypto modules
node -e "const m=require('./addon/build/Release/mlkem.node'); const kp=m.keygen(); console.log('ML-KEM-768 OK:', kp[0].length+'B pk')"
```

### 运行

```bash
# Development
npm start

# Production
pm2 start ecosystem.config.js
```

### 测试

```bash
# All tests
node test/test-all.js

# Per-module
node crypto/ml-kem-768-kat.js    # ML-KEM KAT 10,000
node crypto/sm2-tvla-suite.js    # SM2 TVLA
node crypto/pqc-hybrid-test.js   # Hybrid handshake
```

---

## 项目结构

```
fibemate/
├── src/                  # 服务器源码
├── addon/               # C Native addon (ML-KEM-768, NTT)
│   └── build/Release/mlkem.node
├── www/                 # 前端资源
│   ├── crypto/         # 浏览器密码模块
│   ├── docs/           # 文档 + TSR 证据
│   └── lgv1/          # LookingGlass v1 (DMTH) 已归档
├── rtl/                 # FPGA RTL (Verilog)
├── c-stm32/            # STM32 C 框架
├── scripts/            # CI / 构建 / TVLA 脚本
├── package.json
├── LICENSE             # GPLv3
├── README.md           # 中文版
├── README.en.md        # 英文版
└── BUILD.md            # 构建与部署指南
```

---

## 安全模型

| 层级 | 内容 | 安全级别 |
|------|------|---------|
| **L1-L7** | 标准 ML-KEM-768 + SLH-DSA + SM2 ECDH | 128-bit 经典 + 128-bit PQC |
| **L8** | 运行时完整性检测器 (43/43 PASS) | 逻辑完整性 |
| **L9** | 硬件故障保护 (FPGA v5) | 物理攻击面 |

> LookingGlass 和 VWZ 为**实验性、默认关闭**的研究组件，无密码学安全保证。

---

## IANA #4590

- **TLS 层** (路径 A): X25519MLKEM768 - 已搁置（浏览器/nginx 技术阻断）
- **应用层** (路径 C-2): SM2+ML-KEM-768 HTTP 层混合 KEX，TSR lg-053/lg-057

见 [draft-yang-tls-hybrid-sm2-mlkem](https://datatracker.ietf.org/doc/draft-yang-tls-hybrid-sm2-mlkem/).

---

## 许可证

GNU General Public License v3.0 - 见 [LICENSE](./LICENSE)

---

*FIBEMATE - 后量子密码，工程化。*