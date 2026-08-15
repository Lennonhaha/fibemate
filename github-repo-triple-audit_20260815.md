# GitHub 仓库三项核查（2026-08-15 13:09）

## 任务
1. 字体/乱码规范核查
2. 遗漏文件核查
3. 研究线与生产线是否重叠核查

## 一、乱码核查结论

运行 `node scripts/check-encoding.cjs`（全仓库权威检测器）→ 报 **1 个文件 FAIL**：

`docs/audit-log/encoding-repair_2026-08-14.md` [4x U+FFFD replacement char]

定位 4 处 U+FFFD，全部是**故意示例，不是损坏**：
- L10: `U+FFFD（\uFFFD）替换符` — 文档正文举例展示乱码符号
- L11: `被损坏成 `\uFFFD?`` — 举例展示「吞换行」乱码形态
- L40/L63: `/锟斤拷|\uFFFD{2,}|/` — 引用检测正则（豁免正则命中）

**根因**：check-encoding.cjs 的 U+FFFD 豁免正则 `/(hasGarbage|锟斤拷|garbled|乱码|detect.*corrupt)/` 只命中 L40/L63（含「锟斤拷」），未命中 L10/L11（含「替换符/损坏」但不含豁免关键词）。

**后果**：该文件已提交（上午归档 61 个文件之一），会导致 CI 的 bom-check job（`node scripts/check-encoding.cjs`）FAIL → CI 红。

## 二、遗漏文件核查结论

- git 跟踪 1595 文件 vs 磁盘 3619（差异 = node_modules / build 产物 / 忽略目录，正常）
- **`experimental/` 目录在 main 分支 git 跟踪数 = 0**（`.gitignore:153` 整目录忽略，磁盘也不存在）
- `src/index.js` 有 7 处 `require("../experimental/...")`，全部在 flags 门控内：
  - L84/85/86/103/104/105/108：`flags.X ? require(...) : null` 三元门控
  - L1320/1366/1534：`if (flags.X) { require(...) }` 条件门控
- 生产默认 `FIBEMATE_EXPERIMENTAL=0` → 所有 flags OFF → 这些 require 不执行
- `experimental/` 源码在 `experimental/vwz-lg` 分支上（研究线分支），main 分支刻意不含
- mixnet 实际在顶层 `mixnet/`（16 文件全跟踪），但 `src/index.js:84` require 路径写的是 `../experimental/mixnet/mixnet-transport`（main 分支该路径不存在）

## 三、研究线 vs 生产线结论

`src/flags.js` 用主开关 `FIBEMATE_EXPERIMENTAL`，默认 OFF；所有实验子系统（VWZ/LG/MIXNET/ZK_AUTH/PIR/PHASE4/NEXUS）都门控。生产默认只加载 ML-KEM + SLH-DSA 标准链路。

**运行时已隔离，不重叠。**

## 发现的两个问题

1. **check-encoding 误报导致 CI 失败**（上午归档引入，必须修）
2. **src/index.js experimental require 路径残留**（`../experimental/mixnet/mixnet-transport` 在 main 分支不存在，但被 flags 门控，生产不触发）——冻结期不动，8/31 后评估

## 处理
- 问题 1：改归档文档 2 处故意 \uFFFD 字符 → `\uFFFD` 转义写法（改文档不碰检测器，保持检测器严格性）
- 问题 2：记录到 REMINDER，8/31 后评估
