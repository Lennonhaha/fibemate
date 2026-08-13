/**
 * SM2 WASM — AssemblyScript v0.28
 * Minimal viable product: verify the toolchain first.
 * 
 * Toolchain check: compiles → WASM → Node.js loads → returns correct result.
 */

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function mul(a: i32, b: i32): i32 {
  return a * b;
}

// 256-bit field element operations (8 × u32 little-endian)
export const WORDS: i32 = 8;

export function addModTest(a: Uint8Array, b: Uint8Array): Uint8Array {
  // r[i] = (a[i] + b[i]) & 0xFFFFFFFF  (no carry — pure limb add)
  // Full addMod with carry handled in sm2_field.ts
  let off: i32 = 0;
  for (let i: i32 = 0; i < WORDS; i++) {
    const av: u32 = a[off]
      | <u32>a[off + 1] << 8
      | <u32>a[off + 2] << 16
      | <u32>a[off + 3] << 24;
    const bv: u32 = b[off]
      | <u32>b[off + 1] << 8
      | <u32>b[off + 2] << 16
      | <u32>b[off + 3] << 24;
    const r: u32 = (av + bv) & 0xFFFFFFFF;
    a[off]     = <u8> r;
    a[off + 1] = <u8>(r >> 8);
    a[off + 2] = <u8>(r >> 16);
    a[off + 3] = <u8>(r >> 24);
    off += 4;
  }
  return a;
}
