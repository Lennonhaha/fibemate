import * as vscode from 'vscode';
import { RULES, findRule } from './rules';

// PQC Lens 插件入口
export function activate(context: vscode.ExtensionContext) {
  // 1. Hover Provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['javascript', 'typescript', 'python', 'go', 'java'],
      new PqcHoverProvider()
    )
  );

  // 2. Diagnostics
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('pqc-lens');
  context.subscriptions.push(diagnosticCollection);

  // 3. 文档变更时自动扫描
  vscode.workspace.onDidChangeTextDocument(e => updateDiagnostics(e.document, diagnosticCollection));
  vscode.workspace.onDidOpenTextDocument(doc => updateDiagnostics(doc, diagnosticCollection));

  // 4. 初始扫描
  vscode.workspace.textDocuments.forEach(doc => updateDiagnostics(doc, diagnosticCollection));

  // 5. Sidebar View
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('pqc-sidebar', new PqcTreeProvider())
  );
}

export function deactivate() {}

// ─── Hover Provider ──────────────────────────────────────────────────────────
class PqcHoverProvider implements vscode.HoverProvider {
  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | null {
    const line = doc.lineAt(pos.line).text;

    const patterns: Array<{ regex: RegExp; idx: number }> = [
      { regex: /createHash\(['"](\w+)['"]\)/, idx: 1 },
      { regex: /generateKeyPairSync\(['"](\w+)['"]/, idx: 1 },
      { regex: /createSign\(['"]([\w-]+)['"]\)/, idx: 1 },
      { regex: /createECDH\(['"](\w+)['"]\)/, idx: 1 },
      { regex: /createCipher(?:iv)?\(['"]([\w-]+)['"]\)/, idx: 1 },
      { regex: /["']crypto\/(rsa|ecdsa|sha256|sha1|md5|aes)["']/, idx: 1 },
    ];

    for (const { regex, idx } of patterns) {
      const m = line.match(regex);
      if (!m) continue;
      const algo = m[idx];
      const rule = findRule(algo);
      if (!rule) return null;

      const markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`### 🔐 PQC Lens\n\n`);
      markdown.appendMarkdown(`**${rule.algorithm}** → 量子安全位: **${rule.quantumBits === 0 ? '❌ 0（Shor 可破）' : rule.quantumBits + ' bit'}**\n\n`);
      markdown.appendMarkdown(`| 属性 | 值 |\n|---|---|\n`);
      markdown.appendMarkdown(`| 分类 | ${rule.category} |\n`);
      markdown.appendMarkdown(`| 风险 | ${rule.severity} |\n`);
      markdown.appendMarkdown(`| 迁移 | ${rule.migration} |\n`);
      markdown.appendMarkdown(`\n[📖 在 FIBEMATE 中查看参考实现](https://fibemate.net)`);
      return new vscode.Hover(markdown);
    }
    return null;
  }
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────
function updateDiagnostics(doc: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
  const diagnostics: vscode.Diagnostic[] = [];

  for (let i = 0; i < doc.lineCount; i++) {
    const line = doc.lineAt(i).text;

    for (const [algo, rule] of Object.entries(RULES)) {
      if (!line.toLowerCase().includes(algo.toLowerCase())) continue;
      const idx = line.toLowerCase().indexOf(algo.toLowerCase());
      const range = new vscode.Range(i, idx, i, idx + algo.length);
      const severity = rule.severity === 'HIGH'
        ? vscode.DiagnosticSeverity.Warning
        : rule.severity === 'MEDIUM'
          ? vscode.DiagnosticSeverity.Information
          : vscode.DiagnosticSeverity.Hint;

      diagnostics.push({
        message: `pqc-lens: ${rule.algorithm} — ${rule.migration}`,
        range,
        severity,
        source: 'PQC Lens',
        code: rule.quantumBits === 0 ? 'quantum-vulnerable' : 'grover-safe',
      });
    }
  }

  collection.set(doc.uri, diagnostics);
}

// ─── Sidebar Tree Provider ───────────────────────────────────────────────────
class PqcTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element) return [];

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [new vscode.TreeItem('打开一个文件开始扫描', vscode.TreeItemCollapsibleState.None)];
    }

    // 统计当前文件的算法出现次数
    const counts: Record<string, number> = {};
    const doc = editor.document;
    for (let i = 0; i < doc.lineCount; i++) {
      const line = doc.lineAt(i).text.toLowerCase();
      for (const algo of Object.keys(RULES)) {
        if (line.includes(algo.toLowerCase())) counts[algo] = (counts[algo] || 0) + 1;
      }
    }

    const items: vscode.TreeItem[] = [];
    for (const [algo, count] of Object.entries(counts)) {
      const rule = findRule(algo);
      if (!rule) continue;
      const icon = rule.severity === 'OK' ? '🟢' : rule.severity === 'HIGH' ? '🔴' : rule.severity === 'MEDIUM' ? '🟡' : '⚪';
      const item = new vscode.TreeItem(`${icon} ${rule.algorithm} (${count} 处)`, vscode.TreeItemCollapsibleState.None);
      item.tooltip = rule.migration;
      items.push(item);
    }

    if (items.length === 0) {
      items.push(new vscode.TreeItem('未检测到密码学调用', vscode.TreeItemCollapsibleState.None));
    }
    return items;
  }
}
