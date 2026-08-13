#!/usr/bin/env node
'use strict';
// FIBEMATE 文档索引生成器 — 扫描 www/docs/（真实部署的文档）按角色分类生成 documentation.html
// 设计文档: docs/product-designs/04-pqc-migrate-docs.md §6.1
// 关键修正: 只索引 www/docs/ 真实存在的文件，避免死链（nginx try_files 兜底会把 404 .md 跳转到首页）
const fs = require('fs');
const path = require('path');

// docs 目录可通过第 2 个参数覆盖（服务器上指向 /opt/fibemate-repo/www/docs）
const DOCS_DIR = process.argv[3] || path.resolve(__dirname, '..', 'www', 'docs');

// 角色映射只包含 www/docs/ 真实存在的文件
const ROLE_MAP = [
  {
    role: 'developer', icon: '🧑‍💻', label: '开发者入口',
    files: ['TECHNICAL-VERIFICATION.md', 'tls-hybrid-deployment.md', 'performance-benchmarks-2026-07-18.md', 'good-first-issues.md', 'ANNOUNCEMENT.md'],
  },
  {
    role: 'auditor', icon: '🔒', label: '安全审计入口',
    files: ['SECURITY-AUDIT-CHECKLIST.md', 'known-issues.md', 'VULNERABILITY-DISCLOSURE.md', 'NPM-AUDIT-STATUS.md', 'INCIDENT_RESPONSE_PLAN.md', 'INCIDENT-RESPONSE-FLOW.md', 'KEY-COMPROMISE-GUIDE.md', 'RECOVERY_PLAN.md', 'SM2_TVLA_STATUS.md', 'TVLA-RAW-DISCLAIMER.md'],
  },
  {
    role: 'learner', icon: '📚', label: '学习入口',
    files: ['FIBEMATE-whitepaper-v3.3-preview.md', 'ml-kem-security-estimate.md', 'facts.md', 'discussions-welcome.md', 'discussions-quickstart.md', 'discussions-architecture.md'],
  },
  {
    role: 'decision', icon: '🏢', label: '企业决策入口',
    files: ['PQC_MIGRATION_PLAN.md', 'FIBEMATE-STATUS-20260527.md', 'OPEN_SOURCE_COUNTDOWN.md'],
  },
];

function titleFromFilename(f) {
  return f.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function extractFirstParagraph(content) {
  const lines = content.split('\n');
  let inHeader = true;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (inHeader && (t.startsWith('#') || t.startsWith('---') || t.startsWith('**') || t.startsWith('>') || t.startsWith('|') || t.startsWith('```') || t.startsWith('<!--'))) continue;
    inHeader = false;
    // 跳过纯符号行 + 以框线字符开头的 ASCII 图行 + Markdown 表格行
    if (/^[─│┌┐└┘├┤┬┴┼═╬╠╣║╔╚╗╝•·_\-+=:;|\s]+$/.test(t)) continue;
    if (/^[│┌┐└┘├┤┬┴┼╬╠╣║╔╚╗╝═─]/.test(t)) continue;
    if (t.startsWith('|')) continue;
    // 跳过含 3+ 连续空白的 ASCII 对齐图行（如 "Alice    Reg Server    Bob"）
    if (/\s{3,}/.test(t)) continue;
    if (t.length > 1 && !t.startsWith('#') && !t.startsWith('```') && !t.startsWith('<!--')) {
      return t.length > 120 ? t.slice(0, 120) + '…' : t;
    }
  }
  return '';
}

function generateIndex() {
  const docsDir = DOCS_DIR;
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>📖 FIBEMATE 文档中心</title>
<style>
:root { --bg:#08080d; --card:#0f0f18; --accent:#10b981; --text:#d0d0d0; --muted:rgba(255,255,255,.35); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; padding: 32px 20px; max-width: 900px; margin: 0 auto; }
h1 { font-size: 28px; margin-bottom: 8px; }
.sub { color: var(--muted); font-size: 13px; margin-bottom: 28px; }
section { background: var(--card); border: 1px solid rgba(255,255,255,.06); border-radius: 10px; padding: 18px 20px; margin-bottom: 16px; }
section h2 { font-size: 17px; margin-bottom: 12px; }
ul { list-style: none; }
li { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
li:last-child { border-bottom: none; }
a { color: var(--accent); text-decoration: none; font-weight: 500; }
a:hover { text-decoration: underline; }
.desc { color: var(--muted); font-size: 12px; display: block; margin-top: 2px; }
.missing { color: rgba(255,255,255,.15); }
</style>
</head>
<body>
<h1>📖 FIBEMATE 文档中心</h1>
<div class="sub">按角色分发的文档导航 · 自动生成</div>
`;

  for (const { icon, label, files } of ROLE_MAP) {
    html += `<section><h2>${icon} ${label}</h2><ul>`;
    for (const file of files) {
      const fp = path.join(docsDir, file);
      if (!fs.existsSync(fp)) continue; // 只索引真实存在的文件，避免死链
      const content = fs.readFileSync(fp, 'utf8');
      const desc = extractFirstParagraph(content);
      html += `<li><a href="/docs/${file}">${titleFromFilename(file)}</a>`;
      if (desc) html += `<span class="desc">${desc}</span>`;
      html += `</li>`;
    }
    html += `</ul></section>`;
  }

  // 附：www/docs 下所有 .md 文件清单（全量索引，只列真实存在的）
  const allMd = fs.readdirSync(docsDir).filter(f => f.endsWith('.md')).sort();
  html += `<section><h2>📄 全部文档（${allMd.length}）</h2><ul>`;
  for (const f of allMd) {
    html += `<li><a href="/docs/${f}">${titleFromFilename(f)}</a></li>`;
  }
  html += `</ul></section>`;

  html += `</body></html>`;
  return html;
}

function main() {
  const outFile = process.argv[2] || path.join(DOCS_DIR, 'documentation.html');
  const html = generateIndex();
  fs.writeFileSync(outFile, html, 'utf8');
  console.log('生成文档索引: ' + outFile);
  console.log('字节数: ' + html.length);
}

main();
