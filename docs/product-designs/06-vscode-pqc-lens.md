# PQC Lens — VS Code 插件 设计文档

**类型**：VS Code Extension
**状态**：设计阶段
**优先级**：⭐⭐⭐

---

## 1. 产品定位

光标指向任何密码学相关代码时，VS Code 侧边栏实时显示：
- 该算法量子安全等级
- 推荐迁移方案
- FIBEMATE 中对应的参考实现跳转链接

---

## 2. 核心功能

### 2.1 Hover Provider

```js
// 光标悬停时
const hash = crypto.createHash('sha256');  // ←
// 💡 Tooltip: SHA-256 → 量子安全 128-bit (Grover) · 迁移建议: SHA3-512
```

### 2.2 CodeLens

```js
const key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
// 🔴 [PQC Lens]: RSA-2048 is quantum-vulnerable (Shor). Migrate to ML-KEM-768.
```

### 2.3 Problems Panel (Diagnostics)

将高风险密码学调用标记为 VS Code warning/info：

```
⚠️  pqc-lens: ECDSA P-256 is quantum-vulnerable. Consider ML-DSA-44.
⚠️  pqc-lens: SHA-256 is collision-safe against Grover (128-bit). Monitor only.
```

### 2.4 Sidebar View

```
┌─ PQC Lens ──────────────────────┐
│ 📊 Project Quantum Readiness: 72/100 │
│                                    │
│ 🔴 RSA-2048    (3 occurrences)     │
│ 🔴 ECDSA P-256 (5 occurrences)     │
│ 🟡 AES-128     (12 occurrences)    │
│ 🟢 ML-KEM-768  (0 detected → add?) │
│                                    │
│ [📖 Copy migration guide]         │
│ [🔗 Open FIBEMATE reference]      │
└────────────────────────────────────┘
```

---

## 3. 检测规则

与 `pqc-migrate` CLI 共享同一套规则表（`01-pqc-migrate-cli.md` §5）。

---

## 4. 技术栈

- TypeScript
- VS Code Extension API (`vscode.languages.registerHoverProvider` / `registerCodeLensProvider` / `createDiagnosticCollection`)
- `vscode.window.registerTreeDataProvider`（侧边栏视图）

---

## 5. 独特性

**这是全球第一个 PQC 感知的 IDE 插件。** 已有工具（liboqs、OpenQuantumSafe）专注库替换，但没有任何工具在开发阶段就提醒开发者"你正在写的代码在量子时代不安全"。FIBEMATE 的 29 个可视化页面可直接链接为"为什么"的证据。

---

## 6. 实现细节（伪代码）

### 6.1 扩展入口 `src/extension.ts`

```ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // 1. Hover Provider — 光标悬停提示
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['javascript', 'typescript', 'python', 'go', 'java'],
      new PqcHoverProvider()
    )
  );

  // 2. CodeLens — 行内标签
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      ['javascript', 'typescript'],
      new PqcCodeLensProvider()
    )
  );

  // 3. Diagnostics — Problems 面板
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('pqc-lens');
  context.subscriptions.push(diagnosticCollection);

  // 4. Sidebar View — 树形视图
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('pqc-sidebar', new PqcTreeProvider())
  );

  // 5. 文档变更时自动扫描
  vscode.workspace.onDidChangeTextDocument(e => {
    updateDiagnostics(e.document, diagnosticCollection);
  });

  // 6. 初始扫描
  vscode.workspace.textDocuments.forEach(doc => updateDiagnostics(doc, diagnosticCollection));
}
```

### 6.2 Hover Provider 逻辑

```ts
class PqcHoverProvider implements vscode.HoverProvider {
  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | null {
    const line = doc.lineAt(pos.line).text;

    // 模式匹配：crypto.createHash('sha256') / generateKeyPairSync('rsa') / etc
    const patterns = [
      { regex: /createHash\(['"](\w+)['"]\)/,   type: 'hash' },
      { regex: /generateKeyPairSync\(['"](\w+)['"][,)]/, type: 'keypair' },
      { regex: /createCipher(iv)?\(['"]([\w-]+)['"]\)/, type: 'cipher' },
      { regex: /createSign\(['"]([\w-]+)['"]\)/,       type: 'sign' },
      { regex: /createECDH\(['"](\w+)['"]\)/,          type: 'ecdh' },
      // Go: crypto/rsa, crypto/ecdsa imports
      { regex: /"crypto\/(rsa|ecdsa|sha256|aes)"/,      type: 'go_import' },
    ];

    for (const { regex, type } of patterns) {
      const m = line.match(regex);
      if (m) {
        const algo = m[1];
        const rule = RULES[algo];
        if (!rule) return null;

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`### 🔐 PQC Lens\n\n`);
        markdown.appendMarkdown(`**${algo}** → 量子安全位: **${rule.quantumBits}**\n\n`);
        markdown.appendMarkdown(`| 属性 | 值 |\n|---|---|\n`);
        markdown.appendMarkdown(`| 分类 | ${rule.category} |\n`);
        markdown.appendMarkdown(`| 风险等级 | ${rule.severity} |\n`);
        markdown.appendMarkdown(`| 迁移建议 | ${rule.migration} |\n`);
        markdown.appendMarkdown(`\n[📖 在 FIBEMATE 中查看参考实现](https://fibemate.net)`);
        return new vscode.Hover(markdown);
      }
    }
    return null;
  }
}
```

### 6.3 Diagnostics 更新

```ts
function updateDiagnostics(doc: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
  const diagnostics: vscode.Diagnostic[] = [];

  for (let i = 0; i < doc.lineCount; i++) {
    const line = doc.lineAt(i).text;

    for (const [algo, rule] of Object.entries(RULES)) {
      if (line.includes(algo)) {
        const idx = line.indexOf(algo);
        const range = new vscode.Range(i, idx, i, idx + algo.length);
        const severity = rule.severity === 'HIGH'
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;

        diagnostics.push({
          message:     `pqc-lens: ${algo} — ${rule.migration}`,
          range,
          severity,
          source:      'PQC Lens',
          code:        rule.quantumBits === 0 ? 'quantum-vulnerable' : 'grover-safe',
        });
      }
    }
  }

  collection.set(doc.uri, diagnostics);
}
```

### 6.4 配置 `package.json` (VS Code manifest)

```json
{
  "name": "pqc-lens",
  "version": "1.0.0",
  "engines": { "vscode": "^1.80.0" },
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "views": {
      "explorer": [{
        "id": "pqc-sidebar",
        "name": "PQC Lens",
        "icon": "$(shield)"
      }]
    },
    "configuration": {
      "title": "PQC Lens",
      "properties": {
        "pqcLens.threshold": {
          "type": "number", "default": 50,
          "description": "Minimum quantum readiness score to consider safe"
        },
        "pqcLens.ignoreDev": {
          "type": "boolean", "default": true,
          "description": "Ignore devDependencies"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.80.0",
    "typescript": "^5.0.0"
  }
}
```

---

*冻结期状态：仅设计文档。伪代码不编译、不运行。8/31 后开发。*
