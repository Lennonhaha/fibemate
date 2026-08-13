'use strict';
// 核心 TSR 验证（复用 FIBEMATE scripts/verify-tsr.js 的解析逻辑）
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OPENSSL = process.env.OPENSSL_BIN || 'openssl';

function runOpenssl(args) {
  try {
    return execFileSync(OPENSSL, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
      maxBuffer: 1024 * 1024, // 1MB 上限，防止单文件异常输出撑爆内存
    });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

function hasOpenssl() {
  try { execFileSync(OPENSSL, ['version'], { stdio: 'pipe' }); return true; }
  catch { return false; }
}

// 解析 openssl ts -reply -text 输出的 messageImprint（十六进制）
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

function extractSerial(text) {
  const m = text.match(/Serial number:\s*(0x[0-9A-Fa-f]+)/);
  return m ? m[1] : null;
}

function extractTimestamp(text) {
  const m = text.match(/Time stamp:\s*(.+)/);
  return m ? m[1].trim() : null;
}

function extractHashAlgo(text) {
  const m = text.match(/Hash Algorithm:\s*(\S+)/);
  return m ? m[1] : null;
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

// 验证单个 TSR 文件
function verifyTsr(filePath) {
  const reply = runOpenssl(['ts', '-reply', '-in', filePath, '-text']);
  const status = extractStatus(reply);
  const imprint = extractImprint(reply);

  const result = {
    file: path.basename(filePath, '.tsr'),
    status,
    imprint,
    serial: extractSerial(reply),
    timestamp: extractTimestamp(reply),
    algorithm: extractHashAlgo(reply),
  };

  if (!imprint) {
    return { ...result, valid: false, reason: '无法解析 TSR messageImprint（文件可能损坏）' };
  }

  // 状态必须是 Granted
  if (status !== 'Granted' && status !== 'granted') {
    return { ...result, valid: false, reason: 'Status: ' + status };
  }

  // 关联 .sha256 清单：TSR 时间戳的对象是 .sha256 文件本身
  // imprint = sha256(.sha256 文件内容)，而非清单里列出的源文件哈希
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, '.tsr');
  const manifestFile = path.join(dir, base + '.sha256');

  if (fs.existsSync(manifestFile)) {
    const manifestContent = fs.readFileSync(manifestFile);
    const manifestHash = crypto.createHash('sha256').update(manifestContent).digest('hex');
    if (manifestHash !== imprint) {
      return { ...result, valid: false, reason: '.sha256 清单文件哈希与 imprint 不一致（清单被篡改或 TSR 对错对象）' };
    }
    result.manifestSha256 = manifestHash;

    // 进一步：清单里列出的源文件若本地存在，校验其哈希
    const lines = manifestContent.toString('utf8').split('\n').filter(Boolean);
    let checked = 0, ok = 0, mismatch = null;
    for (const l of lines) {
      const m = l.trim().match(/^[0-9a-f]{64}\s+\*?(.+)$/i);
      if (!m) continue;
      const fp = path.resolve(dir, m[1]);
      if (fs.existsSync(fp)) {
        checked++;
        const actual = sha256File(fp);
        if (actual === m[1].toLowerCase()) ok++;
        else mismatch = m[1];
      }
    }
    if (mismatch) return { ...result, valid: false, reason: '源文件哈希不匹配: ' + mismatch };
    result.filesChecked = checked;
    result.filesOk = ok;
  }

  return { ...result, valid: true };
}

// 从 serial 判断 TSA 机构
function detectAuthority(serial) {
  if (!serial) return 'unknown';
  return serial.toLowerCase().startsWith('0xd') ? 'DigiCert' : 'FreeTSA';
}

module.exports = { verifyTsr, walk, hasOpenssl, extractImprint, extractStatus, detectAuthority, sha256File };
