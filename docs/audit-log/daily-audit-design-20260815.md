# Daily Security Audit Pipeline — 设计方案

**状态**：存档，待 8/31 后落地
**创建**：2026-08-15
**背景**：冻结期（8/31 前）不引入新流水线，开源后按本方案实施

---

## 设计目标

每天自动运行全量安全扫描，输出 Top 5 漏洞/改进项报告，自动创建 GitHub Issue 记录。

---

## 架构概览

```
GitHub Actions (每日 02:00 UTC)
    │
    ├── CodeQL Analysis
    ├── npm audit
    ├── ESLint security rules
    └── 自定义扫描
            ├── check-encoding.cjs      (已存在)
            ├── check-tla-invariants.cjs (待建)
            └── check-hardcoded-secrets.cjs (待建)
    │
    ▼
generate-top5-report.js
    ├── 合并去重
    ├── 按 severity 排序
    └── 输出 Top 5 Markdown 报告
    │
    ▼
create-issue-from-report.js
    └── 自动创建 GitHub Issue
```

---

## 核心脚本

### 1. `.github/workflows/daily-audit.yml`

```yaml
name: Daily Security Audit
on:
  schedule:
    - cron: '0 2 * * *'  # 每天 UTC 02:00
  workflow_dispatch:       # 手动触发

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: CodeQL Analysis
        uses: github/codeql-action/analyze@v2

      - name: Dependency Audit
        run: npm audit --json > npm-audit-report.json

      - name: Custom Security Scans
        run: |
          node scripts/check-encoding.cjs
          node scripts/audit/check-hardcoded-secrets.cjs

      - name: Generate Top 5 Report
        run: node scripts/audit/generate-top5-report.js

      - name: Create GitHub Issue
        run: node scripts/audit/create-issue-from-report.js
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Archive Report
        run: |
          DATE=$(date +%Y-%m-%d)
          cp daily-audit-report.md docs/audit-log/daily-reports/$DATE-report.md
```

### 2. `scripts/audit/generate-top5-report.js`（待建）

```js
// 合并所有扫描结果，去重，按 severity 排序，取 Top 5
// 输出 docs/audit-log/daily-audit-report.md
```

### 3. `scripts/audit/create-issue-from-report.js`（待建）

```js
// 读取报告内容，通过 gh issue create 自动创建 GitHub Issue
// Label: "security", "daily-audit"
```

### 4. `scripts/audit/check-hardcoded-secrets.cjs`（待建）

```js
// 扫描 hardcoded tokens/API keys/passwords
// 复用 .gitignore 路径 + 敏感词正则
```

---

## 落地前提

| 前提 | 状态 | 说明 |
|:---|:---:|:---|
| CodeQL 告警全部分类 | ✅ | 2026-08-15 已完成，182 条 |
| 冻结期结束 | ⏳ | 2026-08-31 |
| 贡献者指南 | ⏳ | 需先建立 CONTRIBUTING.md |
| GitHub Issue 模板 | ⏳ | 需先建 `.github/ISSUE_TEMPLATE/` |

---

## 冻结期策略（当前）

- **不做**：不引入新 CI workflow，不增加扫描负担
- **快照模式**：8/30 跑一次全量扫描，生成 `pre-launch-audit-20260830.md`
- **基线固化**：`docs/audit-log/codeql-baseline-20260815.md` 记录当前状态

---

## 8/31 后实施步骤

1. 建 `.github/workflows/daily-audit.yml`
2. 建 `scripts/audit/generate-top5-report.js`
3. 建 `scripts/audit/create-issue-from-report.js`
4. 建 `scripts/audit/check-hardcoded-secrets.cjs`
5. 建立 `.github/ISSUE_TEMPLATE/security-audit.yml`
6. 测试 `workflow_dispatch` 手动触发
7. 确认每日定时触发正常
