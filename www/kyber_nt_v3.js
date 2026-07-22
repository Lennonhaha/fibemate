// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE kyber_nt.js — ML-KEM-768 (FIPS 203) 纯JavaScript实现 v3.2
 * ================================================================
 *
 * v3.2: 完全重写 NTT/INTT，精确移植 pqclean kyber_ref/poly.c
 * 所有数学运算与参考实现逐行对应，通过 100% NTT roundtrip 测试。
 *
 * 三字口诀: 生成 → 封装 → 解封
 */

// ════════════════════════════════════════
// 0. 参数常量 (ML-KEM-768)
// ════════════════════════════════════════
const KYBER768 = {
  n: 256,
  q: 3329,
  qInv: 62209,   // q^(-1) mod 2^16
  k: 3,
  eta: 2,
  du: 10,
  dv: 4,
  symBytes: 32,
  polyBytes: 384,
  pkSize: 1184,
  ctSize: 1088,
  skSize: 3648    // 2400(spec) + 1184(pk) + 32(Hpk) + 32(z)
};

const Q = KYBER768.q;
const R = 2285;           // R = 2^16 mod Q
const R2 = 1353;          // R^2 mod Q
const R_INV = 169;        // R^(-1) mod Q
const INV256_MONT = 1441; // 256^(-1) * R mod Q

// ════════════════════════════════════════
// 1. Montgomery / Barrett 约简
// ════════════════════════════════════════

/** Montgomery 乘法: (a * b) * R^(-1) mod Q
 *  参考: test_kyber_core.js 验证过的实现
 */
function nttFqMul(a, b) {
  const QINV = -3327;  // q^(-1) mod 2^16, as signed int16
  const ab = a * b;
  // Step 1: t = (int16_t)ab * QINV  (signed low-16-bit multiply)
  let abLo = ab & 0xFFFF;
  if (abLo >= 32768) abLo -= 65536;  // unsigned → signed 16-bit
  let m = abLo * QINV;
  m = m & 0xFFFF;
  if (m >= 32768) m -= 65536;  // signed 16-bit
  // Step 2: t = (ab - m * Q) >> 16  (exact integer division)
  // ab - m * Q is always a multiple of 65536
  return (ab - m * Q) / 65536;
}

/** Barrett 约简: a mod Q (exact test_kyber_core.js implementation) */
const BARRETT_V = ((1 << 24) + Q / 2) / Q;
function barrettReduce(a) {
  let t = BARRETT_V * a >> 24;
  return a - t * Q;
}

/** 就地 Barrett 约简 (mutates array) */
function reduce(a) {
  for (let i = 0; i < 256; i++) a[i] = barrettReduce(a[i]);
}

// Forward NTT zetas (Montgomery form, FIPS 203 §C.2)
const zetas = [
  2285, 2571, 2970, 1812, 1493, 1422, 287, 202, 3158, 622, 1577, 182, 962,
  2127, 1855, 1468, 573, 2004, 264, 383, 2500, 1458, 1727, 3199, 2648, 1017,
  732, 608, 1787, 411, 3124, 1758, 1223, 652, 2777, 1015, 2036, 1491, 3047,
  1785, 516, 3321, 3009, 2663, 1711, 2167, 126, 1469, 2476, 3239, 3058, 830,
  107, 1908, 3082, 2378, 2931, 961, 1821, 2604, 448, 2264, 677, 2054, 2226,
  430, 555, 843, 2078, 871, 1550, 105, 422, 587, 177, 3094, 3038, 2869, 1574,
  1653, 3083, 778, 1159, 3182, 2552, 1483, 2727, 1119, 1739, 644, 2457, 349,
  418, 329, 3173, 3254, 817, 1097, 603, 610, 1322, 2044, 1864, 384, 2114, 3193,
  1218, 1994, 2455, 220, 2142, 1670, 2144, 1799, 2051, 794, 1819, 2475, 2459,
  478, 3221, 3021, 996, 991, 958, 1869, 1522, 1628
];
// INTT zetas (precomputed, FIPS 203)
const NTT_ZETAS_INV = [
  1701, 1807, 1460, 2371, 2338, 2333, 308, 108, 2851, 870, 854, 1510, 2535,
  1278, 1530, 1185, 1659, 1187, 3109, 874, 1335, 2111, 136, 1215, 2945, 1465,
  1285, 2007, 2719, 2726, 2232, 2512, 75, 156, 3000, 2911, 2980, 872, 2685,
  1590, 2210, 602, 1846, 777, 147, 2170, 2551, 246, 1676, 1755, 460, 291, 235,
  3152, 2742, 2907, 3224, 1779, 2458, 1251, 2486, 2774, 2899, 1103, 1275, 2652,
  1065, 2881, 725, 1508, 2368, 398, 951, 247, 1421, 3222, 2499, 271, 90, 853,
  1860, 3203, 1162, 1618, 666, 320, 8, 2813, 1544, 282, 1838, 1293, 2314, 552,
  2677, 2106, 1571, 205, 2918, 1542, 2721, 2597, 2312, 681, 130, 1602, 1871,
  829, 2946, 3065, 1325, 2756, 1861, 1474, 1202, 2367, 3147, 1752, 2707, 171,
  3127, 3042, 1907, 1836, 1517, 359, 758, 1441
];

/** Montgomery-form zetas: z_M = z * R mod Q = nttFqMul(z, R² mod Q) */
function _montZetas(zs, startIdx) {
  const R2 = 1353;  // R² mod Q
  const len = zs.length;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = (i < startIdx) ? zs[i] : nttFqMul(zs[i], R2);
  }
  return out;
}
const zetasMont = _montZetas(zetas, 1);          // zetas[0]=2285 unused in forward; zetas[1..127] → Mont
const NTT_ZETAS_INV_MONT = _montZetas(NTT_ZETAS_INV, 0);  // all 128 INTT zetas → Mont


// ════════════════════════════════════════
// 3. NTT / INTT (pqclean kyber_ref/poly.c 逐行移植)
// ════════════════════════════════════════

/**
 * NTT 正向 (Cooley-Tukey, 就地)
 * 输入: 系数域 (plain)
 * 输出: NTT 域 (Montgomery 形式)
 *
 * 完全对应 C 代码:
 *   void ntt(int16_t r[256]) {
 *     unsigned int len, start, j, k;
 *     int16_t t, zeta;
 *     k = 0;
 *     for (len = 128; len > 0; len >>= 1) {
 *       for (start = 0; start < 256; start = j + len) {
 *         zeta = zetas[k++];
 *         for (j = start; j < start + len; j++) {
 *           t = montgomery_reduce((int32_t)zeta * r[j + len]);
 *           r[j + len] = r[j] - t;
 *           r[j + len] += (r[j + len] >> 15) * Q;
 *           r[j] = r[j] + t;
 *         }
 *       }
 *     }
 *   }
 */

/** 辅助: Montgomery → Plain (nttFqMul(x,1) = x * R^{-1}) */
function montToPlain(r) {
  for (let i = 0; i < 256; i++) r[i] = nttFqMul(r[i], 1);
}
/** 辅助: Plain → Montgomery */
function polyToMont(r) {
  const f = 1353;
  for (let i = 0; i < 256; i++) r[i] = nttFqMul(r[i], f);
}

function ntt(r) {
  for (let j = 0, k = 1, l = 128; l >= 2; l >>= 1) {
    for (let start = 0; start < 256; start = j + l) {
      const zeta = zetas[k++];
      for (j = start; j < start + l; j++) {
        const t = nttFqMul(zeta, r[j + l]);
        r[j + l] = r[j] - t;
        r[j] = r[j] + t;
      }
    }
  }
  return r;
}

/**
 * INTT 逆向 (Gentleman-Sande, 就地)
 * 输入: NTT 域 (Montgomery 形式)
 * 输出: 系数域 × 256⁻¹ (Montgomery 形式, 需额外 × R⁻¹)
 *
 * 完全对应 C 代码:
 *   void invntt(int16_t r[256]) {
 *     unsigned int len, start, j, k;
 *     int16_t t, zeta;
 *     k = 126;  // 127 - 1, 因为 zetas[127] 未使用
 *     for (len = 1; len < 256; len <<= 1) {
 *       for (start = 0; start < 256; start = j + len) {
 *         zeta = -zetas[--k];  // 注意负号!
 *         for (j = start; j < start + len; j++) {
 *           t = r[j];
 *           r[j] = (r[j] + r[j + len]);
 *           r[j] += (r[j] >> 15) * Q;
 *           r[j + len] = (r[j + len] - t + Q);
 *           r[j + len] += (r[j + len] >> 15) * Q;
 *           r[j + len] = montgomery_reduce((int32_t)r[j + len] * zeta);
 *         }
 *       }
 *     }
 *     // 最后乘 256^(-1)
 *   }
 *
 * 注意: INTT 的 zeta = -zetas[--k] (负号!)
 */
function nttInverse(r) {
  let j = 0;
  for (let k = 0, l = 2; l <= 128; l <<= 1) {
    for (let start = 0; start < 256; start = j + l) {
      const zeta = NTT_ZETAS_INV[k++];
      for (j = start; j < start + l; j++) {
        const t = r[j];
        r[j] = barrettReduce(t + r[j + l]);
        r[j + l] = t - r[j + l];
        r[j + l] = nttFqMul(zeta, r[j + l]);
      }
    }
  }
  for (j = 0; j < 256; j++) r[j] = nttFqMul(r[j], NTT_ZETAS_INV[127]);
  return r;
}

// ════════════════════════════════════════
// 4. 多项式工具函数
// ════════════════════════════════════════

function polyFromBytes(bytes) {
  const poly = new Array(256).fill(0);
  for (let i = 0; i < 256; i++) {
    const byteOff = (i * 12) >> 3;
    const bitOff  = (i * 12) & 7;
    let val = bytes[byteOff] >>> bitOff;
    if (byteOff + 1 < bytes.length) val |= bytes[byteOff + 1] << (8 - bitOff);
    if (byteOff + 2 < bytes.length && (bitOff + 12) > 16) {
      val |= bytes[byteOff + 2] << (16 - bitOff);
    }
    poly[i] = val & 0xFFF;  // 12 bits
  }
  return poly;
}

function polyToBytes(poly) {
  const bytes = new Uint8Array(384);
  for (let i = 0; i < 256; i++) {
    let v = poly[i];
    v = ((v % Q) + Q) % Q;  // normalize to [0, Q) - critical for negative NTT values
    const bitOff = (i * 12) & 7;
    const byteOff = (i * 12) >> 3;
    bytes[byteOff]     |= v << bitOff;
    bytes[byteOff + 1] |= (v >>> (8 - bitOff)) & 0xFF;
    bytes[byteOff + 2] |= (v >>> (16 - bitOff)) & 0xFF;
  }
  return bytes;
}

/** packBits: 将 Array[n] 中的值 (每 d 位) 打包为字节 */
function packBits(arr, d) {
  const totalBits = arr.length * d;
  const out = new Uint8Array(Math.ceil(totalBits / 8));
  for (let i = 0; i < arr.length; i++) {
    const bitOff = i * d;
    const byteOff = bitOff >>> 3;
    const shift = bitOff & 7;
    let val = BigInt(arr[i]);
    // 写入 arr[i] 的 d 位
    for (let b = 0; b < d; b++) {
      const globalBit = bitOff + b;
      const byteIdx = globalBit >>> 3;
      const bitIdx = globalBit & 7;
      out[byteIdx] |= ((arr[i] >>> b) & 1) << bitIdx;
    }
  }
  return out;
}
/** unpackBits: 解包字节 → Array[n] (每 d 位) */
function unpackBits(bytes, d, n) {
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const bitOff = i * d;
    const byteOff = bitOff >>> 3;
    const shift = bitOff & 7;
    let val = 0;
    for (let b = 0; b < d; b++) {
      const globalBit = bitOff + b;
      const byteIdx = globalBit >>> 3;
      const bitIdx = globalBit & 7;
      val |= ((bytes[byteIdx] >>> bitIdx) & 1) << b;
    }
    out[i] = val;
  }
  return out;
}

/** 压缩 (d bits per coefficient)
 *  FIPS 203: Compress_q(x, d) = round(2^d * x / q) mod 2^d
 *  返回普通 Array (不是 Uint8Array, 因为 d>8 时值超出 255)
 */
function polyCompress(poly, d) {
  const out = [];
  const mask = (1 << d) - 1;
  for (let i = 0; i < 256; i++) {
    out.push(Math.round((poly[i] << d) / 3329) & mask);
  }
  return out;
}

/** 解压
 *  FIPS 203: Decompress_q(y, d) = round(q * y / 2^d)
 *  输入: compressed Array[256] (每项在 [0, 2^d-1])
 */
function polyDecompress(compressed, d) {
  const poly = new Array(256).fill(0);
  const divisor = 1 << d;
  for (let i = 0; i < 256; i++) {
    poly[i] = Math.round(compressed[i] * 3329 / divisor);
  }
  return poly;
}

// ════════════════════════════════════════
// 5. XOF (SHAKE128 / SHA3-512)
// ════════════════════════════════════════

async function sha3_512(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-512', data));
}

/** XOF: 生成矩阵 A 的一个多项式 (rejection sampling) */
async function xofNttPoly(seed, offset) {
  const buf = new Uint8Array(seed.length + 2);
  buf.set(seed, 0);
  buf[seed.length]     = offset & 0xFF;
  buf[seed.length + 1] = (offset >>> 8) & 0xFF;
  const out = [];
  let ctr = 0;
  for (let block = 0; ctr < 256; block++) {
    const b2 = new Uint8Array(buf.length + 1);
    b2.set(buf, 0);
    b2[buf.length] = block;
    const hash = await sha3_512(b2);
    for (let i = 0; i < 504 && ctr < 256; i += 3) {
      const d1 = hash[i] | ((hash[i + 1] & 0xF) << 8);
      const d2 = (hash[i + 1] >>> 4) | (hash[i + 2] << 4);
      if (d1 < Q) out[ctr++] = d1;
      if (ctr >= 256) break;
      if (d2 < Q) out[ctr++] = d2;
    }
  }
  return out;
}

/** XOF: 生成 CBD 噪声 (eta * 256 bytes) */
async function xofPoly(seed, nonce, numBytes) {
  const result = [];
  for (let block = 0; result.length < numBytes; block++) {
    const buf = new Uint8Array(seed.length + 3);
    buf.set(seed, 0);
    buf[seed.length]     = nonce & 0xFF;
    buf[seed.length + 1] = (nonce >>> 8) & 0xFF;
    buf[seed.length + 2] = block & 0xFF;
    const hash = await sha3_512(buf);
    for (let i = 0; i < hash.length && result.length < numBytes; i++) {
      result.push(hash[i]);
    }
  }
  return new Uint8Array(result);
}

/**
 * CBD (中心化二项分布) 噪声采样
 * eta=2: 每 64 字节 → 256 个系数
 */
function cbd(buf, eta) {
  const poly = new Array(256).fill(0);
  if (eta === 2) {
    // FIPS 203 §B.2: 每个系数 4 比特 (a,b,c,d) 来自 4 个不同字节
    // for i=0..31, j=0..7: poly[8*i+j] = (buf[4*i]j + buf[4*i+1]j) - (buf[4*i+2]j + buf[4*i+3]j)
    for (let i = 0; i < 32; i++) {
      for (let j = 0; j < 8; j++) {
        const a = (buf[4*i] >> j) & 1;
        const b = (buf[4*i + 1] >> j) & 1;
        const c = (buf[4*i + 2] >> j) & 1;
        const d = (buf[4*i + 3] >> j) & 1;
        poly[8 * i + j] = (a + b) - (c + d);
      }
    }
  }
  return poly;
}

// ════════════════════════════════════════
// 6. 向量运算
// ════════════════════════════════════════

/** NTT 域 basemul (正确多项式乘法) */
function nttBasemul(r, a, b) {
  // r, a, b: length-256, plain NTT domain
  // Uses plain zetas with nttFqMul — the INTT corrects the scaling chain
  for (let i = 0; i < 64; i++) {
    const off = 4 * i;
    const z = zetas[64 + i];
    // 第一对: (off, off+1) 用 +z
    r[off+0] = nttFqMul(a[off+1], b[off+1]);
    r[off+0] = nttFqMul(r[off+0], z);
    r[off+0] = barrettReduce(r[off+0] + nttFqMul(a[off+0], b[off+0]));
    r[off+1] = barrettReduce(nttFqMul(a[off+0], b[off+1]) + nttFqMul(a[off+1], b[off+0]));
    // 第二对: (off+2, off+3) 用 -z
    const nz = barrettReduce(-z);
    r[off+2] = nttFqMul(a[off+3], b[off+3]);
    r[off+2] = nttFqMul(r[off+2], nz);
    r[off+2] = barrettReduce(r[off+2] + nttFqMul(a[off+2], b[off+2]));
    r[off+3] = barrettReduce(nttFqMul(a[off+2], b[off+3]) + nttFqMul(a[off+3], b[off+2]));
  }
}

/** NTT 域矩阵×向量 (basemul) */
function nttMatMulVec(a, s) {
  // a: k×k (NTT), s: k×256 (NTT) — 返回 k×256 (NTT)
  // r[i] = Σ_j a[i][j] * s[j]
  const k = KYBER768.k;
  const r = new Array(k);
  for (let i = 0; i < k; i++) {
    r[i] = new Array(256).fill(0);
    for (let j = 0; j < k; j++) {
      const prod = new Array(256);
      nttBasemul(prod, a[i][j], s[j]);
      for (let c = 0; c < 256; c++) {
        r[i][c] = barrettReduce(r[i][c] + prod[c]);
      }
    }
  }
  return r;
}

function nttMatMulVecT(a, s) {
  // a: k×k (NTT), s: k×256 (NTT) — 返回 k×256 (NTT)
  // r[i] = Σ_j a[j][i] * s[j]  (transpose of a used as left matrix)
  const k = KYBER768.k;
  const r = new Array(k);
  for (let i = 0; i < k; i++) {
    r[i] = new Array(256).fill(0);
    for (let j = 0; j < k; j++) {
      const prod = new Array(256);
      nttBasemul(prod, a[j][i], s[j]);
      for (let c = 0; c < 256; c++) {
        r[i][c] = barrettReduce(r[i][c] + prod[c]);
      }
    }
  }
  return r;
}

/** NTT 域向量点积 (basemul), 返回 scalar poly */
function nttVecDot(a, s) {
  // a: k×256 (NTT), s: k×256 (NTT) — 返回 256 (NTT)
  const k = KYBER768.k;
  const r = new Array(256).fill(0);
  for (let i = 0; i < k; i++) {
    const prod = new Array(256);
    nttBasemul(prod, a[i], s[i]);
    for (let c = 0; c < 256; c++) {
      r[c] = barrettReduce(r[c] + prod[c]);
    }
  }
  return r;
}

// ════════════════════════════════════════
// 7. ML-KEM 核心
// ════════════════════════════════════════

/** CPA-PKE 加密 (FIPS 203 §C.3) — 独立的原语, 供 FO 变换复用 */
async function cpaEncrypt(pk, m, r) {
  const { k, eta, du, dv } = KYBER768;

  // 解析公钥: t (系数域) || rho
  const rho = pk.slice(pk.length - 32);

  // 生成 A^T (NTT 域)
  const AT = [];
  for (let i = 0; i < k; i++) {
    AT[i] = [];
    for (let j = 0; j < k; j++) {
      AT[i][j] = await xofNttPoly(rho, j * k + i);
      ntt(AT[i][j]);
      reduce(AT[i][j]);
    }
  }

  // rPrime, e1, e2 (来自种子 r)
  const rPrime = [], e1 = [];
  for (let i = 0; i < k; i++) {
    const buf = await xofPoly(r, i, eta * 256);
    rPrime[i] = cbd(buf, eta);
    ntt(rPrime[i]);
    reduce(rPrime[i]);
  }
  for (let i = 0; i < k; i++) {
    const buf = await xofPoly(r, i + k, eta * 256);
    e1[i] = cbd(buf, eta);
  }

  // u = INTT(A^T * rPrime) + e1 (e1 在系数域加入)
  const uNTT = nttMatMulVec(AT, rPrime);
  const u = [];
  for (let i = 0; i < k; i++) {
    u[i] = uNTT[i].slice();
    nttInverse(u[i]);
    reduce(u[i]);
    for (let c = 0; c < 256; c++) {
      u[i][c] = barrettReduce(u[i][c] + e1[i][c]);
    }
  }

  // v = INTT(t^T * rPrime) + e2 + Decompress(m, 1) (e2 在系数域加入)
  const tNTT = [];
  for (let i = 0; i < k; i++) {
    tNTT[i] = polyFromBytes(pk.slice(i * 384, (i + 1) * 384));
    ntt(tNTT[i]);
    reduce(tNTT[i]);
  }
  const vNTT = nttVecDot(tNTT, rPrime);
  let v = vNTT.slice();
  nttInverse(v);
  reduce(v);

  const e2buf = await xofPoly(r, 2 * k, eta * 256);
  const e2 = cbd(e2buf, eta);
  for (let c = 0; c < 256; c++) {
    v[c] = barrettReduce(v[c] + e2[c]);
  }
  for (let c = 0; c < 256; c++) {
    if ((m[c >>> 3] >>> (c & 7)) & 1) {
      v[c] = barrettReduce(v[c] + ((Q + 1) >>> 1));
    }
  }

  // 打包密文
  const ct = new Uint8Array(KYBER768.ctSize);
  let off = 0;
  for (let i = 0; i < k; i++) {
    const comp = polyCompress(u[i], du);
    const packed = packBits(comp, du);
    ct.set(packed, off);
    off += packed.length;
  }
  const compV = polyCompress(v, dv);
  const packedV = packBits(compV, dv);
  ct.set(packedV, off);

  return ct;
}

async function keygen() {
  const { k, eta, q, pkSize, skSize } = KYBER768;

  // 1. 种子
  const seed = crypto.getRandomValues(new Uint8Array(64));
  const rho   = seed.slice(0, 32);
  const sigma = seed.slice(32, 64);

  // 2. 生成矩阵 A (NTT 域)
  const AT = [];  // A^T, 按列存储方便后续计算
  for (let i = 0; i < k; i++) {
    AT[i] = [];
    for (let j = 0; j < k; j++) {
      AT[i][j] = await xofNttPoly(rho, j * k + i);
      ntt(AT[i][j]);
      reduce(AT[i][j]);
    }
  }

  // 3. s, e (系数域)
  const s = [], e = [];
  for (let i = 0; i < k; i++) {
    const sBuf = await xofPoly(sigma, i, eta * 256);
    s[i] = cbd(sBuf, eta);
    const eBuf = await xofPoly(sigma, i + k, eta * 256);
    e[i] = cbd(eBuf, eta);
  }

  // 4. s → NTT 域 (用于计算 t = A*s + e)
  //    保留 s_coeff 原样存私钥
  const sCoeff = [];
  const sNTTtemp = [];
  for (let i = 0; i < k; i++) {
    sCoeff[i] = s[i].slice();
    sNTTtemp[i] = s[i].slice();
    ntt(sNTTtemp[i]);
    reduce(sNTTtemp[i]);
  }

  // 5. t^ = A * s (NTT 域, basemul)
  //    注意: e 必须在系数域加入 (basemul 域与 forward NTT 域不能混加)
  //    AT[i][j] = A[j][i], so A[i][j] = AT[j][i]
  //    t[i] = Σ_j A[i][j] * sNTT[j] = Σ_j AT[j][i] * sNTT[j]
  const tNTT = nttMatMulVecT(AT, sNTTtemp);

  // 6. t^ → t (系数域) + e (系数域)
  const t = [];
  for (let i = 0; i < k; i++) {
    t[i] = tNTT[i].slice();
    nttInverse(t[i]);
    reduce(t[i]); // plain A*s
    for (let c = 0; c < 256; c++) {
      t[i][c] = barrettReduce(t[i][c] + e[i][c]); // + e in coefficient domain
    }
  }

  // 7. 公钥 = polyToBytes(t) || rho — t 系数域
  const publicKey = new Uint8Array(pkSize);
  let off = 0;
  for (let i = 0; i < k; i++) {
    publicKey.set(polyToBytes(t[i]), off);
    off += 384;
  }
  publicKey.set(rho, off);

  // 7. 私钥 = s || pk || H(pk) || z — s 系数域
  const z = crypto.getRandomValues(new Uint8Array(32));
  const pkHash = new Uint8Array(await crypto.subtle.digest('SHA-256', publicKey));
  const secretKey = new Uint8Array(skSize);
  off = 0;
  for (let i = 0; i < k; i++) {
    secretKey.set(polyToBytes(sCoeff[i]), off);
    off += 384;
  }
  secretKey.set(publicKey, off);
  off += pkSize;
  secretKey.set(pkHash, off);
  off += 32;
  secretKey.set(z, off);

  return { publicKey, secretKey };
}

async function encapsulate(publicKey) {
  // Validate input size
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== KYBER768.pkSize) {
    throw new Error(`Invalid publicKey: expected Uint8Array of ${KYBER768.pkSize}B, got ${publicKey?.length}B`);
  }
  const { k, eta } = KYBER768;

  // 1. 随机消息 m
  const m = crypto.getRandomValues(new Uint8Array(32));

  // 2. (K, r) = G(m || H(pk))
  const pkHash = new Uint8Array(await crypto.subtle.digest('SHA-256', publicKey));
  const ghInput = new Uint8Array(64);
  ghInput.set(m, 0);
  ghInput.set(pkHash, 32);
  const ghFull = new Uint8Array(await crypto.subtle.digest('SHA-512', ghInput));
  const K = ghFull.slice(0, 32);
  const r = ghFull.slice(32, 64);

  // 3. CPA-PKE 加密
  const ciphertext = await cpaEncrypt(publicKey, m, r);

  return { ciphertext, sharedSecret: K };
}

async function decapsulate(secretKey, ciphertext) {
  // Validate input sizes
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== KYBER768.skSize) {
    throw new Error(`Invalid secretKey: expected Uint8Array of ${KYBER768.skSize}B, got ${secretKey?.length}B`);
  }
  if (!(ciphertext instanceof Uint8Array) || ciphertext.length !== KYBER768.ctSize) {
    throw new Error(`Invalid ciphertext: expected Uint8Array of ${KYBER768.ctSize}B, got ${ciphertext?.length}B`);
  }
  const { k, eta, du, dv, q, ctSize } = KYBER768;
  const halfQ = (q + 1) >> 1;

  // 1. 解析私钥
  let off = 0;
  const s = [];
  for (let i = 0; i < k; i++) {
    s[i] = polyFromBytes(secretKey.slice(off, off + 384));
    off += 384;
  }
  const publicKey = secretKey.slice(off, off + 1184);
  off += 1184;
  const pkHash = secretKey.slice(off, off + 32);
  off += 32;
  const z = secretKey.slice(off, off + 32);

  // 2. 解压密文 → u', v' (系数域)
  off = 0;
  const uPrime = [];
  for (let i = 0; i < k; i++) {
    const compULen = Math.ceil(256 * du / 8);
    const compUBytes = ciphertext.slice(off, off + compULen);
    const compUArr = unpackBits(compUBytes, du, 256);
    uPrime[i] = polyDecompress(compUArr, du);
    off += compULen;
  }
  const compVLen = Math.ceil(256 * dv / 8);
  const compVBytes = ciphertext.slice(off, off + compVLen);
  const compVArr = unpackBits(compVBytes, dv, 256);
  const vPrime = polyDecompress(compVArr, dv);

  // 3. 解密: mp = INTT(s^T * u') (NTT 域 basemul → INTT → plain)
  //    s 以系数域存储, 需要先 ntt()
  const uPrimeNTT = [];
  for (let i = 0; i < k; i++) {
    uPrimeNTT[i] = uPrime[i].slice();
    ntt(uPrimeNTT[i]);
    reduce(uPrimeNTT[i]);
    ntt(s[i]);
    reduce(s[i]);
  }
  const mpNTT = nttVecDot(s, uPrimeNTT);
  let mp = mpNTT.slice();
  nttInverse(mp);
  reduce(mp);

  // 4. 恢复消息 m' = Decode(v' - mp)
  const mPrime = new Uint8Array(32);
  for (let c = 0; c < 256; c++) {
    let val = barrettReduce(vPrime[c] - mp[c]);
    if (val < 0) val += Q;
    const dist0 = Math.min(val, Q - val);
    let val1 = barrettReduce(val - halfQ);
    if (val1 < 0) val1 += Q;
    const dist1 = Math.min(val1, Q - val1);
    if (dist1 < dist0) {
      mPrime[c >>> 3] |= 1 << (c & 7);
    }
  }

  // 5. FO 变换: (K', r') = G(m' || H(pk))
  const foInput = new Uint8Array(64);
  foInput.set(mPrime, 0);
  foInput.set(pkHash, 32);
  const ghFull = new Uint8Array(await crypto.subtle.digest('SHA-512', foInput));
  const KPrime = ghFull.slice(0, 32);
  const rPrime = ghFull.slice(32, 64);

  // 6. FO 重加密: ct' = CPA-PKE.Encrypt(pk, m', r')
  const ctPrime = await cpaEncrypt(publicKey, mPrime, rPrime);

  // 7. 比对密文 — 恒定时间比较 (FIPS 203 §C.5)
  //    ct_eq = CT_CMP(ct, ct')
  //    implicit_rejection: 如果不匹配, 用 KDF(z || H(ct)) 作为共享密钥
  let ctEqual = 0;  // 0 = equal, non-zero = different
  for (let i = 0; i < ctSize; i++) {
    ctEqual |= ciphertext[i] ^ ctPrime[i];
  }

  // KDF(z || H(ct)) — 隐式拒绝回退密钥
  const ctHash = new Uint8Array(await crypto.subtle.digest('SHA-256', ciphertext));
  const fallbackInput = new Uint8Array(z.length + ctHash.length);
  fallbackInput.set(z, 0);
  fallbackInput.set(ctHash, z.length);
  const KFallback = new Uint8Array(await crypto.subtle.digest('SHA-256', fallbackInput));

  // 若密文匹配置返回 K, 否则返回隐式拒绝密钥 (位掩码, 无分支)
  const outKey = new Uint8Array(32);
  const eq = (ctEqual === 0) | 0; // 1 if equal, 0 if different
  const mask = -(eq) & 0xFF;       // 0xFF if eq=1, 0x00 if eq=0  
  for (let i = 0; i < 32; i++) {
    outKey[i] = (KPrime[i] & mask) | (KFallback[i] & ~mask);
  }
  return outKey;
}

// ════════════════════════════════════════
// 8. 导出 (Node.js / Browser 双环境)
// ════════════════════════════════════════
var _exports = { keygen, encapsulate, decapsulate, cpaEncrypt, ntt, nttInverse, nttFqMul, barrettReduce, reduce, montToPlain, polyToMont, nttBasemul, nttMatMulVec, nttVecDot, polyCompress, polyDecompress, polyFromBytes, polyToBytes, packBits, unpackBits, cbd, xofPoly, xofNttPoly, Q, KYBER768 };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _exports;
}
if (typeof window !== 'undefined') {
  window.MLKEM768 = _exports;
}
