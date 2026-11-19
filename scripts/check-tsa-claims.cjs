// SPDX-License-Identifier: GPL-3.0-only
'use strict';

/**
 * A page may not name a timestamp authority it cannot show.
 *
 * Measured 2026-11-19 over all 364 tracked tokens: 83 carry a FreeTSA signer
 * certificate, 18 carry a DigiCert one, and 263 carry none at all. A token with
 * no signer certificate does not name its issuer, so calling it "tsa.cn" is a
 * claim with nothing behind it - which is exactly what ten public pages did.
 *
 *   node scripts/check-tsa-claims.cjs            # scan the public files
 *   node scripts/check-tsa-claims.cjs --self-test
 *
 * Exit: 0 clean, 1 a page names an authority it cannot evidence, 2 cannot run.
 * A deliberately historical line may carry `tsa-claim-exempt:` and is counted
 * out loud, so the exemption cannot grow silently.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PATTERNS = [/\btsa\.cn\b/i, /联合信任/, /United\s+Trust/i];

// Pages outside the shared claim list that also mention an authority.
const EXTRA = [
  'www/timestamps/index.html',
  'www/disclaimer.html',
  'www/docs/FAQ.html',
  'www/kat-10000.html',
  'www/kat-purejs-10000.html',
  'www/crypto/test-ml-kem-kat.html',
];

function targets() {
  const shared = require('./lib/public-targets.cjs');
  return [...new Set([...shared, ...EXTRA])];
}

function scan(root, files) {
  const violations = [];
  let exempt = 0;
  for (const rel of files) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!PATTERNS.some((re) => re.test(line))) return;
      if (line.includes('tsa-claim-exempt:')) { exempt++; return; }
      violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return { violations, exempt, scanned: files.length };
}

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsa-claims-'));
  const cases = [
    ['names an authority', '本项目使用联合信任 (tsa.cn) 存证\n', 1],
    ['names it in English', 'Attested by United Trust.\n', 1],
    ['exempt line is counted, not failed', 'old wording 联合信任 <!-- tsa-claim-exempt: historical -->\n', 0],
    ['measured wording passes', 'FreeTSA 83, DigiCert 18, 263 unknown.\n', 0],
  ];
  let failures = 0;
  for (const [name, body, expect] of cases) {
    const f = path.join(dir, 'case.html');
    fs.writeFileSync(f, body, 'utf8');
    const { violations } = scan(dir, ['case.html']);
    const got = violations.length ? 1 : 0;
    const ok = got === expect;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expect=${expect} got=${got}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  if (failures) { console.log(`self-test: ${failures} failing case(s)`); process.exit(1); }
  console.log('self-test: all cases behaved as expected');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const files = targets();
  if (!files.length) { console.log('cannot run: empty target list'); process.exit(2); }
  const { violations, exempt, scanned } = scan(ROOT, files);
  if (violations.length) {
    for (const v of violations) console.log('UNATTRIBUTED ' + v);
    console.log(`FAIL: ${violations.length} line(s) name an authority the tokens do not evidence (${scanned} files, ${exempt} exempt)`);
    process.exit(1);
  }
  console.log(`OK: no unevidenced authority in ${scanned} file(s) (${exempt} exempt)`);
}

main();
