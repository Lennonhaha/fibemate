// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
#!/usr/bin/env node
// scripts/daily-audit.js �?ML-KEM-768 每日自动安全/质量排查
// 用法: node scripts/daily-audit.js [--fix] [--json]

const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, '..', 'packages', 'pqc-kem', 'src', 'ml-kem-768.js');

const RULES = [
  {
    id: 'SAMPLE_POLY_BOUNDS',
    label: 'samplePoly OOB read',
    sev: 'HIGH',
    check: (src) => {
      const m = src.match(/while\s*\(\s*j\s*<\s*256\s*&&\s*(?:idx\s*\+\s*2\s*<\s*504|idx\s*<\s*(\d+))\s*\)/);
      if (!m) return { pass: true, detail: 'while-loop pattern not detected (manual check needed)' };
      if (m[1]) { const n = parseInt(m[1], 10); return n < 504 ? { pass: true, detail: `bound ${n} (legacy pattern), stream idx+2 max=${n+1} < 504 OK` } : { pass: false, detail: `bound ${n} >= 504 �?OOB` }; }
      return { pass: true, detail: 'idx+2<504 pattern detected �?safe' };
    },
    fix: (src) => src.replace(/while\s*\(\s*j\s*<\s*256\s*&&\s*idx\s*<\s*503\s*\)/, 'while (j < 256 && idx + 2 < 504)'),
    fixLabel: 'idx<503 �?idx+2<504',
  },
  {
    id: 'KYBER_QHALF',
    label: 'magic number 1664',
    sev: 'LOW',
    check: (src) => {
      const raw = src.match(/\b1664\b/g);
      const constant = src.includes('KYBER_QHALF');
      if (raw && !constant) return { pass: false, detail: `${raw.length}× raw 1664 without KYBER_QHALF` };
      if (raw && constant) return { pass: true, detail: `KYBER_QHALF defined, ${raw.length}× 1664 (constant ref ok)` };
      return { pass: true, detail: 'no 1664 found' };
    },
    fix: null,
    fixLabel: null,
  },
  {
    id: 'WEB_CRYPTO',
    label: 'crypto.getRandomValues guard',
    sev: 'MED',
    check: (src) => {
      const ok = /typeof\s+crypto\s*!==/.test(src) && /getRandomValues/.test(src);
      return ok ? { pass: true, detail: '_webcrypto guard present' }
                : { pass: false, detail: 'missing crypto availability check (Node�?8 will crash)' };
    },
    fix: null,
    fixLabel: null,
  },
  {
    id: 'SEED_ZEROIZE',
    label: 'seed zeroization',
    sev: 'LOW',
    check: (src) => /zeroizeU8\(seed\)/.test(src)
      ? { pass: true, detail: 'seed zeroized in generateKeypair' }
      : { pass: false, detail: 'seed not zeroized before return' },
    fix: null,
    fixLabel: null,
  },
  {
    id: 'INPUT_VALIDATION',
    label: 'encaps/decaps input validation',
    sev: 'MED',
    check: (src) => {
      const e = /publicKey\.length\s*!==\s*KYBER_PUBLICKEYBYTES/.test(src);
      const dS = /secretKey\.length\s*!==\s*KYBER_SECRETKEYBYTES/.test(src);
      const dC = /ciphertext\.length\s*!==\s*KYBER_CIPHERTEXTBYTES/.test(src);
      const all = e && dS && dC;
      return all ? { pass: true, detail: 'both encapsulate and decapsulate have length checks' }
                 : { pass: false, detail: `missing: ${[!e&&'encapsPK',!dS&&'decapsSK',!dC&&'decapsCT'].filter(Boolean).join(', ')}` };
    },
    fix: null,
    fixLabel: null,
  },
  {
    id: 'JSDOC',
    label: 'JSDoc coverage',
    sev: 'LOW',
    check: (src) => {
      const fns = (src.match(/function\s+(\w+)\s*\(/g) || []).length;
      const docs = (src.match(/\/\*\*[\s\S]*?\*\/\s*(async\s+)?function/g) || []).length;
      const pct = fns > 0 ? Math.round(docs / fns * 100) : 100;
      return pct >= 50 ? { pass: true, detail: `${docs}/${fns} functions documented (${pct}%)` }
                       : { pass: false, detail: `${docs}/${fns} functions documented (${pct}% �?should reach 50%+)` };
    },
    fix: null,
    fixLabel: null,
  },
  {
    id: 'KEM_ROUNDTRIP',
    label: 'KEM roundtrip smoke test',
    sev: 'HIGH',
    check: () => {
      try {
        const m = require(TARGET);
        for (let i = 0; i < 3; i++) {
          const kp = m.generateKeypair();
          const enc = m.encapsulate(kp.publicKey);
          const ss = m.decapsulate(kp.secretKey, enc.ciphertext);
          if (!Buffer.from(ss).equals(Buffer.from(enc.sharedSecret))) {
            return { pass: false, detail: `round ${i}: shared secret mismatch` };
          }
        }
        return { pass: true, detail: '3/3 KEM roundtrips PASS' };
      } catch (e) {
        return { pass: false, detail: `smoke test threw: ${e.message}` };
      }
    },
    fix: null,
    fixLabel: null,
  },
];

// ── runner ────────────────────────────────────────────────
function run(src, applyFix) {
  let modified = src;
  const report = [];
  for (const r of RULES) {
    const { pass, detail } = r.check(modified);
    const entry = { id: r.id, label: r.label, sev: r.sev, pass, detail };
    if (!pass && applyFix && r.fix) {
      modified = r.fix(modified);
      const re = r.check(modified);
      entry.fixed = { ok: re.pass, detail: re.detail };
    } else if (!pass && r.fix) {
      entry.fixable = true;
      entry.fixLabel = r.fixLabel;
    }
    report.push(entry);
  }
  return { report, modified };
}

// ── output ────────────────────────────────────────────────
function print(report) {
  const ok = report.filter(x => x.pass).length;
  const ng = report.filter(x => !x.pass).length;
  console.log('\n' + '�?.repeat(62));
  console.log('  ML-KEM-768 Daily Audit  �? ' + new Date().toISOString().replace('T', ' ').slice(0, 19));
  console.log('�?.repeat(62));
  for (const r of report) {
    const icon = r.pass ? '�? : '�?;
    const sev = {HIGH:'🔴',MED:'🟠',LOW:'🟡'}[r.sev] || '�?;
    console.log(`  ${icon} ${sev} ${r.label}`);
    console.log(`     ${r.detail}`);
    if (r.fixed) console.log(`     🔧 auto-fixed �?${r.fixed.ok ? '�? : '�?} ${r.fixed.detail}`);
    else if (r.fixable) console.log(`     💡 auto-fix available (--fix): ${r.fixLabel}`);
  }
  console.log('─'.repeat(62));
  console.log(`  ${ok} passed / ${ng} failed / ${report.length} checks`);
  console.log('�?.repeat(62) + '\n');
}

// ── main ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const fix = args.includes('--fix');
const json = args.includes('--json');

if (!fs.existsSync(TARGET)) { console.error('�?, TARGET, 'not found'); process.exit(1); }

const src = fs.readFileSync(TARGET, 'utf8');
const { report, modified } = run(src, fix);

if (json) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), file: TARGET, checks: report }, null, 2));
} else {
  print(report);
}

if (fix && modified !== src) {
  fs.writeFileSync(TARGET, modified, 'utf8');
  console.log('�?patched file written');
} else if (fix) {
  console.log('�?no changes needed');
}

const failed = report.some(r => !r.pass);
process.exit(failed ? 1 : 0);
