#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
//
// Syntax-check every inline <script> block under www/.
//
// Why this exists: on 2026-11-23 CodeQL reported js/syntax-error at
// www/app.html:834 as a *note*. The page still rendered, so nothing looked
// wrong - but app.html has a single inline script, and one syntax error means
// the whole block never parses. Every handler in it was dead: saveAuth, the
// keyboard shortcuts, the guest entry. A note-level alert was a total loss of
// client-side behaviour.
//
// Nothing caught that class of defect before a human clicked the page. This
// script does, on every PR that touches HTML.
//
// Exit codes:
//   0  every inline block parses
//   1  at least one block failed to parse (each failure names file:line)
//   2  nothing was checked (no HTML, or no inline JS), or bad usage
//      - deliberately not 0: an empty scan must never read as "clean"
//
// Extraction rules, applied by type rather than by hand:
//   * <script src=...> and empty blocks are skipped (not ours to parse)
//   * type=importmap / application/json / text/template are skipped: they are
//     data, and JSON.parse is their checker, not a JS parser
//   * type=module is parsed as ESM so import/export are legal
//
// Usage:
//   node scripts/check-site-scripts.cjs [--root www] [--verbose]
//   node scripts/check-site-scripts.cjs --selftest

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NON_JS_TYPE = /importmap|application\/(ld\+)?json|text\/(template|html|plain)|x-template/i;

function walkHtml(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walkHtml(full, acc);
    } else if (/\.html?$/i.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

// Find the closing tag for a script block starting at `from`.
//
// No regex on purpose. CodeQL js/bad-tag-filter rejected two regex forms in a
// row ("does not match </script >", then "does not match </script\t\n bar>"),
// and it is right: an HTML end tag is `</script` + optional whitespace +
// optional attributes + `>`, and a pattern that misses a form silently pulls
// the rest of the page into one block. A linear scan is both simpler to reason
// about and impossible to fool that way.
//
// `</scripty>` is a different tag name, so it does not close this block.
const END = '</script';

function isNameChar(c) {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 45 || c === 95;
}

function findScriptEnd(html, from) {
  for (let i = from; i + END.length <= html.length; i++) {
    if (html.charCodeAt(i) !== 60) continue; // '<'
    let k = 1;
    let same = true;
    for (; k < END.length; k++) {
      const c = html.charCodeAt(i + k) | 0x20; // ASCII lowercase
      if (c !== END.charCodeAt(k)) { same = false; break; }
    }
    if (!same) continue;
    const after = i + END.length;
    if (after < html.length && isNameChar(html.charCodeAt(after))) continue;
    const gt = html.indexOf('>', after);
    if (gt < 0) return null;
    return { endStart: i, after: gt + 1 };
  }
  return null;
}

function findBlocks(html) {
  const blocks = [];
  const openRe = /<script\b([^>]*)>/gi;
  let m;
  while ((m = openRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const bodyStart = m.index + m[0].length;
    const startLine = html.slice(0, bodyStart).split('\n').length;
    const end = findScriptEnd(html, bodyStart);
    if (end === null) {
      blocks.push({ code: html.slice(bodyStart), startLine, isModule: false, type: '', unterminated: true });
      break;
    }
    openRe.lastIndex = end.after;
    const code = html.slice(bodyStart, end.endStart);
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const type = typeMatch ? typeMatch[1] : '';
    if (type && NON_JS_TYPE.test(type)) continue;
    if (!code.trim()) continue;
    const isModule = /(^|\s)module(\s|$)/i.test(attrs);
    blocks.push({ code, startLine, isModule, type });
  }
  return blocks;
}

function firstErrorLine(stderr) {
  // node --check prints a caret line under the offending source line
  const lines = String(stderr).split('\n');
  const idx = lines.findIndex((l) => /:\d+$/.test(l.trim()));
  if (idx >= 0) {
    const n = Number(lines[idx].trim().split(':').pop());
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

function checkRoot(root) {
  const files = walkHtml(root);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'site-scripts-'));
  const failures = [];
  let blocks = 0;
  let skipped = 0;

  try {
    for (const file of files) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      const html = fs.readFileSync(file, 'utf8');
      const found = findBlocks(html);
      skipped += (html.match(/<script\b/gi) || []).length - found.length;
      found.forEach((block, i) => {
        blocks += 1;
        if (block.unterminated) {
          failures.push({
            file: rel,
            block: i + 1,
            htmlLine: block.startLine - 1,
            detail: 'unterminated <script> tag: no closing tag before end of file',
          });
          return;
        }
        const name = `${rel.replace(/[\\/]/g, '_')}.${i + 1}${block.isModule ? '.mjs' : '.js'}`;
        const target = path.join(scratch, name);
        fs.writeFileSync(target, block.code, 'utf8');
        try {
          execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
        } catch (e) {
          const inner = firstErrorLine(e.stderr);
          failures.push({
            file: rel,
            block: i + 1,
            htmlLine: block.startLine + inner - 1,
            detail: String(e.stderr).split('\n').map((l) => l.trim()).filter(Boolean).slice(1, 3).join(' '),
          });
        }
      });
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  return { files: files.length, blocks, skipped, failures };
}

function report(result, { verbose }) {
  console.log(`site-scripts: ${result.files} page(s), ${result.blocks} inline block(s) checked, ${result.skipped} skipped, ${result.failures.length} failure(s)`);
  if (verbose) {
    for (const f of result.failures) console.log(`  FAIL ${f.file}:${f.htmlLine} (block #${f.block}) ${f.detail}`);
  } else {
    for (const f of result.failures) console.log(`  FAIL ${f.file}:${f.htmlLine} (block #${f.block})`);
  }
}

// Spawn the real CLI: asserting on a recomputed number would only prove the
// expression equals itself, not that the exit code a caller sees is right.
function runCli(args) {
  try {
    const out = execFileSync(process.execPath, [__filename, ...args], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    return { code: Number(e.status), out: String((e.stdout || '') + (e.stderr || '')) };
  }
}

function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-scripts-selftest-'));
  const cases = [];
  const write = (p, s) => {
    const full = path.join(root, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, s, 'utf8');
  };

  try {
    // 1. a page whose inline block is fine
    write('ok/index.html', '<html><script>const a = 1;\nfunction f(){ return a; }\n</script></html>');

    // 2. a page shaped like the 2026-11-23 defect: body without its header
    write('bad/orphan.html', '<html>\n<script>\n    function a() {}\n      b();\n    }\n</script>\n</html>');

    // 3. data blocks must not be parsed as JS
    write('data/importmap.html', '<html><script type="importmap">{ "imports": { "three": "./t.js" } }</script></html>');

    // 4. module syntax must be accepted under type=module
    write('esm/module.html', '<html><script type="module">import x from "./x.js";\nexport default x;\n</script></html>');

    // 4b. an end tag with whitespace before `>` still closes the block
    write('spaced/close.html', '<html><script>const y = 2;</script ><p>after</p></html>');

    const spacedResult = checkRoot(path.join(root, 'spaced'));
    cases.push({
      name: 'end tag with trailing whitespace still closes the block',
      pass: spacedResult.blocks === 1 && spacedResult.failures.length === 0,
      detail: `blocks=${spacedResult.blocks} failures=${spacedResult.failures.length}`,
    });

    // 4c. the form CodeQL named second: `</script\t\n bar>`
    write('odd/close.html', '<html><script>const q = 3;</script\t\n bar><p>after</p></html>');
    const oddResult = checkRoot(path.join(root, 'odd'));
    cases.push({
      name: 'end tag with tabs, newline and junk attributes closes the block',
      pass: oddResult.blocks === 1 && oddResult.failures.length === 0,
      detail: `blocks=${oddResult.blocks} failures=${oddResult.failures.length}`,
    });

    // 4d. `</scripty>` is a different tag name and must not close the block
    const notEnd = findBlocks('<script>z()</scripty></script>');
    cases.push({
      name: 'a different tag name does not close the block',
      pass: notEnd.length === 1 && notEnd[0].code === 'z()</scripty>',
      detail: notEnd.length ? JSON.stringify(notEnd[0].code) : 'no block found',
    });

    // 4e. an unclosed script tag is a defect, not a silent skip
    write('open/tag.html', '<html>\n<script>\nconst w = 4;\n');
    const openRun = runCli(['--root', path.join(root, 'open'), '--verbose']);
    cases.push({
      name: 'unterminated script tag exits 1 and says so',
      pass: openRun.code === 1 && /unterminated/.test(openRun.out),
      detail: `exit=${openRun.code}`,
    });

    const okRun = runCli(['--root', path.join(root, 'ok')]);
    cases.push({
      name: 'valid tree exits 0',
      pass: okRun.code === 0 && /1 inline block/.test(okRun.out),
      detail: `exit=${okRun.code} ${okRun.out.split('\n')[0].slice(0, 72)}`,
    });

    const badRun = runCli(['--root', path.join(root, 'bad'), '--verbose']);
    cases.push({
      name: 'orphaned body exits 1 and names the file',
      pass: badRun.code === 1 && /orphan\.html:\d+/.test(badRun.out),
      detail: `exit=${badRun.code} ${(badRun.out.split('\n').find((l) => l.includes('FAIL')) || 'not named').trim().slice(0, 72)}`,
    });

    const dataResult = checkRoot(path.join(root, 'data'));
    cases.push({
      name: 'importmap is data, not JS',
      pass: dataResult.blocks === 0 && dataResult.failures.length === 0,
      detail: `blocks=${dataResult.blocks}`,
    });

    const esmResult = checkRoot(path.join(root, 'esm'));
    cases.push({
      name: 'type=module accepts import/export',
      pass: esmResult.blocks === 1 && esmResult.failures.length === 0,
      detail: `blocks=${esmResult.blocks} failures=${esmResult.failures.length}`,
    });

    // 5. a tree with no HTML must be exit 2, never a quiet zero
    const emptyDir = path.join(root, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const emptyRun = runCli(['--root', emptyDir]);
    cases.push({
      name: 'no HTML at all is exit 2, not a pass',
      pass: emptyRun.code === 2 && /nothing was checked/.test(emptyRun.out),
      detail: `exit=${emptyRun.code}`,
    });

    // 6. a tree with HTML but no JS is also exit 2
    write('nojs/plain.html', '<html><body>nothing here</body></html>');
    const noJsRun = runCli(['--root', path.join(root, 'nojs')]);
    cases.push({
      name: 'HTML with no inline JS is exit 2',
      pass: noJsRun.code === 2 && /nothing was checked/.test(noJsRun.out),
      detail: `exit=${noJsRun.code}`,
    });

    // 7. a missing root is usage error, not a pass
    const missingRun = runCli(['--root', path.join(root, 'does-not-exist')]);
    cases.push({
      name: 'missing root is exit 2',
      pass: missingRun.code === 2 && /root not found/.test(missingRun.out),
      detail: `exit=${missingRun.code}`,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  let failed = 0;
  for (const c of cases) {
    if (!c.pass) failed += 1;
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
  }
  console.log(failed ? `selftest: ${failed}/${cases.length} failed` : `selftest: ${cases.length}/${cases.length} passed`);
  return failed ? 1 : 0;
}

function main(argv) {
  if (argv.includes('--selftest')) return selftest();

  const rootFlag = argv.indexOf('--root');
  const root = path.resolve(rootFlag >= 0 ? argv[rootFlag + 1] || '' : path.join(__dirname, '..', 'www'));
  const verbose = argv.includes('--verbose');

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`site-scripts: root not found: ${root}`);
    return 2;
  }

  const result = checkRoot(root);
  report(result, { verbose });

  if (result.blocks === 0) {
    console.error('site-scripts: nothing was checked (0 inline JS blocks) - refusing to report a pass');
    return 2;
  }
  return result.failures.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { checkRoot, findBlocks };
