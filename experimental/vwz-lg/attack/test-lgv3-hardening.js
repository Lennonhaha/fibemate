/**
 * test-lgv3-hardening.js — LG v2.3 Stage-3 加固落地后的真实 WASM 验证
 *
 * 覆盖:
 *   1) 全部混淆变体 roundtrip（confuse / confuse_d / confuse_ex / confuse_mix /
 *      confuse_full(KEM) / pipeline obfuscate）
 *   2) 单字节扰动扩散到近全块（σ 定位攻击失效前提）
 *   3) 多种子/会话/depth 组合下的扩散达标
 *
 * 用法: node test-lgv3-hardening.js [wasm-pkg-path]
 * 默认: ../lg-v2.3/pkg/lgv2_3.js
 */
const path = require('path');

const WASM_PKG = process.argv[2] || path.resolve(__dirname, '../lg-v2.3/pkg/lgv2_3.js');
const m = require(WASM_PKG);

const N = 64;
const SEED = BigInt('0x1234');
const SK = BigInt('0xDEAD');
const DEPTH = 7;
const SS = new Uint8Array(32).fill(0x42);

function eq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sample(n) {
  const d = new Uint8Array(n);
  for (let i = 0; i < n; i++) d[i] = (i * 7) & 0xff;
  return d;
}

function perturbMap(fn, N) {
  const base = fn(new Uint8Array(N));
  const counts = [];
  for (let i = 0; i < N; i++) {
    const inp = new Uint8Array(N);
    inp[i] ^= 1;
    const out = fn(inp);
    let c = 0;
    for (let j = 0; j < N; j++) if (out[j] !== base[j]) c++;
    counts.push(c);
  }
  return counts;
}

let ok = true;
const variants = {
  'lgv2_confuse': (d) => m.lgv2_confuse(d, SEED),
  'lgv2_confuse_d': (d) => m.lgv2_confuse_d(d, SEED, DEPTH),
  'lgv2_confuse_ex': (d) => m.lgv2_confuse_ex(d, SEED, SK, DEPTH),
  'lgv3_confuse_mix': (d) => m.lgv3_confuse_mix(d, SEED, SK, DEPTH),
  'lgv2_confuse_full': (d) => m.lgv2_confuse_full(d, SEED, SK, SS, DEPTH),
  'lgv3_pipeline_obfuscate': (d) => m.lgv3_pipeline_obfuscate(d, SEED, SK, DEPTH),
};

console.log(`[test-lgv3-hardening] WASM: ${WASM_PKG}`);
console.log(`N=${N} seed=0x1234 sk=0xDEAD depth=${DEPTH}`);
console.log('='.repeat(72));

// 1) roundtrip 全部变体
for (const [name, fwd] of Object.entries(variants)) {
  const data = sample(N);
  const c = fwd(data);
  let r;
  switch (name) {
    case 'lgv2_confuse': r = m.lgv2_deconfuse(c, SEED); break;
    case 'lgv2_confuse_d': r = m.lgv2_deconfuse_d(c, SEED, DEPTH); break;
    case 'lgv2_confuse_ex': r = m.lgv2_deconfuse_ex(c, SEED, SK, DEPTH); break;
    case 'lgv3_confuse_mix': r = m.lgv3_deconfuse_mix(c, SEED, SK, DEPTH); break;
    case 'lgv2_confuse_full': r = m.lgv2_deconfuse_full(c, SEED, SK, SS, DEPTH); break;
    case 'lgv3_pipeline_obfuscate': r = m.lgv3_pipeline_deobfuscate(c, SEED, SK, DEPTH); break;
  }
  const pass = eq(r, data);
  ok &= pass;
  console.log(`roundtrip ${name}: ${pass ? 'PASS' : 'FAIL'}`);
}

// 2) 扩散：单字节扰动近全块
for (const [name, fwd] of Object.entries(variants)) {
  const counts = perturbMap(fwd, N);
  const mn = Math.min(...counts);
  const pass = mn >= N / 2;
  ok &= pass;
  console.log(`扩散 ${name}: min=${mn}/${N} ${pass ? 'PASS' : 'FAIL'}`);
}

// 3) 无 1 字节依赖
for (const [name, fwd] of Object.entries(variants)) {
  const counts = perturbMap(fwd, N);
  if (counts.includes(1)) {
    ok = false;
    console.log(`[FAIL] ${name}: 存在恰好 1 字节依赖，σ 定位仍可能成功`);
  } else {
    console.log(`[PASS] ${name}: 无 1 字节依赖 => σ 定位失败`);
  }
}

// 4) 多种子/会话/depth 组合
for (const [s, k, d] of [
  [BigInt('0xDEADBEEF'), BigInt('0xBEEF'), 3],
  [BigInt('0x1'), BigInt('0xCAFE'), 1],
  [BigInt('42'), BigInt('7'), 5],
]) {
  const fwd = (inp) => m.lgv3_pipeline_obfuscate(inp, s, k, d);
  const counts = perturbMap(fwd, N);
  const mn = Math.min(...counts);
  const pass = mn >= N / 2;
  ok &= pass;
  console.log(`pipeline seed=${s.toString(16)} sk=${k.toString(16)} d=${d}: min=${mn}/${N} ${pass ? 'PASS' : 'FAIL'}`);
}

console.log('='.repeat(72));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
