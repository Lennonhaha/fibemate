/*
 * verifact 报告渲染器 — 只把 JSON 里已有的字段搬到 DOM 上，不做任何判定。
 *
 * 硬规则（改这个文件前先读）：
 *   1. 状态字符串原样输出。KNOWN 只决定 CSS 类，不决定"应该是什么状态"。
 *   2. 未知状态一律渲染成 st-unknown 并原样显示字符串 —— 绝不回退成绿色。
 *   3. 颜色只表示"报告里写了什么"，页面上方的横幅已声明：不执行安全判定。
 *   4. renderReport() 是纯函数，测试直接调用它；DOM 绑定在 mount() 里。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VerifactDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KNOWN = ['verified', 'drift', 'ambiguous', 'unbound', 'ref-found', 'ref-missing'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusClass(status) {
    return KNOWN.indexOf(status) >= 0 ? 'st-' + status : 'st-unknown';
  }

  function valueText(claim) {
    const v = claim && claim.value;
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (typeof v.raw === 'string' || typeof v.raw === 'number') return String(v.raw);
    return JSON.stringify(v);
  }

  function pct(part, whole) {
    if (!whole) return '0%';
    return (Math.round((part / whole) * 1000) / 10) + '%';
  }

  function summaryTiles(report) {
    const c = (report && report.counts) || {};
    const total = c.claims || 0;
    const tiles = [
      ['verified', c.verified || 0],
      ['drift', c.drift || 0],
      ['ambiguous', c.ambiguous || 0],
      ['unbound', c.unbound || 0],
    ];
    return tiles
      .map(function (t) {
        return (
          '<div class="tile ' + statusClass(t[0]) + '" data-tile="' + esc(t[0]) + '">' +
          '<b>' + esc(t[1]) + '</b>' +
          '<span>' + esc(t[0]) + '</span>' +
          '<i>' + esc(pct(t[1], total)) + ' of ' + esc(total) + '</i>' +
          '</div>'
        );
      })
      .join('');
  }

  function metaLine(report) {
    const c = (report && report.counts) || {};
    const gate = (report && report.gate) || {};
    const bits = [
      'schema ' + esc(report && report.schema),
      'generatedAt ' + esc(report && report.generatedAt),
      'docs ' + esc(c.docs),
      'claimsTotal ' + esc(c.claimsTotal),
      'refFound ' + esc(c.refFound),
      'refMissing ' + esc(c.refMissing),
      'policy ' + esc(gate.policy),
      'gate.failed ' + esc(String(!!gate.failed)),
    ];
    return bits.join(' · ');
  }

  function banners(report) {
    const out = [];
    const c = (report && report.counts) || {};
    const meta = (report && report.meta) || {};

    if (meta.synthetic) {
      out.push(
        '<div class="banner synthetic" data-banner="synthetic"><b>SYNTHETIC SAMPLE</b>' +
          ' 这份数据是人工构造的演示数据，不是任何一次真实运行的结果。' +
          ' 用途是演示红色路径怎么画，不代表项目状态。</div>'
      );
    }
    if (Number(c.drift) > 0) {
      out.push(
        '<div class="banner drill" data-banner="drift"><b>报告中 drift = ' + esc(c.drift) + '</b>' +
          ' —— 这是报告自己写的数字，本页面只负责显示。是否阻断由 verifact 的 gate 决定。</div>'
      );
    }
    if (report && report.subset && report.subset.enabled) {
      out.push(
        '<div class="banner subset" data-banner="subset">表格只显示 ' + esc(report.subset.shownClaims) +
          ' / ' + esc(report.subset.ofClaims) + ' 条声明（按状态抽样）；上方计数与 meta 行是**全量运行**的值。</div>'
      );
    }
    return out.join('');
  }

  function claimRow(claim) {
    const status = claim && claim.status;
    const sentence = String((claim && claim.sentence) || '').slice(0, 180);
    return (
      '<tr data-id="' + esc(claim && claim.id) + '" data-status="' + esc(status) + '" class="' + statusClass(status) + '">' +
      '<td><span class="chip ' + statusClass(status) + '">' + esc(status == null ? '(missing status)' : status) + '</span></td>' +
      '<td class="file">' + esc(claim && claim.file) + ':' + esc(claim && claim.line) + '</td>' +
      '<td>' + esc(claim && claim.kind) + '</td>' +
      '<td class="val">' + esc(valueText(claim)) + '</td>' +
      '<td class="say">' + esc(sentence) + '</td>' +
      '</tr>'
    );
  }

  function claimTable(report) {
    const claims = (report && report.claims) || [];
    if (!claims.length) {
      return '<p class="empty" data-empty="1">这份报告里没有声明条目。</p>';
    }
    return (
      '<table id="claims">' +
      '<thead><tr><th>status</th><th>file:line</th><th>kind</th><th>value</th><th>sentence</th></tr></thead>' +
      '<tbody>' + claims.map(claimRow).join('') + '</tbody>' +
      '</table>'
    );
  }

  function renderReport(report) {
    return {
      summaryHtml: summaryTiles(report),
      metaHtml: metaLine(report),
      bannersHtml: banners(report),
      tableHtml: claimTable(report),
      rows: ((report && report.claims) || []).length,
    };
  }

  function mount(doc, report) {
    const out = renderReport(report);
    doc.getElementById('summary').innerHTML = out.summaryHtml;
    doc.getElementById('meta').innerHTML = out.metaHtml;
    doc.getElementById('banners').innerHTML = out.bannersHtml;
    doc.getElementById('table').innerHTML = out.tableHtml;
  }

  return { KNOWN: KNOWN, esc: esc, statusClass: statusClass, renderReport: renderReport, mount: mount };
});
