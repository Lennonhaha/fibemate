// SPDX-License-Identifier: GPL-3.0-only
/**
 * check-experimental-isolation.cjs
 *
 * P0-01 编译期隔离验证脚本
 *
 * 验证生产模式下 experimental/ 代码不被 src/ 生产入口无条件引用。
 * 规则：
 *   1. src/ 目录下的 .js 文件不得出现无条件的 require('...experimental/...')
 *   2. 允许在 if (flags.XXX) 条件块内的条件 require
 *   3. 允许 try/catch 中的防御性 require（带 fallback）
 *
 * 用法：node scripts/check-experimental-isolation.cjs
 * 退出码：0 = 通过，1 = 发现违规
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

let violations = 0;

function checkFile(filePath, relPath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // 简单状态机：跟踪 if 块深度（只关心 flags 条件块）
  let inConditionalBlock = false;
  let conditionalDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // 检测 require experimental
    const reqMatch = trimmed.match(/require\s*\(\s*['"]([^'"]*experimental[^'"]*)['"]\s*\)/);
    if (!reqMatch) continue;

    // 跳过注释行
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    // 检查是否在条件块内（if flags.XXX）
    // 简单启发式：如果前几行有 if (flags. 且未闭合 }
    const isConditional = isInConditionalBlock(content, i);

    // 检查是否在 try 块内
    const isInTry = isInTryBlock(content, i);

    // 检查是否是三元表达式的一部分 (flags.X ? require(...) : null)
    const isTernary = trimmed.includes('flags.') && (trimmed.includes('?') || trimmed.includes('&&'));

    if (!isConditional && !isInTry && !isTernary) {
      console.error(`VIOLATION: ${relPath}:${lineNum}: unconditional require of experimental module`);
      console.error(`  ${trimmed}`);
      violations++;
    }
  }
}

function isInConditionalBlock(content, lineIdx) {
  // 向上搜索最近的 if (flags. 或 if (flags[
  const lines = content.split('\n');
  let depth = 0;
  for (let i = lineIdx - 1; i >= 0 && i >= lineIdx - 20; i--) {
    const l = lines[i].trim();
    if (l.includes('}')) depth++;
    if (l.includes('{')) {
      depth--;
      if (depth < 0) {
        // 检查这个 { 是否属于 if (flags.
        // 向上找 if 行
        for (let j = i; j >= 0 && j >= i - 3; j--) {
          const ifLine = lines[j].trim();
          if (ifLine.match(/if\s*\(\s*flags\./)) return true;
        }
      }
    }
  }
  return false;
}

function isInTryBlock(content, lineIdx) {
  const lines = content.split('\n');
  for (let i = lineIdx; i >= 0 && i >= lineIdx - 15; i--) {
    const l = lines[i].trim();
    if (l.match(/^try\s*\{?/) || l.match(/\btry\s*\{/)) return true;
    // 如果遇到函数边界或 if 块开始，停止向上搜索
    if (l.match(/^(function|const|let|var|module|exports|class)\s/) && !l.includes('try')) break;
  }
  return false;
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.cjs')) {
      const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
      checkFile(fullPath, relPath);
    }
  }
}

console.log('Checking experimental code isolation in src/...');
walkDir(SRC_DIR);

if (violations === 0) {
  console.log('OK: all experimental requires in src/ are conditionally gated');
  process.exit(0);
} else {
  console.error(`FAIL: ${violations} violation(s) found`);
  process.exit(1);
}
