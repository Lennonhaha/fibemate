// SM2 曲线点运算 — AssemblyScript
// Jacobian 坐标 + Montgomery Ladder 标量乘法（恒定时间，含无穷远点处理）
// 注意：使用 Array<u64>（走 GC）而非 StaticArray（非托管，会泄漏）
// SPDX-License-Identifier: GPL-3.0-only
import { montMulP, montMulN, feAddP, feSubP, toMontP, fromMontP } from "./field";

const MASK32: u64 = 0xFFFFFFFF;

// ---- SM2 曲线常量（小端 limb）----
const A_LIMBS = new Array<u64>(8);
A_LIMBS[0] = 0xFFFFFFFC; A_LIMBS[1] = 0xFFFFFFFF; A_LIMBS[2] = 0x00000000; A_LIMBS[3] = 0xFFFFFFFF;
A_LIMBS[4] = 0xFFFFFFFF; A_LIMBS[5] = 0xFFFFFFFF; A_LIMBS[6] = 0xFFFFFFFF; A_LIMBS[7] = 0xFFFFFFFE;

const GX_LIMBS = new Array<u64>(8);
GX_LIMBS[0] = 0x334C74C7; GX_LIMBS[1] = 0x715A4589; GX_LIMBS[2] = 0xF2660BE1; GX_LIMBS[3] = 0x8FE30BBF;
GX_LIMBS[4] = 0x6A39C994; GX_LIMBS[5] = 0x5F990446; GX_LIMBS[6] = 0x1F198119; GX_LIMBS[7] = 0x32C4AE2C;

const GY_LIMBS = new Array<u64>(8);
GY_LIMBS[0] = 0x2139F0A0; GY_LIMBS[1] = 0x02DF32E5; GY_LIMBS[2] = 0xC62A4740; GY_LIMBS[3] = 0xD0A9877C;
GY_LIMBS[4] = 0x6B692153; GY_LIMBS[5] = 0x59BDCEE3; GY_LIMBS[6] = 0xF4F6779C; GY_LIMBS[7] = 0xBC3736A2;

// P-2（小端 8×u32 limb），Fermat 求逆
const PM2_LIMBS = new Array<u64>(8);
PM2_LIMBS[0] = 0xFFFFFFFD; PM2_LIMBS[1] = 0xFFFFFFFF; PM2_LIMBS[2] = 0x00000000; PM2_LIMBS[3] = 0xFFFFFFFF;
PM2_LIMBS[4] = 0xFFFFFFFF; PM2_LIMBS[5] = 0xFFFFFFFF; PM2_LIMBS[6] = 0xFFFFFFFF; PM2_LIMBS[7] = 0xFFFFFFFE;

// ---- 辅助 ----
function zeroFe(): Array<u64> { return new Array<u64>(8); }
function oneFe(): Array<u64> { const r = new Array<u64>(8); r[0] = 1; return r; }

function isZero(a: Array<u64>): u64 {
  let acc: u64 = 0;
  for (let i = 0; i < 8; i++) acc |= a[i];
  return acc == 0 ? 1 : 0;
}

// constant-time select：flag=0 选 a，flag=1 选 b（逐 limb）
function ctSelectFe(a: Array<u64>, b: Array<u64>, flag: u64): Array<u64> {
  const r = new Array<u64>(8);
  const mask: u64 = 0 - flag; // flag=0→0, flag=1→全1
  for (let i = 0; i < 8; i++) {
    r[i] = (a[i] & ~mask) | (b[i] & mask);
  }
  return r;
}

// ---- 惰性缓存 Montgomery 域常量 ----
let GX_M: Array<u64> | null = null;
let GY_M: Array<u64> | null = null;

function getGXM(): Array<u64> { if (GX_M == null) GX_M = toMontP(GX_LIMBS); return GX_M!; }
function getGYM(): Array<u64> { if (GY_M == null) GY_M = toMontP(GY_LIMBS); return GY_M!; }
function oneM(): Array<u64> { return toMontP(oneFe()); }

// ---- Jacobian 点（Montgomery 域）----
// 无穷远点 = (1, 1, 0)
export class JPt {
  x: Array<u64> = new Array<u64>(8);
  y: Array<u64> = new Array<u64>(8);
  z: Array<u64> = new Array<u64>(8);
}

function jptNew(): JPt { return new JPt(); }
function jptInf(): JPt { const p = new JPt(); p.x = oneM(); p.y = oneM(); p.z = zeroFe(); return p; }

// 点加倍（Jacobian，标准公式含 a·Z⁴ 项，a=-3）。若 z=0（无穷远）返回无穷远。
function jDouble(p: JPt): JPt {
  const r = jptNew();
  const zIsZero = isZero(p.z);
  const A = montMulP(p.x, p.x);
  const B = montMulP(p.y, p.y);
  const C = montMulP(B, B);
  const ZZ = montMulP(p.z, p.z);
  const ZZZZ = montMulP(ZZ, ZZ);
  let S = montMulP(p.x, B);
  S = feAddP(S, S);
  S = feAddP(S, S);
  let M = feSubP(A, ZZZZ);
  M = montMulP(toMontP(mkSmall(3)), M);
  const T = montMulP(M, M);
  const X3 = feSubP(T, feAddP(S, S));
  let Y3 = feSubP(S, X3);
  Y3 = montMulP(M, Y3);
  Y3 = feSubP(Y3, montMulP(toMontP(mkSmall(8)), C));
  let Z3 = montMulP(p.y, p.z);
  Z3 = feAddP(Z3, Z3);
  const inf = jptInf();
  r.x = ctSelectFe(X3, inf.x, zIsZero);
  r.y = ctSelectFe(Y3, inf.y, zIsZero);
  r.z = ctSelectFe(Z3, inf.z, zIsZero);
  return r;
}

// 点加法（Jacobian + Jacobian，标准公式）。处理无穷远点（constant-time）。
function jAdd(p: JPt, q: JPt): JPt {
  const r = jptNew();
  const z1z = isZero(p.z);
  const z2z = isZero(q.z);
  const Z1Z1 = montMulP(p.z, p.z);
  const Z2Z2 = montMulP(q.z, q.z);
  const U1 = montMulP(p.x, Z2Z2);
  const U2 = montMulP(q.x, Z1Z1);
  const S1 = montMulP(p.y, montMulP(q.z, Z2Z2));
  const S2 = montMulP(q.y, montMulP(p.z, Z1Z1));
  const H = feSubP(U2, U1);
  const RR = feSubP(S2, S1);
  const H2 = montMulP(H, H);
  const H3 = montMulP(H2, H);
  const U1H2 = montMulP(U1, H2);
  let X3 = montMulP(RR, RR);
  X3 = feSubP(X3, H3);
  X3 = feSubP(X3, feAddP(U1H2, U1H2));
  let Y3 = feSubP(U1H2, X3);
  Y3 = montMulP(RR, Y3);
  Y3 = feSubP(Y3, montMulP(S1, H3));
  let Z3 = montMulP(H, p.z);
  Z3 = montMulP(Z3, q.z);
  let X = ctSelectFe(X3, q.x, z1z);
  let Y = ctSelectFe(Y3, q.y, z1z);
  let Z = ctSelectFe(Z3, q.z, z1z);
  const f2: u64 = z2z & (1 - z1z);
  X = ctSelectFe(X, p.x, f2);
  Y = ctSelectFe(Y, p.y, f2);
  Z = ctSelectFe(Z, p.z, f2);
  r.x = X; r.y = Y; r.z = Z;
  return r;
}

// ---- Montgomery Ladder 标量乘法（恒定时间）----
function ladderMul(k: Array<u64>, px: Array<u64>, py: Array<u64>): JPt {
  let R0 = jptInf();
  const R1 = jptNew(); R1.x = px; R1.y = py; R1.z = oneM();
  for (let w = 7; w >= 0; w--) {
    for (let bit = 31; bit >= 0; bit--) {
      const kb: u64 = (k[w] >> bit) & 1;
      const t = jAdd(R0, R1);
      const d0 = jDouble(R0);
      const d1 = jDouble(R1);
      const nR0x = ctSelectFe(d0.x, t.x, kb);
      const nR0y = ctSelectFe(d0.y, t.y, kb);
      const nR0z = ctSelectFe(d0.z, t.z, kb);
      const nR1x = ctSelectFe(t.x, d1.x, kb);
      const nR1y = ctSelectFe(t.y, d1.y, kb);
      const nR1z = ctSelectFe(t.z, d1.z, kb);
      R0.x = nR0x; R0.y = nR0y; R0.z = nR0z;
      R1.x = nR1x; R1.y = nR1y; R1.z = nR1z;
    }
  }
  return R0;
}

// Montgomery 域求逆：a^{-1}*R（Fermat，恒定 256 轮）
function feInvMont(a: Array<u64>): Array<u64> {
  let result = oneM();
  const base = a;
  for (let w = 7; w >= 0; w--) {
    for (let bit = 31; bit >= 0; bit--) {
      result = montMulP(result, result);
      const b: u64 = (PM2_LIMBS[w] >> bit) & 1;
      if (b == 1) result = montMulP(result, base);
    }
  }
  return result;
}

// Jacobian → 仿射（Montgomery 域）
function jacToAff(p: JPt): JPt {
  const r = jptNew();
  const zInv = feInvMont(p.z);
  const zInv2 = montMulP(zInv, zInv);
  const zInv3 = montMulP(zInv2, zInv);
  r.x = montMulP(p.x, zInv2);
  r.y = montMulP(p.y, zInv3);
  r.z = oneM();
  return r;
}

// ---- 公开接口 ----
export function mulGX(k: Array<u64>): Array<u64> {
  const r = ladderMul(k, getGXM(), getGYM());
  const aff = jacToAff(r);
  return fromMontP(aff.x);
}
export function mulGY(k: Array<u64>): Array<u64> {
  const r = ladderMul(k, getGXM(), getGYM());
  const aff = jacToAff(r);
  return fromMontP(aff.y);
}

// 通用标量乘法 k·P（P 为仿射点，普通表示），返回 x 坐标（普通表示）
export function pointMulX(k: Array<u64>, px: Array<u64>, py: Array<u64>): Array<u64> {
  const pxM = toMontP(px);
  const pyM = toMontP(py);
  const r = ladderMul(k, pxM, pyM);
  const aff = jacToAff(r);
  return fromMontP(aff.x);
}
export function pointMulY(k: Array<u64>, px: Array<u64>, py: Array<u64>): Array<u64> {
  const pxM = toMontP(px);
  const pyM = toMontP(py);
  const r = ladderMul(k, pxM, pyM);
  const aff = jacToAff(r);
  return fromMontP(aff.y);
}

// 域逆 mod N（Fermat，恒定 256 轮）：a^{-1} mod N（普通表示）
function feInvNOrd(a: Array<u64>): Array<u64> {
  const e = new Array<u64>(8);
  e[0] = 0x39D54121; e[1] = 0x53BBF409; e[2] = 0x21C6052B; e[3] = 0x7203DF6B;
  e[4] = 0xFFFFFFFF; e[5] = 0xFFFFFFFF; e[6] = 0xFFFFFFFF; e[7] = 0xFFFFFFFE;
  const one = new Array<u64>(8); one[0] = 1;
  let result = montMulN(one, R2N());
  const base = montMulN(a, R2N());
  for (let w = 7; w >= 0; w--) {
    for (let bit = 31; bit >= 0; bit--) {
      result = montMulN(result, result);
      const b: u64 = (e[w] >> bit) & 1;
      if (b == 1) result = montMulN(result, base);
    }
  }
  const one2 = new Array<u64>(8); one2[0] = 1;
  return montMulN(result, one2);
}

// R² mod N（小端 limb）
function R2N(): Array<u64> {
  const r = new Array<u64>(8);
  r[0] = 0x7C114F20; r[1] = 0x901192AF; r[2] = 0xDE6FA2FA; r[3] = 0x3464504A;
  r[4] = 0x3AFFE0D4; r[5] = 0x620FC84C; r[6] = 0xA22B3D3B; r[7] = 0x1EB5E412;
  return r;
}

export function feInvN(a: Array<u64>): Array<u64> {
  return feInvNOrd(a);
}

function mkSmall(v: u64): Array<u64> {
  const r = new Array<u64>(8);
  r[0] = v;
  return r;
}

export function mk(a0: u32, a1: u32, a2: u32, a3: u32, a4: u32, a5: u32, a6: u32, a7: u32): Array<u64> {
  const r = new Array<u64>(8);
  r[0] = <u64>a0; r[1] = <u64>a1; r[2] = <u64>a2; r[3] = <u64>a3;
  r[4] = <u64>a4; r[5] = <u64>a5; r[6] = <u64>a6; r[7] = <u64>a7;
  return r;
}
