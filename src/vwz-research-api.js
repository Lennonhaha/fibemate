// SPDX-License-Identifier: GPL-3.0-only
'use strict';

// VWZ 研究线 API — 仅 /research/* 命名空间，不接入生产线
const { Router } = require('express');
const path = require('path');
const fs = require('fs');

const router = Router();

// ── WASM 懒加载 ──────────────────────────────────────────────
let vwz        = null;
let vwzReady   = false;
let loadError  = null;
let lastPk     = null;  // 最近一次 keygen 产生的 pk bytes
let lastK      = 8;

function initVwz() {
  if (vwz) return vwz;
  try {
    const modPath = path.join(__dirname, '..', 'www', 'crypto', 'vwz-node', 'vwz_signature.js');
    if (!fs.existsSync(modPath)) {
      loadError = 'vwz-node JS not found at ' + modPath;
      return null;
    }
    vwz = require(modPath);
    vwz.init();
    vwzReady = true;
    console.log('[VWZ-Research] WASM loaded OK');
    return vwz;
  } catch (e) {
    loadError = e.message;
    console.error('[VWZ-Research] load failed:', e.message);
    return null;
  }
}


// ── IP 访问控制（仅内网/本地） ──────────────────────────────────
router.use((req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' ||
      ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('192.168.')) {
    return next();
  }
  res.status(403).json({ error: 'research endpoints are internal-only', tier: 'research' });
});

// ── 状态端点 ─────────────────────────────────────────────────
router.get('/status', (_req, res) => {
  const m = vwzReady ? vwz : initVwz();
  res.json({
    module: 'VWZ Vandermonde-Wang-Zhang',
    tier:  'research',
    loaded: vwzReady,
    error:  loadError,
    defaultK: lastK,
    endpoints: {
      keygen: 'POST /research/vwz/keygen  { k?: 2|4|8|16|32 }',
      sign:   'POST /research/vwz/sign     { msg: "hex" }',
      verify: 'POST /research/vwz/verify   { pk: "hex", msg: "hex", sig: "hex" }',
      status: 'GET  /research/vwz/status'
    },
    note: '研究线 · 默认关闭 · 仅限内网 · 不接入生产加密路径'
  });
});

// ── 密钥生成 ─────────────────────────────────────────────────
router.post('/keygen', (req, res) => {
  const m = vwzReady ? vwz : initVwz();
  if (!m) return res.status(503).json({ error: 'VWZ WASM unavailable', detail: loadError });

  const k = parseInt(req.body?.k) || 8;
  if (![2, 4, 8, 16, 32].includes(k)) {
    return res.status(400).json({ error: 'k must be one of 2,4,8,16,32' });
  }

  try {
    const kp = m.keygen(k);
    const pk = m.serialize_public_key(kp.public_key());
    lastPk = Array.from(pk);
    lastK  = k;

    // 不序列化 sk bytes 做缓存——研究线无需持久化密钥
    res.json({
      k,
      public_key_hex:  Buffer.from(pk).toString('hex'),
      public_key_len:  pk.length,
      sig_len_est:     4 * (k + 1),
      note: 'sk held in WASM memory only — no persistence'
    });
  } catch (e) {
    res.status(500).json({ error: 'keygen failed', detail: e.message });
  }
});

// ── 签名 ──────────────────────────────────────────────────────
router.post('/sign', (req, res) => {
  const m = vwzReady ? vwz : initVwz();
  if (!m) return res.status(503).json({ error: 'VWZ WASM unavailable', detail: loadError });

  const msgHex = req.body?.msg;
  if (!msgHex || !/^[0-9a-fA-F]+$/.test(msgHex)) {
    return res.status(400).json({ error: 'msg is required as hex string' });
  }

  try {
    // 每次签名生成新 kp（研究线模式——不暴露 sk bytes 越过 API 边界）
    const k  = parseInt(req.body?.k) || lastK || 8;
    const kp = m.keygen(k);
    const msg = Uint8Array.from(Buffer.from(msgHex, 'hex'));
    const sig = m.sign(kp.secret_key(), msg);
    const sigBytes = m.serialize_signature(sig);
    const pkBytes   = m.serialize_public_key(kp.public_key());

    res.json({
      k,
      public_key_hex: Buffer.from(pkBytes).toString('hex'),
      signature_hex:  Buffer.from(sigBytes).toString('hex'),
      sig_len:        sigBytes.length,
      verified:       m.verify(kp.public_key(), msg, sig)
    });
  } catch (e) {
    res.status(500).json({ error: 'sign failed', detail: e.message });
  }
});

// ── 验签 ──────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const m = vwzReady ? vwz : initVwz();
  if (!m) return res.status(503).json({ error: 'VWZ WASM unavailable', detail: loadError });

  const { pk, msg, sig } = req.body || {};
  if (!pk || !msg || !sig) {
    return res.status(400).json({ error: 'pk, msg, sig are required (hex strings)' });
  }

  try {
    const pkObj  = m.deserialize_public_key(Uint8Array.from(Buffer.from(pk, 'hex')));
    const sigObj = m.deserialize_signature(Uint8Array.from(Buffer.from(sig, 'hex')));
    const msgBuf = Uint8Array.from(Buffer.from(msg, 'hex'));
    const ok = m.verify(pkObj, msgBuf, sigObj);
    res.json({ verified: ok });
  } catch (e) {
    res.status(500).json({ error: 'verify failed', detail: e.message });
  }
});

module.exports = router;
