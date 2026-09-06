# VWZ rank-2 FreeTSA 时间戳存证 (2026-09-06)

VWZ rank-1 WASM 伪造漏洞公开披露后，rank-2 修复产物于 2026-09-06 完成
FreeTSA RFC 3161 时间戳存证。时间戳证明以下文件字节串在 2026-09-06
12:59:55~59 GMT 已存在（早于公开披露，抗 commit 历史改写）。

## 存证文件

| 文件 | SHA256 | TSR | FreeTSA 序列号 | 时间戳 (GMT) |
|---|---|---|---|---|
| vwz_signature_bg.wasm (rank-2) | 30c28dd8...e3c6058 | vwz-rank2-wasm.tsr | 0x079EF5A7 | 2026-09-06 12:59:55 |
| vwz_signature.js | cb035cd9...7ae3890f | vwz-rank2-js.tsr | 0x079EF5AE | 2026-09-06 12:59:57 |
| vwz_signature.d.ts | 69d0c9d8...f7d8f02d | vwz-rank2-dts.tsr | 0x079EF5BD | 2026-09-06 12:59:58 |
| vwz-kat.json (24/24 KAT) | de09ace1...b7818104e2 | vwz-rank2-kat.tsr | 0x079EF5C2 | 2026-09-06 12:59:59 |

## 复验方法

```bash
# 需要 FreeTSA Root CA (freetsa-root-ca.pem, 已随仓保存)
openssl ts -verify -data <原始文件> -in <对应.tsr> -CAfile freetsa-root-ca.pem -no_check_time
# 输出 "Verification: OK" 即签名链 + 哈希绑定通过
```

源文件位于 `experimental/vwz-lg` 分支（www/crypto/vwz/ + vwz-kat.json），
本次存证不含源文件本身（避免仓库膨胀），以 SHA256 绑定。
