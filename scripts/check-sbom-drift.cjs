#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * scripts/check-sbom-drift.cjs — 比对 SBOM 与仓库真实状态是否一致
 *
 * 语义：CI 现场用 gen-sbom.js 重新生成 SBOM，与仓库 committed 的 SBOM 比对。
 * gen-sbom.js 是确定性的（相同 lockfile -> 相同 SBOM），两者必须完全一致。
 *
 * 检查两层，缺一不可：
 *   1) 组件集合：name@version 集合必须相等（依赖漂移）。
 *   2) metadata 版本：metadata.component.version 必须等于 package.json 的
 *      version（自身版本漂移）。
 *
 * 为什么第 2 层必须单独查：第 1 层只比 components，而根组件不在
 * components 里（它在 metadata.component）。历史事故：committed SBOM 写
 * fibemate@3.3.0 而 package.json 已是 3.3.2，组件集合完全一致，门禁长期
 * 静默通过。**判据本身也要被核**——门禁不仅要拦依赖变化，也要拦自身版本漂移。
 *
 * 用法:
 *   node scripts/check-sbom-drift.cjs <generated> <committed> [--package-json <path>]
 *
 * 退出码: 0 = 一致; 1 = 漂移（打印差异明细）; 2 = 用法错误/输入不可读
 */
'use strict';

const fs = require('fs');

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`无法读取 ${file}: ${err.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${file} 不是合法 JSON: ${err.message}`);
  }
}

function loadComponents(file) {
  const sbom = readJson(file);
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

/**
 * 取 SBOM 根组件声明的版本。根组件在 metadata.component，不在 components 里，
 * 所以 versionSet() 永远看不到它 —— 这正是旧版门禁的盲区。
 */
function rootVersionOf(sbom) {
  const root = sbom.metadata && sbom.metadata.component;
  if (!root || typeof root !== 'object') return { version: null, reason: '缺 metadata.component' };
  if (typeof root.version !== 'string') return { version: null, reason: 'metadata.component 缺 version 字符串' };
  return {
    version: root.version,
    name: root.name,
    bomRef: root['bom-ref'],
  };
}

function parseArgs(argv) {
  const positional = [];
  let packageJson = 'package.json';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--package-json') {
      packageJson = argv[++i];
      if (!packageJson) throw new Error('--package-json 需要路径参数');
    } else if (a === '--help' || a === '-h') {
      return { help: true };
    } else if (a.startsWith('--')) {
      throw new Error(`未知参数: ${a}`);
    } else {
      positional.push(a);
    }
  }
  return { positional, packageJson };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error('用法: node scripts/check-sbom-drift.cjs <generated> <committed> [--package-json <path>]');
    process.exit(2);
  }

  if (args.help) {
    console.log('用法: node scripts/check-sbom-drift.cjs <generated> <committed> [--package-json <path>]');
    process.exit(0);
  }

  const [genFile, committedFile] = args.positional;
  if (!genFile || !committedFile) {
    console.error('用法: node scripts/check-sbom-drift.cjs <generated> <committed> [--package-json <path>]');
    process.exit(2);
  }

  // package.json 是「真相」。读不到就是配置错误，不能静默跳过 —— 跳过等于
  // 把这条门禁关掉，正是要修的那类盲区。
  let pkgVersion;
  try {
    const pkg = readJson(args.packageJson);
    if (typeof pkg.version !== 'string' || pkg.version === '') {
      throw new Error(`${args.packageJson} 缺 version 字段`);
    }
    pkgVersion = pkg.version;
  } catch (err) {
    console.error(`✗ 无法确定项目版本: ${err.message}`);
    process.exit(2);
  }

  let genComponents, committedComponents, genSbom, committedSbom;
  try {
    genSbom = readJson(genFile);
    committedSbom = readJson(committedFile);
    genComponents = loadComponents(genFile);
    committedComponents = loadComponents(committedFile);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(2);
  }

  const genSet = versionSet(genComponents);
  const committedSet = versionSet(committedComponents);

  const onlyInGenerated = [...genSet].filter((x) => !committedSet.has(x)).sort();
  const onlyInCommitted = [...committedSet].filter((x) => !genSet.has(x)).sort();

  // ── 第 2 层：metadata 版本漂移 ──────────────────────────────────────────
  const genRoot = rootVersionOf(genSbom);
  const committedRoot = rootVersionOf(committedSbom);
  const metaProblems = [];

  for (const [label, root, file] of [
    ['现场生成', genRoot, genFile],
    ['committed', committedRoot, committedFile],
  ]) {
    if (root.version === null) {
      metaProblems.push(`${label} SBOM (${file}) ${root.reason}`);
      continue;
    }
    if (root.version !== pkgVersion) {
      metaProblems.push(
        `${label} SBOM (${file}) metadata.component.version = ${root.version}，` +
          `但 package.json 是 ${pkgVersion}`,
      );
    }
    // bom-ref 内嵌版本，二者必须自洽（防只改一处的手工编辑）
    if (typeof root.bomRef === 'string' && typeof root.name === 'string') {
      const expected = `${root.name}@${root.version}`;
      if (root.bomRef !== expected) {
        metaProblems.push(
          `${label} SBOM (${file}) bom-ref 不自洽: ${root.bomRef}（按 name@version 应为 ${expected}）`,
        );
      }
    }
  }

  const componentDrift = onlyInGenerated.length > 0 || onlyInCommitted.length > 0;

  if (!componentDrift && metaProblems.length === 0) {
    console.log(`SBOM up-to-date: ${genSet.size} components, root version ${pkgVersion}`);
    process.exit(0);
  }

  if (componentDrift) {
    console.error(`SBOM drift detected: generated=${genSet.size} committed=${committedSet.size}`);
    if (onlyInGenerated.length) {
      console.error(`\n  缺少（committed 没有，现场生成有）：${onlyInGenerated.length} 个`);
      for (const x of onlyInGenerated) console.error(`    + ${x}`);
    }
    if (onlyInCommitted.length) {
      console.error(`\n  多余（committed 有，现场生成没有）：${onlyInCommitted.length} 个`);
      for (const x of onlyInCommitted) console.error(`    - ${x}`);
    }
  }

  if (metaProblems.length) {
    console.error(`\nSBOM metadata drift detected（组件集合${componentDrift ? '同时' : '未'}漂移）：`);
    for (const p of metaProblems) console.error(`    ! ${p}`);
    console.error(`\n  根组件不在 components 数组里，组件集合比对看不到它 —— 这是本条检查存在的原因。`);
  }

  console.error('\n请运行 `node scripts/gen-sbom.js` 重新生成并提交 sbom.cdx.json。');
  process.exit(1);
}

main();
