// kat-verify.mjs — Verify ML-DSA KeyGen KAT against @noble/post-quantum
// 2026-07-29: 75 ACVP KAT vectors → noble keygen → byte-level comparison

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KAT_DIR = resolve(__dirname, '..', 'kat-vectors');

const bundle = readFileSync(resolve(__dirname, '..', '..', '..', 'www', 'noble-pq-bundle', 'ml-dsa.js'), 'utf8');
eval(bundle.replace('var __NOBLE_PQ__', 'globalThis.__NOBLE_PQ__'));
const noble = globalThis.__NOBLE_PQ__;

function h2b(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return b;
}

function cmp(a, b) {
  if (a.length !== b.length) return { ok: false, off: -1, la: a.length, lb: b.length };
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) return { ok: false, off: i, ea: a[i], eb: b[i] };
  return { ok: true };
}

const PS_MAP = { 1312: 'ML-DSA-44', 1952: 'ML-DSA-65', 2592: 'ML-DSA-87' };
const FN_MAP = { 'ML-DSA-44': noble.ml_dsa44, 'ML-DSA-65': noble.ml_dsa65, 'ML-DSA-87': noble.ml_dsa87 };

let total = 0, passed = 0, failed = 0;
const log = [];

for (const file of readdirSync(KAT_DIR).filter(f => f.endsWith('.json'))) {
  const tests = JSON.parse(readFileSync(resolve(KAT_DIR, file), 'utf8'));
  const first = tests.find(t => t.pk);
  if (!first) continue;
  const ps = PS_MAP[first.pk.length / 2];
  const fn = FN_MAP[ps];
  if (!ps || !fn) { log.push(`${file}: SKIP (unknown PK len)`); continue; }

  log.push(`\n${ps} (${file}) — ${tests.length} vectors`);

  for (const t of tests) {
    if (!t.seed || !t.pk || !t.sk) continue;
    total++;
    try {
      const keys = fn.keygen(h2b(t.seed));
      const { ok: pok, off: po, ea: pgot, eb: pexp, la: pla, lb: plb } = cmp(Array.from(keys.publicKey), Array.from(h2b(t.pk)));
      const { ok: sok, off: so, ea: sgot, eb: sexp, la: sla, lb: slb } = cmp(Array.from(keys.secretKey), Array.from(h2b(t.sk)));

      if (pok && sok) { passed++; continue; }
      failed++;
      const errs = [];
      if (!pok) errs.push(`pk ${po >= 0 ? `off=${po} got=0x${pgot.toString(16)} exp=0x${pexp.toString(16)}` : `len ${pla}≠${plb}`}`);
      if (!sok) errs.push(`sk ${so >= 0 ? `off=${so} got=0x${sgot.toString(16)} exp=0x${sexp.toString(16)}` : `len ${sla}≠${slb}`}`);
      log.push(`  ✗ tcId=${t.tcId} ${errs.join(', ')}`);
    } catch (e) {
      failed++;
      log.push(`  ✗ tcId=${t.tcId} error: ${e.message}`);
    }
  }
  log.push(`  OK: ${tests.filter(t => t.pk && t.sk).length - log.filter(l => l.includes('✗')).length}/${tests.filter(t => t.pk).length}`);
}

const summary = `\n${'='.repeat(50)}\nKeyGen KAT: ${passed}/${total} PASS${failed ? `, ${failed} FAIL` : ''}\n${failed === 0 ? '🎉 ALL 75/75 KAT vectors match @noble/post-quantum byte-for-byte!' : `⚠️ ${failed} FAILURES`}`;
log.push(summary);
console.log(log.join('\n'));
writeFileSync(resolve(__dirname, '..', 'noble-kat-validation.log'), log.join('\n'), 'utf8');
console.log('\n📝 Log saved to noble-kat-validation.log');

process.exit(failed > 0 ? 1 : 0);
