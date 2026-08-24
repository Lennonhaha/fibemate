# TLS Path A (X25519MLKEM768) 废弃复盘

**状态**：永久搁置
**日期**：2026-07-18 诊断完成，2026-08-25 正式关闭
**责任**：FIBEMATE 核心团队

## 1. 背景

Path A 指在标准 TLS 1.3 层使用 X25519MLKEM768 混合密钥交换（NIST 标准化后量子算法），通过 OpenSSL oqs-provider 实现浏览器 ↔ Nginx 间的原生后量子 TLS 握手。

## 2. 诊断结论

详见 [path-a-diagnosis_2026-07-18.md](../memory/archive/path-a-diagnosis_2026-07-18.md)。

| 项目 | 状态 |
|:---|:---|
| oqs-provider 编译安装 | ✅ v0.7.0 |
| liboqs 链接 | ✅ |
| X25519MLKEM768 算法可用 | ✅ |
| openssl.cnf 配置 | ✅ |
| oqsprovider 自动加载 | ❌ OpenSSL 3.0.13 bug |
| Nginx 实际协商混合组 | ❌ 回退到纯 X25519 |

**根因**：Ubuntu 24.04 系统 OpenSSL 3.0.13 存在已知 provider auto-loading bug——通过 `openssl.cnf` 配置 `[provider_sect]` + `activate = 1` 不会将第三方 provider 的 groups/KEM 注册到 TLS 协商层。只有命令行 `-provider oqsprovider` 显式指定时才生效，而 Nginx 不支持此参数。

## 3. 处置决策

**永久搁置 Path A**，原因：

1. OpenSSL 3.0.x provider auto-loading bug 无法在应用层修复
2. 升级到 OpenSSL 3.2+ 需要从源码编译 Nginx，维护成本过高
3. 浏览器侧 X25519MLKEM768 支持尚不稳定（Chrome canary only）
4. FIBEMATE 已有 Path C-2（应用层 SM2+ML-KEM-768 混合 KEX，IANA #4590）作为替代方案

## 4. 代码清理

- 生产代码（`src/`、`www/`）中无 X25519MLKEM768 混合 KEX 实现残留
- `algorithm-resolver.js` 中保留 `X25519` 条目作为算法注册表参考数据（非 Path A 代码）
- `scripts/archive/` 中保留 `tls-hybrid-upstream.js` 作为代码归档（不进入 CI 编译）

## 5. 替代方案

**Path C-2（当前活跃）**：应用层 SM2-MLKEM768 混合密钥交换
- 实现：`src/tls-hybrid-extension.js` + `www/crypto/hybrid-kem-client.js`
- IANA TLS NamedGroup #4590
- 不依赖 OpenSSL provider，纯应用层实现
- 已通过 100k 轮 SM2 交叉验证 + ML-KEM 10k 轮 KAT

## 6. 教训

- 标准化协议（TLS）的生态支持滞后于算法标准化
- 应用层 KEX 虽不如 TLS 层透明，但可控性和可调试性更优
- 后续如需 TLS 层后量子，应等待 OpenSSL 3.4+ 稳定后再评估
