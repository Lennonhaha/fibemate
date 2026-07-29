// packages/fml-dsa/test/kat-vectors.mjs
// Download NIST ACVP ML-DSA KeyGen KAT vectors
// Uses GitHub blob API for large files
//
// Output: kat-vectors/ml-dsa-{44,65,87}-keygen.json

import { writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'kat-vectors');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

async function fetchJsonViaBlob(sha) {
  const url = `https://api.github.com/repos/usnistgov/ACVP-Server/git/blobs/${sha}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  const raw = Buffer.from(data.content, data.encoding || 'base64');
  return JSON.parse(raw.toString('utf8'));
}

async function main() {
  // ── Step 1: Prompt (seeds) ──
  console.log('=== Step 1: Fetching prompt.json ===');
  const prompt = await fetchJsonViaBlob('f53809df5fefee2c1b80da1122885a2e0e843e32');
  console.log(`  Got ${prompt.testGroups.length} test groups`);

  // Build KAT seed index
  const KAT = { 'ML-DSA-44': [], 'ML-DSA-65': [], 'ML-DSA-87': [] };
  for (const g of prompt.testGroups) {
    const ps = g.parameterSet;
    for (const t of g.tests) {
      KAT[ps].push({ tcId: t.tcId, seed: t.seed });
    }
  }

  // ── Step 2: Expected results ──
  console.log('\n=== Step 2: Fetching expectedResults.json (873KB) ===');
  const expected = await fetchJsonViaBlob('38213cd71c20c019cc49bf140f616ed86c81ad98');
  console.log(`  Got ${expected.testGroups.length} test groups`);

  // ── Step 3: Match by tcId ──
  console.log('\n=== Step 3: Matching results ===');
  for (const g of expected.testGroups) {
    // Match parameter set from prompt (prompt groups are in order: 44, 65, 87)
    // expectedResults testGroups have no parameterSet field — match by tgId
    const promptGroup = prompt.testGroups.find(pg => pg.tgId === g.tgId);
    if (!promptGroup) {
      console.log(`  ⚠️ No prompt group for tgId=${g.tgId}`);
      continue;
    }
    const ps = promptGroup.parameterSet;
    if (!KAT[ps]) continue;

    for (const t of g.tests) {
      const kat = KAT[ps].find(x => x.tcId === t.tcId);
      if (kat) {
        kat.pk = t.pk;
        kat.sk = t.sk;
      }
    }
  }

  // ── Step 4: Write output ──
  console.log('\n=== Step 4: Writing output ===');
  for (const [ps, tests] of Object.entries(KAT)) {
    const file = resolve(OUT, `ml-dsa-${ps.toLowerCase().replace('-','')}-keygen.json`);
    writeFileSync(file, JSON.stringify(tests, null, 2), 'utf8');
    const complete = tests.filter(t => t.pk && t.sk);
    const stats = statSync(file);
    console.log(`  ${ps}: ${complete.length}/${tests.length} complete → ${(stats.size/1024).toFixed(1)}KB`);
    if (complete.length > 0) {
      const first = complete[0];
      console.log(`    seed: ${first.seed}`);
      console.log(`    pk:   ${first.pk.length} hex chars = ${first.pk.length/2} bytes`);
      console.log(`    sk:   ${first.sk.length} hex chars = ${first.sk.length/2} bytes`);
    }
  }

  console.log('\n✅ KAT vectors saved to kat-vectors/');
}

main().catch(e => { console.error(e); process.exit(1); });
