// SPDX-License-Identifier: GPL-3.0-only
// FIBEMATE 压测脚本 v2 — Extended: B/F/W
// ==========================================
// B: Basic (health, mlkem)
// F: Full hybrid handshake E2E (SM2 + ML-KEM-768 C-2 path)
// W: WASM frontend benchmark (Node.js WASM simulation)
// No external deps — Node.js built-in http + crypto + fs only
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3001';
const REG = 'http://127.0.0.1:3080';
const RESULTS = [];

// ===================== Utility =====================
function fetch(url, timeout = 30000, headers = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const req = http.request(url, {timeout, headers}, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({status: res.statusCode, ms: Date.now() - t0, body: data}));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function post(url, body, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const u = new URL(url);
    const buf = JSON.stringify(body);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(buf)},
      timeout
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({status: res.statusCode, ms: Date.now() - t0, body: data}));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end(buf);
  });
}

function parallel(url, count, label) {
  const start = Date.now();
  return Promise.all(Array.from({length: count}, () => fetch(url)))
    .then(res => {
      const totalMs = Date.now() - start;
      const ok = res.filter(r => r.status === 200).length;
      const fail = res.filter(r => r.status !== 200).length;
      const err = res.filter(r => r.status >= 500).length;
      const ms = res.map(r => r.ms);
      ms.sort((a,b) => a-b);
      const p50 = ms[Math.floor(ms.length*0.5)];
      const p90 = ms[Math.floor(ms.length*0.9)];
      const p99 = ms[Math.floor(ms.length*0.99)];
      const max = ms[ms.length-1];
      RESULTS.push({label, count, ok, fail, err, totalMs, avgMs: (totalMs/count).toFixed(1), p50, p90, p99, max});
      console.log('  ' + label + ': ' + ok + '/' + count + ' OK, ' + fail + ' fail, ' + err + ' 5xx | p50=' + p50 + 'ms p90=' + p90 + 'ms total=' + totalMs + 'ms');
      return {ok, fail, err, p50, p95: ms[Math.floor(ms.length*0.95)], p99, max};
    });
}

function log(label, data) {
  console.log('  ' + label + ': ' + JSON.stringify(data));
  RESULTS.push({label, ...data, count: data.count ?? 1, ok: 1, fail: 0});
}

// ===================== B: Basic Section =====================
async function sectionBasic() {
  console.log('\n=== B: 基础性能 ===');
  
  console.log('\n--- B1: 健康检查 ---');
  const healthRes = await parallel(BASE + '/health', 100, 'B1: GET /health');
  
  console.log('\n--- B2: 单轮 ML-KEM (keygen+encaps+decaps) ---');
  const mlkemRes = await parallel(BASE + '/api/mlkem/test', 50, 'B2: ML-KEM single');
  
  console.log('\n--- B3: ML-KEM 批量原生 (100轮) ---');
  // 2026-09-02: batch-test token via header (query-string token removed for security)
  const BATCH_TOKEN = process.env.BATCH_TEST_TOKEN || '';
  const batchHeaders = BATCH_TOKEN ? { 'x-batch-test-token': BATCH_TOKEN } : {};
  const b3 = await fetch(BASE + '/api/mlkem/test-batch?count=100', 30000, batchHeaders);
  if (b3.status === 200) {
    const j = JSON.parse(b3.body);
    log('B3: ML-KEM native batch 100', {count: j.count, totalMs: j.totalMs, avgMsPerRound: (j.totalMs/j.count).toFixed(2), wallMs: b3.ms, throughput: Math.round(j.count/j.totalMs*1000) + ' rps'});
  }
  
  console.log('\n--- B4: ML-KEM PureJS 批量 (100轮) ---');
  const b4 = await fetch(BASE + '/api/mlkem/test-batch-purejs?count=100', 30000, batchHeaders);
  if (b4.status === 200) {
    const j = JSON.parse(b4.body);
    log('B4: ML-KEM purejs batch 100', {count: j.count, totalMs: j.totalMs, avgMsPerRound: (j.totalMs/j.count).toFixed(2), wallMs: b4.ms, throughput: Math.round(j.count/j.totalMs*1000) + ' rps'});
  }
  
  console.log('\n--- B5: 并发 500 /health ---');
  const concurrencyRes = await parallel(BASE + '/health', 500, 'B5: concurrency x500');
  
  console.log('\n--- B6: 并发 200 /api/health ---');
  await parallel(BASE + '/api/health', 200, 'B6: api health x200');
  
  return {healthRes, mlkemRes, concurrencyRes};
}

// ===================== F: Full Hybrid Handshake E2E =====================
async function sectionHybrid(count) {
  console.log('\n=== F: 混合握手 E2E (C-2: SM2 + ML-KEM-768) ===');
  
  // Test single handshake first
  console.log('\n--- F1: 单次混合握手 ---');
  const t0 = Date.now();
  const initRes = await fetch(BASE + '/api/pqc-hybrid/init');
  const initData = JSON.parse(initRes.body);
  
  // Client simulates: ML-KEM encaps + SM2 ECDH
  // Since we don't have the native addon client-side, use the server's own
  const finalizeRes = await post(BASE + '/api/pqc-hybrid/finalize', {
    sessionId: initData.sessionId,
    clientSm2PubHex: initData.sm2PublicKey,
    mlkemCiphertext: Buffer.alloc(1088).toString('hex') // dummy CT
  });
  const singleMs = Date.now() - t0;
  log('F1: single hybrid handshake', {status: initRes.status + ',' + finalizeRes.status, wallMs: singleMs, method: 'GET init + POST finalize'});

  // Test concurrency: handshake with dummy packets
  console.log('\n--- F2: 并发混合握手 (' + count + 'x) ---');
  const start = Date.now();
  const results = await Promise.all(Array.from({length: count}, async () => {
    const ir = await fetch(BASE + '/api/pqc-hybrid/init');
    if (ir.status !== 200) return {ok: false, ms: ir.ms};
    const d = JSON.parse(ir.body);
    const fr = await post(BASE + '/api/pqc-hybrid/finalize', {
      sessionId: d.sessionId,
      clientSm2PubHex: d.sm2PublicKey,
      mlkemCiphertext: d.mlkemPublicKey.substring(0, 1088)
    });
    return {ok: fr.status === 200, ms: fr.ms};
  }));
  const totalMs = Date.now() - start;
  const ok = results.filter(r => r.ok).length;
  const fail = count - ok;
  const ms = results.map(r => r.ms).sort((a,b) => a-b);
  log('F2: concurrent hybrid', {
    count, ok, fail,
    totalMs,
    avgMs: (totalMs/count).toFixed(1),
    p50: ms[Math.floor(ms.length*0.5)],
    p90: ms[Math.floor(ms.length*0.9)],
    p99: ms[Math.floor(ms.length*0.99)],
    throughput: Math.round(count/totalMs*1000) + ' hs/sec'
  });

  // Dummy: load test the status endpoint
  console.log('\n--- F3: 混合握手状态查询 (100x) ---');
  await parallel(BASE + '/api/pqc-hybrid/status', 100, 'F3: hybrid status x100');
}

// ===================== W: WASM Frontend Benchmark =====================
async function sectionWASM() {
  console.log('\n=== W: WASM 模块基准 ===');
  
  // Try loading each WASM module from known paths
  const wasmPaths = [
    {name: 'ML-KEM WASM', dir: '/opt/fibemate-full/www/crypto/wasm/', file: 'mlkem_ct_wasm_bg.wasm'},
    {name: 'fibemate_pq_wasm', dir: '/opt/fibemate-full/www/crypto/wasm/', file: 'fibemate_pq_wasm_bg.wasm'},
    {name: 'LG v2.2 WASM', dir: '/opt/fibemate-full/www/crypto/lgv2/', file: 'lookingglass_v2_bg.wasm'},
    {name: 'VWZ WASM', dir: '/opt/fibemate-full/www/crypto/vwz/', file: 'vwz_signature_bg.wasm'},
  ];
  
  console.log('\n--- W1: WASM 文件大小与可用性 ---');
  for (const wp of wasmPaths) {
    try {
      const fullPath = wp.dir + wp.file;
      const stats = fs.statSync(fullPath);
      log('W1: ' + wp.name, {file: wp.file, sizeBytes: stats.size, sizeKB: (stats.size/1024).toFixed(1)});
    } catch (e) {
      log('W1: ' + wp.name, {file: wp.file, error: e.code});
    }
  }
  
  // WASM instantiation benchmark (Node.js runtime, with imports={} for standalone modules)
  console.log('\n--- W2: WASM 实例化性能 (Node.js) ---');
  for (const wp of wasmPaths) {
    const fullPath = wp.dir + wp.file;
    try {
      const buf = fs.readFileSync(fullPath);
      
      // Try with empty imports first, then with wasi_snapshot_preview1
      let inst;
      let compileMs;
      try {
        const t0 = Date.now();
        const mod = new WebAssembly.Module(buf);
        inst = new WebAssembly.Instance(mod, {});
        compileMs = Date.now() - t0;
      } catch (e) {
        // Some WASM modules need wasi_snapshot_preview1
        const t0 = Date.now();
        const mod = new WebAssembly.Module(buf);
        inst = new WebAssembly.Instance(mod, {
          wasi_snapshot_preview1: { fd_write: () => 0, fd_close: () => 0 }
        });
        compileMs = Date.now() - t0;
      }
      
      // Multiple instantiation benchmark
      const n = 50;
      const t1 = Date.now();
      for (let i = 0; i < n; i++) {
        const m = new WebAssembly.Module(buf);
        try {
          new WebAssembly.Instance(m, {});
        } catch (_) {
          new WebAssembly.Instance(m, {
            wasi_snapshot_preview1: { fd_write: () => 0, fd_close: () => 0 }
          });
        }
      }
      const batchMs = Date.now() - t1;
      
      log('W2: ' + wp.name, {
        file: wp.file,
        sizeKB: (buf.length/1024).toFixed(1),
        compileOnceMs: compileMs,
        instantiate50AvgMs: (batchMs/n).toFixed(2),
        exports: Object.keys(inst.exports).length > 0 ? Object.keys(inst.exports).slice(0, 8).join(',') : '(none)'
      });
    } catch (e) {
      log('W2: ' + wp.name, {file: wp.file, error: e.message.substring(0, 80)});
    }
  }
}

// ===================== R: Registration Server =====================
async function sectionReg() {
  console.log('\n=== R: 注册服务器 ===');
  
  console.log('\n--- R1: reg-server 连接测试 ---');
  const t0 = Date.now();
  try {
    const r1 = await fetch(REG + '/', 5000);
    log('R1: reg-server root', {status: r1.status, bytes: r1.body.length, ms: r1.ms});
  } catch (e) {
    log('R1: reg-server root', {error: e.message});
  }
}

// ===================== Main =====================
async function main() {
  console.log('\n========== FIBEMATE Stress Test v2 ==========');
  console.log('Server: ' + BASE + ' | Date: ' + new Date().toISOString());
  
  await sectionBasic();
  await sectionHybrid(20);
  await sectionWASM();
  await sectionReg();
  
  // Final summary
  console.log('\n========== 压测结果汇总 ==========');
  console.log('');
  const table = RESULTS.map(r => ({
    label: (r.label || '').substring(0, 40),
    total: r.count ?? '-',
    ok: r.ok ?? '-',
    fail: r.fail ?? '-',
    avgMs: r.avgMs ?? (typeof r.totalMs === 'number' ? (r.totalMs/(r.count || 1)).toFixed(1) : '-'),
    p50: r.p50 ?? '-',
    p90: r.p90 ?? '-',
    p99: r.p99 ?? '-',
    throughput: r.throughput ?? '-'
  }));
  console.table(table);
  
  console.log('\n✅ 压测完成 | Results: ' + RESULTS.length + ' metrics');
}

main().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
