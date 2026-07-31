#!/usr/bin/env node
// check-bom.cjs — UTF-8 BOM detector (Node.js, fast)
// Exits 1 if any tracked text file contains UTF-8 BOM (EF BB BF)
//
// Usage:
//   node scripts/check-bom.cjs                    # scan all tracked text files
//   node scripts/check-bom.cjs file1.js file2.md  # scan specific files
//
// Why: PowerShell on Chinese Windows mis-decodes BOM-prefixed files as GBK,
//      showing garbled text. Repo convention is plain UTF-8 with NO BOM.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PATTERN = /\.(js|mjs|cjs|html|md|json|ya?ml|toml|sh|css|txt|tcl|tsv)$/i;

function listFiles(args) {
    if (args.length > 0) return args;
    try {
        const out = execSync('git ls-files', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return out.split('\n').filter(f => f && PATTERN.test(f));
    } catch (e) {
        console.error('Error listing git files:', e.message);
        process.exit(2);
    }
}

function checkBom(file) {
    let fd;
    try {
        fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(3);
        const bytesRead = fs.readSync(fd, buf, 0, 3, 0);
        fs.closeSync(fd);
        if (bytesRead < 3) return false;
        return buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
    } catch (e) {
        if (fd) try { fs.closeSync(fd); } catch {}
        return false;
    }
}

const files = listFiles(process.argv.slice(2));
const bad = [];
let checked = 0;
for (const f of files) {
    if (!fs.existsSync(f)) continue;
    checked++;
    if (checkBom(f)) bad.push(f);
}

if (bad.length > 0) {
    console.error(`FAIL: UTF-8 BOM detected in ${bad.length} file(s):`);
    for (const f of bad) console.error(`  ${f}`);
    console.error('');
    console.error('Fix with:');
    console.error('  node -e "const fs=require(\'fs\');for(const f of process.argv.slice(1)){const b=fs.readFileSync(f);if(b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF)fs.writeFileSync(f,b.slice(3));}" <files>');
    process.exit(1);
}

if (process.argv.length <= 2) {
    console.log(`OK: No UTF-8 BOM in ${checked} tracked text files`);
}
process.exit(0);