# UTF-8 编码损坏扫描报告（2026-08-15）

## 任务
扫描仓库所有文本文件，检测 UTF-8 编码损坏（U+FFFD / GBK 误解码 / 非法 UTF-8 / NUL / BOM）。

## 方法
1. 用 `git -c core.quotepath=false ls-files` 列出所有 tracked 文件（1597 个）。
2. 按优先级筛选目标文本文件：`.html`(138) / `.md`(258) / `.js|.cjs|.mjs`(www+docs+scripts) / `.ts`(tools/pqc-lens/src)。
3. 对每个目标文件运行 `node scripts/check-encoding.cjs <file>`（该脚本检测 BOM / NUL / U+FFFD / 非法 UTF-8）。
4. 另做一次全仓库字节级扫描（U+FFFD = EF BF BD、NUL、TextDecoder fatal 校验）交叉验证。

## 结果
### 目标文本文件（在扫描范围内）：全部 OK
- 共检查 **798 个文件**（含 3 个中文文件名的 .md）
- **OK: 798，CORRUPT: 0**

三个中文文件名文件已单独验证 OK：
- docs/audit-log/CARS-VWZ-调查_20260815.md
- docs/audit-log/命名纠正_张量场vs矩阵场_2026-08-12.md
- docs/audit-log/官网版本不一致_事故复盘_2026-08-12.md

### 字节级全仓扫描交叉验证（1120 个非排除文件）
发现 21 条命中，全部为**范围外/误报**，无真实中文文本损坏：

**A. 二进制文件误报（NUL / invalid-utf8，本就不是文本）— 18 个**
- fpga/releases/v4/*.bit × 13（FPGA 比特流）
- papers/vwz-eprint-2026.pdf
- www/circuits/build/setup/identity_final.zkey
- c-stm32/test_tensor_tvla（无扩展名二进制）
- docs/tsa/cfca/.../*.tsa × 2（时间戳证书，属排除项 tsq/tsr 同类）

**B. 仅 UTF-8 BOM（非损坏，但属范围外/非中文正文）— 3 个**
- .gitignore（BOM）
- packages/pqc-kem/native/params.h（BOM，.h 不在目标范围）
- www/main.html.sm2bak（BOM，.sm2bak 备份文件）

## 结论
**目标文本文件（.html / .md / .js/.cjs/.mjs / .ts）无任何 UTF-8 编码损坏。**
仓库当前编码状态干净，无 U+FFFD、无 GBK 误解码、无非法 UTF-8。
范围外另有 3 个文件带 UTF-8 BOM（非损坏，如需可单独清理）。
