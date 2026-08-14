#!/usr/bin/env node
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

for (const f of files) {
  if (!fs.existsSync(f)) continue;
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
  // 3. U+FFFD replacement char (the irreversible-damage marker)
  const s = buf.toString('utf8');
  const fffdCount = (s.match(/\uFFFD/g) || []).length;
  if (fffdCount > 0) {
    // Allow U+FFFD when it is part of a deliberate "detect garbled text" regex,
    // e.g. scripts/health-check.js: /锟斤拷|�{2,}|.../ (used to flag broken webpages).
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
