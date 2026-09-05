// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// KatVerifier 主类 — 可复用 KAT 验证框架
const fs = require('fs');
const path = require('path');
const { bufEq, toBuf, bufToHex } = require('./util');
const { parseVectors } = require('./parser');

class KatVerifier {
  constructor(algorithm, katDir) {
    this.algorithm = algorithm;
    this.katDir = katDir;
    this.vectors = [];
  }

  // 从 NIST/ACVP 文件加载向量
  loadFromFiles() {
    const files = fs.readdirSync(this.katDir).filter(f => /\.(json|rsp|txt)$/i.test(f));
    for (const f of files) {
      const p = path.join(this.katDir, f);
      const content = fs.readFileSync(p, 'utf8');
      const vecs = parseVectors(content, this.algorithm);
      vecs.forEach(v => { v.sourceFile = f; });
      this.vectors.push(...vecs);
    }
    return this;
  }

  // 直接注入向量（内存）
  setVectors(vecs) {
    this.vectors = vecs;
    return this;
  }

  // 运行验证：impl 提供 { keygen?, encaps?, decaps?, sign?, verify? }
  // 每个函数签名：(fields) => { ... } 或 (seed, ...) 
  // run() 会调用对应 stage 并比较结果
  run(impl, stages = {}) {
    const summary = {
      algorithm: this.algorithm,
      total: this.vectors.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    for (const vec of this.vectors) {
      const detail = { id: vec.id ?? vec.sourceFile, stages: {}, ok: true };
      let vecFailed = false;

      for (const [stage, stageImpl] of Object.entries(stages)) {
        if (!stageImpl) continue;
        try {
          const got = stageImpl(vec.fields, vec);
          const expField = this._expectedFieldForStage(stage);
          if (expField && vec.fields[expField] !== undefined) {
            const expected = vec.fields[expField];
            const pass = bufEq(toBuf(got), toBuf(expected));
            detail.stages[stage] = { passed: pass, expected: bufToHex(expected).slice(0, 16) + '…', actual: bufToHex(toBuf(got)).slice(0, 16) + '…' };
            if (!pass) vecFailed = true;
          } else {
            detail.stages[stage] = { passed: true, note: '无预期值，仅执行' };
          }
        } catch (e) {
          detail.stages[stage] = { passed: false, error: e.message };
          vecFailed = true;
        }
      }

      detail.ok = !vecFailed;
      if (vecFailed) summary.failed++;
      else summary.passed++;
      summary.details.push(detail);
    }

    return summary;
  }

  // stage → 预期字段映射（按算法可覆盖）
  _expectedFieldForStage(stage) {
    const map = {
      keygen_pk: 'pk', keygen_sk: 'sk', keygen: 'pk',
      encaps_ct: 'ct', encaps_ss: 'k', encaps: 'ct',
      decaps_ss: 'k', decaps: 'k',
      sign_sig: 'sig', sign: 'sig',
    };
    return map[stage] || null;
  }

  // 结果字符串
  format(summary, mode = 'default') {
    const L = [];
    if (mode === 'json') {
      return JSON.stringify(summary, null, 2);
    }
    L.push(`📋 ${summary.algorithm} KAT 验证`);
    L.push(`   total:   ${summary.total}`);
    L.push(`   passed:  ${summary.passed} ✅`);
    if (summary.failed) L.push(`   failed:  ${summary.failed} ❌`);
    if (summary.skipped) L.push(`   skipped: ${summary.skipped}`);
    const pct = summary.total ? Math.round(100 * summary.passed / summary.total) : 0;
    L.push(`   结果:    ${summary.passed}/${summary.total} (${pct}%)`);
    if (summary.failed > 0) {
      L.push('');
      L.push('   失败明细:');
      for (const d of summary.details.filter(d => !d.ok)) {
        L.push(`     ❌ ${d.id}: ${Object.entries(d.stages).filter(([, s]) => !s.passed).map(([k, s]) => `${k}(${s.error || 'mismatch'})`).join(', ')}`);
      }
    }
    return L.join('\n');
  }
}

module.exports = { KatVerifier };
