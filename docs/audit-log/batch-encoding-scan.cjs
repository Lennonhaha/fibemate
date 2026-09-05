// SPDX-License-Identifier: GPL-3.0-only
/**
 * Batch encoding scan — Node.js version (no PowerShell object issues)
 * Scans all text files for UTF-8 corruption (U+FFFD, NUL, invalid UTF-8, BOM)
 * 
 * Usage: node scripts/batch-encoding-scan.cjs
 * 
 * Reports: OK / CORRUPT / SKIP for each file
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CHECKER = path.join(ROOT, 'scripts', 'check-encoding.cjs');

// Files to skip (binary or non-text)
const SKIP_EXT = new Set([
  '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.wasm', '.wasm.gz', '.lock', '.tsq', '.tsr', '.sha256',
  '.mp3', '.mp4', '.pdf', '.zip', '.tar', '.gz'
]);

function isTextFile(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  if (SKIP_EXT.has(ext)) return false;
  // Skip node_modules and .github/workflows
  if (filepath.includes('node_modules')) return false;
  if (filepath.includes('.github/workflows')) return false;
  return true;
}

function runChecker(filepath) {
  return new Promise((resolve) => {
    const cp = require('child_process');
    cp.execFile('node', [CHECKER, filepath], { timeout: 10000 }, (err, stdout, stderr) => {
      const out = (stdout || '') + (stderr || '');
      resolve(out);
    });
  });
}

async function main() {
  // Get changed files from 4dd06ab to HEAD
  const cp = require('child_process');
  const { stdout } = await new Promise((resolve) => {
    cp.exec('git diff --name-only 4dd06ab..HEAD', { cwd: ROOT }, (err, so, se) => resolve({ stdout: so, stderr: se }));
  });
  
  const allFiles = stdout.split('\n').filter(f => f.trim()).filter(isTextFile);
  
  const htmlFiles = allFiles.filter(f => f.endsWith('.html'));
  const mdFiles = allFiles.filter(f => f.endsWith('.md'));
  const jsFiles = allFiles.filter(f => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs'));
  
  console.log(`Total text files to scan: ${allFiles.length}`);
  console.log(`  HTML: ${htmlFiles.length}`);
  console.log(`  MD:   ${mdFiles.length}`);
  console.log(`  JS:   ${jsFiles.length}`);
  console.log('');
  
  const results = { ok: [], corrupt: [] };
  
  async function scanGroup(label, files) {
    console.log(`=== Scanning ${label} (${files.length} files) ===`);
    for (const f of files) {
      const fullPath = path.join(ROOT, f);
      if (!fs.existsSync(fullPath)) continue;
      const out = await runChecker(fullPath);
      if (out.includes('CORRUPTED') || out.includes('ERROR') || out.includes('NUL')) {
        results.corrupt.push(f);
        console.log(`CORRUPT: ${f}`);
      } else {
        results.ok.push(f);
      }
    }
    console.log(`  ${label} done. Bad: ${files.length - results.ok.filter(f => files.includes(f)).length}\n`);
  }
  
  await scanGroup('HTML', htmlFiles);
  await scanGroup('MD', mdFiles);
  await scanGroup('JS/CJS/MJS', jsFiles);
  
  console.log('========================================');
  console.log(`SCAN COMPLETE`);
  console.log(`  OK:       ${results.ok.length}`);
  console.log(`  CORRUPT:  ${results.corrupt.length}`);
  if (results.corrupt.length > 0) {
    console.log(`\nCorrupted files:`);
    for (const f of results.corrupt) console.log(`  - ${f}`);
  } else {
    console.log(`\n✅ All files are clean (no U+FFFD/NUL/invalid UTF-8)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
