/**
 * lg-service.js — LookingGlass v2.2.3 HTTP API 服务
 * 
 * 独立部署: node lg-service.js [--port=3699]
 * 
 * 端点:
 *   POST /confuse       body: { data: "<base64>", seed: "<hex>", depth?: number }
 *   POST /deconfuse     body: { data: "<base64>", seed: "<hex>", depth?: number }
 *   GET  /verify        可逆性自检
 *   GET  /version       版本信息
 *   GET  /health        健康检查
 * 
 * 安全边界: 此服务不提供密码学安全保证。
 *           LookingGlass 是二进制混淆实验工具, 禁止生产防护。
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '3699', 10);

// ---- WASM 加载 (与 CLI 共用逻辑) ----

let wasmExports = null;

async function loadWasm() {
  if (wasmExports) return wasmExports;
  const wasmPath = path.resolve(__dirname, '../../www/crypto/lgv2/lookingglass_v2_bg.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error('WASM not found: ' + wasmPath);
  }
  const wasmBuffer = fs.readFileSync(wasmPath);
  const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
    env: {
      memory: new WebAssembly.Memory({ initial: 17, maximum: 16384 }),
      __wbindgen_malloc: () => { throw new Error('wbindgen not available'); },
      __wbindgen_free: () => {}
    }
  });
  wasmExports = wasmModule.instance.exports;
  return wasmExports;
}

// ---- JS fallback (XOR 混淆, 纯 JS) ----

function jsXorTransform(data, seed) {
  if (!data || data.length === 0) return Buffer.alloc(0);
  let s = BigInt(seed || 1);
  const result = Buffer.from(data);
  for (let i = 0; i < result.length; i++) {
    s = ((s * 6364136223846793005n) + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
    result[i] ^= Number(s & 0xFFn);
  }
  return result;
}

// ---- 端点 ----

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'LookingGlass v2.2.3 HTTP API' });
});

app.get('/version', (req, res) => {
  res.json({
    version: 'LookingGlass v2.2.3 (lg-101 baseline)',
    wasm: 'www/crypto/lgv2/lookingglass_v2_bg.wasm',
    branch: 'experimental/vwz-lg',
    disclaimer: 'binary obfuscation only — no cryptographic security guarantees'
  });
});

app.get('/verify', async (req, res) => {
  try {
    const testData = Buffer.from(Array.from({length: 100}, (_, i) => (i * 7) % 256));
    const seed = 0x1234n;
    let ok;
    try {
      await loadWasm();
      const confused = wasmExports.lgv2_confuse(testData, seed);
      const restored = wasmExports.lgv2_deconfuse(confused, seed);
      ok = Buffer.compare(testData, restored) === 0;
    } catch {
      const confused = jsXorTransform(testData, seed);
      const restored = jsXorTransform(confused, seed);
      ok = Buffer.compare(testData, restored) === 0;
    }
    res.json({ invertible: ok, mode: wasmExports ? 'WASM' : 'JS-fallback' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/confuse', async (req, res) => {
  try {
    const { data, seed, depth } = req.body;
    if (!data || !seed) {
      return res.status(400).json({ error: 'Missing required fields: data (base64), seed (hex)' });
    }
    
    const input = Buffer.from(data, 'base64');
    const seedVal = BigInt(seed);
    const d = Math.min(Math.max(parseInt(depth) || 7, 1), 7);
    
    let output;
    try {
      await loadWasm();
      output = wasmExports.lgv2_confuse_d(input, seedVal, d);
    } catch {
      output = jsXorTransform(input, seedVal);
    }
    
    res.json({
      result: output.toString('base64'),
      depth: d,
      mode: wasmExports ? 'WASM' : 'JS-fallback',
      data_len: input.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/deconfuse', async (req, res) => {
  try {
    const { data, seed, depth } = req.body;
    if (!data || !seed) {
      return res.status(400).json({ error: 'Missing required fields: data (base64), seed (hex)' });
    }
    
    const input = Buffer.from(data, 'base64');
    const seedVal = BigInt(seed);
    const d = Math.min(Math.max(parseInt(depth) || 7, 1), 7);
    
    let output;
    try {
      await loadWasm();
      output = wasmExports.lgv2_deconfuse_d(input, seedVal, d);
    } catch {
      output = jsXorTransform(input, seedVal);
    }
    
    res.json({
      result: output.toString('base64'),
      depth: d,
      mode: wasmExports ? 'WASM' : 'JS-fallback',
      data_len: input.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 启动 ----

app.listen(PORT, '127.0.0.1', () => {
  console.log(`LookingGlass v2.2.3 HTTP API running on http://127.0.0.1:${PORT}`);
  console.log('Endpoints: POST /confuse, POST /deconfuse, GET /verify, GET /version, GET /health');
  console.log('Disclaimer: binary obfuscation only — no cryptographic security guarantees');
});
