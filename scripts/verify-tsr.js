#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// =============================================================================
// verify-tsr.js 鈥?FIBEMATE TSR 鏃堕棿鎴冲瓨璇併€屽彲澶嶇幇銆嶉獙璇侊紙璺ㄥ钩鍙?Node 鐗堬級
// -----------------------------------------------------------------------------
// 涓?verify-tsr.sh 绛変环锛岄澶栫敤 Node crypto 鍋?.sha256 娓呭崟鏂囦欢瀹屾暣鎬ф牎楠岋紝
// 涓嶄緷璧?sha256sum銆傞渶绯荤粺宸插畨瑁?openssl锛堢敤浜庤В鏋?鏍￠獙 RFC3161 浠ょ墝锛夈€?//
// 鐢ㄦ硶: node scripts/verify-tsr.js [TSA鐩綍] [CA閾炬枃浠禲
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

// 瑙ｆ瀽 openssl ts -reply/-query -text 杈撳嚭鐨?messageImprint
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
  if (!fs.existsSync(TSA_DIR)) { console.error(`閿欒锛歍SA 鐩綍涓嶅瓨鍦? ${TSA_DIR}`); process.exit(2); }
  try { execFileSync(OPENSSL, ['version']); } catch { console.error('閿欒锛氭湭鎵惧埌 openssl'); process.exit(2); }

  console.log('===================================================================');
  console.log(' FIBEMATE TSR 瀛樿瘉楠岃瘉 (Node)');
  console.log(` TSA 鐩綍 : ${TSA_DIR}`);
  console.log(` CA 閾?    : ${fs.existsSync(CA_FILE) ? CA_FILE : '<鏃?'}`);
  console.log('===================================================================');

  const tsrs = walk(TSA_DIR, '.tsr').sort();
  if (tsrs.length === 0) { console.log('鏈壘鍒颁换浣?.tsr 鏂囦欢'); process.exit(0); }

  let PASS = 0, FAIL = 0, SKIP = 0;
  for (const tsr of tsrs) {
    const dir = path.dirname(tsr);
    const base = path.basename(tsr, '.tsr');
    const tsq = path.join(dir, base + '.tsq');
    const manifest = path.join(dir, base + '.sha256');

    console.log('---------------------------------------------------------------');
    console.log(`鏂囦欢: ${tsr}`);

    const reply = run(OPENSSL, ['ts', '-reply', '-in', tsr, '-text']);
    const status = extractStatus(reply);
    const imprint = extractImprint(reply);
    if (!imprint) { console.log('  [FAIL] 鏃犳硶瑙ｆ瀽 tsr messageImprint'); FAIL++; continue; }
    console.log(`  鐘舵€? ${status}   imprint: ${imprint.slice(0,16)}...${imprint.slice(48)}`);

    // 1) 绛惧悕灞?    if (fs.existsSync(tsq)) {
      if (fs.existsSync(CA_FILE)) {
        const v = run(OPENSSL, ['ts', '-verify', '-in', tsr, '-queryfile', tsq, '-CAfile', CA_FILE]);
        if (/Verification: OK/.test(v)) console.log('  [绛惧悕] OK  (DigiCert TSA 绛惧悕鏈夋晥)');
        else { console.log('  [绛惧悕] FAIL (openssl ts -verify 澶辫触)'); FAIL++; continue; }
      } else {
        const tsqImp = extractImprint(run(OPENSSL, ['ts', '-query', '-in', tsq, '-text']));
        if (tsqImp === imprint) { console.log('  [绛惧悕] SKIP (鏃?CA 閾撅紝tsr 涓?tsq 鍝堝笇涓€鑷?'); SKIP++; }
        else { console.log('  [绛惧悕] FAIL (tsq 鍝堝笇涓?tsr 涓嶄竴鑷?'); FAIL++; continue; }
      }
    } else {
      console.log('  [绛惧悕] SKIP (缂?.tsq 璇锋眰鏂囦欢)'); SKIP++;
    }

    // 2) 缁戝畾灞?+ 3) 鏂囦欢瀹屾暣鎬?    if (fs.existsSync(manifest)) {
      const lines = fs.readFileSync(manifest, 'utf8').split('\n').filter(Boolean);
      const hashes = lines.map(l => l.trim().split(/\s+/)[0]).filter(h => /^[0-9a-f]{64}$/i.test(h));
      if (hashes.length && hashes.includes(imprint)) console.log('  [缁戝畾] OK  (imprint 鍛戒腑 .sha256 娓呭崟鍝堝笇)');
      else if (hashes.length) { console.log('  [缁戝畾] FAIL (imprint 涓嶅湪 .sha256 娓呭崟涓?'); FAIL++; continue; }
      else console.log('  [缁戝畾] WARN (.sha256 娓呭崟鏍煎紡寮傚父)');

      // 鏂囦欢瀹屾暣鎬э細娓呭崟寮曠敤鐨勬枃浠惰嫢鏈湴瀛樺湪鍒欐牎楠?      let checked = 0, ok = 0;
      for (const l of lines) {
        const m = l.trim().match(/^[0-9a-f]{64}\s+\*?(.+)$/i);
        if (!m) continue;
        const fp = path.resolve(dir, m[1]);
        if (fs.existsSync(fp)) {
          checked++;
          if (sha256File(fp) === m[1].toLowerCase()) ok++;
          else console.log(`  [鏂囦欢] FAIL (${m[1]} sha256 涓嶅尮閰?`);
        }
      }
      if (checked) console.log(`  [鏂囦欢] ${ok === checked ? 'OK' : 'FAIL'}  (${ok}/${checked} 涓竻鍗曟枃浠舵湰鍦版牎楠岄€氳繃)`);
      else console.log('  [鏂囦欢] WARN (娓呭崟鏂囦欢涓嶅湪鏈湴锛屽睘姝ｅ父鈥斺€斿師濮嬫枃浠跺瀛樹簬澶栭儴)');
    } else if (fs.existsSync(tsq)) {
      const tsqImp = extractImprint(run(OPENSSL, ['ts', '-query', '-in', tsq, '-text']));
      if (tsqImp === imprint) console.log('  [缁戝畾] OK  (imprint 涓?.tsq 璇锋眰鍝堝笇涓€鑷?');
      else { console.log('  [缁戝畾] FAIL (imprint 涓?.tsq 涓嶄竴鑷?'); FAIL++; continue; }
    } else {
      console.log('  [缁戝畾] WARN (鏃㈡棤 .sha256 涔熸棤 .tsq)');
    }
    PASS++;
  }

  console.log('===============================================================');
  console.log(`缁撴灉: 閫氳繃 ${PASS} | 澶辫触 ${FAIL} | 璺宠繃/璀﹀憡 ${SKIP} | 鎬昏 ${tsrs.length}`);
  console.log('===============================================================');
  process.exit(FAIL === 0 ? 0 : 1);
}

main();
