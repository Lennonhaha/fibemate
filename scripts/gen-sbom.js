#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * scripts/gen-sbom.js — 从 package-lock.json 生成 CycloneDX 1.4 JSON SBOM
 *
 * 不依赖 node_modules，仅读取 package.json + package-lock.json 的精确版本锁定。
 * 用法: node scripts/gen-sbom.js [输出文件，默认 sbom.cdx.json]
 *
 * 依赖 CycloneDX 社区 CLI 的用户也可用:
 *   npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json
 * (但需 node_modules 已安装)
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');

const outFile = process.argv[2] || 'sbom.cdx.json';

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const pkgs = lock.packages || {};

const components = [];
const seen = new Set();

// 根组件
components.push({
  type: 'application',
  'bom-ref': 'fibemate@' + rootPkg.version,
  name: 'fibemate',
  version: rootPkg.version,
  purl: 'pkg:npm/fibemate@' + rootPkg.version,
  licenses: [{ license: { name: 'GPL-3.0-only' } }],
});

// 遍历 node_modules/* 传递依赖
for (const [k, v] of Object.entries(pkgs)) {
  if (!k || !k.startsWith('node_modules/')) continue;
  // 嵌套依赖（如 node_modules/A/node_modules/B）要取最后一段 B 作为真实包名；
  // 旧逻辑 replace(/\/node_modules\/.*$/, '') 会误取父包 A（name 与 version 串位）。
  const name = k.replace(/^node_modules\//, '').split('/node_modules/').pop();
  const version = v.version;
  if (!version || seen.has(name + '@' + version)) continue;
  seen.add(name + '@' + version);

  const comp = {
    type: 'library',
    'bom-ref': name + '@' + version,
    name,
    version,
    purl: 'pkg:npm/' + name.replace(/\//g, '%2F') + '@' + version,
  };
  if (v.license) {
    const licenses = Array.isArray(v.license) ? v.license : [v.license];
    comp.licenses = licenses.map(l => ({
      license: { name: typeof l === 'string' ? l : (l.type || '') },
    }));
  }
  components.push(comp);
}

// 确定性（reproducible-builds）：serial 由内容派生，timestamp 由 SOURCE_DATE_EPOCH 派生。
// 相同 lockfile -> 相同 SBOM 字节。见 .github/workflows/repro-build-check.yml。
const canonical = JSON.stringify(components);
const serialSeed = crypto.createHash('sha256').update(canonical).digest('hex');
const uuidLike =
  serialSeed.slice(0, 8) + '-' + serialSeed.slice(8, 12) + '-5' +
  serialSeed.slice(13, 16) + '-' + serialSeed.slice(16, 20) + '-' + serialSeed.slice(20, 32);
const SOURCE_DATE_EPOCH = process.env.SOURCE_DATE_EPOCH;
const timestamp = SOURCE_DATE_EPOCH
  ? new Date(Number(SOURCE_DATE_EPOCH) * 1000).toISOString()
  : '1970-01-01T00:00:00.000Z';

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.4',
  serialNumber: 'urn:uuid:' + uuidLike,
  version: 1,
  metadata: {
    timestamp,
    component: components[0],
    tools: [{ vendor: 'FIBEMATE', name: 'gen-sbom', version: '1.0.0' }],
  },
  components: components.slice(1),
};

fs.writeFileSync(outFile, JSON.stringify(sbom, null, 2) + '\n', 'utf8');
console.log(`SBOM 生成完成: ${outFile}`);
console.log(`  组件总数: ${components.length} (含根)`);
console.log(`  库组件: ${components.length - 1}`);
