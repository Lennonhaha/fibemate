// SM2 域运算（256-bit）— AssemblyScript 实现
// 域元素：8 个 u32 limb（每个 < 2^32，little-endian）
// 内部乘法用 CIOS Montgomery（已 10 万组验证 0 失败）
// 注意：使用 Array<u64>（走 GC）而非 StaticArray（非托管，会泄漏）
// SPDX-License-Identifier: GPL-3.0-only

const MASK32: u64 = 0xFFFFFFFF;

// ---- SM2 曲线常量（小端 limb）----
// P = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF
const P_LIMBS = new Array<u64>(8);
P_LIMBS[0] = 0xFFFFFFFF; P_LIMBS[1] = 0xFFFFFFFF; P_LIMBS[2] = 0x00000000; P_LIMBS[3] = 0xFFFFFFFF;
P_LIMBS[4] = 0xFFFFFFFF; P_LIMBS[5] = 0xFFFFFFFF; P_LIMBS[6] = 0xFFFFFFFF; P_LIMBS[7] = 0xFFFFFFFE;

// N = 0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123
const N_LIMBS = new Array<u64>(8);
N_LIMBS[0] = 0x39D54123; N_LIMBS[1] = 0x53BBF409; N_LIMBS[2] = 0x21C6052B; N_LIMBS[3] = 0x7203DF6B;
N_LIMBS[4] = 0xFFFFFFFF; N_LIMBS[5] = 0xFFFFFFFF; N_LIMBS[6] = 0xFFFFFFFF; N_LIMBS[7] = 0xFFFFFFFE;

// 2^256 - P（小端 limb）
const C_P = new Array<u64>(8);
C_P[0] = 0x00000001; C_P[1] = 0x00000000; C_P[2] = 0xFFFFFFFF; C_P[3] = 0x00000000;
C_P[4] = 0x00000000; C_P[5] = 0x00000000; C_P[6] = 0x00000000; C_P[7] = 0x00000001;

// 2^256 - N（小端 limb）
const C_N = new Array<u64>(8);
C_N[0] = 0xC62ABEDD; C_N[1] = 0xAC440BF6; C_N[2] = 0xDE39FAD4; C_N[3] = 0x8DFC2094;
C_N[4] = 0x00000000; C_N[5] = 0x00000000; C_N[6] = 0x00000000; C_N[7] = 0x00000001;

// R² mod P（小端 limb）
const R2_P = new Array<u64>(8);
R2_P[0] = 0x00000003; R2_P[1] = 0x00000002; R2_P[2] = 0xFFFFFFFF; R2_P[3] = 0x00000002;
R2_P[4] = 0x00000001; R2_P[5] = 0x00000001; R2_P[6] = 0x00000002; R2_P[7] = 0x00000004;

// R² mod N（小端 limb）
const R2_N = new Array<u64>(8);
R2_N[0] = 0x7C114F20; R2_N[1] = 0x901192AF; R2_N[2] = 0xDE6FA2FA; R2_N[3] = 0x3464504A;
R2_N[4] = 0x3AFFE0D4; R2_N[5] = 0x620FC84C; R2_N[6] = 0xA22B3D3B; R2_N[7] = 0x1EB5E412;

// n' = -n^{-1} mod 2^32 = 0x72350975
const NP_N: u64 = 0x72350975;
// p' = -p^{-1} mod 2^32 = 1（P ≡ -1 mod 2^32）
const NP_P: u64 = 0x1;

// ---- 归约辅助：把 t[0..7]（含 hi = t[7] 的溢出位）归约到 < M ----
// 输入 t[0..7] 是 257 位（t[7] 可到 2^33），值 < 2M
// 输出 t[0..7] 归约到 < M
function reduce257(t: Array<u64>, m: Array<u64>, c: Array<u64>): Array<u64> {
  const hi: u64 = t[7] >> 32;
  t[7] = t[7] & MASK32;
  if (hi == 1) {
    // value = 2^256 + t >= 2^256 > M，减 M → result = (2^256 - M) + t = c + t
    let carry: u64 = 0;
    for (let j = 0; j < 8; j++) {
      const sum: u64 = t[j] + c[j] + carry;
      t[j] = sum & MASK32;
      carry = sum >> 32;
    }
  } else {
    // value = t（256 位），条件减 M
    let borrow: u64 = 0;
    for (let j = 0; j < 8; j++) {
      const mv: u64 = m[j] + borrow;
      const tOld: u64 = t[j];
      t[j] = (tOld - mv) & MASK32;
      borrow = (tOld < mv) ? 1 : 0;
    }
    if (borrow == 1) {
      let carry: u64 = 0;
      for (let j = 0; j < 8; j++) {
        const sum: u64 = t[j] + m[j] + carry;
        t[j] = sum & MASK32;
        carry = sum >> 32;
      }
    }
  }
  return t;
}

// ---- CIOS Montgomery 乘法（核心）----
// a, b: 8 个 u32 limb（Montgomery 域，aR mod M）
// 返回 a*b*R^{-1} mod M（8 个归一化 u32 limb，< M）
function montMul(a: Array<u64>, b: Array<u64>, m: Array<u64>, c: Array<u64>, np: u64): Array<u64> {
  const t = new Array<u64>(9);
  for (let i = 0; i < 8; i++) {
    const ai: u64 = a[i];
    let carry: u64 = 0;
    for (let j = 0; j < 8; j++) {
      const cur: u64 = t[j] + ai * b[j] + carry;
      t[j] = cur & MASK32;
      carry = cur >> 32;
    }
    t[8] += carry;
    const mm: u64 = (t[0] * np) & MASK32;
    let carry2: u64 = 0;
    for (let j = 0; j < 8; j++) {
      const cur2: u64 = t[j] + mm * m[j] + carry2;
      t[j] = cur2 & MASK32;
      carry2 = cur2 >> 32;
    }
    t[8] += carry2;
    for (let j = 0; j < 8; j++) t[j] = t[j + 1];
    t[8] = 0;
  }
  return reduce257(t, m, c);
}

// ---- 公共接口 ----

// 进入 Montgomery 域：a → aR mod P
export function toMontP(a: Array<u64>): Array<u64> {
  return montMul(a, R2_P, P_LIMBS, C_P, NP_P);
}

// 离开 Montgomery 域：aR → a mod P
export function fromMontP(a: Array<u64>): Array<u64> {
  const one = new Array<u64>(8);
  one[0] = 1;
  return montMul(a, one, P_LIMBS, C_P, NP_P);
}

export function montMulP(a: Array<u64>, b: Array<u64>): Array<u64> {
  return montMul(a, b, P_LIMBS, C_P, NP_P);
}
export function montMulN(a: Array<u64>, b: Array<u64>): Array<u64> {
  return montMul(a, b, N_LIMBS, C_N, NP_N);
}

// 域加法 mod P（普通域）：返回 (a+b) mod P
export function feAddP(a: Array<u64>, b: Array<u64>): Array<u64> {
  const r = new Array<u64>(9);
  let carry: u64 = 0;
  for (let i = 0; i < 8; i++) {
    const sum: u64 = a[i] + b[i] + carry;
    r[i] = sum & MASK32;
    carry = sum >> 32;
  }
  r[8] = carry; // 0 或 1（a+b < 2P < 2^257）
  // 用 reduce257 处理（把 r[8] 视作 t[7] 的 hi 位）
  const t = new Array<u64>(9);
  for (let i = 0; i < 8; i++) t[i] = r[i];
  t[7] = r[7] | (r[8] << 32);
  return reduce257(t, P_LIMBS, C_P);
}

// 域减法 mod P（普通域）：返回 (a-b+P) mod P
export function feSubP(a: Array<u64>, b: Array<u64>): Array<u64> {
  const r = new Array<u64>(8);
  let borrow: u64 = 0;
  for (let i = 0; i < 8; i++) {
    const bv: u64 = b[i] + borrow;
    const aOld: u64 = a[i];
    r[i] = (aOld - bv) & MASK32;
    borrow = (aOld < bv) ? 1 : 0;
  }
  if (borrow == 1) {
    let carry: u64 = 0;
    for (let i = 0; i < 8; i++) {
      const sum: u64 = r[i] + P_LIMBS[i] + carry;
      r[i] = sum & MASK32;
      carry = sum >> 32;
    }
  }
  return r;
}

export function mk(a0: u32, a1: u32, a2: u32, a3: u32, a4: u32, a5: u32, a6: u32, a7: u32): Array<u64> {
  const r = new Array<u64>(8);
  r[0] = <u64>a0; r[1] = <u64>a1; r[2] = <u64>a2; r[3] = <u64>a3;
  r[4] = <u64>a4; r[5] = <u64>a5; r[6] = <u64>a6; r[7] = <u64>a7;
  return r;
}
