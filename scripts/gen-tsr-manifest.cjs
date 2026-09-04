#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// =============================================================================
// gen-tsr-manifest.cjs — regenerate docs/TSR-MANIFEST.md from the actual
// tracked .tsr files in the repository. Idempotent, data-driven, no hand edits.
//
// Usage: node scripts/gen-tsr-manifest.cjs
// =============================================================================
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(REPO_ROOT, 'docs', 'TSR-MANIFEST.md');

function gitLs(pattern) {
  const out = execFileSync('git', ['ls-files', pattern], {
    cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  return out.split('\n').map(s => s.trim()).filter(Boolean).sort();
}

// Extract lg identifier: prefers lg-### (or lg###), returns null otherwise.
function lgId(filename) {
  const base = path.basename(filename);
  let m = base.match(/lg[-_]?(\d{2,3})/i);
  if (m) return parseInt(m[1], 10);
  m = base.match(/\blg[-_]?v(2(?:\.\d+)?)/i);
  if (m) return 'lg-v' + m[1];
  return null;
}

function tsrId(filename) {
  const id = lgId(filename);
  if (typeof id === 'number') return 'lg-' + String(id).padStart(2, '0');
  if (typeof id === 'string') return id;
  // non-lg: use the basename stem as the ID
  return path.basename(filename, '.tsr');
}

function tsaProvider(filename) {
  const base = path.basename(filename);
  if (/_digicert/i.test(base)) return 'DigiCert';
  if (/freetsa/i.test(base)) return 'FreeTSA';
  return '';
}

const tsrFiles = gitLs('*.tsr');
const tsqSet = new Set(gitLs('*.tsq'));
const shaSet = new Set(gitLs('*.sha256'));

const rows = [];
for (const rel of tsrFiles) {
  const abs = path.join(REPO_ROOT, rel);
  let size = 0, hash = '', companions = [];
  try {
    const buf = fs.readFileSync(abs);
    size = buf.length;
    hash = crypto.createHash('sha256').update(buf).digest('hex');
  } catch (e) {
    hash = 'ERROR';
  }
  const stem = rel.replace(/\.tsr$/, '');
  if (tsqSet.has(stem + '.tsq')) companions.push('tsq');
  if (shaSet.has(stem + '.sha256')) companions.push('sha256');
  const prov = tsaProvider(rel);
  rows.push({
    id: tsrId(rel),
    file: rel,
    size,
    hash: hash.slice(0, 16),
    companions,
    provider: prov,
    num: (() => { const x = lgId(rel); return typeof x === 'number' ? x : null; })(),
  });
}

// Sort: by numeric lg id ascending; non-lg entries grouped at end by path.
rows.sort((a, b) => {
  const an = a.num === null ? Infinity : a.num;
  const bn = b.num === null ? Infinity : b.num;
  if (an !== bn) return an - bn;
  return a.file.localeCompare(b.file);
});

const numericIds = rows.filter(r => r.num !== null).map(r => r.num);
const uniqueIds = [...new Set(numericIds)];
const minId = uniqueIds.length ? Math.min(...uniqueIds) : 0;
const maxId = uniqueIds.length ? Math.max(...uniqueIds) : 0;
const providers = [...new Set(rows.map(r => r.provider).filter(Boolean))];

// Build markdown
const lines = [];
lines.push('# TSR Manifest — FIBEMATE v3.3-preview');
lines.push('');
lines.push('**Generated**: ' + new Date().toISOString().slice(0, 10));
lines.push('**Commit**: ' + gitHead());
lines.push('**Scope**: Timestamped evidence records for ML-KEM-768, SM2, FPGA, and website snapshots');
lines.push('');
lines.push('> All TSR files in this manifest are verifiable via `openssl ts -verify -in file.tsr -queryfile file.tsq -CAfile <TSA-CA>.pem`. SHA256 digests of the timestamped content are provided alongside each TSR.');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| Metric | Value |');
lines.push('| :--- | :--- |');
lines.push('| Total TSR files | ' + rows.length + ' |');
lines.push('| Total unique lg-xxx identifiers | ' + uniqueIds.length + ' |');
lines.push('| ID range | lg-' + String(minId).padStart(3, '0') + ' ~ lg-' + String(maxId).padStart(3, '0') + ' |');
lines.push('| TSA providers | ' + (providers.length ? providers.join(', ') : '—') + ' |');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Detailed Inventory');
lines.push('');
lines.push('| TSR ID | File | Size | TSR SHA256 | Companions |');
lines.push('| :--- | :--- | ---: | :--- | :--- |');
for (const r of rows) {
  lines.push('| ' + r.id + ' | `' + r.file + '` | ' + r.size + ' | `' + r.hash + '...` | ' + (r.companions.join(' ') || '') + ' |');
}
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Verification');
lines.push('');
lines.push('```bash');
lines.push('# Verify a single TSR (example with FreeTSA)');
lines.push('openssl ts -verify -in www/docs/tsa/2026-07-22/lg-093.tsr \\');
lines.push('  -queryfile www/docs/tsa/2026-07-22/lg-093.tsq \\');
lines.push('  -CAfile digicert-certs/freetsa-ca.pem');
lines.push('');
lines.push('# Verify all TSR files with tsq companions');
lines.push('node scripts/verify-tsr.js');
lines.push('```');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO_ROOT, encoding: 'utf8',
    }).trim();
  } catch (e) { return 'unknown'; }
}

console.log(JSON.stringify({
  total: rows.length,
  uniqueLgIds: uniqueIds.length,
  idRange: `lg-${String(minId).padStart(3, '0')} ~ lg-${String(maxId).padStart(3, '0')}`,
  providers,
  out: OUT,
}, null, 2));
