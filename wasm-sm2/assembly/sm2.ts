// SM2 签名/验签 — AssemblyScript（GB/T 32918.2）
// 依赖 field.ts（域运算）+ curve.ts（点运算）
// 注意：使用 Array<u64>（走 GC）而非 StaticArray（非托管，会泄漏）
// SPDX-License-Identifier: GPL-3.0-only
import { montMulP, montMulN, feAddP, feSubP, toMontP, fromMontP } from "./field";
import { mulGX, mulGY, pointMulX, pointMulY, feInvN, mk } from "./curve";

// N（曲线阶）小端 limb
const N_LIMBS = new Array<u64>(8);
N_LIMBS[0] = 0x39D54123; N_LIMBS[1] = 0x53BBF409; N_LIMBS[2] = 0x21C6052B; N_LIMBS[3] = 0x7203DF6B;
N_LIMBS[4] = 0xFFFFFFFF; N_LIMBS[5] = 0xFFFFFFFF; N_LIMBS[6] = 0xFFFFFFFF; N_LIMBS[7] = 0xFFFFFFFE;

// ---- mod N 域运算（普通表示）----
function isZeroN(a: Array<u64>): u64 {
  let acc: u64 = 0;
  for (let i = 0; i < 8; i++) acc |= a[i];
  return acc == 0 ? 1 : 0;
}

// addModN: (a+b) mod N
function addModN(a: Array<u64>, b: Array<u64>): Array<u64> {
  const r = new Array<u64>(8);
  let carry: u64 = 0;
  for (let i = 0; i < 8; i++) {
    const sum: u64 = a[i] + b[i] + carry;
    r[i] = sum & 0xFFFFFFFF;
    carry = sum >> 32;
  }
  let ge = carry;
  if (ge == 0) {
    let gt = 0;
    for (let i = 7; i >= 0; i--) {
      if (r[i] > N_LIMBS[i]) { gt = 1; break; }
      if (r[i] < N_LIMBS[i]) break;
    }
    ge = gt;
  }
  if (ge == 1) {
    let borrow: u64 = 0;
    for (let i = 0; i < 8; i++) {
      const nv: u64 = N_LIMBS[i] + borrow;
      const rOld: u64 = r[i];
      r[i] = (rOld - nv) & 0xFFFFFFFF;
      borrow = (rOld < nv) ? 1 : 0;
    }
  }
  return r;
}

// subModN: (a-b) mod N
function subModN(a: Array<u64>, b: Array<u64>): Array<u64> {
  const r = new Array<u64>(8);
  let borrow: u64 = 0;
  for (let i = 0; i < 8; i++) {
    const bv: u64 = b[i] + borrow;
    const aOld: u64 = a[i];
    r[i] = (aOld - bv) & 0xFFFFFFFF;
    borrow = (aOld < bv) ? 1 : 0;
  }
  if (borrow == 1) {
    let carry: u64 = 0;
    for (let i = 0; i < 8; i++) {
      const sum: u64 = r[i] + N_LIMBS[i] + carry;
      r[i] = sum & 0xFFFFFFFF;
      carry = sum >> 32;
    }
  }
  return r;
}

// mulModN: (a*b) mod N（普通表示，内部用 Montgomery）
function mulModN(a: Array<u64>, b: Array<u64>): Array<u64> {
  const aM = montMulN(a, R2_N_LOCAL());
  const bM = montMulN(b, R2_N_LOCAL());
  const cM = montMulN(aM, bM);
  const one = new Array<u64>(8); one[0] = 1;
  return montMulN(cM, one);
}

function R2_N_LOCAL(): Array<u64> {
  const r = new Array<u64>(8);
  r[0] = 0x7C114F20; r[1] = 0x901192AF; r[2] = 0xDE6FA2FA; r[3] = 0x3464504A;
  r[4] = 0x3AFFE0D4; r[5] = 0x620FC84C; r[6] = 0xA22B3D3B; r[7] = 0x1EB5E412;
  return r;
}

// 签名核心：给定 dA（私钥）、e（消息哈希 ZA||M）、k（随机数），返回 r||s（16 limbs）
export function sm2SignCore(
  dA: Array<u64>,
  e: Array<u64>,
  k: Array<u64>
): Array<u64> {
  const x1 = mulGX(k);
  const x1modN = modN(x1);
  const r = addModN(e, x1modN);

  const one = new Array<u64>(8); one[0] = 1;
  const dA1 = addModN(dA, one);
  const dA1Inv = feInvN(dA1);
  const rdA = mulModN(r, dA);
  const kMrda = subModN(k, rdA);
  const s = mulModN(dA1Inv, kMrda);

  const out = new Array<u64>(16);
  for (let i = 0; i < 8; i++) { out[i] = r[i]; out[8 + i] = s[i]; }
  return out;
}

// 验签核心：给定 PA(x,y)、e、r、s，返回 0/1
export function sm2VerifyCore(
  px: Array<u64>,
  py: Array<u64>,
  e: Array<u64>,
  r: Array<u64>,
  s: Array<u64>
): u32 {
  if (isZeroN(r) == 1 || isZeroN(s) == 1) return 0;
  if (geN(r) == 1 || geN(s) == 1) return 0;
  const t = addModN(r, s);
  if (isZeroN(t) == 1) return 0;
  const sGx = mulGX(s);
  const sGy = mulGY(s);
  const tPx = pointMulX(t, px, py);
  const tPy = pointMulY(t, px, py);
  const qx = affAddX(sGx, sGy, tPx, tPy);
  const qxN = modN(qx);
  const R = addModN(e, qxN);
  let match: u64 = 1;
  for (let i = 0; i < 8; i++) { if (R[i] != r[i]) match = 0; }
  return <u32>match;
}

// ---- 辅助 ----
function modN(a: Array<u64>): Array<u64> {
  if (geN(a) == 1) {
    return subModN(a, N_LIMBS);
  }
  return a;
}

function geN(a: Array<u64>): u64 {
  for (let i = 7; i >= 0; i--) {
    if (a[i] > N_LIMBS[i]) return 1;
    if (a[i] < N_LIMBS[i]) return 0;
  }
  return 1;
}

// 仿射点加法（mod P）：返回 x 坐标
function affAddX(x1: Array<u64>, y1: Array<u64>, x2: Array<u64>, y2: Array<u64>): Array<u64> {
  const x1m = toMontP(x1), y1m = toMontP(y1), x2m = toMontP(x2), y2m = toMontP(y2);
  const dy = feSubP(y2m, y1m);
  const dx = feSubP(x2m, x1m);
  const dxInv = feInvMontP(dx);
  const lam = montMulP(dy, dxInv);
  let x3 = montMulP(lam, lam);
  x3 = feSubP(x3, x1m);
  x3 = feSubP(x3, x2m);
  return fromMontP(x3);
}

// 域逆 mod P（Montgomery 域，复用 curve 的逻辑）
function feInvMontP(a: Array<u64>): Array<u64> {
  const e = new Array<u64>(8);
  e[0] = 0xFFFFFFFD; e[1] = 0xFFFFFFFF; e[2] = 0x00000000; e[3] = 0xFFFFFFFF;
  e[4] = 0xFFFFFFFF; e[5] = 0xFFFFFFFF; e[6] = 0xFFFFFFFF; e[7] = 0xFFFFFFFE;
  const one = new Array<u64>(8); one[0] = 1;
  let result = toMontP(one);
  const base = a;
  for (let w = 7; w >= 0; w--) {
    for (let bit = 31; bit >= 0; bit--) {
      result = montMulP(result, result);
      const b: u64 = (e[w] >> bit) & 1;
      if (b == 1) result = montMulP(result, base);
    }
  }
  return result;
}
