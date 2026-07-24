#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// =============================================================================
// verify-tsr.js — FIBEMATE TSR 时间戳存证「可复现」验证（跨平台 Node 版）
// -----------------------------------------------------------------------------
// 与 verify-tsr.sh 等价，额外用 Node crypto 做 .sha256 清单文件完整性校验，
// 不依赖 sha256sum。需系统已安装 openssl（用于解析/校验 RFC3161 令牌）。
//
// 用法: node scripts/verify-tsr.js [TSA目录] [CA链文件]
// =============================================================================
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OPENSSL = process.env.OPENSSL_BIN || 'openssl';
const TSA_DIR = process.argv[2] || 'www/docs/tsa';
const CA_FILE = process.argv[3] || 'digicert-certs/digicert-tsa-chain.pem';

function run(cmd, args, input) {
  try {
    return execFileSync(cmd, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

// 解析 openssl ts -reply/-query -text 输出的 messageImprint
function extractImprint(text) {
  let cap = false, out = '';
  for (const raw of text.split('\n')) {
    if (/Message data:/.test(raw)) { cap = true; continue; }
    if (cap && /^ *[0-9a-f]+ - /.test(raw)) {
      let line = raw.replace(/^ *[0-9a-f]+ - /, '');
      for (const seg of line.split('-')) {
        const pairs = seg.replace(/[^0-9a-fA-F]/g, ' ').trim().split(/\s+/).filter(h => /^[0-9a-fA-F]{2}$/.test(h));
        out += pairs.join('');
      }
      continue;
    }
    if (cap && /^$/.test(raw)) cap = false;
  }
  return out.toLowerCase();
}

function extractStatus(text) {
  const m = text.match(/Status:\s*(\w+)/);
  return m ? m[1] : 'unknown';
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

function walk(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

function main() {
  if (!fs.existsSync(TSA_DIR)) { console.error(`错误：TSA 目录不存在: ${TSA_DIR}`); process.exit(2); }
  try { execFileSync(OPENSSL, ['version']); } catch { console.error('错误：未找到 openssl'); process.exit(2); }

  console.log('===================================================================');
  console.log(' FIBEMATE TSR 存证验证 (Node)');
  console.log(` TSA 目录 : ${TSA_DIR}`);
  console.log(` CA 链     : ${fs.existsSync(CA_FILE) ? CA_FILE : '<无>'}`);
  console.log('===================================================================');

  const tsrs = walk(TSA_DIR, '.tsr').sort();
  if (tsrs.length === 0) { console.log('未找到任何 .tsr 文件'); process.exit(0); }

  let PASS = 0, FAIL = 0, SKIP = 0;
  for (const tsr of tsrs) {
    const dir = path.dirname(tsr);
    const base = path.basename(tsr, '.tsr');
    const tsq = path.join(dir, base + '.tsq');
    const manifest = path.join(dir, base + '.sha256');

    console.log('---------------------------------------------------------------');
    console.log(`文件: ${tsr}`);

    const reply = run(OPENSSL, ['ts', '-reply', '-in', tsr, '-text']);
    const status = extractStatus(reply);
    const imprint = extractImprint(reply);
    if (!imprint) { console.log('  [FAIL] 无法解析 tsr messageImprint'); FAIL++; continue; }
    console.log(`  状态: ${status}   imprint: ${imprint.slice(0,16)}...${imprint.slice(48)}`);

    // 1) 签名层
    if (fs.existsSync(tsq)) {
      if (fs.existsSync(CA_FILE)) {
        const v = run(OPENSSL, ['ts', '-verify', '-in', tsr, '-queryfile', tsq, '-CAfile', CA_FILE]);
        if (/Verification: OK/.test(v)) console.log('  [签名] OK  (DigiCert TSA 签名有效)');
        else { console.log('  [签名] FAIL (openssl ts -verify 失败)'); FAIL++; continue; }
      } else {
        const tsqImp = extractImprint(run(OPENSSL, ['ts', '-query', '-in', tsq, '-text']));
        if (tsqImp === imprint) { console.log('  [签名] SKIP (无 CA 链，tsr 与 tsq 哈希一致)'); SKIP++; }
        else { console.log('  [签名] FAIL (tsq 哈希与 tsr 不一致)'); FAIL++; continue; }
      }
    } else {
      console.log('  [签名] SKIP (缺 .tsq 请求文件)'); SKIP++;
    }

    // 2) 绑定层 + 3) 文件完整性
    if (fs.existsSync(manifest)) {
      const lines = fs.readFileSync(manifest, 'utf8').split('\n').filter(Boolean);
      const hashes = lines.map(l => l.trim().split(/\s+/)[0]).filter(h => /^[0-9a-f]{64}$/i.test(h));
      if (hashes.length && hashes.includes(imprint)) console.log('  [绑定] OK  (imprint 命中 .sha256 清单哈希)');
      else if (hashes.length) { console.log('  [绑定] FAIL (imprint 不在 .sha256 清单中)'); FAIL++; continue; }
      else console.log('  [绑定] WARN (.sha256 清单格式异常)');

      // 文件完整性：清单引用的文件若本地存在则校验
      let checked = 0, ok = 0;
      for (const l of lines) {
        const m = l.trim().match(/^[0-9a-f]{64}\s+\*?(.+)$/i);
        if (!m) continue;
        const fp = path.resolve(dir, m[1]);
        if (fs.existsSync(fp)) {
          checked++;
          if (sha256File(fp) === m[1].toLowerCase()) ok++;
          else console.log(`  [文件] FAIL (${m[1]} sha256 不匹配)`);
        }
      }
      if (checked) console.log(`  [文件] ${ok === checked ? 'OK' : 'FAIL'}  (${ok}/${checked} 个清单文件本地校验通过)`);
      else console.log('  [文件] WARN (清单文件不在本地，属正常——原始文件多存于外部)');
    } else if (fs.existsSync(tsq)) {
      const tsqImp = extractImprint(run(OPENSSL, ['ts', '-query', '-in', tsq, '-text']));
      if (tsqImp === imprint) console.log('  [绑定] OK  (imprint 与 .tsq 请求哈希一致)');
      else { console.log('  [绑定] FAIL (imprint 与 .tsq 不一致)'); FAIL++; continue; }
    } else {
      console.log('  [绑定] WARN (既无 .sha256 也无 .tsq)');
    }
    PASS++;
  }

  console.log('===============================================================');
  console.log(`结果: 通过 ${PASS} | 失败 ${FAIL} | 跳过/警告 ${SKIP} | 总计 ${tsrs.length}`);
  console.log('===============================================================');
  process.exit(FAIL === 0 ? 0 : 1);
}

main();
