// FIBEMATE 压测脚本 - Stress Test Suite
// No external deps, uses Node.js built-in http only
const http = require('http');

const BASE = 'http://127.0.0.1:3001';
const REG = 'http://127.0.0.1:3082';
const RESULTS = [];

function fetch(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const req = http.get(url, {timeout}, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({status: res.statusCode, ms: Date.now() - t0, body: data}));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
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
      return res;
    });
}

async function main() {
  console.log('\n=== FIBEMATE 压力测试 ===');
  console.log('Server: ' + BASE + ' | Date: ' + new Date().toISOString());

  // 1. 健康检查
  console.log('\n--- 1/5 健康检查 ---');
  await parallel(BASE + '/health', 100, 'GET /health');

  // 2. ML-KEM 单轮
  console.log('\n--- 2/5 ML-KEM 基准 ---');
  await parallel(BASE + '/api/mlkem/test', 50, 'GET /api/mlkem/test');

  // 3. ML-KEM 批量（服务器内部 100 轮）
  console.log('\n--- 3/5 ML-KEM 批量（100轮/请求） ---');
  const batchStart = Date.now();
  const batchResult = await fetch(BASE + '/api/mlkem/test-batch?count=100');
  const batchMs = Date.now() - batchStart;
  if (batchResult.status === 200) {
    const j = JSON.parse(batchResult.body);
    console.log('  Batch 100: ' + batchResult.status + ', ' + j.count + ' rounds, ' + j.totalMs + 'ms server, ' + batchMs + 'ms wall');
    RESULTS.push({label: 'GET /api/mlkem/test-batch?count=100', count: j.count, totalMs: j.totalMs, wallMs: batchMs, ok: 1, fail: 0});
  }

  // 4. 批量 PureJS
  console.log('\n--- 4/5 ML-KEM PureJS 批量（100轮/请求） ---');
  const pjsStart = Date.now();
  const pjsResult = await fetch(BASE + '/api/mlkem/test-batch-purejs?count=100');
  const pjsMs = Date.now() - pjsStart;
  if (pjsResult.status === 200) {
    const j = JSON.parse(pjsResult.body);
    console.log('  PureJS Batch 100: ' + pjsResult.status + ', ' + j.count + ' rounds, ' + j.totalMs + 'ms server, ' + pjsMs + 'ms wall');
    RESULTS.push({label: 'GET /api/mlkem/test-batch-purejs?count=100', count: j.count, totalMs: j.totalMs, wallMs: pjsMs, ok: 1, fail: 0});
  }

  // 5. 高并发健康检查
  console.log('\n--- 5/5 高并发压测 ---');
  await parallel(BASE + '/health', 500, 'GET /health x500 concurrent');

  // 6. 注册服务器健康检查
  console.log('\n--- 注册服务器 ---');
  await parallel(REG + '/health', 50, 'GET reg-server /health');

  // 7. API 健康检查
  console.log('\n--- API 健康 ---');
  await parallel(BASE + '/api/health', 100, 'GET /api/health');

  // 汇总
  console.log('\n=== 压测结果汇总 ===');
  for (const r of RESULTS) {
    console.log('  ' + r.label + ' | total=' + r.count + ' | ok=' + r.ok + ' | fail=' + (r.fail ?? 0) + ' | avg=' + (r.avgMs ?? (r.totalMs/r.count).toFixed(1)) + 'ms | p50=' + (r.p50 ?? '-') + 'ms | p90=' + (r.p90 ?? '-') + 'ms | wall=' + (r.totalMs ?? r.wallMs) + 'ms');
  }
}

main().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
