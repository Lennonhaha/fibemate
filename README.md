# FIBEMATE — 下一代后量子密码通信协议

**v3.1-preview** | 2026-07-06  
TSR 序列: lg-001 ~ lg-055 | 许可证: GNU GPLv3  
[fibemate.net](https://fibemate.net) | [PQC 就绪状态](https://fibemate.net/docs/pqc-readiness.html)

---

## 项目概述

FIBEMATE 是一个全栈后量子密码学工程验证平台，聚焦三条技术线：

| 线路 | 内容 | 状态 |
|------|------|------|
| **标准 PQC** | ML-KEM-768 (FIPS 203) + SLH-DSA (FIPS 205) — KAT、WASM、TLS 1.3 混合握手 | ✅ 生产就绪 |
| **国密混合** | SM2/SM3/SM4 + ML-KEM — IANA #4590 应用层验证 | ✅ 双轨道上线 |
| **前沿研究** | LookingGlass v1/v2 (群表示代数实验), VWZ 格-张量签名, FPGA v5 硬件防护 | 🔬 实验分支 |

### 生产环境

- **TLS 1.3 混合后量子握手** — 路径 A (X25519MLKEM768, NamedGroup) 已于 2026-07-07 搁置（浏览器/nginx 技术阻断） · 路径 C-2 (SM2+ML-KEM-768) 应用层 ✅ 5/5, p95=78.5ms, lg-053
- **路径 C-2** — SM2+ML-KEM-768 混合密钥交换 (IANA #4590 应用层验证)
- **双轨道互不干扰** — 普通客户端自动降级至经典 ECDH

---

## 核心特性

| 模块 | 说明 | 验证 |
|------|------|------|
| **ML-KEM-768** | C Native + WASM 双实现，FIPS 203 合规 | KAT 10,000/10,000 |
| **SLH-DSA** | pqc_sphincsplus WASM (FIPS 205)，签名 7,856B | WASM 集成 |
| **SM2 ECDH** | BigInt 标量掩码 + 射影随机化，常量时间 | TVLA 5/5 PASS (N=10,000) |
| **SM4-αGCM** | α=7.5 认证加密，自动选择 λ₂C 或 SM4 | 10/10 PASS |
| **SM3 哈希** | GB/T 32905 合规 | KAT 通过 |
| **TLS 1.3 混合** | 路径 A 已搁置 · 路径 C-2 (SM2+ML-KEM-768) 应用层 ✅ | 路径 C-2 独立运行 |
| **OPK 预密钥** | X3DH 异步握手，7/7 全绿 | 端到端闭环 |
| **LookingGlass** | v1 DMTH 📦 (已归档) + v2 群表示代数实验 🔬 | v1 36/36 TVLA · v2 WASM 线性变换 |
| **VWZ 签名** | Vandermonde-Wang-Zhang 格-张量方案 (k=8) | WASM 7/7 |
| **FPGA v5** | NTT 流水线 + LFSR PRNG + 故障保护 | Artix-7 合成通过 |

---

## 快速开始

### 前置要求

- Node.js ≥ 18
- npm ≥ 9
- Git
- (可选) OpenSSL ≥ 3.0, Rust ≥ 1.70, Vivado 2023+

### 编译

```bash
# 克隆仓库
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate

# 安装 Node.js 依赖
npm install

# 编译 C Native 插件 (ML-KEM-768, NTT)
cd addon && npm install && cd ..

# 验证核心密码模块
node -e "const m=require('./addon/build/Release/mlkem.node'); const kp=m.keygen(); console.log('ML-KEM-768 OK:', kp[0].length+'B pk')"
```

### 启动服务

```bash
# 开发模式
npm start

# 生产模式
pm2 start ecosystem.config.js

# 服务默认监听 http://localhost:3001
# Nginx 反向代理示例见 BUILD.md
```

### 测试

```bash
# 运行所有核心测试
node test/test-all.js

# 分模块测试
node crypto/ml-kem-768-kat.js    # ML-KEM KAT 10000
node crypto/sm2-tvla-suite.js    # SM2 TVLA
node crypto/pqc-hybrid-test.js   # 混合握手
```

---

## 项目结构

```
fibemate/
├── src/                  # 服务端源码
│   ├── index.js          # Express 主入口
│   ├── pqc-hybrid-server.js  # 路径 C-2 混合握手
│   ├── opk-server.js     # X3DH 预密钥协议
│   ├── vwz-research-api.js   # VWZ 研究端 API
│   └── crypto/           # 混淆/填充/过滤器
├── addon/                # C Native 插件 (ML-KEM-768, NTT)
│   ├── build/Release/mlkem.node
│   └── ntt/              # FPGA NTT C 参考
├── www/                  # 前端资源
│   ├── index.html        # 主站
│   ├── crypto/           # 浏览器密码模块
│   │   ├── ml-kem-768.js
│   │   ├── sm2-bigint-ec.js (v1.2, TVLA 5/5)
│   │   ├── sm4-alpha-gcm.js
│   │   └── pqc-hybrid-client.js
│   ├── docs/             # 文档 + TSA 存证
│   │   ├── pqc-readiness.html
│   │   ├── lg-vwz-security-en.html
│   │   └── tsa/          # lg-001~053 TSR 文件
│   ├── lgv1/             # LookingGlass v1 (DMTH) 📦 已归档
│   └── lgv2/             # LookingGlass v2 群表示代数实验 WASM
├── rtl/                  # FPGA RTL (Verilog)
│   ├── ntt_core_pipe2.v
│   ├── vwz/
│   └── hw_monitor.v
├── c-stm32/              # STM32 C 框架
├── scripts/              # CI/构建/TVLA 脚本
├── experimental/         # 实验模块
├── package.json
├── ecosystem.config.js
├── LICENSE               # GPLv3
├── README.md             # 本文件
└── BUILD.md              # 构建与部署指南
```

---

## 安全模型

FIBEMATE 遵循纵深防御 (defense-in-depth) 三层架构（不包含 LookingGlass 实验分支）：

| 层 | 内容 | 安全水平 |
|----|------|---------|
| **L1-L7** | 标准 ML-KEM-768 + SLH-DSA + SM2 ECDH | 128-bit 经典 + 128-bit PQC |
| **L8** | 运行时检测器 (43/43 PASS) | 逻辑完整性 |
| **L9** | 硬件故障保护 (FPGA v5) | 物理攻击面 |

**LookingGlass (v1 DMTH 📦 已归档 + v2 群表示代数实验 🔬)**: 有限群表示克罗内克嵌套代数实验。外层为纯无损线性变换，不提升 LWE 格硬度。默认关闭，不接入生产加密链路。v1 已归档，v2 仅用于群论教学、硬件容错自检及 L8/L9 运行监测实验。

**VWZ**: 自研张量签名方案，保留在研究分支。不部署生产环境。

---

## IANA #4590

FIBEMATE 完成了 SM2+ML-KEM-768 混合方案的工程验证：

- **TLS 层** (路径 A): X25519MLKEM768 — 已于 2026-07-07 搁置（浏览器/nginx 技术阻断），编译产出保留供参考
- **应用层** (路径 C-2): SM2+ML-KEM-768 — HTTP 层混合密钥交换，lg-053 存证

详见 [draft-yang-tls-hybrid-sm2-mlkem](https://datatracker.ietf.org/doc/draft-yang-tls-hybrid-sm2-mlkem/)。

---

## 许可证

GNU General Public License v3.0 — 详见 [LICENSE](./LICENSE)

本项目的 ML-KEM-768 和 SLH-DSA 实现基于 NIST FIPS 203/205 标准。SM2/SM3/SM4 实现参考 GB/T 32918/32905/32907 国家标准。

---

## 致谢

- **NIST PQC 标准化项目** — ML-KEM (FIPS 203), SLH-DSA (FIPS 205)
- **Open Quantum Safe** — liboqs, oqs-provider
- **FreeTSA / 联合信任** — 时间戳存证

---

*FIBEMATE — Post-Quantum Cryptography, Engineered.*
