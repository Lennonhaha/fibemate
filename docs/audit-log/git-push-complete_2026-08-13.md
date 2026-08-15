# FIBEMATE 代码推送完成 — PQC 工具套件 + SM2 WASM 第二实现 + 可视化 + 文档

## 时间
2026-08-13（D-18）

## 推送结果
`4e48fe720..76284acd4 main -> main`（成功，GitHub 已同步）

## 两个 commit

### Commit 1：`0dc2db9c9` — feat: PQC tool suite + SM2 WASM + viz pages（70 files, +6536）
- **tools/**：7 个工具包（pqc-migrate / tsr-verify / kat-verifier / ntt-benchmark / pqc-deploy / pqc-lens / pqc-desktop）
- **wasm-sm2/**：AssemblyScript SM2 恒定时间第二实现（field/curve/sm3/sm2 源码 + 11 个验证脚本）
- **www/viz/**：6 个交互可视化 + CTF 单页 + 组件库（纯 Canvas/Three.js，零 CDN）
- **docker/**：3 镜像（learn/attack/bench）+ compose
- **scripts/generate-doc-index.js**：文档中心生成器
- **.github/codeql/codeql-config.yml**：CodeQL 配置（7 条 query 排除理由）
- **.gitignore**：排除编译产物 + 调试脚本 + 攻击套件

### Commit 2：`76284acd4` — docs: design docs + security governance + honesty fixes（28 files, +4442）
- **docs/product-designs/**：11 份产品设计规范（01-11）
- **docs/visualization-designs/**：6 份可视化设计规范
- **docs/VULNERABILITY-DISCLOSURE + INCIDENT-RESPONSE-FLOW + KEY-COMPROMISE-GUIDE**：安全治理三文档
- **docs/index.html + documentation.html**：文档中心
- **security-assessment.md**：LG 安全评估（模拟层数据已诚实标注）
- **www/docs/TECHNICAL-VERIFICATION.md**：v6、TSR 138、v3.3.0、死链诚实标注
- **www/index.html**：删除 2 个可视化卡片入口

## 关键边界决策（用户确认）

| 决策 | 处理 |
|------|------|
| 攻击套件（attack-*.py / attack-run.sh / lg-mapping-*.json） | ❌ 排除，8/31 后单独定 |
| wasm-sm2/build/ 编译产物 | ❌ 排除（加 .gitignore，源码可重建） |
| wasm-sm2 调试脚本（test-leak/test-locate/test-profile 等） | ❌ 排除，只保留 11 个核心验证脚本 |
| 会话记录 / pre-release / 研究数据 | ❌ 排除 |
| MEMORY.md（私人记忆） | ✅ 隔离，未 push（SM2 战报留在本地） |

## 踩坑记录

1. **.gitignore 误伤核心文件**：`tools/tsr-verify/bin/tsr-verify.js` 被 `ts*.js` 规则误杀、`tools/pqc-desktop/main.js` 被 `main.js` 规则误杀。已加白名单 `!` 规则恢复。
2. **wasm-sm2 混入调试脚本**：`git add wasm-sm2/` 会把 test-leak*.js 等 20+ 调试脚本一起加进去。改为精确 add 核心源码 + 11 个验证脚本。
3. **PowerShell git 输出乱码**：`git push` 的 stderr（dependabot 23 漏洞提示）被 PowerShell 当 RemoteException，但 push 实际成功（exit 1 是误报）。

## 剩余未提交（不阻塞 8/31）
- MEMORY.md（私人记忆，永不 push）
- codeql-audit / codeql-remaining-triage / pre-release-checklist 三个过程分析 md（本地保留）

## 待办
- 8/31 后：攻击套件是否开源、10,000 组 KAT（需先性能优化）、Comb 窗口法、TVLA 硬件侧信道
- 公告最终定稿（用户侧）
