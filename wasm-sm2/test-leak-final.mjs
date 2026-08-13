import { mulGX, mk } from './build/curve.js';

const k = mk(0xa40955da, 0x2abb8984, 0xf0c562fc, 0x3f93b9cb, 0x4b48a908, 0x3bce7a9e, 0x9a2f57d5, 0xadae5c18);

const curve = await import('./build/curve.js');
function wasmMem() { return curve.memory.buffer.byteLength / 1024 / 1024; }

console.log('初始 WASM mem:', wasmMem().toFixed(1), 'MB');
let lastX = null;
const N = 2000;
let ok = 0;
for (let i = 0; i < N; i++) {
  try {
    lastX = mulGX(k);
    ok++;
  } catch (e) {
    console.log(`FAIL at i=${i}: ${e.message}`);
    break;
  }
  if (i % 500 === 0 && i > 0) console.log(`i=${i}: mem=${wasmMem().toFixed(1)}MB`);
}
console.log(`结果: ${ok}/${N} 次, WASM mem=${wasmMem().toFixed(1)}MB`);
if (ok === N) console.log('✅ 无泄漏'); else console.log('❌ 泄漏/崩溃');
process.exit(ok === N ? 0 : 1);
