// SPDX-License-Identifier: GPL-3.0-only
const fs = require('fs');
const path = require('path');
const { matchCryptoDep } = require('./matchers');

// 检测项目清单类型
function detectManifest(rootDir) {
  const npmLock = path.join(rootDir, 'package-lock.json');
  const npmJson = path.join(rootDir, 'package.json');
  const goMod = path.join(rootDir, 'go.mod');
  const pom = path.join(rootDir, 'pom.xml');

  if (fs.existsSync(pom)) return { type: 'maven', file: 'pom.xml' };
  if (fs.existsSync(goMod)) return { type: 'golang', file: 'go.mod' };
  if (fs.existsSync(npmLock)) return { type: 'npm', file: 'package.json', lock: 'package-lock.json' };
  if (fs.existsSync(npmJson)) return { type: 'npm', file: 'package.json', lock: null };
  return null;
}

// 解析 npm 依赖树（从 package-lock.json）
function parseNpm(rootDir, manifest) {
  const deps = [];
  if (manifest.lock) {
    const lockPath = path.join(rootDir, manifest.lock);
    if (!fs.existsSync(lockPath)) {
      throw new Error('Lock file not found: ' + manifest.lock + ' (run `npm install` first)');
    }
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const packages = lock.packages || {};
    for (const [pkgPath, meta] of Object.entries(packages)) {
      if (!pkgPath || pkgPath === '') continue; // 根包跳过
      const name = pkgPath.split('node_modules/').pop();
      deps.push({
        name,
        version: meta.version || '?',
        type: meta.dev ? 'dev' : 'prod',
      });
    }
  } else {
    // 无 lock 文件，退化为解析 package.json 的 dependencies
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    for (const [name, ver] of Object.entries(pkg.dependencies || {})) {
      deps.push({ name, version: String(ver).replace(/^\^|~/, ''), type: 'prod' });
    }
    for (const [name, ver] of Object.entries(pkg.devDependencies || {})) {
      deps.push({ name, version: String(ver).replace(/^\^|~/, ''), type: 'dev' });
    }
  }
  return deps;
}

// 解析 go.mod require 块
function parseGolang(rootDir) {
  const content = fs.readFileSync(path.join(rootDir, 'go.mod'), 'utf8');
  const deps = [];
  const lines = content.split('\n');
  let inRequire = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('require (')) { inRequire = true; continue; }
    if (inRequire && trimmed === ')') { inRequire = false; continue; }
    if (inRequire && trimmed && !trimmed.startsWith('//')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) deps.push({ name: parts[0], version: parts[1], type: 'prod' });
    } else if (trimmed.startsWith('require ') && trimmed !== 'require (') {
      const m = /^require\s+(\S+)\s+(\S+)/.exec(trimmed);
      if (m) deps.push({ name: m[1], version: m[2], type: 'prod' });
    }
  }
  return deps;
}

// 解析 pom.xml 依赖
function parseMaven(rootDir) {
  const content = fs.readFileSync(path.join(rootDir, 'pom.xml'), 'utf8');
  const deps = [];
  const depRe = /<dependency>([\s\S]*?)<\/dependency>/g;
  let m;
  while ((m = depRe.exec(content)) !== null) {
    const block = m[1];
    const gid = /<groupId>([^<]+)<\/groupId>/.exec(block)?.[1]?.trim();
    const aid = /<artifactId>([^<]+)<\/artifactId>/.exec(block)?.[1]?.trim();
    const ver = /<version>([^<]+)<\/version>/.exec(block)?.[1]?.trim() || '?';
    if (aid) deps.push({ name: aid, groupId: gid, version: ver, type: 'prod' });
  }
  return deps;
}

const PARSERS = { npm: parseNpm, golang: parseGolang, maven: parseMaven };

// 计算风险评分：100 - Σ(severity 权重) / totalDeps × 100
const SEVERITY_WEIGHT = { HIGH: 30, MEDIUM: 15, LOW: 5, OK: 0 };

function calcScore(findings, totalDeps) {
  if (totalDeps === 0) return 100;
  const penalty = findings.reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] || 0), 0);
  const score = Math.round(100 - penalty / totalDeps);
  return Math.max(0, Math.min(100, score));
}

async function scan(rootDir, flags = {}) {
  const absRoot = path.resolve(rootDir || '.');
  if (!fs.existsSync(absRoot)) {
    const err = new Error('Directory not found: ' + absRoot);
    err.exitCode = 2;
    throw err;
  }

  const manifest = detectManifest(absRoot);
  if (!manifest) {
    const err = new Error('No supported manifest found. Supported: package.json, go.mod, pom.xml');
    err.exitCode = 2;
    throw err;
  }

  const deps = PARSERS[manifest.type](absRoot, manifest);
  const targets = flags.ignoreDev ? deps.filter(d => d.type !== 'dev') : deps;

  const findings = [];
  for (const dep of targets) {
    const match = matchCryptoDep(dep.name);
    if (match) findings.push({ ...dep, ...match });
  }

  const score = calcScore(findings, deps.length);
  const report = {
    path: absRoot,
    manifest,
    totalDeps: deps.length,
    findings,
    score,
    timestamp: new Date().toISOString(),
  };

  // 缓存（供 report 命令）
  try {
    fs.writeFileSync(path.join(absRoot, '.pqc-migrate-cache.json'), JSON.stringify(report, null, 2));
  } catch (_) { /* 缓存失败不阻塞 */ }

  return report;
}

module.exports = { scan, detectManifest, calcScore, parseNpm, parseGolang, parseMaven };
