# FIBEMATE 可视化数量口径审计（2026-08-14）

## 结论

**「28 个」从未出现在任何正式文档**。它是内部笔记 `vwz-tensor-field_2026-08-12.md` 里的增量记录「工程可视化工具 27→28」。正式文档中存在 **4 个互相矛盾的口径**。

## 各文档口径冲突表

| 来源 | 数字 | 原文描述 |
|------|------|----------|
| `docs/facts.md` | **14** | "14 interactive 3D visualization dashboards" |
| `README.md` §547 标题 | **14 pages** | "## Visualization Dashboards (14 pages)" |
| `README.md` 顶部 + `README-upstream.md` | **26** | "26 interactive visualizations" |
| `ARCHITECTURE.md` | **26** | "26 个交互可视化 (Math→Code→Hardware)" |
| `announcement-current.md` | **26** | "26 个交互式可视化分析工具"（出现 4 处） |
| `www/docs/viz-index.html` | **26**（标题）/ **14+12**（stats） | subtitle「26 个」，stats 块「14 可视化页面 + 12 密码算法」 |
| `www/index.html` `#engineering-viz` | **37** | 区块标题「37 个交互式工具」 |
| 内部笔记 vwz-tensor-field | **27→28** | "工程可视化工具 27→28" |

## index.html 首页实际卡片盘点

### 区块一 `#visualizations`（交互式密码学可视化）— 7 张卡
1. NTT 蝶形运算
2. PQC 算法体检仪表盘
3. 格拓扑结构
4. 挂谷集合（含 kakeya-visualizer + kakeya-perron 双链接）
5. 流量混淆效果
6. CARS 密码敏捷性评估（含 6 个二级链接：cars-radar/self-assessment/crypto-audit/cbom-viewer/cbom-graph/cryptolaw-assessment）
7. 密码资产审计仪表盘（standalone，与 CARS 卡内 crypto-audit 重复）

### 区块二 `#engineering-viz`（工程可视化工具集）— 33 张卡（标题却写「37 个」）
1. CARS vs IBM 双框架雷达
2. PQC 性能基准
3. TVLA 侧信道看板
4. 经典 vs PQC 并排
5. CARS/IBM 评分趋势
6. 3D 算法族谱树
7. ML-KEM 密钥封装流程
8. ML-DSA 签名验证流程
9. SLH-DSA 哈希签名流程
10. TLS 1.3 Hybrid Handshake
11. 供应链依赖风险图
12. FPGA 资源热力图
13. 双后端性能对比
14. 项目演进时间轴
15. PQC 安全等级对比
16. PQC 部署验证器
17. 交互式依赖下钻
18. PQC 验证仪表盘
19. 协议层次结构
20. ML-KEM 安全强度 3D
21. LWE 难度地貌图
22. TVLA 前后对比看板
23. VWZ 张量场
24. VWZ 综合画像卡
25. VWZ 性能基准看板
26. LG v2.3 矩阵场
27. 混合密钥交换动态对比
28. NTT 蝶形运算动态流
29. ML-KEM 密钥封装黑盒拆解
30. 协议 × 算法族谱
31. 量子攻击如何作用于群结构
32. 格密码 101
33. 文档中心

### HTML 文件层（独立于首页卡片）
- `www/docs/*.html`：55 个（含 7 个 tsa 存档 + 若干纯文档页）
- `www/viz/*.html`：9 个
- `www/` 根目录交互式动画页：约 12 个（double-ratchet-animation、key-lifecycle-trace、ml-kem-flow-animation 等）

## 数字来源的真相
- **14** = `viz-index.html` 里 `pages` 数组最初只列了 14 个条目（实际数组现为 15 个，也已过时）
- **26** = 某次里程碑「9→26 可视化」的定格值（见 MEMORY.md D-15~D-19 记录「可视化 9→26」），后被多处引用固化
- **37** = index.html 工程区块标题手写值，与实际 33 张卡不符（少 4）
- **28** = 内部笔记增量，从未写入正式文档

## 建议
1. **术语统一**：区分「可视化页面」（HTML 文件）vs「首页可视化卡片」（入口）vs「交互式工具」（工程区块总称），三者不可混用。
2. **选定唯一权威数字**写入 facts.md，并同步 README / ARCHITECTURE / announcement / viz-index.html / index.html 区块标题。
3. 推荐口径：**以 index.html 首页实际渲染的卡片数为准**，或**以 `www/docs + www/viz` 中真实交互式 HTML 文件数为准**（需先按「交互式可视化」标准筛一遍）。
4. 优先级最高是 `facts.md`——它是 AI 搜索引擎抓取的主参考页，当前「14 个」与 README「26 个」直接冲突，会污染搜索结果。
