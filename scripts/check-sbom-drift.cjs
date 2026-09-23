#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * scripts/check-sbom-drift.cjs — 比对两个 SBOM 的组件集合是否一致
 *
 * 语义：CI 现场用 gen-sbom.js 重新生成 SBOM，与仓库 committed 的 SBOM 比对。
 * gen-sbom.js 是确定性的（相同 lockfile -> 相同 SBOM），两个 SBOM 的
 * name@version 集合必须完全相等；任何差异 = committed SBOM 过时（依赖漂移）。
 *
 * 用法:
 *   node scripts/check-sbom-drift.cjs <generated> <committed>
 *
 * 退出码: 0 = 一致; 1 = 漂移（打印差异明细）; 2 = 用法错误
 */
'use strict';

const fs = require('fs');

function loadComponents(file) {
  const sbom = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(sbom.components)) {
    throw new Error(`${file}: 非 CycloneDX SBOM（缺 components 数组）`);
  }
  return sbom.components;
}

function versionSet(components) {
  const set = new Set();
  for (const c of components) {
    if (c && typeof c.name === 'string' && typeof c.version === 'string') {
      set.add(`${c.name}@${c.version}`);
    }
  }
  return set;
}

function main() {
  const genFile = process.argv[2];
  const committedFile = process.argv[3];
  if (!genFile || !committedFile) {
    console.error('用法: node scripts/check-sbom-drift.cjs <generated> <committed>');
    process.exit(2);
  }

  const genSet = versionSet(loadComponents(genFile));
  const committedSet = versionSet(loadComponents(committedFile));

  const onlyInGenerated = [...genSet].filter((x) => !committedSet.has(x)).sort();
  const onlyInCommitted = [...committedSet].filter((x) => !genSet.has(x)).sort();

  if (onlyInGenerated.length === 0 && onlyInCommitted.length === 0) {
    console.log(`SBOM up-to-date: ${genSet.size} components`);
    process.exit(0);
  }

  console.error(`SBOM drift detected: generated=${genSet.size} committed=${committedSet.size}`);
  if (onlyInGenerated.length) {
    console.error(`\n  缺少（committed 没有，现场生成有）：${onlyInGenerated.length} 个`);
    for (const x of onlyInGenerated) console.error(`    + ${x}`);
  }
  if (onlyInCommitted.length) {
    console.error(`\n  多余（committed 有，现场生成没有）：${onlyInCommitted.length} 个`);
    for (const x of onlyInCommitted) console.error(`    - ${x}`);
  }
  console.error('\n请运行 `node scripts/gen-sbom.js` 重新生成并提交 sbom.cdx.json。');
  process.exit(1);
}

main();
