#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// check-encoding.cjs — UTF-8 / GBK corruption detector (Node.js, cross-platform)
//
// Detects the exact class of corruption that hit the repo on 2026-08-14:
//   PowerShell `Set-Content -Encoding UTF8` / `>` redirect on Chinese Windows
//   mis-decoded UTF-8 bytes as GBK, producing:
//     1. U+FFFD (EF BF BD) replacement chars  — irreversible damage marker
//     2. Invalid UTF-8 byte sequences        — GBK-misdecoded Chinese (e.g. 鈥?)
//     3. NUL bytes in "text" files           — binary mistaken as text
//   It also re-checks UTF-8 BOM (superset of scripts/check-bom.cjs).
//
// Usage:
//   node scripts/check-encoding.cjs                     # scan all tracked text files
//   node scripts/check-encoding.cjs file1.js file2.md   # scan specific files
//
// Exit code: 0 = clean, 1 = corruption found, 2 = internal error.

const { execSync } = require('child_process');
const fs = require('fs');

const PATTERN = /\.(js|mjs|cjs|jsx|ts|tsx|html|htm|md|json|css|scss|ya?ml|toml|py|rs|sh|ps1|sql|vue|txt|tcl|xml)$/i;

// --- GBK mojibake fingerprints ---
// When correct UTF-8 Chinese is mis-decoded as GBK (the 2026-08-14 corruption
// class), two tell-tale signals appear that are ABSENT from legitimate UTF-8:
//   1. PUA (Private Use Area) chars U+E000–U+F8FF — GBK maps some byte pairs
//      here; real UTF-8 Chinese text never contains PUA.
//   2. High-frequency mojibake hanzi (e.g. 鈹 锛 鈫) — these are the GBK
//      mis-decode of common chars (##, ，, →).
// Both are invisible to isValidUtf8() (the bytes are legal UTF-8), so we scan
// for them explicitly. Fingerprints were extracted from real corrupted files
// and verified to appear 0 times in clean files.
const GBK_MOJIBAKE_HANZI = [
  '\u9239', // 鈹 — "##" heading marker
  '\u951B', // 锛 — "，" fullwidth comma
  '\u922B', // 鈫 — "→" arrow
  '\u9359', // 鍙 — "号"
  '\u9428', // 鐨 — "的"
  '\u93C3', // 鏃 — "时"
  '\u934F', // 鍏 — "关"
  '\u93AC', // 鎬 — "总"
  '\u93B4', // 鎴 — "战"
  '\u7487', // 璇 — "试"
  '\u9286', // 銆 — "（"
  '\u93C2', // 鏂 — "方"
  '\u6D93', // 涓 — "中"
  '\u701B', // 瀛 — "学"
  '\u8BF2', // 诲 — "设"
];

function hasPuaChar(s) {
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xE000 && cp <= 0xF8FF) return ch;
  }
  return null;
}

function findMojibakeHanzi(s) {
  for (const ch of s) {
    if (GBK_MOJIBAKE_HANZI.includes(ch)) return ch;
  }
  return null;
}

// --- UTF-8 strict decode helper: returns true if buffer is valid UTF-8 ---
function isValidUtf8(buf) {
  let i = 0;
  const n = buf.length;
  while (i < n) {
    const b0 = buf[i];
    if (b0 < 0x80) { i++; continue; }
    let need, cp;
    if ((b0 & 0xE0) === 0xC0) { need = 1; cp = b0 & 0x1F; if (cp < 2) return false; }
    else if ((b0 & 0xF0) === 0xE0) { need = 2; cp = b0 & 0x0F; }
    else if ((b0 & 0xF8) === 0xF0) { need = 3; cp = b0 & 0x07; }
    else return false; // 0x80-0xBF or 0xF8+ lead byte = invalid
    if (i + need >= n) return false;
    for (let k = 1; k <= need; k++) {
      const b = buf[i + k];
      if ((b & 0xC0) !== 0x80) return false;
      cp = (cp << 6) | (b & 0x3F);
    }
    // reject overlong / surrogates / out-of-range
    if (cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return false;
    if (need === 1 && cp < 0x80) return false;
    if (need === 2 && cp < 0x800) return false;
    if (need === 3 && cp < 0x10000) return false;
    i += need + 1;
  }
  return true;
}

function listFiles(args) {
  if (args.length > 0) return args.filter(f => PATTERN.test(f));
  try {
    const out = execSync('git ls-files', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(f => f && PATTERN.test(f));
  } catch (e) {
    console.error('Error listing git files:', e.message);
    process.exit(2);
  }
}

const files = listFiles(process.argv.slice(2));
const issues = []; // { file, kind }

// Self-exemption: the detector scripts define the mojibake fingerprint tables,
// so their own comments legitimately contain the fingerprint characters.
const SELF_SCRIPTS = new Set([
  'scripts/check-encoding.cjs',
  'scripts/check-bom.cjs',
  'scripts/health-check.js',
]);

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  if (SELF_SCRIPTS.has(f)) continue;
  let buf;
  try { buf = fs.readFileSync(f); } catch (e) { issues.push({ file: f, kind: `unreadable: ${e.message}` }); continue; }

  // 1. BOM
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    issues.push({ file: f, kind: 'UTF-8 BOM' });
  }
  // 2. NUL bytes (binary mistaken as text)
  if (buf.includes(0x00)) {
    issues.push({ file: f, kind: 'NUL byte (binary as text)' });
    continue;
  }
  // 2b. ASCII control chars 0x01-0x08 / 0x0B / 0x0C / 0x0E-0x1F (corruption markers).
  //     Root cause (2026-08-18): literal \a \b \f escape sequences got written as real
  //     control bytes, replacing the FIRST letter of words (\b ash->bash, \a ddon->addon,
  //     \f 04a282->f04a282). \t \n \r are legitimate; 0x00 handled above.
  //     Exemption: ietf/ draft-*.txt use \f (0x0C) as standard RFC section page-breaks.
  {
    const ffLegit = f.startsWith('ietf/');
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x00) {
        if (c === 0x0c && ffLegit) continue;
        issues.push({ file: f, kind: `ASCII control char 0x${c.toString(16).padStart(2, '0')} (offset ${i})` });
        break;
      }
    }
  }
  // 3. U+FFFD replacement char (the irreversible-damage marker)
  const s = buf.toString('utf8');
  const fffdCount = (s.match(/\uFFFD/g) || []).length;
  if (fffdCount > 0) {
    // Allow U+FFFD when it is part of a deliberate "detect garbled text" regex,
    // e.g. scripts/health-check.js: /锟斤拷|\uFFFD{2,}|.../ (used to flag broken webpages).
    let allIntentional = true;
    for (const line of s.split('\n')) {
      if (line.includes('\uFFFD') && !/(hasGarbage|锟斤拷|garbled|乱码|detect.*corrupt)/.test(line)) {
        allIntentional = false;
        break;
      }
    }
    if (!allIntentional) {
      issues.push({ file: f, kind: `${fffdCount}x U+FFFD replacement char` });
    }
  }
  // 4. Invalid UTF-8 (GBK-misdecoded Chinese still shows as raw bytes)
  if (!isValidUtf8(buf)) {
    issues.push({ file: f, kind: 'invalid UTF-8 byte sequence (GBK misdecode?)' });
    continue;
  }
  // 5. GBK mojibake fingerprints (legal UTF-8 but semantically garbled)
  //    Exempt lines that deliberately document the corruption class
  //    (audit logs / this script itself), same convention as U+FFFD above.
  const s5 = buf.toString('utf8');
  const puaChar = hasPuaChar(s5);
  const mojiChar = findMojibakeHanzi(s5);
  if (puaChar || mojiChar) {
    // Determine whether every offending line is an intentional sample
    let allIntentional = true;
    for (const line of s5.split('\n')) {
      const hasPua = hasPuaChar(line) !== null;
      const hasMoji = findMojibakeHanzi(line) !== null;
      if ((hasPua || hasMoji) && !/(hasGarbage|锟斤拷|garbled|乱码|mojibake|detect.*corrupt|misdecode|GBK|\uFFFD|鈥\?|鈫\?|锛\?|→)/.test(line)) {
        allIntentional = false;
        break;
      }
    }
    if (!allIntentional) {
      const kind = puaChar
        ? `GBK mojibake (PUA U+${puaChar.codePointAt(0).toString(16).toUpperCase()})`
        : `GBK mojibake (hanzi ${JSON.stringify(mojiChar)})`;
      issues.push({ file: f, kind });
    }
  }
}

if (issues.length > 0) {
  console.error(`FAIL: encoding corruption in ${issues.length} file(s):`);
  for (const it of issues) console.error(`  ${it.file}  [${it.kind}]`);
  console.error('');
  console.error('Fix: re-edit the file and save as UTF-8 (no BOM). Do NOT use');
  console.error('PowerShell Set-Content -Encoding UTF8 / `>` redirect on Chinese Windows.');
  console.error('Use Node.js fs.writeFileSync(path, content, "utf8") instead.');
  process.exit(1);
}

console.log(`OK: no encoding corruption in ${files.length} checked file(s)`);
process.exit(0);
