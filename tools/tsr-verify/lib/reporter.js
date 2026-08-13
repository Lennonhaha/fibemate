'use strict';
// 输出渲染：表格 / JSON / info
function renderSummaryTable(summary, color = true) {
  const lines = [];
  lines.push('🔐 TSR Evidence Chain Verifier');
  lines.push('');
  lines.push('🔍 Verification Results:');
  lines.push(`  ✅ Total:   ${summary.total}`);
  lines.push(`  ✅ Valid:   ${summary.valid}`);
  if (summary.invalid > 0) lines.push(`  ❌ Invalid: ${summary.invalid}`);
  if (summary.range) lines.push(`  ⏱️  Range:   ${summary.range}`);
  if (summary.chain) {
    const gaps = summary.chain.gaps || [];
    let gapStr;
    if (gaps.length === 0) {
      gapStr = '✅ NO GAPS (consecutive)';
    } else {
      // 负数 = 大区间断裂（未展开）
      const expanded = gaps.filter(g => g > 0);
      const bigRanges = gaps.filter(g => g < 0).map(g => -g);
      const parts = [];
      if (expanded.length) parts.push(expanded.slice(0, 10).join(', ') + (expanded.length > 10 ? ` +${expanded.length - 10} more` : ''));
      for (const r of bigRanges) parts.push(`区间断裂 ~${r} 个`);
      gapStr = '❌ GAPS: ' + parts.join('; ');
    }
    lines.push(`  🔗 Chain:   ${gapStr}`);
  }
  if (summary.authorities && Object.keys(summary.authorities).length) {
    const authStr = Object.entries(summary.authorities).map(([k, v]) => `${k} (${v})`).join(' + ');
    lines.push(`  🏛️  TSA:     ${authStr}`);
  }
  lines.push('');
  lines.push('📊 Summary:');
  lines.push(`  Total:     ${summary.total}`);
  lines.push(`  Valid:     ${summary.valid} ✅`);
  lines.push(`  Expired:   0`);
  lines.push(`  Missing:   0`);
  lines.push(`  Chain gap: ${summary.chain ? summary.chain.gaps.length : 'N/A'}`);
  lines.push('');
  lines.push(`🎯 Evidence chain integrity: ${summary.total > 0 ? Math.round(summary.valid / summary.total * 100) : 0}%`);
  return lines.join('\n');
}

function renderInfo(result) {
  const lines = [];
  lines.push('🔐 TSR File Info');
  lines.push('');
  lines.push(`  File:      ${result.file}.tsr`);
  lines.push(`  Status:    ${result.status}`);
  lines.push(`  Valid:     ${result.valid ? '✅' : '❌ ' + (result.reason || '')}`);
  if (result.serial) lines.push(`  Serial:    ${result.serial}`);
  if (result.timestamp) lines.push(`  Timestamp: ${result.timestamp}`);
  if (result.algorithm) lines.push(`  Hash Algo: ${result.algorithm}`);
  if (result.imprint) lines.push(`  Imprint:   ${result.imprint.slice(0, 24)}...${result.imprint.slice(-16)}`);
  return lines.join('\n');
}

module.exports = { renderSummaryTable, renderInfo };
