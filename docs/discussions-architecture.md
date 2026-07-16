# 架构讨论

## 核心架构

```
浏览器/客户端
  └── TLS 1.3 Hybrid (路径 A: X25519MLKEM768 / 路径 C-2: SM2+ML-KEM-768)
        ├── 服务器 (reg-server, Node.js + WebSocket, PM2 管理)
        └── ML-KEM-768 WASM + Native C
              ├── SM2 ECDH (TVLA 5/5)
              ├── SM4-aGCM 认证加密
              └── OPK 预密钥 (X3DH 异步握手)

FPGA (Artix-7 35T FGG484)
  └── NTT 流水线 + LFSR PRNG + 故障保护
        ├── LookingGlass v2 (L1-L7 TVLA)
        └── VWZ 签名 (格-张量, k=16)
```

## CI/CD 流水线

### CI (Push / PR)
- **node-test**: Node.js 单元测试 (test-keccak.js, test-fibemate.js)
- **docs-check**: Markdown 格式检查 (markdownlint + dead link)

### Nightly (每日 06:00 UTC)
- **kat-smoke**: 跨语言 KAT 测试 (JS + Rust, ML-KEM-768 KAT 10,000)
- **wasm-build**: lgv2 Rust to WASM 编译验证

### Release (发布触发)
- **publish**: @fibemate/* 包发布到 npm

> **构建注意**: 优先使用 npm ci 而非 npm install（基于 lockfile 确保跨平台一致）。Windows 下 __dirname 在 ESM 模块中为脚本目录。

## 密钥生命周期

| 密钥类型 | TTL | 用途 |
|----------|-----|------|
| identity_sm2/identity_mlkem | 180d | 长期身份密钥 |
| signed_prekey | 7d / 1000次 | 中期密钥 |
| opk | 7d / 1次 | 一次性预密钥 |

## 形式化验证

- L4 路径 C-2: TLA+ 7 不变式，101,467 states，TLC EXIT 0
- K3 强形式: key[i] != key[j] 密码学独立验证
- 局限性: lossy network deadlock 绕过（TCP 重传兜底），K3 基于 key=i 构造而非密码学独立采样