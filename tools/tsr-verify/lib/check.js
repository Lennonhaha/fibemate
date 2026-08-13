'use strict';
// 批量验证 + 序列连续性 + manifest 验证
const fs = require('fs');
const path = require('path');
const { verifyTsr, walk, detectAuthority } = require('./verify');

// 序列连续性检查
function checkSequenceGaps(results) {
  const nums = results
    .map(r => {
      // 只匹配 lg-XXX 或 xxx 开头的纯序号，避免把文件名里的年份/日期误当序号
      const m = /^(?:lg[-_]?)?(\d+)/i.exec(r.file);
      if (m) return parseInt(m[1], 10);
      // 退路：文件名里第一个连续数字，但排除明显的年份（≥2000）
      const m2 = /(\d+)/.exec(r.file);
      if (m2) {
        const n = parseInt(m2[1], 10);
        return n >= 2000 ? null : n;
      }
      return null;
    })
    .filter(n => n !== null)
    .sort((a, b) => a - b);

  if (nums.length === 0) return { gaps: [], min: null, max: null };

  const gaps = [];
  const MAX_GAP_EXPAND = 1000; // 防爆：差值超过 1000 不逐个展开，只记区间
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) {
      const diff = nums[i] - nums[i - 1] - 1;
      if (diff <= MAX_GAP_EXPAND) {
        for (let j = nums[i - 1] + 1; j < nums[i]; j++) gaps.push(j);
      } else {
        // 大 gap 用负数标记（表示 "区间断裂"，不展开）
        gaps.push(-diff);
      }
    }
  }
  return { gaps, min: nums[0], max: nums[nums.length - 1] };
}

// 批量验证目录下所有 .tsr
function check(targetPath) {
  const stat = fs.statSync(targetPath);
  const files = stat.isDirectory()
    ? walk(targetPath, '.tsr').sort()
    : [targetPath];

  const results = [];
  for (const file of files) {
    try {
      results.push(verifyTsr(file));
    } catch (e) {
      results.push({ file: path.basename(file, '.tsr'), valid: false, reason: e.message });
    }
  }

  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);

  const authorities = {};
  for (const r of valid) {
    const tsa = detectAuthority(r.serial);
    authorities[tsa] = (authorities[tsa] || 0) + 1;
  }

  const seq = checkSequenceGaps(results);

  return {
    total: results.length,
    valid: valid.length,
    invalid: invalid.length,
    range: valid.length > 0
      ? `${valid[0].timestamp} ~ ${valid[valid.length - 1].timestamp}`
      : 'N/A',
    authorities,
    chain: seq,
    details: results,
  };
}

// 根据 timestamp-manifest.json 批量验证
function checkManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baseDir = path.dirname(manifestPath);

  // manifest 可能是数组，或 { files: [...] }（FIBEMATE v4 实际格式），或 { entries/records: [...] }
  let entries;
  if (Array.isArray(manifest)) entries = manifest;
  else entries = manifest.files || manifest.entries || manifest.records || [];
  if (entries.length === 0) {
    throw new Error('manifest 中未找到 files/entries/records 数组');
  }

  const results = [];
  for (const entry of entries) {
    const id = entry.id || entry.name || entry.file;
    // FIBEMATE v4: { name:'lg-058.tsr', dir:'2026-07-09', sha256:'...' }
    const tsrRel = entry.tsr || entry.tsrFile || (entry.dir ? `${entry.dir}/${entry.name}` : entry.name) || `${id}.tsr`;
    const tsrPath = path.isAbsolute(tsrRel) ? tsrRel : path.join(baseDir, tsrRel);

    let r;
    if (fs.existsSync(tsrPath)) {
      r = verifyTsr(tsrPath);
    } else {
      r = { file: id, valid: false, reason: 'TSR 文件不存在: ' + tsrRel };
    }

    // 交叉验证 manifest 中的 sha256
    if (entry.sha256 && r.imprint) {
      const match = entry.sha256.toLowerCase() === r.imprint.toLowerCase();
      r.hashMatch = match;
      if (!match) { r.valid = false; r.reason = (r.reason || '') + ' sha256 不匹配'; }
    }
    r.id = id;
    results.push(r);
  }

  const valid = results.filter(r => r.valid);
  return {
    total: results.length,
    valid: valid.length,
    invalid: results.length - valid.length,
    details: results,
  };
}

module.exports = { check, checkManifest, checkSequenceGaps };
