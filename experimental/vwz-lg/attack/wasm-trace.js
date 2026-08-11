#!/usr/bin/env node
/**
 * wasm-trace.js — 纯 Node.js WASM 调用追踪（绕过 Frida 安装）
 * 
 * Target: LG v2.2 7-layer wreath-product finite group obfuscation
 * WASM:  www/crypto/lgv2/lookingglass_v2_bg.wasm (21KB)
 * JS glue: www/crypto/lgv2/lookingglass_v2.js (11KB)
 * 
 * 用法: node wasm-trace.js
 * 产出: wasm-samples.json (映射样本数据集)
 * 
 * 绕过 Frida 的理由:
 *   服务器无 pip/frida, 且 Frida 在 Node+WASM 环境下 hook 
 *   内部 C 函数需要特殊处理。改为直接钩 JS 胶水层传入/传出。
 */

const fs = require('fs');
const path = require('path');

const WASM_PATH = '/opt/fibemate-repo/www/crypto/lgv2/lookingglass_v2_bg.wasm';
const JS_GLUE = '/opt/fibemate-repo/www/crypto/lgv2/lookingglass_v2.js';
const OUTPUT = 'wasm-samples.json';

// ---- 加载 WASM ----

async function loadWasm() {
  const wasmBuffer = fs.readFileSync(WASM_PATH);
  const env = {
    memory: new WebAssembly.Memory({ initial: 17, maximum: 16384 }),
    __wbindgen_malloc: (size) => {
      // 简易分配器 (生产环境用 proper malloc)
      return memoryPtr;
    },
    __wbindgen_free: () => {},
    __wbindgen_realloc: () => 0,
  };

  const { instance } = await WebAssembly.instantiate(wasmBuffer, { env });
  
  console.error('[wasm-trace] WASM loaded:', WASM_PATH);
  console.error('[wasm-trace] Exports:', Object.keys(instance.exports).filter(k => k.startsWith('lgv2_')).join(', '));
  
  return instance.exports;
}

// ---- 生成测试数据 ----

function randomBytes(n) {
  const buf = Buffer.alloc(n);
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

// ---- 主逻辑 ----

async function main() {
  const wasm = await loadWasm();
  
  // 检查已导出的函数
  const functions = {
    confuse: wasm.lgv2_confuse,
    deconfuse: wasm.lgv2_deconfuse,
    confuse_d: wasm.lgv2_confuse_d,
    confuse_ex: wasm.lgv2_confuse_ex,
  };
  
  console.error('[wasm-trace] Available functions:', 
    Object.entries(functions).filter(([,fn]) => fn).map(([k]) => k).join(', '));
  
  const sampleCount = parseInt(process.argv[2]) || 100;
  const blockSize = 48;
  const samples = [];
  
  console.error(`[wasm-trace] Collecting ${sampleCount} samples (${blockSize}B each)...`);
  
  for (let i = 0; i < sampleCount; i++) {
    const seed = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    const depth = Math.floor(Math.random() * 7) + 1;
    const plain = randomBytes(blockSize);
    
    try {
      const start = Date.now();
      const obf = functions.confuse_d(plain, seed, depth);
      const elapsed = Date.now() - start;
      
      if (obf && obf.length === plain.length) {
        samples.push({
          id: i,
          seed: '0x' + seed.toString(16).padStart(16, '0'),
          depth: depth,
          in: plain.toString('hex'),
          out: obf.toString('hex'),
          time_us: elapsed * 1000,
        });
      }
    } catch (e) {
      console.error(`[wasm-trace] Sample ${i} FAILED:`, e.message);
    }
    
    if (i % 50 === 49) console.error(`[wasm-trace] ... ${i + 1}/${sampleCount}`);
  }
  
  // 写输出
  fs.writeFileSync(OUTPUT, JSON.stringify({
    meta: {
      target: 'LG v2.2 7-layer wreath-product finite group',
      method: 'node-wasm-direct',
      wasm: WASM_PATH,
      count: samples.length,
      block_size: blockSize,
    },
    samples: samples,
  }, null, 2));
  
  console.error(`[wasm-trace] Saved ${samples.length} samples to ${OUTPUT}`);
  console.error(`[wasm-trace] Done.`);
}
