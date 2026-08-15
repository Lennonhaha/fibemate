# CARS 分数全站统一到 77.30（v4 回填）

**日期**：2026-08-15
**commit**：`82139d19e`（本地 = GitHub = 服务器三端一致）

## 任务目标

解决全站 CARS 分数「5 个打架数字」的问题，统一权威值。

## 根因

不是「加权 vs 简单平均」之争，而是 `tools/cars-scorecard.json` v3 过时 + 数据漂移：

| 数字 | 来源 | 性质 |
|:---:|:---|:---|
| 67.0 | scorecard.json v3（08-02） | 权威加权分，但过时（缺 08-05 后改进） |
| 75.20 | radar + self-assessment | 最新简单平均（90/61/82/73/70） |
| 78.50 | ANNOUNCEMENT.md:96 | ❌ 错误，任何算法都算不出 |
| 85 | index.html:1824 | ❌ 把「组织准备度」单维误当总分 |
| 62→78.50 | cars-ibm-trend.html | ❌ 另一套口径 |

## 最终权威值：77.30（加权分）

CI 维度修正：radar 的 CI=90 是旧口径；scorecard v3 changelog 明确写 `Crypto Inventory 90→95`（scanner 147/147 依赖 100% 覆盖，可复现）。故 CI 用 95。

| 维度 | 值 | 权重 | 加权贡献 |
|:---|:---:|:---:|:---:|
| CI 加密资产盘点 | 95 | 0.25 | 23.75 |
| AA 算法敏捷性 | 61 | 0.2 | 12.2 |
| KL 密钥生命周期 | 82 | 0.2 | 16.4 |
| PC 协议耦合 | 73 | 0.15 | 10.95 |
| OR 组织准备度 | 70 | 0.2 | 14.0 |
| **加权总分** | | | **77.30** |

加权自洽验证：95×0.25 + 61×0.2 + 82×0.2 + 73×0.15 + 70×0.2 = **77.30** ✅

## 修改清单（13 文件，全部 UTF-8 干净）

1. `tools/cars-scorecard.json` — 结构化升级 v4，维度分 + overall_score 67.0→77.30
2. `tools/cars-verification.md` — 多版本混杂文档，重写摘要段 + 5 个维度分标题 + 综合评分表
3. `www/docs/cars-radar.html` — 总分 + CI 90→95 + improved 数组
4. `www/docs/cars-self-assessment.html` — FIBEMATE_SCORES/OVERALL + comp-box
5. `www/docs/cars-vs-ibm.html` — overall + CI 维度分
6. `www/docs/cars-ibm-trend.html` — 标题 + 78.50→77.30 + trend 数据点
7. `www/docs/index.html` — 综合分
8. `www/docs/viz-index.html` — stat-num + desc
9. `www/index.html` — 综合分 + footer「85」→77.30
10. `www/ANNOUNCEMENT.md` — 78.50→77.30 + 五维 OR 78→70
11. `docs/ANNOUNCEMENT.md` — 75.20→77.30 + 五维
12. `www/docs/ANNOUNCEMENT.md` — 85→77.30 + 五维
13. `docs/cars-bias-analysis.md` — 内部基线 67.0→77.30 + 维度对比表 + 偏差方向重算

## 关键教训

- **cars-verification.md 是「多版本混杂」文档**：正文散布 v1/v2/v3 旧维度分（40/70/55/63），光改总分会制造新自相矛盾，必须同步维度分标题 + 综合表 + 摘要段。
- **cars-bias-analysis.md 的偏差方向结论依赖维度分**：OR 63→70、KL 70→82 后，「外部高估 Algorithm Agility」反转为「v4 后外部低估」，偏差定性结论需整段重写。
- **误报区分**：扫描「残留旧值」时，scorecard changelog（"90→95"）、self-assessment 问卷选项分值（score:55）、IBM Seven-Dim 框架（D3/D4）都不是 CARS 分数，不能盲目替换。

## 线上验证

`https://fibemate.net/docs/cars-radar.html` 返回 77.30 和 score:95 ✅
