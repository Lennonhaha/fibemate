#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * tools/scan-crypto-assets.cjs — 系统级密码资产清单扫描器 (CBOM runtime layer)
 *
 * 定位: 与 tools/build-cbom.cjs (源码静态 CBOM) 互补 —— 本工具扫描【运行态】配置:
 *   - nginx TLS 配置 (协议/密码套件/证书链)
 *   - pm2 Node 服务清单 (端口/环境)
 *   - 证书与密钥文件 (公钥算法/有效期)
 *   - 混合 PQC 能力探测 (OpenSSL 是否含 ML-KEM / 服务器 PQ 资产存在性)
 *
 * 输出: crypto-assets.json (可作 Policy-as-Code 基线, 部署前 diff 防配置漂移)
 *
 * 用法:
 *   node tools/scan-crypto-assets.cjs                # 自动探测 (Linux 服务器)
 *   node tools/scan-crypto-assets.cjs --nginx /etc/nginx --pm2 --certs /etc/letsencrypt/live
 *   node tools/scan-crypto-assets.cjs --out /tmp/crypto-assets.json
 *   node tools/scan-crypto-assets.cjs --json         # 输出 JSON (供 CI 消费)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
function parseArgs(argv) {
  const args = { nginxDir: null, pm2: false, certsDir: null, out: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--nginx') args.nginxDir = argv[++i];
    else if (a === '--pm2') args.pm2 = true;
    else if (a === '--certs') args.certsDir = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--json') args.json = true;
  }
  return args;
}

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, ...opts }).trim();
  } catch (e) {
    return opts.silent ? '' : null; // null = 命令不可用/失败
  }
}

/** 递归找 nginx 配置文件里的 server 块 TLS 指令 */
function scanNginxTLS(nginxDir) {
  const result = { endpoints: [], files: [] };
  if (!nginxDir || !fs.existsSync(nginxDir)) return result;
  const confs = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      let isDir = ent.isDirectory();
      let isFile = ent.isFile();
      if (ent.isSymbolicLink()) {
        try {
          const st = fs.statSync(p); // 跟随符号链接
          isDir = st.isDirectory();
          isFile = st.isFile();
        } catch {
          continue; // 断链
        }
      }
      if (isDir) {
        if (['sites-enabled', 'conf.d', 'sites-available'].includes(ent.name)) walk(p);
      } else if (isFile) {
        // sites-enabled/conf.d 下任意文件名都是 nginx 配置 (Debian 惯例: 无 .conf 后缀也合法);
        // 仅递归根目录时限制 nginx.conf / .conf
        const parent = path.basename(dir);
        if (parent === 'sites-enabled' || parent === 'conf.d' || /\.conf$/.test(ent.name) || ent.name === 'nginx.conf') {
          confs.push(p);
        }
      }
    }
  };
  walk(nginxDir);
  for (const f of confs) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    result.files.push(f);
    // 粗解析: 找 TLS 监听端口 (443/8443 等带 ssl) + 该 server 块的 ssl 指令
    const blocks = text.split(/server\s*\{/).slice(1);
    for (const b of blocks) {
      const listenLine = (b.match(/listen\s+([^;]+)/) || [])[1] || '';
      const isTLS = /443/.test(listenLine) && /ssl/.test(listenLine);
      const is8443TLS = /8443/.test(listenLine) && /ssl/.test(listenLine);
      if (!isTLS && !is8443TLS) continue;
      const name = (b.match(/server_name\s+([^;]+)/) || [])[1]?.trim().split(/\s+/)[0] || 'default';
      const protocols = (b.match(/ssl_protocols\s+([^;]+)/) || [])[1]?.trim() || null;
      const ecdh = (b.match(/ssl_ecdh_curve(s)?\s+([^;]+)/) || [])[2]?.trim() || null;
      const ciphers = (b.match(/ssl_ciphers\s+([^;]+)/) || [])[1]?.trim() || null;
      const cert = (b.match(/ssl_certificate\s+([^;]+)/) || [])[1]?.trim() || null;
      const port = (listenLine.match(/(443|8443)/) || [])[1] || null;
      result.endpoints.push({ file: f, server_name: name, listen: port ? port + (is8443TLS ? ' (alt)' : '') : null, tls_versions: protocols, ecdh_curves: ecdh, ciphers, cert });
    }
  }
  return result;
}

/** pm2 进程清单 */
function scanPM2() {
  try {
    const raw = execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 10000 });
    const apps = JSON.parse(raw);
    return apps.map((a) => {
      const env = a.pm2_env || {};
      const e = env.env || {};
      return {
        name: a.name,
        status: env.status,
        node_env: env.NODE_ENV || null,
        port: e.PORT || null,
        pid: env.pid || null,
        uptime_ms: env.pm_uptime ? Date.now() - env.pm_uptime : null,
      };
    });
  } catch {
    return { error: 'pm2 不可用 (非服务器或未安装)' };
  }
}

/** 证书公钥算法提取 */
function scanCerts(certsDir) {
  const result = [];
  if (!certsDir || !fs.existsSync(certsDir)) return result;
  const dirs = fs.readdirSync(certsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(certsDir, d.name));
  for (const dir of dirs) {
    const fullchain = path.join(dir, 'fullchain.pem');
    if (!fs.existsSync(fullchain)) continue;
    const out = run('openssl', ['x509', '-in', fullchain, '-noout', '-text'], { silent: true });
    if (!out) {
      result.push({ cert: fullchain, error: 'openssl 解析失败' });
      continue;
    }
    const algo = (out.match(/Public Key Algorithm:\s*([^\n]+)/) || [])[1]?.trim() || null;
    const sigAlgo = (out.match(/Signature Algorithm:\s*([^\n]+)/) || [])[1]?.trim() || null;
    const notAfter = (out.match(/Not After\s*:\s*([^\n]+)/) || [])[1]?.trim() || null;
    const bits = (out.match(/Public-Key:\s*\((\d+) bit\)/) || [])[1] || null;
    result.push({ cert: fullchain, domain: path.basename(dir), key_algorithm: algo, key_bits: bits, signature_algorithm: sigAlgo, not_after: notAfter });
  }
  return result;
}

/** PQ 能力探测: openssl 是否认识混合组 */
function probePQ(nginxEndpoints) {
  const openssl = run('openssl', ['version']);
  const groups = run('openssl', ['list', '-tls-groups'], { silent: true }) || '';
  const hasMLKEM = /mlkem|X25519MLKEM768/i.test(groups);
  const openssl351 = /OpenSSL\s+3\.[5-9]/.test(openssl || '');
  return {
    openssl_version: openssl || 'unknown',
    openssl_supports_mlkem: hasMLKEM,
    hybrid_tls_ready: openssl351 && hasMLKEM,
    note: openssl351 && hasMLKEM
      ? 'OpenSSL >= 3.5 + ML-KEM: 可启用 ssl_ecdh_curve X25519MLKEM768'
      : 'OpenSSL < 3.5 或无 ML-KEM: 直接配置混合组会导致 nginx emerg 拒启, 需先升级 OpenSSL 或换含 PQ 的构建',
    endpoints_using_hybrid: nginxEndpoints.filter((e) => e.ecdh_curves && /mlkem/i.test(e.ecdh_curves)).length,
  };
}

/** 主仓 PQ 资产存在性 (部署目录) */
function probeRepoAssets() {
  const candidates = ['/opt/fibemate-repo', '/opt/fibemate-full'];
  const assets = {};
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    assets[dir] = {
      mlkem_js: fs.existsSync(path.join(dir, 'packages/pqc-kem/src/ml-kem-768.js')),
      spk_server: fs.existsSync(path.join(dir, 'src/opk-server.js')) || fs.existsSync(path.join(dir, 'backend/opk-server.js')),
      hybrid_kex: fs.existsSync(path.join(dir, 'src/hybrid-kex.js')) || fs.existsSync(path.join(dir, 'backend/hybrid-kex.js')),
    };
  }
  return assets;
}

function main() {
  const args = parseArgs(process.argv);
  const nginxDir = args.nginxDir || (process.platform === 'linux' && fs.existsSync('/etc/nginx') ? '/etc/nginx' : null);
  const certsDir = args.certsDir || (process.platform === 'linux' && fs.existsSync('/etc/letsencrypt/live') ? '/etc/letsencrypt/live' : null);

  const nginx = scanNginxTLS(nginxDir);
  const assets = {
    timestamp: new Date().toISOString(),
    host: require('os').hostname(),
    platform: {
      nginx: nginx,
      pm2: args.pm2 || process.platform === 'linux' ? scanPM2() : { note: '跳过 (非 Linux 或未指定 --pm2)' },
      certs: scanCerts(certsDir),
    },
    pq: probePQ(nginx.endpoints || []),
    repo_assets: probeRepoAssets(),
  };

  const out = args.out || 'crypto-assets.json';
  fs.writeFileSync(out, JSON.stringify(assets, null, 2) + '\n', 'utf8');
  if (args.json) {
    process.stdout.write(JSON.stringify(assets));
  } else {
    console.log(`[OK] ${out} 已生成 (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
    console.log(`  nginx endpoints: ${(nginx.endpoints || []).length}, pm2: ${Array.isArray(assets.platform.pm2) ? assets.platform.pm2.length : 'n/a'}, certs: ${assets.platform.certs.length}`);
    console.log(`  hybrid TLS ready: ${assets.pq.hybrid_tls_ready} (${assets.pq.openssl_version})`);
  }
}

main();
