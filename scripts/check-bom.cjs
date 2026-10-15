#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
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

// Binary formats that are never text: media, archives, the timestamp evidence
// formats (.tsr/.tsq/.tsa) and FPGA/zk artifacts. Extension-based on purpose:
// a content sniff alone misses binaries whose first block has no NUL byte.
const BINARY_EXT = /\.(tsr|tsq|tsa|bit|zkey|wasm|pdf|png|jpe?g|gif|webp|avif|ico|svgz|zip|gz|tgz|tar|7z|bz2|xz|zst|woff2?|ttf|otf|eot|mp3|mp4|m4a|mov|webm|wav|avi|exe|dll|so|dylib|o|a|class|jar|pyc|bin|der|p12|pfx)$/i;

// Scope is "every tracked file that looks like text", NOT an extension
// allowlist. The old allowlist silently skipped .gitignore, .gitattributes,
// Dockerfile, Makefile, *.h, *.c, *.v, *.sha256 -- which is exactly how the
// UTF-8 BOM planted in .gitignore on 2026-10-04 (commit 6d8fa1b) stayed
// invisible to CI for ten days.
function isTextFile(p) {
    if (BINARY_EXT.test(p)) return false;
    let fd;
    try {
        // Open once and stat the descriptor: a path-based "stat, then open on
        // the same path" pair is a file-system race and CodeQL reports it.
        // Symlinks never reach this for the repo-wide scan (git mode 120000 is
        // filtered out first); an explicit argument that is a symlink is followed.
        fd = fs.openSync(p, 'r');
        if (!fs.fstatSync(fd).isFile()) return false;
        const head = Buffer.alloc(8192);
        const n = fs.readSync(fd, head, 0, head.length, 0);
        return head.subarray(0, n).indexOf(0) === -1;   // NUL in head => binary
    } catch { return false; }
    finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}

function listFiles(args) {
    if (args.length > 0) return args.filter(isTextFile);
    try {
        // `git ls-files -s` also yields the mode, so symlinks (120000) are
        // skipped consistently on Windows (where git checks a symlink out as a
        // regular file holding the target path) and on Linux/macOS (a link).
        const out = execSync('git ls-files -s', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const files = [];
        for (const line of out.split('\n')) {
            const tab = line.indexOf('\t');
            if (tab < 0) continue;
            if (line.slice(0, tab).startsWith('120000')) continue;   // symlink
            const p = line.slice(tab + 1);
            if (p && isTextFile(p)) files.push(p);
        }
        return files;
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