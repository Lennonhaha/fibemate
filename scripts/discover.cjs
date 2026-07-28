// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BASE = 'C:/Users/maivs/.qclaw/workspace-tfxjjhfnjialcuju';

function findFiles(pattern, dir) {
  const results = [];
  function walk(d) {
    try {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
          walk(full);
        } else if (e.isFile() && pattern.test(e.name)) {
          results.push(full.replace(BASE + '/', ''));
        }
      }
    } catch (_) {}
  }
  walk(dir);
  return results;
}

// 1. packages/pqc-kem entry
console.log('=== packages/pqc-kem ===');
try {
  const pkg = require(path.join(BASE, 'packages/pqc-kem'));
  console.log('type:', typeof pkg, ' keys:', Object.keys(pkg).slice(0, 15));
} catch(e) { console.log('FAIL:', e.message); }

// 2. index.js
const idxPath = path.join(BASE, 'packages/pqc-kem/index.js');
if (fs.existsSync(idxPath)) {
  console.log('\n=== index.js (first 40 lines) ===');
  console.log(fs.readFileSync(idxPath, 'utf8').split('\n').slice(0, 40).join('\n'));
}

// 3. src files
const srcDir = path.join(BASE, 'packages/pqc-kem/src');
if (fs.existsSync(srcDir)) {
  console.log('\n=== src/ files ===');
  fs.readdirSync(srcDir).forEach(f => console.log('  ' + f));
}

// 4. SM2
console.log('\n=== SM2 files ===');
const sm2Files = findFiles(/sm2/i, BASE);
sm2Files.forEach(f => console.log('  ' + f));

// 5. ML-KEM JS
console.log('\n=== ML-KEM JS files ===');
const mlkemFiles = findFiles(/ml-kem-768/i, BASE);
mlkemFiles.forEach(f => console.log('  ' + f));

// 6. SM4
console.log('\n=== SM4 files ===');
const sm4Files = findFiles(/sm4/i, BASE);
sm4Files.forEach(f => console.log('  ' + f));

// 7. SM3
console.log('\n=== SM3 files ===');
const sm3Files = findFiles(/sm3/i, BASE);
sm3Files.forEach(f => console.log('  ' + f));

// 8. Try requiring each SM2 entry point
console.log('\n=== SM2 require attempts ===');
const sm2Candidates = sm2Files.filter(f => /sm2.*\.(js|cjs)$/i.test(f) && !f.includes('node_modules') && !f.includes('backup'));
sm2Candidates.slice(0, 5).forEach(f => {
  try {
    const mod = require(path.join(BASE, f));
    console.log(f + ' => OK, keys: ' + Object.keys(mod).slice(0, 10).join(', '));
  } catch(e) {
    console.log(f + ' => FAIL: ' + e.message.split('\n')[0]);
  }
});
