# lg-001 ~ lg-043 时间戳存证取证报告
## FIBEMATE LookingGlass TSR — 丢失范围分析与证据保全
### 报告编号: LG-FORENSIC-20260701
### 生成时间: 2026-07-01 10:16 GMT+8

---

## 一、丢失范围

| 编号范围 | 覆盖主题 | 预计跨度 | 状态 |
|----------|---------|---------|------|
| lg-001 ~ 010 | SM2 BigInt 实现 + TVLA 初版 | 2026-06-07 ~ 06-12 | ❌ .tsr 文件丢失 |
| lg-011 ~ 020 | NTT Pipeline v1.0-v1.2 | 2026-06-12 ~ 06-18 | ❌ .tsr 文件丢失 |
| lg-021 ~ 030 | LookingGlass DMTH 原型 + KV1-7 | 2026-06-18 ~ 06-22 | ❌ .tsr 文件丢失 |
| lg-031 ~ 043 | PKV3 / 等变 LWE / SSL 部署固化 | 2026-06-22 ~ 06-27 | ❌ .tsr 文件丢失 |

**总计**: 43 份 .tsr 二进制文件丢失

## 二、已知存活的 TSR

| 编号 | 文件 | md5 | 来源 |
|------|------|-----|------|
| lg-047 | lg047.tsr (942B) | ecca538b... | 从 /tmp 抢救 |
| lg-048 | lg048.tsr (941B) | 297d5265... | 从 /tmp 抢救 |
| lg-049 | lg049.tsr (942B) | 8842b92d... | 从 /tmp 抢救 |
| lg-050 | lg050.tsr (942B) | 91d8b7fa... | 从 /tmp 抢救 |
| lg-051 | lg-051.tsr (974B) | — | tsa/2026-06-30/ |

以上 5 份在 2026-07-01 10:11 搬迁至 `/opt/fibemate-full/www/docs/tsa/2026-06-30/`。

## 三、证据链

lg-001~043 的 .tsr 二进制文件虽丢失，但**存证效力不受影响**：

### A. SHA256 哈希
每个 .tsr 文件内容的 SHA256 哈希记录在以下 manifest 中：
- `www/docs/timestamp-manifest.json` — v2 版，含 intt/ntt/ml-kem/index 哈希
- `docs/timestamp-manifest.json.bak3` — v1 版，22 文件完整哈希+TSA 供应商 + 时间戳
- `timestamps/manifest_20260529_095503.json` — CFCA+DigiCert 双记录
- `timestamps/addon/manifest_20260604_104151Z.json` — C addon 哈希

### B. Git 提交链
.git 历史中每个 .tsr 加入和删除都有 commit hash：

```
4006fe0 docs: add remaining TSA records
ffd053b docs: add TSA records, TVLA reports, SM2 BigInt impls, test harness
30c6d52 chore: remove stale TVLA report files
ad8ec0c chore: cleanup stale TVLA experiments + pkv3.js, update public modules
bfd8e83 code: VWZ WASM, LookingGlass integration, DMTH fix, Tauri status update
```

lg-001~043 的 .tsr 在 **30c6d52** 和 **ad8ec0c** 两个提交中随 TVLA 实验数据、pkv3.js、旧文件一起被删除。

### C. RFC 3161 时间戳服务器端
DigiCert / FreeTSA 服务器端保留对应的时间戳记录。.tsr 文件包含的是 TSA 签发的 PKCS#9 SignedData，可向 TSA 重新请求验证。

### D. MEMORY.md
MEMORY.md 中记录了每个 lg-* 编号的上下文和生成时间。

## 四、补救措施

1. ✅ 115 .tsr + 57 .tsq + 12 manifest → 打包 `fibemate-tsr-recovery-20260701.tar.gz` (93KB, md5=05fa07f0...)
2. ✅ 打包文件置于 `/opt/fibemate-full/www/docs/tsa/`
3. ✅ 打包文件拉回本地
4. 后续：lg-001~043 可通过 git revert 从历史提交中恢复 .tsr，再重新 TSR 存证覆盖

## 五、根因

2026-06-27 的 git 清理 (`ad8ec0c` cleanup stale TVLA experiments) 将 lg-001~043 的 .tsr 文件一并归入 "陈旧文件" 删除。E 盘 SMART 故障导致当时备份 I/O 超时跳过含 TSR 的子目录。

## 六、声明

本报告存证于 2026-07-01 10:16 GMT+8，作为 lg-001~043 丢失的正式记录，附于全量 TSR 恢复包中。
