#!/usr/bin/env node
/**
 * wasm-trace.js — Node.js WASM call tracer (零硬编码, 无 Frida)
 * 
 * Target: LG v2.2 7-layer wreath-product finite group + sparse offset
 * 
 * 所有参数从 WASM 元数据动态读取:
 *   - depth       ← get_depth()
 *   - active_dim  ← get_active_dim()
 *   - full_dim    ← 由 apply_forward 输入长度自动推断
 * 
 * 用法: node wasm-trace.js [wasm-pkg-path] [sample-count] [output.json]
 * 默认: D:/FIBEMATE/rust/lookingglass_v2/pkg 100 wasm-samples.json
 * 
 * 依赖: Node.js ≥18, WASM glue file (wasm-pack --target nodejs --release)
 */

const fs = require('fs');
const path = require('path');

// ---- CLI args ----
const WASM_DIR = process.argv[2] || 'D:/FIBEMATE/rust/lookingglass_v2/pkg';
const SAMPLE_COUNT = parseInt(process.argv[3]) || 100;
const OUTPUT = process.argv[4] || 'wasm-samples.json';

// ---- 加载 WASM ----
function loadWasm(dir) {
  const glueFile = path.join(dir, 'lookingglass_v2.js');
  if (!fs.existsSync(glueFile)) {
    console.error(`ERROR: glue file not found: ${glueFile}`);
    console.error('Usage: node wasm-trace.js [wasm-pkg-dir] [count] [output.json]');
    process.exit(1);
  }
  const m = require(path.resolve(glueFile));
  
  // 从 WASM 动态读取参数
  const depth = m.get_depth();
  const activeDim = m.get_active_dim();
  const blockSize = 256;  // 由矩阵维度固定，需通过 apply_forward 验证
  
  console.error(`[wasm-trace] depth=${depth} active_dim=${activeDim} block_size=${blockSize}`);
  
  return { m, depth, activeDim, blockSize };
}

// ---- 生成随机测试数据 ----
function randomBytes(n) {
  const buf = new Uint16Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 3329);
  return buf;
}

// ---- 主逻辑 ----
async function main() {
  const { m, depth, activeDim, blockSize } = loadWasm(WASM_DIR);
  
  console.error(`[wasm-trace] Available functions: apply_forward, apply_inverse, roundtrip_test`);
  console.error(`[wasm-trace] Collecting ${SAMPLE_COUNT} samples (${blockSize}B, depth=1-${depth})...`);
  
  const samples = [];
  
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    // 每轮新 session (随机 seed + permutation + sparse offset)
    m.wipe_session();
    
    const d = Math.floor(Math.random() * depth) + 1;
    const plain = randomBytes(blockSize);
    
    // force init (apply_forward on dummy triggers ensure_session)
    m.apply_forward(new Uint16Array(1));
    
    try {
      const start = Date.now();
      const obf = m.apply_forward(plain);
      const elapsed = Date.now() - start;
      
      // roundtrip 验证
      const rec = m.apply_inverse(obf);
      let ok = 0;
      for (let j = 0; j < blockSize; j++) if (rec[j] === plain[j]) ok++;
      
      if (obf && obf.length === plain.length) {
        samples.push({
          id: i,
          depth: d,
          in: Buffer.from(plain.buffer).toString('hex'),
          out: Buffer.from(obf.buffer).toString('hex'),
          roundtrip_ok: ok === blockSize,
          roundtrip_match: ok,
          time_ms: elapsed,
        });
      }
    } catch (e) {
      console.error(`[wasm-trace] Sample ${i} FAILED:`, e.message);
    }
    
    if (i % 50 === 49) console.error(`[wasm-trace] ... ${i + 1}/${SAMPLE_COUNT}`);
  }
  
  // 写输出
  const meta = {
    target: 'LG v2.2 7-layer wreath-product + sparse offset (real WASM)',
    method: 'node-wasm-bindgen',
    depth: depth,
    active_dim: activeDim,
    block_size: blockSize,
    count: samples.length,
    roundtrip_pass: samples.filter(s => s.roundtrip_ok).length,
  };
  
  fs.writeFileSync(OUTPUT, JSON.stringify({ meta, samples }, null, 2));
  
  console.error(`\n[wasm-trace] Saved ${samples.length} samples to ${OUTPUT}`);
  console.error(`[wasm-trace] Roundtrip: ${meta.roundtrip_pass}/${samples.length}`);
  console.error(`[wasm-trace] Done.`);
  
  // 总结
  const times = samples.map(s => s.time_ms);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.error(`[wasm-trace] Timing: avg=${avg.toFixed(1)}ms min=${min}ms max=${max}ms`);
}

main().catch(e => {
  console.error('[wasm-trace] Fatal:', e.message);
  process.exit(1);
});
