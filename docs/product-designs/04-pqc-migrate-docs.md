# PQC 迁移配套文档包 — 设计文档

**类型**：文档系统设计
**状态**：设计阶段
**优先级**：⭐⭐⭐⭐

---

## 1. 产品定位

FIBEMATE 目前有 19 份文档散落在 `docs/` 下。这导致两个问题：(1) 用户不知道从哪开始读 (2) 不同角色需要不同入口。本文档定义一套"按角色分发的文档导航系统"。

---

## 2. 四角色入口

| 角色 | 入口文档 | 核心问题 |
|------|----------|----------|
| 🧑‍💻 **开发者** | `docs/getting-started/dev-quickstart.md` | "我怎么跑起来？" |
| 🔒 **安全审计者** | `docs/audit/security-auditor-guide.md` | "这代码安全吗？怎么验证？" |
| 📚 **学习者** | `docs/learn/pqc-crash-course.md` | "什么是 PQC？FIBEMATE 演示了什么？" |
| 🏢 **企业决策者** | `docs/enterprise/pqc-readiness-for-managers.md` | "我的公司要不要现在迁移？" |

---

## 3. 文档索引页

新建 `docs/index.html`（纯静态页面，不依赖后端）：

```
┌──────────────────────────────────────────────┐
│  📖 FIBEMATE 文档中心                         │
├──────────────────────────────────────────────┤
│                                              │
│  🧑‍💻 开发者入口                               │
│  ├─ 快速开始 (5 分钟运行)                      │
│  ├─ API 参考 (ML-KEM/SM2/SLH-DSA)            │
│  ├─ 构建指南 (BUILD.md)                      │
│  └─ KAT/TVLA 验证指南                         │
│                                              │
│  🔒 安全审计入口                               │
│  ├─ 安全架构概述                              │
│  ├─ 威胁模型                                  │
│  ├─ TVLA 测试方法学                           │
│  ├─ 已知限制 (known-issues.md)                │
│  └─ 漏洞披露 (VULNERABILITY-DISCLOSURE.md)    │
│                                              │
│  📚 学习入口                                  │
│  ├─ PQC 速成课 (30 分钟)                      │
│  ├─ NTT 蝶形运算图解                          │
│  ├─ ML-KEM 封装流程详解                       │
│  └─ 格密码直观理解 (挂谷集合 3D)               │
│                                              │
│  🏢 企业决策入口                               │
│  ├─ PQC 迁移就绪度报告                        │
│  ├─ CARS/IBM 评分解读                         │
│  ├─ NIST CSF 2.0 差距分析                    │
│  └─ 行业时间表 (2030/2035 大限)               │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 4. 需新建的文档

| 文档 | 目标读者 | 预计字数 | 复用资产 |
|------|----------|:---:|------|
| `docs/getting-started/dev-quickstart.md` | 开发者 | ~800 | BUILD.md |
| `docs/audit/security-auditor-guide.md` | 安全审计者 | ~2000 | SECURITY-AUDIT-CHECKLIST.md + TVLA 报告 |
| `docs/learn/pqc-crash-course.md` | 学习者 | ~3000 | 29 个可视化 + architecture.md |
| `docs/enterprise/pqc-readiness-for-managers.md` | 决策者 | ~1500 | README.md + pqc-readiness.html |
| `docs/integration/api-reference.md` | 开发者 | ~2000 | 7 个 npm 包 README |
| `docs/integration/ci-cd-guide.md` | DevOps | ~1000 | ci.yml + nightly workflows |

---

## 5. 文档自动化（8/31 后）

- `scripts/generate-doc-index.js`：扫描 `docs/` 目录自动生成 `docs/index.html`
- `scripts/check-broken-links.sh`：扫描所有 `.md/.html` 文件检查死链
- `scripts/generate-sitemap.sh`：自动更新 `sitemap.xml`

---

## 6. 实现细节（伪代码）

### 6.1 文档索引生成脚本 `scripts/generate-doc-index.js`

```js
// 扫描 docs/ 目录，按角色分类生成 docs/index.html
const fs = require('fs');
const path = require('path');

const ROLE_MAP = {
  'Developer':    { icon:'🧑‍💻', label:'开发者入口',   files: ['BUILD.md','api-reference.md','ci-cd-guide.md'] },
  'Auditor':      { icon:'🔒', label:'安全审计入口', files: ['SECURITY-AUDIT-CHECKLIST.md','THREAT_MODEL.md','VULNERABILITY-DISCLOSURE.md','known-issues.md'] },
  'Learner':      { icon:'📚', label:'学习入口',      files: ['pqc-crash-course.md','architecture.md'] },
  'DecisionMaker':{ icon:'🏢', label:'企业决策入口', files: ['pqc-readiness-for-managers.md','pqc-migration-plan.md'] },
};

function generateIndex() {
  const docs = fs.readdirSync('docs/').filter(f => f.endsWith('.md'));

  let html = '<html>...<body><h1>📖 FIBEMATE 文档中心</h1>';

  for (const [role, cfg] of Object.entries(ROLE_MAP)) {
    html += `<section><h2>${cfg.icon} ${cfg.label}</h2><ul>`;
    for (const file of cfg.files) {
      const content = fs.readFileSync(path.join('docs/', file), 'utf8');
      const desc = extractFirstParagraph(content);  // 取第一段作为摘要
      html += `<li><a href="/docs/${file}"><strong>${titleFromFilename(file)}</strong></a> — ${desc}</li>`;
    }
    html += '</ul></section>';
  }

  html += '</body></html>';
  fs.writeFileSync('docs/index.html', html);
}

function titleFromFilename(f) {
  return f.replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
```

### 6.2 死链检查脚本

```js
// scripts/check-broken-links.sh
// 扫描所有 .md/.html → 提取 <a href>/[text](url) → HEAD request → 报告
// 透传 curl + grep + awk，零 npm 依赖
```

### 6.3 文档模板结构

```
# {标题}

**目标读者**：{角色}
**预计阅读时间**：{X 分钟}
**前置知识**：{列出}

---

## 1. {第一节}
...

## 2. {第二节}
...

---

*最后更新：{日期} · 作者：{维护者}*
```

---

*冻结期状态：仅设计文档。8/31 后开发。*
