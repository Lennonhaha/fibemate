// SPDX-License-Identifier: GPL-3.0-only
// Who actually signed each tracked timestamp token.
//
// A .tsr is a TimeStampResp: PKIStatusInfo plus an encapsulated TimeStampToken.
// `openssl pkcs7` cannot parse the response directly - it fails with a wrong tag,
// prints nothing, and a naive reader concludes "no signer certificate" for every
// file. The token has to be unwrapped with `ts -reply -token_out` first; that is
// the whole reason this script exists as a tool instead of a one-off.
//
//   node scripts/tsa-issuers.cjs                  # summary only
//   node scripts/tsa-issuers.cjs --json           # machine readable
//   node scripts/tsa-issuers.cjs --write          # refresh www/docs/TIMESTAMP-ISSUERS.md
//   node scripts/tsa-issuers.cjs --check          # table still describes this tree?
//   node scripts/tsa-issuers.cjs --self-test-check
//   node scripts/tsa-issuers.cjs --root DIR       # measure another tree
//
// Exit: 0 measured (or checked clean), 1 drift, 2 could not measure.
// Read-only: it never modifies a token.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const ROOT = path.resolve(valueOf('--root', path.join(__dirname, '..')));
const AS_JSON = has('--json');
const WRITE = has('--write');
// Served path: nginx serves www/, so the evidence the site links to has to live there.
const DOC = path.join(ROOT, 'www', 'docs', 'TIMESTAMP-ISSUERS.md');

function trackedTokens() {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z', '*.tsr'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return out.split('\0').filter(Boolean).sort();
}

// openssl on Windows exits 1 while still writing its output, so the exit status is
// not evidence. The unwrapped token is: a file that exists and is not empty.
function unwrap(full, env, work, index) {
  const tmp = path.join(work, 'token-' + index + '.der');
  try {
    spawnSync('openssl', ['ts', '-reply', '-in', full, '-token_out', '-out', tmp], { env, stdio: 'ignore' });
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) return null;
    const r = spawnSync('openssl', ['pkcs7', '-inform', 'DER', '-in', tmp, '-print_certs', '-noout'], { env, encoding: 'utf8' });
    return (r.stdout || '') + (r.stderr || '');
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* nothing to clean */ }
  }
}

function issuerOf(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^issuer=/.test(lines[i])) continue;
    let rdn = lines[i].slice('issuer='.length).trim();
    // Multi-line RDNs are printed as indented continuation lines.
    for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j++) rdn += ' / ' + lines[j].trim();
    found.push(rdn);
  }
  return found.length ? found : null;
}

function classify(issue) {
  const s = issue.toLowerCase();
  if (/freetsa|free tsa/.test(s)) return 'FreeTSA';
  if (/digicert/.test(s)) return 'DigiCert';
  return 'other';
}

// The table is only evidence while it describes the current tree. Comparing the file
// set costs no openssl calls, so it can run on every push; the counts are refreshed
// by re-running --write.
function docRows(doc) {
  if (!fs.existsSync(doc)) return null;
  const text = fs.readFileSync(doc, 'utf8');
  const paths = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\| (\S+\.tsr) \| /);
    if (m) paths.push(m[1]);
  }
  const total = text.match(/\| \*\*total\*\* \| \*\*(\d+)\*\* \|/);
  return { paths, claimedTotal: total ? Number(total[1]) : null };
}

function checkDoc(doc, tracked) {
  const parsed = docRows(doc);
  if (!parsed) { console.log('DRIFT missing ' + doc); return 1; }
  const inDoc = new Set(parsed.paths);
  const inTree = new Set(tracked);
  let drift = 0;
  for (const f of [...inTree].sort()) if (!inDoc.has(f)) { console.log('DRIFT unlisted ' + f); drift++; }
  for (const f of [...inDoc].sort()) if (!inTree.has(f)) { console.log('DRIFT stale ' + f); drift++; }
  if (parsed.claimedTotal !== null && parsed.claimedTotal !== tracked.length) {
    console.log('DRIFT total claims ' + parsed.claimedTotal + ' but the tree has ' + tracked.length);
    drift++;
  }
  if (drift) {
    console.log('FAIL: ' + drift + ' drift item(s); run node scripts/tsa-issuers.cjs --write');
    return 1;
  }
  console.log('OK: issuer table covers ' + tracked.length + ' tracked token(s), no drift');
  return 0;
}

function selfTestCheck(doc, tracked) {
  if (!fs.existsSync(doc)) { console.log('FAIL doc missing, cannot self-test'); return 1; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsa-issuers-doc-'));
  const tmp = path.join(dir, 'table.md');
  const text = fs.readFileSync(doc, 'utf8');
  const cases = [
    ['intact table passes', text, 0],
    ['a removed row is caught', text.replace(/^\| \S+\.tsr \| [^\n]*$/m, ''), 1],
    ['a stale extra row is caught', text.replace('| --- | --- | --- |', '| --- | --- | --- |\n| docs/tsa/not-real.tsr | 10 | FreeTSA |'), 1],
  ];
  let failures = 0;
  for (const [name, body, expect] of cases) {
    fs.writeFileSync(tmp, body, 'utf8');
    const code = checkDoc(tmp, tracked);
    if (code !== expect) { failures++; console.log('FAIL ' + name + ': expect=' + expect + ' got=' + code); }
    else console.log('PASS ' + name);
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* nothing */ }
  if (failures) { console.log('self-test: ' + failures + ' failing case(s)'); return 1; }
  console.log('self-test: all cases behaved as expected');
  return 0;
}

function main() {
  let files;
  try {
    files = trackedTokens();
  } catch (e) {
    console.error('tsa-issuers: git ls-files failed in ' + ROOT + ' -- cannot measure');
    process.exit(2);
  }
  if (!files.length) {
    console.error('tsa-issuers: no tracked .tsr files under ' + ROOT + ' -- cannot measure');
    process.exit(2);
  }

  if (has('--self-test-check')) process.exit(selfTestCheck(DOC, files));
  if (has('--check')) process.exit(checkDoc(DOC, files));

  // One private directory for every temporary file this run creates: mkdtemp is the
  // only temp-name API that cannot collide with a file someone else prepared.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tsa-issuers-'));
  let env = { ...process.env };
  try {
    const blank = path.join(work, 'openssl.cnf');
    fs.writeFileSync(blank, '', { mode: 0o600 });
    env.OPENSSL_CONF = blank;
  } catch (e) { /* keep the inherited config */ }

  const rows = [];
  for (const rel of files) {
    const full = path.join(ROOT, rel);
    const size = fs.statSync(full).size;
    const text = unwrap(full, env, work, rows.length);
    const issuers = issuerOf(text);
    const primary = issuers ? classify(issuers[0]) : 'no-signer-certificate';
    const label = issuers ? issuers[0] : '';
    rows.push({ file: rel, size, primary, issuer: label, issuers: issuers || [] });
  }

  const counts = {};
  for (const r of rows) counts[r.primary] = (counts[r.primary] || 0) + 1;
  const total = rows.length;

  if (AS_JSON) {
    console.log(JSON.stringify({ root: ROOT, total, counts, rows }, null, 2));
    return;
  }

  console.log('tokens: ' + total);
  for (const k of Object.keys(counts).sort()) console.log('  ' + k + ': ' + counts[k]);
  console.log('no signer certificate in the token: ' + (counts['no-signer-certificate'] || 0) + ' (issuer cannot be read from the file)');

  if (!WRITE) return;

  const dirs = {};
  for (const r of rows) {
    const d = path.dirname(r.file);
    dirs[d] = dirs[d] || {};
    dirs[d][r.primary] = (dirs[d][r.primary] || 0) + 1;
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const now = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push('# Timestamp issuer attribution');
  lines.push('');
  lines.push('Generated by `node scripts/tsa-issuers.cjs --write`. Do not hand-edit: the table is');
  lines.push('evidence, and a table a human types is not evidence.');
  lines.push('');
  lines.push('- Measured: ' + now + ' over ' + total + ' tracked token(s)');
  lines.push('- Tokens: **' + total + '** tracked `.tsr` files, version ' + pkg.version);
  lines.push('- Method: `openssl ts -reply -token_out`, then `openssl pkcs7 -print_certs`; the');
  lines.push('  issuer comes from the signer certificate inside the token, never from the file name,');
  lines.push('  the directory, or the page that links it.');

  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This table covers the tracked .tsr files. It deliberately does not rewrite:');
  lines.push('');
  lines.push('- docs/tsa/** stamped snapshots and archives/**: they are the attested object, and');
  lines.push('  editing them would change what the timestamp was taken over;');
  lines.push('- NOTICE and www/LICENSE.txt, which name services used over time, not tokens;');
  lines.push('- tools/tsa_cn.py, the client that submits to a TSA, not a claim about any token');
  lines.push('  that already exists.');
  lines.push('');
  lines.push('A live page may therefore name FreeTSA or DigiCert, or say the token carries no');
  lines.push('signer certificate. scripts/check-tsa-claims.cjs enforces that.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| issuer | tokens |');
  lines.push('| --- | --- |');
  for (const k of Object.keys(counts).sort()) lines.push('| ' + k + ' | ' + counts[k] + ' |');
  lines.push('| **total** | **' + total + '** |');
  lines.push('');
  lines.push('`no-signer-certificate` means the token carries no signer certificate of its own.');
  lines.push('That is a property of the file, not a verdict on whether a timestamp exists: the');
  lines.push('signature can still be checked against a TSA certificate fetched separately, but the');
  lines.push('file alone does not name the issuer. Do not describe these as "tsa.cn" or as any other');
  lines.push('authority without that separate certificate.');
  lines.push('');
  lines.push('## By directory');
  lines.push('');
  lines.push('| directory | FreeTSA | DigiCert | other | no cert | total |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const d of Object.keys(dirs).sort()) {
    const c = dirs[d];
    const sum = Object.values(c).reduce((a, b) => a + b, 0);
    lines.push(`| ${d} | ${c.FreeTSA || 0} | ${c.DigiCert || 0} | ${c.other || 0} | ${c['no-signer-certificate'] || 0} | ${sum} |`);
  }
  lines.push('');
  lines.push('DigiCert and FreeTSA tokens sit in the same directories, so a directory-level label is');
  lines.push('wrong for at least one file in most of them. Attribution has to be per file.');
  lines.push('');
  lines.push('## Per file');
  lines.push('');
  lines.push('| file | bytes | issuer |');
  lines.push('| --- | --- | --- |');
  for (const r of rows) {
    const label = r.issuer ? r.issuer.replace(/\\/g, '\\\\').replace(/\|/g, '\\|') : '(none in token)';
    lines.push(`| ${r.file} | ${r.size} | ${r.primary}${r.issuer ? ' - ' + label : ''} |`);
  }
  lines.push('');
  fs.mkdirSync(path.dirname(DOC), { recursive: true });
  fs.writeFileSync(DOC, lines.join('\n'), 'utf8');
  console.log('wrote ' + DOC + ' (' + fs.statSync(DOC).size + ' bytes)');
}

main();
