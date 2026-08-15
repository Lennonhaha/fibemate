# 8 份产品设计文档实现 + 验收（2026-08-13）

> 冻结纪律由用户明确破例（02:45-02:47）：实现 11 份设计文档，先做核心 3 个（01/02/05）不推送，随后「继续做剩下的 8 份 同时验收」（03:28）。

## 验收结论

| 工具 | 测试 | 状态 |
|------|------|------|
| 01 pqc-migrate CLI | 11/11 | ✅（前轮完成，本轮复验通过） |
| 02 tsr-verify CLI | 9/9 | ✅（前轮完成，服务器端已跑通 129 valid） |
| 05 kat-verifier npm 包 | 9/9 | ✅（前轮完成） |
| 10 ntt-benchmark CLI | 4/4 | ✅（本轮新做） |
| 11 pqc-deploy CLI | 6/6 | ✅（本轮新做） |

## 本轮新增 8 份实现明细

### 工具类（可运行）
- **03 viz-design-system**（组件库，非 CLI）：
  - `www/viz/lib/canvas-utils.js`（2657B）：roundRect/drawGrid/colorScale/LEVEL_COLORS/setupCanvas 五大函数
  - `www/viz/lib/viz-theme.css`（1087B）：11 个 CSS 变量（--bg/--card/--accent 等）+ toolbar/legend 组件样式
- **04 pqc-migrate-docs**（文档索引生成器）：
  - `scripts/generate-doc-index.js`（4237B）：扫描 docs/ 按四角色分类生成 docs/index.html，实测生成 8965B
- **10 ntt-benchmark**（CLI）：
  - `tools/ntt-benchmark/`（package.json + lib/bench.js + bin/ntt-bench.js + test）4/4 通过，CLI 实测跑通（JS naive 基线 120.83µs avg @ N=32）
- **11 pqc-deploy**（CLI）：
  - `tools/pqc-deploy/`（package.json + lib/deploy.js + bin/pqc-deploy.js + test）6/6 通过
  - 复用真实 `server/pqc-detector.js` 的 probe/probeMany/formatReport
  - 新增：清单解析（parseManifest）、结果持久化（persist JSON）、迁移建议映射（MIGRATION_RULES 4 条）

### 产出文件类
- **06 pqc-lens**（VS Code 插件源码）：
  - `tools/pqc-lens/`（package.json + tsconfig.json + src/rules.ts 21 条规则 + src/extension.ts Hover/Diagnostics/Sidebar 三功能）
  - TypeScript，需 npm install @types/vscode + typescript 后编译
- **07 pqc-ctf**（单页 Web 应用）：
  - `www/viz/pqctf.html`（13895B）：14 题（L1-L4）+ localStorage 进度 + Canvas 粒子庆祝动画
- **08 pqc-docker**（3 镜像 + compose）：
  - `docker/learn/Dockerfile` + nginx.conf、`docker/attack/Dockerfile` + server.js、`docker/bench/Dockerfile`、`docker/docker-compose.yml`
- **09 pqc-desktop**（Electron 应用）：
  - `tools/pqc-desktop/`（package.json + main.js + preload.js + nav.html 16 节课程树 + IPC）

## 语法/结构自检
- `_check-implementation.js`：13 个 JS/TS 文件 + 5 个 JSON 全部 OK
- `_check-html-js.js`：pqctf.html + nav.html 内嵌 script 全部 OK

## 修复的 bug
1. ntt-benchmark `generateReport` 引用未定义 `modulus` → 改为 `params.modulus`（首跑 2 失败，修复后 4/4）
2. pqc-deploy require 路径 `../../server/` → `../../../server/`（MODULE_NOT_FOUND）

## 关键决策
- 全部本地 workspace 保存，**未 commit 未 push**（守「推前询问」纪律）
- 所有新工具均放 `tools/` 或 `www/viz/`、`docker/`，未污染核心 crypto 包
- 06/09 为源码产出，实际编译需 npm install（TypeScript/electron），不在本轮执行

## 待办（用户侧 + 后续）
- 全部改动 commit/push（需用户回「推」）
- 用户确认删除范围 A/B/C（签名对比/决策树 HTML 仍在服务器）
- nginx viz location 规则未加
- 公告最终定稿（6 份草稿已修 17 处 + 3 份加 VWZ 免责声明）
