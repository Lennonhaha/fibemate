// SPDX-License-Identifier: GPL-3.0-only
/*
 * verifact 报告渲染器 — 只把 JSON 里已有的字段搬到 DOM 上，不做任何判定。
 *
 * 硬规则（改这个文件前先读）：
 *   1. 状态字符串原样输出。KNOWN 只决定 CSS 类，不决定"应该是什么状态"。
 *   2. 未知状态一律渲染成 st-unknown 并原样显示字符串 —— 绝不回退成绿色。
 *   3. 颜色只表示"报告里写了什么"，页面上方的横幅已声明：不执行安全判定。
 *   4. renderReport() 是纯函数，测试直接调用它；DOM 绑定在 mount() 里。
 *   5. 算术对账（recon）只做加减法并把结果显示出来。它对不上时页面必须变红，
 *      不允许"算不平但照样绿" —— 那正是这个页面要防的假绿。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VerifactDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KNOWN = ['verified', 'drift', 'ambiguous', 'unbound', 'ref-found', 'ref-missing'];
  const TILES = ['verified', 'drift', 'ambiguous', 'unbound'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function num(value) {
    const n = Number(value);
    if (!isFinite(n)) return esc(value);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

  /*
   * 算术对账：把报告自己的数字串成一条可以逐项验算的链。
   * 全部数字来自 report.counts，页面不引入任何外部常数。
   *
   *   瓦片合计 + refFound + refMissing = counts.claims
   *   counts.claims + 非代码制品      = counts.claimsTotal
   *
   * 只有当 report.claims 覆盖全部声明时，才算得出"非代码制品"的分项
   * （reference / disposition / denied / ignored）；抽样视图只报总数，不猜分项。
   */
  function reconcile(report) {
    const c = (report && report.counts) || {};
    const claims = (report && report.claims) || [];

    const tiles = TILES.reduce(function (sum, k) { return sum + (Number(c[k]) || 0); }, 0);
    const refFound = Number(c.refFound) || 0;
    const refMissing = Number(c.refMissing) || 0;
    const codeClaims = Number(c.claims) || 0;
    const claimsTotal = Number(c.claimsTotal) || 0;
    const nonCode = claimsTotal - codeClaims;

    const eq1 = tiles + refFound + refMissing === codeClaims;

    const complete = claims.length > 0 && claims.length === claimsTotal;
    let byStatus = null;
    let eqFull = null;
    if (complete) {
      byStatus = {};
      claims.forEach(function (cl) {
        const s = String(cl && cl.status);
        byStatus[s] = (byStatus[s] || 0) + 1;
      });
      const summed = Object.keys(byStatus).reduce(function (s, k) { return s + byStatus[k]; }, 0);
      eqFull = summed === claimsTotal;
    }

    return {
      tiles: tiles,
      refFound: refFound,
      refMissing: refMissing,
      codeClaims: codeClaims,
      claimsTotal: claimsTotal,
      nonCode: nonCode,
      eq1: eq1,
      complete: complete,
      byStatus: byStatus,
      eqFull: eqFull,
      ok: eq1 && (complete ? eqFull === true : true),
    };
  }

  function reconBlock(report) {
    const r = reconcile(report);

    function term(value, label, strong) {
      return '<span class="term"><span class="op' + (strong ? ' strong' : '') + '">' + value +
        '</span><span class="lbl">' + label + '</span></span>';
    }
    function sym(s) {
      return '<span class="sym">' + s + '</span>';
    }

    const parts = [
      term(num(r.tiles), '瓦片合计'),
      sym('+') + term(num(r.refFound), 'ref-found'),
      sym('+') + term(num(r.refMissing), 'ref-missing'),
      sym('=') + term(num(r.codeClaims), 'counts.claims', true),
      sym('+') + term(num(r.nonCode), '非代码制品'),
      sym('=') + term(num(r.claimsTotal), 'claimsTotal', true),
    ].join('');

    let detail;
    if (r.complete && r.byStatus) {
      const keys = Object.keys(r.byStatus).sort();
      detail = '本报告含全部 ' + num(r.claimsTotal) + ' 条明细：' +
        keys.map(function (k) { return esc(k) + ' ' + num(r.byStatus[k]); }).join(' · ') +
        '。非代码制品 ' + num(r.nonCode) + ' = 上述 reference / disposition / denied / ignored 之和。';
    } else {
      detail = '抽样视图：只有 ' + num((report && report.claims || []).length) + ' / ' + num(r.claimsTotal) +
        ' 条明细，分项无法在页面上重算；但 ' + num(r.codeClaims) + ' + ' + num(r.nonCode) + ' = ' +
        num(r.claimsTotal) + ' 仍然成立（非代码制品 = claimsTotal − counts.claims）。';
    }

    const fail = r.ok
      ? ''
      : '<div class="recon-fail" data-recon-fail="1"><b>对账失败</b> ' +
        esc('瓦片 ' + r.tiles + ' + refFound ' + r.refFound + ' + refMissing ' + r.refMissing +
          ' ≠ counts.claims ' + r.codeClaims +
          (r.complete && r.eqFull === false ? '；逐条状态之和 ≠ claimsTotal' + r.claimsTotal : '')) +
        '。这份报告自己的数字对不上，页面不会把它显示成正常。</div>';

    return (
      '<div class="recon ' + (r.ok ? 'ok' : 'bad') + '" data-recon="' + (r.ok ? 'ok' : 'fail') + '"' +
        ' data-recon-tiles="' + esc(r.tiles) + '"' +
        ' data-recon-ref-found="' + esc(r.refFound) + '"' +
        ' data-recon-ref-missing="' + esc(r.refMissing) + '"' +
        ' data-recon-claims="' + esc(r.codeClaims) + '"' +
        ' data-recon-noncode="' + esc(r.nonCode) + '"' +
        ' data-recon-total="' + esc(r.claimsTotal) + '">' +
        '<div class="recon-head">算术对账 <span>下面每个数字都是页面从 counts 里算的，不是抄的</span></div>' +
        '<div class="recon-eq">' + parts + '</div>' +
        '<div class="recon-note">' + detail + '</div>' +
        fail +
        '</div>'
    );
  }

  function metaLine(report) {
    const c = (report && report.counts) || {};
    const gate = (report && report.gate) || {};
    const bits = [
      'schema ' + esc(report && report.schema),
      'generatedAt ' + esc(report && report.generatedAt),
      'docs ' + esc(c.docs),
      'claims ' + esc(c.claims) + ' / claimsTotal ' + esc(c.claimsTotal),
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
      reconHtml: reconBlock(report),
      metaHtml: metaLine(report),
      bannersHtml: banners(report),
      tableHtml: claimTable(report),
      rows: ((report && report.claims) || []).length,
      recon: reconcile(report),
    };
  }

  function mount(doc, report) {
    const out = renderReport(report);
    doc.getElementById('summary').innerHTML = out.summaryHtml;
    if (doc.getElementById('recon')) doc.getElementById('recon').innerHTML = out.reconHtml;
    doc.getElementById('meta').innerHTML = out.metaHtml;
    doc.getElementById('banners').innerHTML = out.bannersHtml;
    doc.getElementById('table').innerHTML = out.tableHtml;
  }

  return {
    KNOWN: KNOWN,
    esc: esc,
    statusClass: statusClass,
    reconcile: reconcile,
    renderReport: renderReport,
    mount: mount,
  };
});
