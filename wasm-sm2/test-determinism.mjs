// 确定性验证：同一输入重复签名/验签，结果必须完全一致（检测未初始化内存）
import { mulGX, mk } from './build/curve.js';
import { sm2SignCore } from './build/sm2.js';

const MASK32 = 0xFFFFFFFFn;
function bi2limbs(x) { const l = []; for (let i = 0; i < 8; i++) { l.push(Number(x & MASK32)); x >>= 32n; } return l; }
function limbs2bi(arr) { let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 32n) | BigInt(arr[i]); return x; }

// 固定输入
const dA = 0xd73801ed4ccd881066d54015acce1bd01a037f31b06e5786b09fcab2e56c0719n;
const eHash = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn % 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123n;
const k = 0xa40955da2abb8984f0c562fc3f93b9cb4b48a9083bce7a9e9a2f57d5adae5c18n;

// 跑 3 轮，对比结果
const results = [];
for (let round = 0; round < 3; round++) {
  const out = sm2SignCore(mk(...bi2limbs(dA)), mk(...bi2limbs(eHash)), mk(...bi2limbs(k)));
  const r = limbs2bi(out.slice(0, 8));
  const s = limbs2bi(out.slice(8, 16));
  results.push({ r, s });
}

let deterministic = true;
for (let i = 1; i < results.length; i++) {
  if (results[i].r !== results[0].r || results[i].s !== results[0].s) {
    deterministic = false;
    console.log(`第 ${i} 轮结果不一致！`);
  }
}

if (deterministic) {
  console.log('✅ 确定性验证通过：3 轮签名结果完全一致');
  console.log('  r =', results[0].r.toString(16).padStart(64, '0'));
  console.log('  s =', results[0].s.toString(16).padStart(64, '0'));
} else {
  console.log('❌ 确定性验证失败：存在未初始化内存/非确定性');
  process.exit(1);
}
