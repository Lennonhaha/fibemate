// SPDX-License-Identifier: GPL-3.0-only
// 报告渲染：table / json / html
const SEVERITY_ICON = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🔵', OK: '🟢' };
const SEVERITY_LABEL = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', OK: 'OK' };

function renderTable(report, color = true) {
  const lines = [];
  const f = report.findings;

  lines.push('🔍 PQC Migration Scanner');
  lines.push('📁 Scanning: ' + report.path);
  lines.push('📦 Dependencies: ' + report.totalDeps + ' total');

  const bySev = (sev) => f.filter(x => x.severity === sev);

  const high = bySev('HIGH'), med = bySev('MEDIUM'), low = bySev('LOW');

  if (high.length) {
    lines.push('');
    lines.push('🔴 HIGH — ' + high.length + ' quantum-vulnerable components:');
    high.forEach(x => {
      lines.push('  ' + x.name + '@' + x.version + ' → ' + x.algorithm + ' (' + x.category + ') → ' + x.migration);
    });
  }
  if (med.length) {
    lines.push('');
    lines.push('🟡 MEDIUM — ' + med.length + ' classical cryptography (Grover-affected):');
    med.forEach(x => {
      lines.push('  ' + x.name + '@' + x.version + ' → ' + x.algorithm + ' (' + x.category + ') → ' + x.migration);
    });
  }
  if (low.length) {
    lines.push('');
    lines.push('🔵 LOW — ' + low.length + ' needs manual review:');
    low.forEach(x => {
      lines.push('  ' + x.name + '@' + x.version + ' → ' + (x.note || x.algorithm));
    });
  }

  const okCount = report.totalDeps - f.length;
  lines.push('');
  lines.push('🟢 OK — ' + okCount + ' components (no crypto detected)');

  lines.push('');
  lines.push('📊 Overall Quantum Readiness Score: ' + report.score + '/100');

  if (high.length) {
    lines.push('⚠️  ' + high.length + ' critical items must be addressed before full PQC migration.');
  }

  return lines.join('\n');
}

function renderHtml(report) {
  const rows = report.findings.map(f => `
    <tr>
      <td>${f.name}@${f.version}</td>
      <td>${f.algorithm}</td>
      <td>${f.category}</td>
      <td>${f.quantumBits ?? '?'}</td>
      <td>${f.migration}</td>
      <td class="sev-${f.severity.toLowerCase()}">${f.severity}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>PQC Migration Report</title>
<style>
body{font-family:-apple-system,sans-serif;background:#060a12;color:#b8c8e8;padding:24px;margin:0}
h1{color:#e8f0ff;font-size:20px}
table{width:100%;border-collapse:collapse;margin-top:16px;background:#0d1525;border-radius:10px;overflow:hidden}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid #1a2744;font-size:13px}
th{background:#141c2e;color:#5a6a8a;font-weight:600}
.sev-high{color:#ef4444;font-weight:700}
.sev-medium{color:#f59e0b}
.sev-low{color:#4fc3f7}
.score{font-size:18px;color:#10b981;font-weight:700;margin-top:16px}
</style></head>
<body>
<h1>🔍 PQC Migration Report</h1>
<p>Path: ${report.path} · Dependencies: ${report.totalDeps} · ${report.timestamp}</p>
<table><thead><tr><th>Package</th><th>Algorithm</th><th>Category</th><th>Quantum Bits</th><th>Migration</th><th>Severity</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="score">Overall Score: ${report.score}/100</div>
</body></html>`;
}

module.exports = { renderTable, renderHtml };
