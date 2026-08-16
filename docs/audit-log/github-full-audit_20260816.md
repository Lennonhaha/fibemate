# GitHub 全量文件格式与数据完整性审计（2026-08-16）

## 一、审计范围

- 仓库：`Lennonhaha/fibemate`，main 分支 HEAD `c57eb717d`
- 跟踪文件总数：**1599 个**
- 审计维度：文件名格式、编码完整性（U+FFFD/GBK/NUL）、空文件、JSON 结构、TSR/TSQ 存证结构、大文件（构建产物/二进制误提交）

## 二、审计结果总览

| 维度 | 结果 |
|:---|:---|
| 空文件（0 字节） | ✅ 0 个 |
| 无法读取的文件 | ✅ 0 个 |
| JSON 解析失败 | ✅ 0 个（109/109 通过） |
| 无效 UTF-8（GBK 误解码） | ✅ 0 个 |
| 含 NUL 字节的文本 | ✅ 仅 3 个（均为合法二进制：stm32 可执行 + 2 个 TSA） |
| 文件名损坏 | ✅ 0 个（"带引号扩展名"是 git quotepath 显示行为，非真损坏） |
| TSR 结构异常 | ⚠️ **8 个（真损坏，见下）** |
| TSQ 结构异常 | ✅ 0 个（96/96 正常 DER） |

## 三、发现的问题

### 🔴 P0：8 个 TSR 存证文件是 FreeTSA 错误页（真数据损坏）

以下 8 个 `.tsr` 文件内容为 259 字节的 HTML 错误页（`<!DOCTYPE html>... <img src=https://freetsa.org/s85Xa.png>`），**不是**合法时间戳响应。根因：FreeTSA 请求失败时，错误页被误存为 `.tsr`。

| 文件 | 大小 | 引入 commit |
|:---|:---:|:---|
| evidence/tvla/tvla-9of9-corrected-report.json.tsr | 259B | 1439f0523 (07-07) |
| evidence/tvla/tvla-9of9-summary.md.tsr | 259B | 1439f0523 (07-07) |
| evidence/tvla/tvla-defense-for-reviewers.md.tsr | 259B | 1439f0523 (07-07) |
| evidence/tvla/tvla-experiment-5-polyMul-attack-verification.json.tsr | 259B | 1439f0523 (07-07) |
| www/docs/tvla/ml-kem-768/tvla-9of9-corrected-report.json.tsr | 259B | db81c7f55 (07-06 initial) |
| www/docs/tvla/ml-kem-768/tvla-9of9-summary.md.tsr | 259B | db81c7f55 (07-06 initial) |
| www/docs/tvla/ml-kem-768/tvla-defense-for-reviewers.md.tsr | 259B | db81c7f55 (07-06 initial) |
| www/docs/tvla/ml-kem-768/tvla-experiment-5-polyMul-attack-verification.json.tsr | 259B | db81c7f55 (07-06 initial) |

**性质**：从 initial commit（07-06）就一直是坏文件，非后来覆盖。`evidence/tvla/` 4 个是 07-07 从 initial commit 复制恢复的同一批坏文件。

**原始文件状态**（.tsr 对应的源文件）：
- 存在：`evidence/tvla/tvla-9of9-corrected-report.json` (1190B)、`evidence/tvla/tvla-9of9-summary.md` (8249B)、`www/docs/tvla/ml-kem-768/tvla-9of9-corrected-report.json` (1185B)
- 缺失：`tvla-defense-for-reviewers.md`、`tvla-experiment-5-polyMul-attack-verification.json`（两处均缺失）

### 🟡 P1：7 个文件含字面 U+FFFD（文档举例，非真损坏）

均为「举例乱码符号」或「引用 health-check.js 检测正则」，字面 `\uFFFD` 写进文档。check-encoding.cjs 白名单豁免了它们，CI 未报。

| 文件 | 数量 | 性质 |
|:---|:---:|:---|
| scripts/health-check.js L79 | 1 | **功能必需**（检测正则，不可改） |
| scripts/scan-corrupted.sh L28 | 1 | 注释举例，可改转义 |
| MEMORY.md L1593 | 1 | 记录「豁免正则」时引用 |
| august-2026-summary_2026-08-15.md | 2 | 记录踩坑教训时举例 |
| docs/audit-log/encoding-repair_2026-08-14.md | 2 | 历史审计日志 |
| docs/audit-log/fibemate-health-check_20260815.md | 1 | 健康检查记录 |
| docs/audit-log/memory-history-restore_2026-08-14.md | 1 | 历史审计日志 |

**处理原则**：5 个 .md 是历史审计日志，`\uFFFD` 是「当时踩坑的证物」，改动会失去记录价值，且被白名单豁免不影响 CI。**建议保留**（除非用户要求统一转义）。

### 🟢 正常项确认

- 大文件 16 个（>500KB）：均为合法资产——FPGA `.bit` 流 10 个、three.js 库 4 个、ML-KEM KAT `.rsp` 1 个、three.min.js 1 个。无构建产物误提交。
- SHA256 校验文件 37 个：格式正确（hash + 文件名）。
- KAT 文件 1 个（19.6KB）：正常。

## 四、结论与建议

1. **核心存证资产（TSR/TSQ/SHA256/KAT）99% 完整**，唯一真损坏是 8 个 TVLA 的 TSR（FreeTSA 错误页）。
2. **建议 8/31 后处理**：
   - 8 个坏 TSR：重新向 FreeTSA 发起存证（原始文件若存在则重新存证，缺失的 2 个源文件需先确认是否可恢复）
   - 7 个 U+FFFD 文档：按「历史证物保留」原则，除非要统一转义
   - `scripts/scan-corrupted.sh` L28 注释：可顺手改转义（与 check-encoding.cjs 同类）
3. **冻结期**：本次仅审计，未改任何文件，未提交。

## 五、审计方法

全部通过 node 脚本字节级扫描（规避 PowerShell 转义/编码坑）：
- 文件名：`git -c core.quotepath=false ls-files` + 引号/空格/控制字符检测
- 编码：U+FFFD / NUL / `TextDecoder fatal` 三重检测
- JSON：`JSON.parse` 全量校验
- TSR/TSQ：首字节 0x30（DER SEQUENCE）检测 + 大小分布
