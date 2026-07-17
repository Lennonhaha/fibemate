# DigiCert TSA 证书链

本目录存放 FIBEMATE RFC3161 时间戳存证（`.tsr`）的验证用 CA 链。

## 文件

- `digicert-tsa-chain.pem` — **完整验证链（PEM，有效）**，用于 `openssl ts -verify`：
  - `DigiCert SHA256 RSA4096 Timestamp Responder 2025 1` (leaf，签发的 TSA 响应证书)
  - `DigiCert Trusted G4 TimeStamping RSA4096 SHA256 2025 CA1` (中间 CA)
  - `DigiCert Trusted Root G4` (根 CA)
- `digicert-tsa-responder.pem` — 仅 leaf 证书（从某份 `.tsr` 内嵌提取，备用）。
- `digicert_tsa_chain.pem` — 同上完整链（兼容旧脚本引用，已覆盖为有效 PEM）。

## 链的来源

DigiCert TSA（时间戳服务）在每次签发时会把 **leaf 证书** 嵌入 `.tsr` 响应内，
但中间 CA 与根 CA 不在响应中。本链的中间/根证书取自 DigiCert 公开 CA 仓库
（`cacerts.digicert.com`），与 leaf 的签发者链一致：

```
leaf  : DigiCert SHA256 RSA4096 Timestamp Responder 2025 1
中间  : DigiCert Trusted G4 TimeStamping RSA4096 SHA256 2025 CA1
根    : DigiCert Trusted Root G4
```

## 验证

```bash
openssl ts -verify \
  -in  <file>.tsr \
  -queryfile <file>.tsq \
  -CAfile digicert-certs/digicert-tsa-chain.pem
# 期望输出: Verification: OK
```

若系统信任库已含 DigiCert 根（Linux `/etc/ssl/certs` 通常包含），也可：

```bash
openssl ts -verify -in <file>.tsr -queryfile <file>.tsq -CApath /etc/ssl/certs
```

> 注意：仓库早期 commit 中的 `digicert_tsa_chain.pem` 曾为损坏的 DER 片段，
> 已在 2026-07-16 重新生成为上述有效 PEM 链。所有 `.tsr` 均使用同一 DigiCert
> TSA 2025 链，故一份链文件可用于全部存证验证。
