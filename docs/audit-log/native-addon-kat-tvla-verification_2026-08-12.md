# C Native Addon + KAT/TVLA 代码完整性验证

**日期**：2026-08-12 D-19  
**目标**：确认"核心代码没上传"报告中，KAT 10000 + TVLA + C native addon 是否与 E 盘备份一致

## 验证方法

- 源 A：`C:\Users\maivs\.qclaw\workspace-tfxjjhfnjialcuju`（本地 workspace git 仓库，已推送 GitHub）
- 源 B：`E:\FIBEMATE_backup_20260806\fibemate\`（最后备份 2026-08-06 01:59）
- 逐文件 SHA256 比对

## 结果

### KAT/TVLA 脚本（13 文件）

| 文件 | 结果 |
|------|:---:|
| scripts/kat-bench.js | ❌ 差 1B（修复 require 路径 ./www/→../www/） |
| scripts/kat500.js | ✅ |
| scripts/tvla-mlkem-1024.mjs | ✅ |
| scripts/tvla-summary.js | ✅ |
| scripts/ci-mlkem-kat.cjs | ✅ |
| scripts/kat-quick.js | ✅ |
| scripts/kat-diag.js | ✅ |
| scripts/kat-jasmin-compare.js | ✅ |
| scripts/kat-nonce-diag.js | ✅ |
| scripts/kat-sha3cmp.js | ✅ |
| scripts/kat-verify-fix.js | ✅ |
| scripts/ecdh-p256-kat.cjs | ✅ |
| scripts/hmac-sm3-kat.cjs | ✅ |

**12/13 = 92.3% 完全一致。** 唯一差异是刚修复的路径 bug。

### C Native Addon 源码（26 文件）

全部 26 文件 SHA256 完全一致：kem.c/h, mlkem_wrap.c, indcpa.c/h, ntt.c/h, poly.c/h, polyvec.c/h, cbd.c/h, params.h, params_768.h, reduce.c/h, verify.c/h, fips202.c/h, symmetric-shake.c, symmetric.h, randombytes.c/h, binding.gyp。

**26/26 = 100% 完全一致。**

### TVLA 实测

在服务器重新运行 `scripts/tvla-mlkem-1024.mjs`：
- ML-KEM-1024 keygen：|t| = 0.13 → PASS
- ML-KEM-1024 encapsulate：|t| = 0.37 → PASS
- ML-KEM-1024 decapsulate：|t| = 0.08 → PASS
- 3/3 PASS，耗时 78.8 秒，N=10,000

## 结论

KAT 10000 轮测试、TVLA ML-KEM-1024、C native addon 26 个源文件**全部已在 git 仓库且已推送 GitHub**。E 盘备份与本地 workspace 比对结果一致（唯一差异是路径 bug 修复）。不存在"核心代码没上传"的情况。
