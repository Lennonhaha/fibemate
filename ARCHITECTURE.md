# FIBEMATE 架构总览

> 版本: v3.3.0 | 最后更新: 2026-08-03
> 详细架构见 [`docs/architecture.md`](docs/architecture.md)

## 系统分层

```
┌─────────────────────────────────────────────────────────┐
│ 1. 浏览器前端 (www/)                                      │
│    ML-KEM / SLH-DSA / SM2/3/4 通过 WASM 包加载            │
│    26 个交互可视化 (Math→Code→Hardware)                   │
└───────────────────────────┬─────────────────────────────┘
            │  HTTPS (应用层混合 KEX, Path C-2)
            ▼
┌─────────────────────────────────────────────────────────┐
│ 2. 后端服务 (src/)                                        │
│    Node.js + Express                                      │
│    TLS 1.3 Hybrid Handshake (SM2 + ML-KEM-768, Path C-2) │
│    OPK 一次性预密钥协议 (X3DH-like)                       │
└───────────────────────────┬─────────────────────────────┘
            │  Native Addon (N-API)
            ▼
┌─────────────────────────────────────────────────────────┐
│ 3. 原生密码核心 (packages/pqc-kem/)                       │
│    ML-KEM-768 C Native + WASM 双实现 (FIPS 203)          │
│    SM2/SM3/SM4 纯 JS 参考实现                            │
│    fml-dsa (ML-DSA-44/65/87, FIPS 204)                   │
└───────────────────────────┬─────────────────────────────┘
            │  PCIe / JTAG (硬件卸载)
            ▼
┌─────────────────────────────────────────────────────────┐
│ 4. FPGA NTT 加速器 (rtl/)                                 │
│    Artix-7 XC7A200T | WNS 9.755ns | ILA+L4 完整性       │
└───────────────────────────┬─────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ 5. 形式化验证层 (L4)                                      │
│    TLA+ 状态机 (7 不变式) 验证 Path C-2 握手             │
│    TLC 201,467 states, 0 violations, DigiCert TSR lg-069 │
└─────────────────────────────────────────────────────────┘
```

## 核心模块

### 密码学原语层 (packages/)

| 模块 | 路径 | 标准 | 状态 |
|:---|:---|:---|:---|
| ML-KEM-768 | `packages/pqc-kem/src/ml-kem-768.js` | FIPS 203 | ✅ 工程就绪 |
| fml-dsa | `packages/fml-dsa/` | FIPS 204 (ML-DSA) | ✅ 跨 Noble 互操作 |
| SLH-DSA | `packages/pqc-kem/` (WASM) | FIPS 205 | ✅ 集成 |
| SM2 | `packages/sm2/` | GB/T 32918 | ✅ TVLA 5/5 |
| SM3 | `packages/sm3/` | GB/T 32905 | ✅ KAT |
| SM4-αGCM | `packages/sm4/` | GB/T 32907 | ✅ 10/10 |

### 应用层混合协议 (src/)

| 路径 | 说明 | 状态 |
|:---|:---|:---|
| Path A (TLS 传输层) | X25519MLKEM768, IANA #4588 | 🔶 已完成但搁置 (浏览器生态) |
| Path C-2 (应用层) | SM2+ML-KEM-768, IANA #4590 | ✅ 活跃, 5/5 E2E |

### 实验组件 (default-off, 无安全保证)

| 组件 | 分支 | 说明 |
|:---|:---|:---|
| VWZ | `experimental/vwz-lg` | 张量签名方案 (VMQ-SPARSE 假设) |
| LookingGlass v2 | `experimental/vwz-lg` | 代数群表示二进制混淆 |

## 安全边界

| 层 | 内容 | 安全级别 |
|:---|:---|:---|
| L1–L7 | 标准算法 (ML-KEM/SLH-DSA/SM2) | 128-bit 经典 + 128-bit PQC |
| L8 | 运行时完整性检测 (43/43) | 逻辑完整性 |
| L9 | 硬件故障保护 (FPGA v5) | 物理攻击面 |

实验组件 (VWZ / LookingGlass) 永不进入生产加密路径。

## 技术栈

- **语言**: JavaScript (46%) / HTML (41%) / C (5%) / Verilog (3%) / Shell (2%) / CSS (1%)
- **运行时**: Node.js ≥18 (推荐 20/22)
- **原生加速**: C++17 N-API Addon (ML-KEM-768 NTT)
- **WASM**: wasm-pack / wasm-opt -O4
- **FPGA**: Vivado 2023+, Artix-7 XC7A200T
- **CI**: GitHub Actions (CI / Nightly / CodeQL / OpenSSF Scorecard / Native Build)
- **许可证**: GPL-3.0

## 已知限制

- 无第三方安全审计 (规划 2027 Q2)
- 物理 TVLA (ChipWhisperer) 未完成 (目标 Q4 2026)
- 无 KMS / 证书管理 / 吊销 / 轮换
- 非生产产品, 工程演示平台
