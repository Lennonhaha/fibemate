# 证据地图更新 + 两项诚实性修正（2026-08-13）

## 一、TECHNICAL-VERIFICATION.md（证据地图）更新

核实真实数据后更新 3 处（非照抄用户方案的「200+」虚高数字）：

| 项 | 原值 | 新值 | 核实依据 |
|----|------|------|----------|
| 最后更新日期 | 2026-07-17 | 2026-08-13 | — |
| TSR 存证数量 | 76 份 / 「9 文件」 | 138 份 | 服务器 `find .../docs/tsa -name '*.tsr'` 实测 138；manifest `total:131`（version 2026-07-21-v4） |
| 版本号 | v3.3-preview | v3.3.0 | 项目当前版本 |

**注意**：用户方案写「TSR 200+」，实测为 138，按数据诚实原则取 138（不虚高）。

## 二、发现的死链（诚实性关键）

存证表原引用 `TECHNICAL-VERIFICATION-v5.tsr` / `v5.sha256`，但仓库实际只有 v1 的 `tsa/TECHNICAL-VERIFICATION.tsr`，v5 存证文件不存在（死链）。

处理：把「最新存证」表改为诚实标注「v6 尚未重新存证」，不再引用不存在的 v5 文件。v6 的 .sha256/.tsr 留待后续生成。

## 三、attack-run.sh WASM 路径 bug 修正

- 原：`WASM_PATH="../../www/crypto/lgv2/lookingglass_v2_bg.wasm"`（路径不存在）
- 改：`WASM_PATH="research/lgv2-v2_1/lookingglass_v2_bg.wasm"`
- 依据：脚本实际在仓库根目录（非 `experimental/vwz-lg/attack/`），真实 WASM 在 `research/lgv2-v2_1/lookingglass_v2_bg.wasm`（48KB，主目标）；备用 `research/lgv2/rust/pkg/lgv2_bg.wasm`（26KB，LG v3.0/3.1）

## 四、security-assessment.md 顶部声明

在 `## 1. 定位声明` 前新增醒目声明：§3 的「5,913 冲突」「1,000/1,000 roundtrip」为 Python 模拟层数据，未经真实 WASM 验证，不代表真实实现攻击面，真实攻击面参见 §4。

## 纪律合规
- 全部为纯文档/配置修正，不碰生产代码、不碰 www/ 或 packages/ 生产逻辑
- 未 commit 未 push（守「推前询问」纪律）
