// SPDX-License-Identifier: GPL-3.0-only
// kat-siggen-fetch.mjs v2 — Fetch SigGen KAT correctly
// Prompt: { tcId, message, sk, context }
// Expected: { tcId, signature }
// Output: kat-vectors/ml-dsa-{44,65,87}-siggen.json

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'kat-vectors');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

async function fetchBlob(sha) {
  const r = await fetch('https://api.github.com/repos/usnistgov/ACVP-Server/git/blobs/' + sha);
  const j = await r.json();
  return JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
}

async function main() {
  console.log('Fetching SigGen prompt...');
  const prompt = await fetchBlob('d8325788fe4805a9598490f14c6adec07fe648fe');

  // Build KAT with sk + message
  const KAT = { 'ML-DSA-44': [], 'ML-DSA-65': [], 'ML-DSA-87': [] };
  for (const g of prompt.testGroups) {
    const ps = g.parameterSet;
    if (!KAT[ps]) continue;
    for (const t of g.tests) {
      KAT[ps].push({ tcId: t.tcId, message: t.message, sk: t.sk });
    }
  }

  console.log('Fetching SigGen expectedResults...');
  const expected = await fetchBlob('d9923ac185db3955a1a1c8e4009ded404a4eec9b');

  // Match signatures
  for (const g of expected.testGroups) {
    const pg = prompt.testGroups.find(pg => pg.tgId === g.tgId);
    if (!pg) continue;
    const ps = pg.parameterSet;
    if (!KAT[ps]) continue;
    for (const t of g.tests) {
      const kat = KAT[ps].find(x => x.tcId === t.tcId);
      if (kat) kat.signature = t.signature;
    }
  }

  // Write
  for (const [ps, tests] of Object.entries(KAT)) {
    const file = resolve(OUT, `ml-dsa-${ps.toLowerCase().replace('-','')}-siggen.json`);
    writeFileSync(file, JSON.stringify(tests, null, 2), 'utf8');
    const complete = tests.filter(t => t.signature && t.sk && t.message);
    console.log(`  ${ps}: ${complete.length}/${tests.length} complete`);
  }
  console.log('✅ Done');
}

main().catch(e => { console.error(e); process.exit(1); });
