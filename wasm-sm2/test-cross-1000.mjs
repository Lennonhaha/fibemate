// 随机标量乘交叉验证：WASM mulGX/mulGY vs BigInt 参考（1000 组）
import { mulGX, mulGY, mk } from './build/curve.js';

const P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFFn;
const N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123n;
const A = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFCn;
const GX = 0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7n;
const GY = 0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0n;
const MASK32 = 0xFFFFFFFFn;

function bi2limbs(x) { const l = []; for (let i = 0; i < 8; i++) { l.push(Number(x & MASK32)); x >>= 32n; } return l; }
function limbs2bi(arr) { let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 32n) | BigInt(arr[i]); return x; }
function mod(a, m) { const r = a % m; return r < 0n ? r + m : r; }
function inv(a, m) { a = mod(a, m); let t = 0n, newt = 1n, r = m, newr = a; while (newr !== 0n) { const q = r / newr; const tn = t - q * newt; t = newt; newt = tn; const rn = r - q * newr; r = newr; newr = rn; } if (t < 0n) t += m; return t; }
function pointAdd(P1, P2) {
  if (P1 === null) return P2; if (P2 === null) return P1;
  const x1 = P1[0], y1 = P1[1], x2 = P2[0], y2 = P2[1];
  if (x1 === x2 && (y1 + y2) % P === 0n) return null;
  let lam;
  if (x1 === x2 && y1 === y2) lam = mod((3n * x1 * x1 + A) * inv(2n * y1, P), P);
  else lam = mod((y2 - y1) * inv(x2 - x1, P), P);
  const x3 = mod(lam * lam - x1 - x2, P);
  const y3 = mod(lam * (x1 - x3) - y1, P);
  return [x3, y3];
}
function pointMul(k, Pnt) { let r = null, a = Pnt; while (k > 0n) { if (k & 1n) r = pointAdd(r, a); a = pointAdd(a, a); k >>= 1n; } return r; }

let fails = 0;
const N_TEST = 1000;
const t0 = performance.now();

for (let i = 0; i < N_TEST; i++) {
  let k = 0n;
  for (let j = 0; j < 256; j += 32) k = (k << 32n) | BigInt(Math.floor(Math.random() * 4294967296));
  k %= N; if (k === 0n) k = 1n;

  const wx = limbs2bi(mulGX(mk(...bi2limbs(k))));
  const wy = limbs2bi(mulGY(mk(...bi2limbs(k))));
  const ref = pointMul(k, [GX, GY]);

  if (wx !== ref[0] || wy !== ref[1]) {
    fails++;
    if (fails <= 3) console.log(`FAIL k=${k.toString(16)}\n  wasm x=${wx.toString(16)}\n  ref  x=${ref[0].toString(16)}`);
  }
}

const t1 = performance.now();
console.log(`随机标量乘交叉验证: ${N_TEST - fails} pass / ${fails} fail / ${N_TEST} total (${((t1 - t0) / 1000).toFixed(1)}s)`);
process.exit(fails === 0 ? 0 : 1);
