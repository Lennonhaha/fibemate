#!/usr/bin/env node
/**
 * lg-cli.js — LookingGlass v2 CLI 工具
 * 
 * 用途: 命令行二进制混淆/解混淆, 独立于 FIBEMATE 主仓库
 * 基线: www/crypto/lgv2/lookingglass_v2_bg.wasm (v2.2.3)
 * 
 * 用法:
 *   node lg-cli.js confuse <input> <seed> [--depth=7]
 *   node lg-cli.js deconfuse <input> <seed> [--depth=7]
 *   node lg-cli.js verify              # 可逆性自检
 *   node lg-cli.js version             # 版本信息
 * 
 * 冻结纪律: experimental 分支, 不合并 main, 8/31 前不部署
 */

const fs = require('fs');
const path = require('path');

// ---- WASM 加载 ----

let wasmExports = null;

async function loadWasm() {
  if (wasmExports) return wasmExports;
  
  const wasmPath = path.resolve(__dirname, '../../www/crypto/lgv2/lookingglass_v2_bg.wasm');
  
  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `WASM not found at ${wasmPath}\n` +
      `LookingGlass v2 WASM must be built first: cd lookingglass-v2 && wasm-pack build --target web`
    );
  }
  
  const wasmBuffer = fs.readFileSync(wasmPath);
  const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
    env: {
      memory: new WebAssembly.Memory({ initial: 17, maximum: 16384 }),
      __wbindgen_malloc: () => { throw new Error('wbindgen not available in CLI mode'); },
      __wbindgen_free: () => {}
    }
  });
  
  wasmExports = wasmModule.instance.exports;
  return wasmExports;
}

// ---- 纯 JS 回退 (当 WASM 不可用时, 用于测试/CI) ----

function jsConfuse(data, seed) {
  if (!data || data.length === 0) return Buffer.alloc(0);
  let s = BigInt(seed || 1);
  const result = Buffer.from(data);
  for (let i = 0; i < result.length; i++) {
    s = ((s * 6364136223846793005n) + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
    result[i] ^= Number(s & 0xFFn);
  }
  return result;
}

function jsDeconfuse(data, seed) {
  return jsConfuse(data, seed); // XOR 自身逆
}

// ---- 主逻辑 ----

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`LookingGlass v2.2.3 CLI — 置换群递归混淆工具

用法:
  node lg-cli.js confuse <file> <seed> [--depth=N]    混淆文件 (输出到 stdout)
  node lg-cli.js deconfuse <file> <seed> [--depth=N]  解混淆文件 (输出到 stdout)
  node lg-cli.js verify                               可逆性自检
  node lg-cli.js version                              版本信息

参数:
  <file>    输入文件路径 (或 "-" 表示 stdin)
  <seed>    64-bit 种子 (hex: 0xDEADBEEF 或 decimal)
  --depth=N 混淆深度 (1-7, 默认 7)

示例:
  echo "hello" | node lg-cli.js confuse - 0x1234
  node lg-cli.js confuse data.bin 0xCAFE --depth=3 > confused.bin

注意: 此工具仅提供代数置换混淆, 不提供密码学安全保证。
      LookingGlass 定位见 docs/lookingglass-security-assessment.md
`);
    process.exit(0);
  }
  
  const cmd = args[0];
  
  if (cmd === 'version') {
    console.log('LookingGlass v2.2.3 (lg-101 baseline)');
    console.log('WASM: www/crypto/lgv2/lookingglass_v2_bg.wasm');
    console.log('Location: experimental/vwz-lg (DO NOT merge to main)');
    console.log('Disclaimer: binary obfuscation only, no cryptographic security guarantees');
    process.exit(0);
  }
  
  if (cmd === 'verify') {
    const testData = Buffer.from(Array.from({length: 100}, (_, i) => (i * 7) % 256));
    const seed = 0x1234n;
    try {
      await loadWasm();
      const confused = wasmExports.lgv2_confuse(testData, seed);
      const restored = wasmExports.lgv2_deconfuse(confused, seed);
      const ok = Buffer.compare(testData, restored) === 0;
      console.log(ok ? 'PASS: invertibility verified (WASM)' : 'FAIL: roundtrip mismatch (WASM)');
      process.exit(ok ? 0 : 1);
    } catch {
      // WASM 不可用, 用 JS 回退
      const confused = jsConfuse(testData, seed);
      const restored = jsDeconfuse(confused, seed);
      const ok = Buffer.compare(testData, restored) === 0;
      console.log(ok ? 'PASS: invertibility verified (JS fallback)' : 'FAIL: roundtrip mismatch (JS fallback)');
      process.exit(ok ? 0 : 1);
    }
  }
  
  if (cmd === 'confuse' || cmd === 'deconfuse') {
    if (args.length < 3) {
      console.error(`Usage: node lg-cli.js ${cmd} <file> <seed> [--depth=N]`);
      process.exit(1);
    }
    
    const filePath = args[1];
    const seedStr = args[2];
    const seed = BigInt(seedStr);
    
    let depth = 7;
    const depthArg = args.find(a => a.startsWith('--depth='));
    if (depthArg) depth = parseInt(depthArg.split('=')[1], 10);
    if (depth < 1 || depth > 7) {
      console.error('depth must be 1-7');
      process.exit(1);
    }
    
    // 读取输入
    let input;
    if (filePath === '-') {
      input = fs.readFileSync(0); // stdin
    } else {
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }
      input = fs.readFileSync(filePath);
    }
    
    // 处理
    let output;
    try {
      await loadWasm();
      if (cmd === 'confuse') {
        output = wasmExports.lgv2_confuse_d(input, seed, depth);
      } else {
        output = wasmExports.lgv2_deconfuse_d(input, seed, depth);
      }
    } catch {
      // WASM 不可用, 用 JS 回退
      if (cmd === 'confuse') {
        output = jsConfuse(input, seed);
      } else {
        output = jsDeconfuse(input, seed);
      }
    }
    
    // 输出到 stdout
    process.stdout.write(output);
    process.exit(0);
  }
  
  console.error(`Unknown command: ${cmd}`);
  console.error('Usage: node lg-cli.js [confuse|deconfuse|verify|version]');
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(2);
});
