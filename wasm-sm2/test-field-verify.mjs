// field.ts 层验证（BigInt oracle）
// 注意：Array<u64> 在 JS 侧元素必须用 BigInt
import { montMulP, feAddP, feSubP, toMontP, fromMontP } from './build/field.js';

const P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFFn;
const M32 = 0xFFFFFFFFn;

function arrToBig(a) {
  let r = 0n;
  for (let i = 7; i >= 0; i--) r = (r << 32n) | BigInt(a[i]);
  return r;
}
function bigToArr(b) {
  const a = new Array(8);
  for (let i = 0; i < 8; i++) { a[i] = BigInt(b & M32); b >>= 32n; }
  return a;
}

function rnd() {
  let b = 0n;
  for (let i = 0; i < 8; i++) b = (b << 32n) | BigInt(Math.floor(Math.random() * 0x100000000));
  return b % P;
}

let pass = 0, fail = 0;

// 1. montMulP: (aR * bR) * R^-1 = a*b*R
for (let t = 0; t < 1000; t++) {
  const a = rnd(), b = rnd();
  const cM = montMulP(toMontP(bigToArr(a)), toMontP(bigToArr(b)));
  const c = arrToBig(fromMontP(cM));
  const want = (a * b) % P;
  if (c === want) pass++; else { fail++; if (fail <= 3) console.log('montMulP FAIL'); }
}

// 2. feAddP
for (let t = 0; t < 1000; t++) {
  const a = rnd(), b = rnd();
  const c = arrToBig(feAddP(bigToArr(a), bigToArr(b)));
  const want = (a + b) % P;
  if (c === want) pass++; else { fail++; if (fail <= 3) console.log('feAddP FAIL'); }
}

// 3. feSubP
for (let t = 0; t < 1000; t++) {
  const a = rnd(), b = rnd();
  const c = arrToBig(feSubP(bigToArr(a), bigToArr(b)));
  const want = (a - b + P) % P;
  if (c === want) pass++; else { fail++; if (fail <= 3) console.log('feSubP FAIL'); }
}

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
