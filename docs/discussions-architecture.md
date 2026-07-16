# 架构讨论

## 核心架构

```
浏览器/客户端
  └── TLS 1.3 Hybrid (Path A: X25519MLKEM768 / Path C-2: SM2+ML-KEM-768)
        ├── 服务器 (reg-server, Node.js + WebSocket, PM2 管理)
        └── ML-KEM-768 WASM + Native C
              ├── SM2 ECDH (TVLA 5/5)
              ├── SM4-αGCM 认证加密
              └── OPK 预密钥 (X3DH 异步握手)

FPGA (Artix-7 35T FGG484)
  └── NTT 流水线 + LFSR PRNG + 故障保护
        ├── LookingGlass v1/v2 (L1-L7 TVLA)
        └── VWZ 签名 (格-张量, k=16)
```

## 密钥生命周期

| 密钥类型 | TTL | 用途 |
|----------|-----|------|
| identity_sm2/identity_mlkem | 180d | 长期身份密钥 |
| signed_prekey | 7d / 1000次 | 中期密钥 |
| opk | 7d / 1次 | 一次性预密钥 |

## 形式化验证

- L4 Path C-2: TLA+ 7 不变式，101,467 states，TLC EXIT 0
- K3 强形式：`key[i] ≠ key[j]` 密码学独立验证
