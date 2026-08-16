# 分支纪律违规事件复盘 — 2026-08-16

## 事件

用户发现 `vwz-portrait.html` 和 `vwz-verify-bottleneck_2026-08-12.md` 出现在 main 分支根目录，质疑是否违反研究线/生产线分离原则。

## 核实结果

**属实。严重违规。**

| 提交 | 时间 | 内容 | 问题 |
|:---|:---|:---|:---|
| `0497a9009` | 2026-08-12 09:25 | 新增 `vwz-portrait.html` + `vwz-verify-bottleneck_2026-08-12.md` | **研究线文件进入 main** |
| `18d5b4694` | 后续 | `vwz-portrait.html` v2.1 更新 | 继续违规 |

## 违规性质

1. **违反分支分离政策**：VWZ 是实验性研究线，必须在 `experimental/vwz-lg` 分支开发
2. **违反默认关闭原则**：研究线代码不应出现在生产分支（main）
3. **违反 8/31 冻结期纪律**：冻结期前不应向 main 添加新实验功能

## 根因分析

1. **.gitignore 配置漏洞**：有 `vwz*.js` `vwz*.py`，但缺少 `vwz*.html` `vwz*.md`
2. **提交审核缺失**：2026-08-12 的提交未检查文件性质
3. **分支切换混乱**：可能在 experimental 分支开发后误切到 main 提交

## 修复动作

1. **立即移除**：`git rm vwz-portrait.html vwz-verify-bottleneck_2026-08-12.md`
2. **加固 .gitignore**：添加 `vwz*.html` `vwz*.md`
3. **提交 REVERT**：`1333c578c` — 明确标注为纪律违规修复
4. **待推送**：本地已修复，需同步到 GitHub + 服务器

## 教训

### 技术层面
- **.gitignore 必须全面**：研究线所有文件类型（.html .md .rs .wasm）都要覆盖
- **提交前检查**：`git status` 确认当前分支 + 文件性质
- **实验分支隔离**：`experimental/` 目录已在 .gitignore，但根目录 vwz* 文件漏网

### 流程层面
- **冻结期纪律**：8/31 前 main 分支只接受 bugfix，不接受新功能（包括研究线可视化）
- **代码审查**：即使是单人项目，关键提交也应自我审查（检查分支 + 文件列表）
- **命名规范**：研究线文件应统一前缀 `vwz-` 或放 `experimental/` 子目录

### 认知层面
- **"可视化不是代码"陷阱**：HTML/MD 也是代码，同样受分支政策约束
- **"文档无害"陷阱**：研究线文档承诺了未经验证的技术方向，可能误导用户

## 后续预防

1. **已加固 .gitignore**：`vwz*.html` `vwz*.md` 已添加
2. **建议**：所有研究线文件统一放 `experimental/vwz-lg/` 目录，不在根目录创建
3. **建议**：8/31 后建立 pre-commit hook，检查 main 分支是否包含实验性文件

## 状态

- 本地修复：✅ `1333c578c`（删除）+ `dad9be4d6`（MEMORY 记录）
- **挪回实验分支**：✅ `066933c9f`（experimental/vwz-lg 分支）
  - `vwz-portrait.html` → `experimental/vwz-lg/visualization/`
  - `vwz-verify-bottleneck_2026-08-12.md` → `experimental/vwz-lg/docs/`
- GitHub 同步：✅ 三端已验证（main 已无文件，experimental/vwz-lg 已有文件）

## 完整处置链（2026-08-16 07:47-07:51）

1. `1333c578c`（main）：删除两文件 + .gitignore 加固
2. `dad9be4d6`（main）：MEMORY 记录违规
3. `066933c9f`（experimental/vwz-lg）：把文件挪到正确分支的正确目录

**关键教训补充**：之前的处置只做了「删除」，漏了「挪移」。正确处置是**删除 + 挪移两步都要做**——文件不能凭空消失，必须归位到研究线分支。
