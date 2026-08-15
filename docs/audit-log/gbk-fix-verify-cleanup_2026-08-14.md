# GBK 修复验证 + 远程分支清理（2026-08-14 10:32-10:40）

## 结论：5 文件修复早已完成并推送，无需再 commit/push

用户误以为 5 文件尚未提交推送，要求执行 `git add/commit/push`。经核查：

1. **本地 HEAD = `e8955b170`** `fix(encoding): repair GBK double-misdecode corruption in 5 files`
   → 5 文件修复早已在上一轮提交（commit e8955b170）。
2. **`git ls-remote origin main` 返回 `e8955b170...`** → GitHub 实时 main 已指向修复提交。
3. **`git push --dry-run origin main` → "Everything up-to-date"** → 无需推送。
4. **`git fetch` 后验证 GitHub 实时内容**：5 文件全部 `GBK=false, U+FFFD=false`，
   em-dash 计数正确（double-ratchet-pq.js=13, TIMESTAMP-MANIFEST.md=2, FAQ.html=3,
   sm2-frontend-verification.html=2, timestamps/index.html=0）。**GitHub 上已干净。**

用户看到的「GitHub 乱码」实为以下之一：
- 旧的 GitHub 页面缓存（修复已上线）
- 截图中的「页面加载出错」是 GitHub 临时故障页，非文件损坏

## 发现并修复的隐患：stale local branch `origin/main`

- 本地存在一个**名为 `origin/main` 的本地分支**（非远程跟踪引用），指向旧提交 `07ac47c66`，
  与真正的远程跟踪引用 `refs/remotes/origin/main` 冲突，导致 `git show origin/main:file`
  报 "refname ambiguous" 并解析到旧（损坏）版本。
- 真正的远程跟踪引用 `refs/remotes/origin/main` 此前缓存停留在 `f21aa09d9`（修复前的旧提交）。
- **已执行 `git fetch origin main`** 刷新远程跟踪引用 → 现指向 `e8955b170`（干净）。
- **已执行 `git branch -D origin/main`** 删除 stray 本地分支，消除歧义。
- 删除后 `git show origin/main:double-ratchet-pq.js` 正常返回远程跟踪引用的干净内容。

## 2 个不可逆文件（保持选 A）

`www/session-manager.js`、`www/sm-v12.js` 仍为双重 GBK + `?` 替换符损坏，全网无干净版本。
代码逻辑完整，仅中文注释乱码。8/31 开源前不动（用户已确认选 A）。

## ⚠️ 待用户决策：工作区 50+ 未提交文件

`git status` 显示大量未提交修改（来自 D-18/D-19 工作，非本次任务）：
- 已修改（M）：~45 个文件（api/a2a/a2a-core.js、mixnet/*、packages/pqc-kem/*、scripts/*、www/* 等）
- 未跟踪（??）：~60 个文件（各类 codeql/dependabot 审计报告 md、wasm-sm2/、中文名 md、本次诊断脚本等）

这些**不在本次 5 文件任务范围**，保持未提交。若需整体推送需用户单独确认（避免误打包）。

## 验证命令存档
```bash
git fetch origin main
git show refs/remotes/origin/main:double-ratchet-pq.js | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('GBK='+/鈥|鈫|鈺|鈮|閬|閳|閸|閺|閻/.test(s),'em-dash='+(s.match(/—/g)||[]).length))"
```
