// SM3 哈希 — AssemblyScript 实现（GB/T 32905-2016）
// 注意：使用 Array（走 GC）而非 StaticArray（非托管，会泄漏）
// SPDX-License-Identifier: GPL-3.0-only

// ---- SM3 常量 ----
const IV: Array<u32> = [
  0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
  0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e
];

function rotl(x: u32, n: u32): u32 {
  return (x << n) | (x >> (32 - n));
}

function FF0(x: u32, y: u32, z: u32): u32 { return x ^ y ^ z; }
function FF1(x: u32, y: u32, z: u32): u32 { return (x & y) | (x & z) | (y & z); }
function GG0(x: u32, y: u32, z: u32): u32 { return x ^ y ^ z; }
function GG1(x: u32, y: u32, z: u32): u32 { return (x & y) | ((~x) & z); }
function P0(x: u32): u32 { return x ^ rotl(x, 9) ^ rotl(x, 17); }
function P1(x: u32): u32 { return x ^ rotl(x, 15) ^ rotl(x, 23); }

// 消息扩展：B 是 64 字节块，返回 W[68] + W1[64]
function messageExpand(B: Array<u8>, W: Array<u32>, W1: Array<u32>): void {
  for (let i = 0; i < 16; i++) {
    const b0: u32 = B[i * 4];
    const b1: u32 = B[i * 4 + 1];
    const b2: u32 = B[i * 4 + 2];
    const b3: u32 = B[i * 4 + 3];
    W[i] = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
  }
  for (let i = 16; i < 68; i++) {
    const t = W[i - 16] ^ W[i - 9] ^ rotl(W[i - 3], 15);
    W[i] = P1(t) ^ rotl(W[i - 13], 7) ^ W[i - 6];
  }
  for (let i = 0; i < 64; i++) {
    W1[i] = W[i] ^ W[i + 4];
  }
}

// 压缩函数：V(8) + B(64 字节) → V'(8)
function compress(V: Array<u32>, B: Array<u8>): Array<u32> {
  const W = new Array<u32>(68);
  const W1 = new Array<u32>(64);
  messageExpand(B, W, W1);

  let A = V[0], BB = V[1], C = V[2], D = V[3];
  let E = V[4], F = V[5], G = V[6], H = V[7];

  const T0: u32 = 0x79cc4519;
  const T1: u32 = 0x7a879d8a;

  for (let j = 0; j < 64; j++) {
    const T: u32 = (j < 16) ? T0 : T1;
    const FF = (j < 16) ? FF0 : FF1;
    const GG = (j < 16) ? GG0 : GG1;

    const SS1 = rotl(rotl(A, 12) + E + rotl(T, j % 32), 7);
    const SS2 = SS1 ^ rotl(A, 12);
    const TT1 = FF(A, BB, C) + D + SS2 + W1[j];
    const TT2 = GG(E, F, G) + H + SS1 + W[j];

    D = C;
    C = rotl(BB, 9);
    BB = A;
    A = TT1;
    H = G;
    G = rotl(F, 19);
    F = E;
    E = P0(TT2);
  }

  const r = new Array<u32>(8);
  r[0] = V[0] ^ A; r[1] = V[1] ^ BB; r[2] = V[2] ^ C; r[3] = V[3] ^ D;
  r[4] = V[4] ^ E; r[5] = V[5] ^ F; r[6] = V[6] ^ G; r[7] = V[7] ^ H;
  return r;
}

// 哈希入口：msg 是 Uint8Array，返回 32 字节 Uint8Array
export function sm3Hash(msg: Array<u8>, msgLen: i32): Array<u8> {
  const len = msgLen;
  const bitLen: u64 = <u64>len * 8;
  const rem = len % 64;
  const padLen: i32 = (rem < 56) ? (56 - rem) : (120 - rem);
  const totalLen = len + padLen + 8;

  const padded = new Array<u8>(totalLen);
  for (let i = 0; i < len; i++) padded[i] = msg[i];
  padded[len] = 0x80;
  for (let i = 0; i < 8; i++) {
    padded[totalLen - 8 + i] = <u8>((bitLen >> <u64>(56 - i * 8)) & 0xFF);
  }

  let V = new Array<u32>(8);
  for (let i = 0; i < 8; i++) V[i] = IV[i];

  for (let off = 0; off < totalLen; off += 64) {
    const block = new Array<u8>(64);
    for (let i = 0; i < 64; i++) block[i] = padded[off + i];
    V = compress(V, block);
  }

  const result = new Array<u8>(32);
  for (let i = 0; i < 8; i++) {
    const v = V[i];
    result[i * 4] = <u8>(v >> 24);
    result[i * 4 + 1] = <u8>(v >> 16);
    result[i * 4 + 2] = <u8>(v >> 8);
    result[i * 4 + 3] = <u8>(v);
  }
  return result;
}
