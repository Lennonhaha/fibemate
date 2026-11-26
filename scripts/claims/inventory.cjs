#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// Inventory the sentences in this repository that make a checkable claim.
//
// Why this exists: the "7.6% of claims are machine-bound" figure was produced by
// a one-off audit script and could not be reproduced, so nobody could say whether
// it had moved. A metric whose denominator is not committed is a rumour with a
// percent sign. This script is the denominator.
//
// A line is a claim only if it carries a witness a machine could compare against
// something: a hash, a version, a ratio, a count with a unit, an endpoint, a script
// path, a threshold, a date or a measurement. Prose without a witness is not
// counted, because no gate could ever falsify it.
//
// Usage:
//   node scripts/claims/inventory.cjs            # summary by tier guess
//   node scripts/claims/inventory.cjs --json     # full inventory on stdout
//   node scripts/claims/inventory.cjs --list must
//
// Exit: 0 always (this is a measurement, not a gate). coverage.cjs is the gate.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

const CORPUS = [
  /^README\.md$/,
  /^SECURITY\.md$/,
  /^ARCHITECTURE\.md$/,
  /^ENGINEERING-GATES\.md$/,
  /^docs\/(?!pr-archive\/|tsa\/|evidence\/|TSR-MANIFEST).+\.md$/,
  /^www\/(?!docs\/tsa\/).+\.html$/,
  /^packages\/[^/]+\/README\.md$/,
];

// Lines that are structural rather than assertive.
const SKIP_LINE = [
  /^\s*$/,
  /^\s*#{1,6}\s/,           // headings
  /^\s*\|?\s*-{3,}/,        // rules / table separators
  /^\s*\|/,                // table rows: enumerated data, covered wholesale by manifest gates
  /^\s*\[[^\]]+\]:\s/,      // link definitions
  /^\s*!\[/,                // images
  /^\s*<[^>]+>\s*$/,        // bare tags
  /^\s*```/,                // fences (also tracked below)
];

// A strong witness is something a machine can compare byte-for-byte.
const STRONG_WITNESS = [
  /\b[0-9a-f]{8,40}\b/,                      // commit / digest prefix
  /\b\d+\s*\/\s*\d+\b/,                       // ratio 108/1424
  /\bN\s*=\s*\d[\d,]*/,                       // N=5000
  /\b\d[\d,]{2,}\s*(条|项|个|files?|tests?|vectors?|cases?|users?|messages?)\b/i,
  /(<=|>=|≤|≥|<|>)\s*\d/,                     // thresholds
  /\/(api|health)[a-z0-9/_\-]*/i,             // endpoints
  /\bscripts\/[\w.\-/]+\.(cjs|js|mjs|sh)\b/,  // gate paths
  /\b(sha256|sha-256|sha512)\b/i,
  /\b\d+(\.\d+)?\s*(ms|µs|us|MB|KB|GB|%)\b/i,   // measurements
];

// Weak witnesses only count when two of them co-occur: a lone version string is
// usually an install instruction, not a claim about this repository.
const WEAK_WITNESS = [
  /\bv?\d+\.\d+\.\d+\b/,                     // semver
  /\b20\d{2}-\d{2}-\d{2}\b/,                  // dates
];

const TIER_RULES = [
  {
    tier: 'must',
    // Security assertions, deployment facts, behavioural contracts. If one of
    // these is wrong a reader is misled about safety or about what is running.
    re: /(不承诺|不得|必须|仅|边界|安全|密钥|泄露|侧信道|清零|为\s*0|KAT|TVLA|TSR|部署|生产|current|release|never|must not|cannot|zero|no side[- ]channel)/i,
  },
  {
    tier: 'sampled',
    // Architecture and behaviour descriptions: worth periodic human review,
    // not worth a per-line gate.
    re: /(架构|模块|实现|支持|负责|流程|设计|architecture|module|implements|supports|flow)/i,
  },
];

const SKIP_FILES = new Set(['CHANGELOG.md', 'RELEASE_NOTES.md']);

function tracked() {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

function inCorpus(rel) {
  if (SKIP_FILES.has(rel)) return false;
  return CORPUS.some((re) => re.test(rel));
}

function stripMarkup(line, rel) {
  if (rel.endsWith('.html')) {
    return line.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  return line.replace(/^\s*[-*+]\s+/, '').replace(/\s+/g, ' ').trim();
}

// Skip <script> and <style> bodies with a line-level state machine. A regex for
// "does not contain an end tag" cannot be made correct here: HTML accepts
// "</script foo>" after the name, and every pattern that tries to describe it
// gets flagged (rightly) as a bad tag filter.
function blockTracker() {
  let inside = null;
  return (raw) => {
    const lower = raw.toLowerCase();
    if (inside) {
      if (lower.includes('</' + inside)) inside = null;
      return true;
    }
    for (const tag of ['script', 'style']) {
      if (lower.includes('<' + tag)) {
        if (!lower.includes('</' + tag)) inside = tag;
        return true;
      }
    }
    return false;
  };
}

function tierOf(text) {
  for (const r of TIER_RULES) if (r.re.test(text)) return r.tier;
  return 'descriptive';
}

function hash(text) {
  return require('crypto').createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function inventory() {
  const rows = [];
  for (const rel of tracked()) {
    if (!inCorpus(rel)) continue;
    const full = path.join(ROOT, rel);
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch (e) {
      continue;
    }
    const lines = text.split('\n');
    let fenced = false;
    const inBlock = rel.endsWith('.html') ? blockTracker() : () => false;
    lines.forEach((raw, i) => {
      const trimmed = raw.trim();
      if (/^```/.test(trimmed)) { fenced = !fenced; return; }
      if (fenced) return;
      if (inBlock(raw)) return;
      if (SKIP_LINE.some((re) => re.test(raw))) return;
      const clean = stripMarkup(raw, rel);
      if (clean.length < 25) return;
      const strong = STRONG_WITNESS.filter((re) => re.test(clean)).length;
      const weak = WEAK_WITNESS.filter((re) => re.test(clean)).length;
      if (strong === 0 && weak < 2) return;
      if (/^\[[^\]]+\]\(#/.test(clean)) return; // table-of-contents entry
      rows.push({
        id: `${rel}:${i + 1}#${hash(clean)}`,
        file: rel,
        line: i + 1,
        tier: tierOf(clean),
        text: clean.slice(0, 240),
      });
    });
  }
  return rows;
}

function main() {
  const argv = process.argv.slice(2);
  const rows = inventory();
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ generatedFrom: 'git ls-files', count: rows.length, claims: rows }, null, 1) + '\n');
    return;
  }
  if (argv.includes('--list')) {
    const want = argv[argv.indexOf('--list') + 1];
    const subset = want ? rows.filter((r) => r.tier === want) : rows;
    for (const r of subset) console.log(`${r.tier}\t${r.file}:${r.line}\t${r.text}`);
    return;
  }
  const by = rows.reduce((acc, r) => ((acc[r.tier] = (acc[r.tier] || 0) + 1), acc), {});
  console.log(`[claims/inventory] ${rows.length} checkable claim lines in ${new Set(rows.map((r) => r.file)).size} files`);
  for (const tier of ['must', 'sampled', 'descriptive']) {
    console.log(`  ${tier.padEnd(12)} ${String(by[tier] || 0).padStart(5)}`);
  }
  console.log('  tier is a keyword guess; docs/claims/registry.json is authoritative.');
}

if (require.main === module) main();

module.exports = { inventory };
