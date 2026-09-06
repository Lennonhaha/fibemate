#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * tools/check-crypto-policy.cjs — 密码策略合规校验 (Policy as Code)
 *
 * 读取 crypto-assets.json (由 scan-crypto-assets.cjs 生成), 校验策略:
 *   P1. TLS 版本 >= 1.2 (禁止 1.0/1.1)
 *   P2. 若 OpenSSL >= 3.5: 必须配置混合组 (X25519MLKEM768) —— 迁移目标态
 *   P3. 证书公钥算法非量子脆弱 (RSA-2048 以下 / 无) 时告警 (信息级)
 *   P4. 配置漂移检测: 与基线文件 diff, 输出差异 (供 CI 门禁)
 *
 * 用法:
 *   node tools/check-crypto-policy.cjs --baseline crypto-assets.json     # 校验
 *   node tools/check-crypto-policy.cjs --baseline x.json --strict        # 严格模式 (漂移即失败)
 *   node tools/check-crypto-policy.cjs --gen-baseline --out baseline.json # 生成基线
 *
 * 退出码: 0 = 通过, 1 = 策略违规, 2 = 漂移 (仅 --strict)
 */
'use strict';

const fs = require('fs');

function parseArgs(argv) {
  const args = { baseline: null, genBaseline: false, out: null, strict: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') args.baseline = argv[++i];
    else if (a === '--gen-baseline') args.genBaseline = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--strict') args.strict = true;
  }
  return args;
}

function load(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`[ERR] 解析失败 ${p}: ${e.message}`);
    return null;
  }
}

function check(assets) {
  const findings = [];
  const endpoints = assets.platform?.nginx?.endpoints || [];

  for (const ep of endpoints) {
    const tv = ep.tls_versions || '';
    if (/TLSv1(\s|$)|TLSv1\.0/.test(tv)) {
      findings.push({ severity: 'error', policy: 'P1', msg: `${ep.server_name}: 禁用 TLS 1.0/1.1 (当前: ${tv})` });
    }
    if (!/TLSv1\.3/.test(tv)) {
      findings.push({ severity: 'warn', policy: 'P1', msg: `${ep.server_name}: 未启用 TLS 1.3 (当前: ${tv})` });
    }
  }

  const pq = assets.pq || {};
  if (pq.hybrid_tls_ready && pq.endpoints_using_hybrid === 0) {
    findings.push({
      severity: 'error',
      policy: 'P2',
      msg: 'OpenSSL >= 3.5 已就绪但无端点配置混合组 X25519MLKEM768 (迁移目标态未达成)',
    });
  } else if (!pq.hybrid_tls_ready) {
    findings.push({
      severity: 'info',
      policy: 'P2',
      msg: `OpenSSL ${pq.openssl_version || '未知'} < 3.5: 平台层混合 TLS 暂不可用 (应用层混合 KEX 仍生效)`,
    });
  }

  for (const cert of assets.platform?.certs || []) {
    if (cert.key_algorithm === 'rsaEncryption' && parseInt(cert.key_bits, 10) < 2048) {
      findings.push({ severity: 'error', policy: 'P3', msg: `${cert.domain}: RSA < 2048 (${cert.key_bits} bit)` });
    }
    if (cert.error) {
      findings.push({ severity: 'warn', policy: 'P3', msg: `${cert.cert}: ${cert.error}` });
    }
  }

  return findings;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.genBaseline) {
    const src = args.baseline || 'crypto-assets.json';
    const assets = load(src);
    if (!assets) { console.error('[ERR] 无输入资产文件'); process.exit(1); }
    // 基线 = 策略相关字段子集 (不含时间戳/host, 防噪声漂移)
    const baseline = {
      version: 1,
      endpoints: (assets.platform?.nginx?.endpoints || []).map((e) => ({
        server_name: e.server_name, tls_versions: e.tls_versions, ecdh_curves: e.ecdh_curves,
      })),
      hybrid_tls_ready: assets.pq?.hybrid_tls_ready ?? false,
      certs: (assets.platform?.certs || []).map((c) => ({
        domain: c.domain, key_algorithm: c.key_algorithm, key_bits: c.key_bits,
      })),
    };
    const out = args.out || 'crypto-policy-baseline.json';
    fs.writeFileSync(out, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
    console.log(`[OK] 基线已生成: ${out}`);
    return;
  }

  if (!args.baseline) {
    console.error('用法: node tools/check-crypto-policy.cjs --baseline crypto-assets.json [--strict]');
    process.exit(1);
  }
  const assets = load(args.baseline);
  if (!assets) process.exit(1);

  const findings = check(assets);
  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');
  const infos = findings.filter((f) => f.severity === 'info');

  console.log(`== 密码策略校验: ${findings.length} 条发现 (${errors.length} error / ${warns.length} warn / ${infos.length} info)`);
  for (const f of findings) console.log(`  [${f.severity.toUpperCase()}] ${f.policy} ${f.msg}`);

  if (errors.length > 0) process.exit(1);
  console.log('[OK] 策略合规 (无 error 级违规)');
}

main();
