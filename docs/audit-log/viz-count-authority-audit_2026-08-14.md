# FIBEMATE 可视化权威口径审计（2026-08-14 13:00）

## 一、核心结论

**权威数字不能用简单的「42」或「HTML 文件数」**。真实情况比「数字打架」更复杂，存在三个相互纠缠的问题：

1. **数字打架**（4 个互相矛盾的对外口径：14 / 26 / 37 / 28）
2. **本地仓库 ≠ 服务器**（`vwz-tensor/` 4 个 HTML 在服务器存在、本地缺失、且被 .gitignore 挡在 git 外）
3. **首页 4 个死链**（`vwz-tensor/` 3 个 + `docs/documentation.html` 1 个，本地磁盘无对应文件）

## 二、HTML 文件总数（精确盘点）

| 口径 | 数量 | 说明 |
|------|:---:|------|
| `www/` 下全部 HTML（本地磁盘，去重） | **124** | 含归档、法务、测试页 |
| git 已跟踪的 HTML | **132** | 含 8 个 `www/` 之外的（根 docs/、tools/、vwz-portrait.html） |
| 服务器 `www/` 下全部 HTML | **125** | 比本地多 1 个（`vwz-tensor/` 差异） |

**本地磁盘 ≠ git ≠ 服务器，三方不一致**——这是比「数字写错」更严重的问题。

## 三、首页实际渲染的卡片与链接

### 区块一 `#visualizations`（交互式密码学可视化）
- **7 张卡片**，实际提取到 **13 个 href**（去重后 12 个，`crypto-audit.html` 出现 2 次）
- 卡片 6「CARS 密码敏捷性评估」内含 6 个二级链接（radar/self-assessment/crypto-audit/cbom-viewer/cbom-graph/cryptolaw-assessment）
- 卡片 7「密码资产审计仪表盘」与卡片 6 内的 `crypto-audit` 重复

### 区块二 `#engineering-viz`（工程可视化工具集）
- **33 张卡片**，区块标题却写「**37 个交互式工具**」（多标 4 个）
- 实际提取 **34 个 href**（含 `viz-index.html` 索引入口 + `documentation.html` 文档中心入口）

### 首页两区块去重后总链接数：**46 个 href**
其中 **4 个是死链**（本地文件不存在）：

| 死链 | 原因 |
|------|------|
| `www/vwz-tensor/tensor-field.html` | 本地缺失，服务器有，被 .gitignore:396 挡 |
| `www/vwz-tensor/portrait.html` | 同上（服务器有） |
| `www/vwz-tensor/performance.html` | 同上（服务器有） |
| `www/docs/documentation.html` | 本地缺失，真实文件在 `docs/documentation.html`（根 docs/，非 www/docs/），且该文件 title 有 GBK 乱码「馃摉」 |

## 四、vwz-tensor 差异根因

- 服务器 `/opt/fibemate-repo/www/vwz-tensor/` 有 4 个 HTML + 1 JSON：`tensor-field.html`、`portrait.html`、`performance.html`、`size-comparison.html`、`vwz-tensor-data.json`
- 本地磁盘 `www/vwz-tensor/` **整个目录不存在**
- `.gitignore:396` 写的是 `tensor-field.html`（无路径前缀），恰好误伤了 `www/vwz-tensor/tensor-field.html`
- 但 `portrait.html`/`performance.html`/`size-comparison.html` **未被 ignore**，它们缺失说明：**这批文件是磁盘先行（scp 直传服务器），从未进过 git，也从未同步回本地**

## 五、权威口径建议（最终方案）

不要再纠结单一数字。**分层定义，各写各的**：

| 层级 | 权威数字 | 含义 | 建议写入位置 |
|------|:---:|------|------|
| **可视化页面总数** | **42** | 首页 46 个 href 去重后，扣除 4 个死链 = 42 个真实存在的可视化入口 | facts.md、README、announcement |
| **首页可视化卡片** | **40** | 区块一 7 张 + 区块二 33 张 = 40 张卡 | index.html 区块标题 |
| **交互式 3D 可视化（严格）** | **32** | filename 启发式筛出的纯 viz 类（含 tensor、flow、radar、heatmap 等） | viz-index.html subtitle |

> 但「42」这个数成立的前提是：**先把 vwz-tensor 目录拉回本地、修好 documentation.html 死链**。否则 42 里有 4 个假入口。

## 六、必须先修的 4 个死链/差异（比改数字更紧急）

1. **vwz-tensor 目录拉回本地**（从服务器 scp 回，或加白名单后 commit）
2. **`.gitignore:396` 的 `tensor-field.html` 裸规则误伤**——应改为精确路径或加白名单 `!www/vwz-tensor/*.html`
3. **`docs/documentation.html`** title 乱码「馃摉」需修复（应为「📊 FIBEMATE 文档中心」）
4. **`index.html` 的 `/docs/documentation.html` 链接**——实际文件在根 `docs/`，nginx 需有 rewrite，或链接改对

## 七、待你拍板的决策点

1. **权威数字最终定多少？** 我推荐「42」（修复死链后）或「40」（首页实际卡片数）
2. **vwz-tensor 是否拉回本地进 git？** 这决定了 42 还是 38
3. **「37」这个手写标题** 是否直接改成实际卡片数 40？

---

*扫描脚本已清理；本报告即完整审计结论。*
