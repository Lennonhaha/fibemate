#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * CARS/IBM 评分快照生成器
 *
 * 每次评分更新后运行，生成不可变 HTML 快照 + SHA-256 存证。
 * 快照 HTML 保持原样（零注入），哈希存在 manifest 中。
 *
 * 用法:
 *   node tools/cars-snapshot.js                        # 生成最新快照
 *   node tools/cars-snapshot.js --verify <file>         # 验证单文件 vs manifest
 *   node tools/cars-snapshot.js --verify-all            # 验证全部快照
 *   node tools/cars-snapshot.js --list                  # 列出所有历史快照+趋势
 *
 * 输出:
 *   www/snapshots/cars-radar-YYYYMMDD.html
 *   www/snapshots/ibm-seven-YYYYMMDD.html
 *   www/snapshots/snapshot-manifest.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const REPO = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
const SNAPSHOT_DIR = path.join(REPO, 'www', 'snapshots');
const MANIFEST_PATH = path.join(SNAPSHOT_DIR, 'snapshot-manifest.json');

const SOURCES = [
  {
    id: 'cars-radar',
    file: path.join(REPO, 'www', 'docs', 'cars-radar.html'),
    title: 'CARS 五维审计仪表盘',
    scoreLabel: 'CARS',
    extractScore: (html) => {
      const m = html.match(/综合\s*(\d+\.\d+)\s*\/\s*100/);
      return m ? parseFloat(m[1]) : null;
    },
  },
  {
    id: 'ibm-seven',
    file: path.join(REPO, 'www', 'docs', 'ibm-seven-radar.html'),
    title: 'IBM 七维安全审计仪表盘',
    scoreLabel: 'IBM',
    extractScore: (html) => {
      const m = html.match(/OVERALL\s*=\s*([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    },
  },
];

const args = process.argv.slice(2);
const mode = args[0] || 'snapshot';

// ============ VERIFY ============
if (mode === '--verify' && args[1]) {
  verifyFile(args[1]);
  process.exit(0);
}

if (mode === '--verify-all') {
  verifyAll();
  process.exit(0);
}

// ============ LIST ============
if (mode === '--list') {
  listSnapshots();
  process.exit(0);
}

// ============ SNAPSHOT ============
const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const generationTime = new Date().toISOString();

fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

let manifest = [];
if (fs.existsSync(MANIFEST_PATH)) {
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')); } catch (e) { /* reset */ }
}

const snapshots = [];

for (const src of SOURCES) {
  let html = fs.readFileSync(src.file, 'utf-8');
  if (html.charCodeAt(0) === 0xFEFF) html = html.slice(1); // strip BOM
  const score = src.extractScore(html);
  const sha256 = crypto.createHash('sha256').update(html, 'utf-8').digest('hex');

  const outName = `${src.id}-${dateStr}.html`;
  const outPath = path.join(SNAPSHOT_DIR, outName);
  fs.writeFileSync(outPath, html, 'utf-8');

  snapshots.push({
    id: src.id,
    score,
    scoreLabel: src.scoreLabel,
    file: outName,
    size: Buffer.byteLength(html, 'utf-8'),
    sha256,
    gitHash,
    date: generationTime,
    sourcePath: `www/docs/${path.basename(src.file)}`,
  });

  console.log(`  ✅ ${outName} (${src.scoreLabel}=${score}, ${(Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1)}KB, sha256=${sha256.slice(0, 12)}…)`);
}

// Build entry with delta from previous
const prev = manifest[manifest.length - 1];
const delta = {};
if (prev) {
  for (const s of snapshots) {
    const ps = prev.snapshots.find(x => x.id === s.id);
    if (ps && ps.score !== s.score) {
      delta[s.scoreLabel] = { from: ps.score, to: s.score };
    }
  }
}

manifest.push({ date: generationTime, gitHash, delta, snapshots });
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');

console.log(`  📋 manifest: ${manifest.length} entries`);
if (Object.keys(delta).length > 0) {
  for (const [label, d] of Object.entries(delta)) {
    const diff = (d.to - d.from).toFixed(2);
    const arrow = diff > 0 ? '↑' : '↓';
    console.log(`  📈 ${label}: ${d.from} → ${d.to} (${arrow}${diff > 0 ? '+' : ''}${diff})`);
  }
} else {
  console.log('  📊 评分无变化（与上次快照一致）');
}

// ============ FUNCTIONS ============

function verifyFile(filePath) {
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const html = fs.readFileSync(filePath, 'utf-8');
  const stripped = html.charCodeAt(0) === 0xFEFF ? html.slice(1) : html;
  const actual = crypto.createHash('sha256').update(stripped, 'utf-8').digest('hex');
  const fname = path.basename(filePath);

  // Find entry
  for (const entry of m) {
    const s = entry.snapshots.find(x => x.file === fname);
    if (s) {
      if (s.sha256 === actual) {
        console.log(`✅ ${fname} — hash verified (${actual.slice(0, 16)}…)`);
        console.log(`   source: ${s.sourcePath}`);
        console.log(`   git: ${s.gitHash} | date: ${s.date}`);
        console.log(`   ${s.scoreLabel} score: ${s.score}`);
        return;
      }
    }
  }
  console.log(`✕ ${fname} — NOT IN MANIFEST (declared hash not found)`);
  console.log(`  actual hash: ${actual}`);
  process.exitCode = 1;
}

function verifyAll() {
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  let ok = 0, fail = 0;
  const seen = new Set();
  for (const entry of m) {
    for (const s of entry.snapshots) {
      const fp = path.join(SNAPSHOT_DIR, s.file);
      if (!fs.existsSync(fp)) {
        console.log(`✕ ${s.file} — FILE MISSING`);
        fail++;
        continue;
      }
      if (seen.has(s.file)) continue; // only verify first occurrence
      seen.add(s.file);
      const html = fs.readFileSync(fp, 'utf-8');
      const stripped = html.charCodeAt(0) === 0xFEFF ? html.slice(1) : html;
      const actual = crypto.createHash('sha256').update(stripped, 'utf-8').digest('hex');
      if (s.sha256 === actual) {
        ok++;
      } else {
        console.log(`✕ ${s.file} — TAMPER DETECTED`);
        console.log(`  declared: ${s.sha256.slice(0, 16)}…`);
        console.log(`  actual:   ${actual.slice(0, 16)}…`);
        fail++;
      }
    }
  }
  console.log(`\n✅ ${ok} passed | ✕ ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

function listSnapshots() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log('No snapshots found.');
    return;
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`# Snapshots (${m.length} entries)\n`);
  m.forEach((e, i) => {
    const d = e.date.slice(0, 10);
    console.log(`## ${i + 1}. ${d} — ${e.gitHash}`);
    e.snapshots.forEach(s => {
      console.log(`  - ${s.scoreLabel}: ${s.score} — ${s.file} (${(s.size / 1024).toFixed(1)}KB, ${s.sha256.slice(0, 12)}…)`);
    });
    if (Object.keys(e.delta || {}).length > 0) {
      for (const [label, d] of Object.entries(e.delta)) {
        const diff = (d.to - d.from).toFixed(2);
        const arrow = diff > 0 ? '↑' : '↓';
        console.log(`    ${label}: ${d.from} → ${d.to} (${arrow}${diff > 0 ? '+' : ''}${diff})`);
      }
    }
  });
}
