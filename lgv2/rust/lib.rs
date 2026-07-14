use wasm_bindgen::prelude::*;

/// LG v2.1/v2.2 混淆引擎 (Rust/C/WASM)
/// 匹配 Python lgv2_nonlinear.py 参考实现：
///   - 输入 ≤ BLOCK_SIZE：直接对原始长度执行全 7 层
///   - 输入 > BLOCK_SIZE：分割为 BLOCK_SIZE 块，每块独立混淆
///   - off1/off2 为 64-bit 种子，每层每块动态展开为 chunk_size 字节

const NUM_LAYERS: usize = 7;

// ---- AES S-box ----
static SBOX: [u8; 256] = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5,
    0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0,
    0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc,
    0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a,
    0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0,
    0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b,
    0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85,
    0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5,
    0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17,
    0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88,
    0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c,
    0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9,
    0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6,
    0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e,
    0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94,
    0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68,
    0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
];

static INV_SBOX: [u8; 256] = [
    0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38,
    0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
    0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87,
    0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
    0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d,
    0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
    0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2,
    0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
    0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16,
    0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
    0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda,
    0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
    0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a,
    0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
    0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02,
    0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
    0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea,
    0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
    0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85,
    0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
    0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89,
    0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
    0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20,
    0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
    0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31,
    0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
    0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d,
    0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
    0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0,
    0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
    0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26,
    0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d,
];

// ---- xorshift64 (shifts 13/7/17, matching Python) ----
struct XorShift64(u64);

impl XorShift64 {
    fn new(seed: u64) -> Self { Self(if seed == 0 { 1 } else { seed }) }
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn next_u8(&mut self) -> u8 { (self.next() & 0xFF) as u8 }
}

// ---- 种子派生 ----
fn layer_seed(base: u64, idx: usize) -> u64 {
    let mut s = base ^ ((idx as u64 + 1).wrapping_mul(0x9E3779B97F4A7C15));
    s ^= s >> 30;
    s = s.wrapping_mul(0xBF58476D1CE4E5B9);
    s ^= s >> 27;
    s = s.wrapping_mul(0x94D049BB133111EB);
    s ^= s >> 31;
    s
}

/// 预计算各层 off1/off2 种子（64-bit，与输入大小无关）
struct LayerSeeds {
    off1: [u64; NUM_LAYERS],
    off2: [u64; NUM_LAYERS],
}

impl LayerSeeds {
    fn new(seed: u64) -> Self {
        let mut off1 = [0u64; NUM_LAYERS];
        let mut off2 = [0u64; NUM_LAYERS];
        for li in 0..NUM_LAYERS {
            let mut rng = XorShift64::new(layer_seed(seed, li + NUM_LAYERS));
            off1[li] = rng.next();
            off2[li] = rng.next();
        }
        Self { off1, off2 }
    }
}

/// 对单个 chunk（任意大小 n）执行正向全 7 层
///   L1 -> SBOX -> L2 -> SBOX -> ... -> L7 -> SBOX
fn confuse_chunk(chunk: &mut [u8], seed: u64, seeds: &LayerSeeds) {
    let n = chunk.len();
    for li in 0..NUM_LAYERS {
        // 1. 线性层: XOR(off1) -> 置换 -> XOR(off2)
        let mut rng = XorShift64::new(layer_seed(seed, li));
        let perm: Vec<usize> = {
            let mut p: Vec<usize> = (0..n).collect();
            for i in (1..n).rev() {
                let j = (rng.next() % (i as u64 + 1)) as usize;
                p.swap(i, j);
            }
            p
        };
        let mut rng1 = XorShift64::new(seeds.off1[li]);
        let mut rng2 = XorShift64::new(seeds.off2[li]);
        let off1: Vec<u8> = (0..n).map(|_| rng1.next_u8()).collect();
        let off2: Vec<u8> = (0..n).map(|_| rng2.next_u8()).collect();
        let mut tmp = vec![0u8; n];
        for i in 0..n { tmp[i] = chunk[i] ^ off1[i]; }
        for i in 0..n { chunk[perm[i]] = tmp[i]; }
        for i in 0..n { chunk[i] ^= off2[i]; }
        // 2. 非线性 S-box
        for i in 0..n { chunk[i] = SBOX[chunk[i] as usize]; }
    }
}

/// 对单个 chunk 执行逆向全 7 层
///   INV_SBOX -> L7_INV -> INV_SBOX -> ... -> L1_INV
fn deconfuse_chunk(chunk: &mut [u8], seed: u64, seeds: &LayerSeeds) {
    let n = chunk.len();
    for li in (0..NUM_LAYERS).rev() {
        // 1. INV_SBOX
        for i in 0..n { chunk[i] = INV_SBOX[chunk[i] as usize]; }
        // 2. 线性逆层: XOR(off2) -> 逆置换 -> XOR(off1)
        let mut rng = XorShift64::new(layer_seed(seed, li));
        let perm: Vec<usize> = {
            let mut p: Vec<usize> = (0..n).collect();
            for i in (1..n).rev() {
                let j = (rng.next() % (i as u64 + 1)) as usize;
                p.swap(i, j);
            }
            p
        };
        let inv_perm: Vec<usize> = {
            let mut inv = vec![0usize; n];
            for (i, &p) in perm.iter().enumerate() { inv[p] = i; }
            inv
        };
        let mut rng1 = XorShift64::new(seeds.off1[li]);
        let mut rng2 = XorShift64::new(seeds.off2[li]);
        let off1: Vec<u8> = (0..n).map(|_| rng1.next_u8()).collect();
        let off2: Vec<u8> = (0..n).map(|_| rng2.next_u8()).collect();
        let mut tmp = vec![0u8; n];
        for i in 0..n { chunk[i] ^= off2[i]; }
        for i in 0..n { tmp[inv_perm[i]] = chunk[i]; }
        for i in 0..n { chunk[i] = tmp[i] ^ off1[i]; }
    }
}

/// 全量混淆：整个 data 作为单个 chunk 过全 7 层（匹配 Python 行为）
fn confuse_full(data: &mut [u8], seed: u64) {
    let seeds = LayerSeeds::new(seed);
    confuse_chunk(data, seed, &seeds);
}

fn deconfuse_full(data: &mut [u8], seed: u64) {
    let seeds = LayerSeeds::new(seed);
    deconfuse_chunk(data, seed, &seeds);
}

// ============================================================
// WASM 公开 API
// ============================================================

#[wasm_bindgen]
pub fn lgv2_confuse(data: &[u8], seed: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    confuse_full(&mut result, seed);
    result
}

#[wasm_bindgen]
pub fn lgv2_deconfuse(data: &[u8], seed: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    deconfuse_full(&mut result, seed);
    result
}

// ============================================================
// 单元测试
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_with_python_100b() {
        // Python reference (seed=0x1234): [215, 243, 99, 104, 54, 216, 205, 254]
        let data: Vec<u8> = (0..100).map(|i| (i * 7) as u8).collect();
        let confused = lgv2_confuse(&data, 0x1234);
        let expected_first8 = vec![215, 243, 99, 104, 54, 216, 205, 254];
        assert_eq!(&confused[..8], &expected_first8[..], "100B first 8 bytes must match Python");
    }

    #[test]
    fn test_roundtrip_100b() {
        let data: Vec<u8> = (0..100).map(|i| (i * 7) as u8).collect();
        let confused = lgv2_confuse(&data, 0x1234);
        let restored = lgv2_deconfuse(&confused, 0x1234);
        assert_eq!(data, restored, "round-trip 100B failed");
    }

    #[test]
    fn test_roundtrip_840b() {
        let data: Vec<u8> = (0..840).map(|i| (i ^ 0xAA) as u8).collect();
        let confused = lgv2_confuse(&data, 0xDEADBEEF);
        let restored = lgv2_deconfuse(&confused, 0xDEADBEEF);
        assert_eq!(data, restored, "round-trip 840B failed");
    }

    #[test]
    fn test_roundtrip_2000b() {
        let data: Vec<u8> = (0..2000).map(|i| (i & 0xFF) as u8).collect();
        let confused = lgv2_confuse(&data, 0xCAFE);
        let restored = lgv2_deconfuse(&confused, 0xCAFE);
        assert_eq!(data, restored, "round-trip 2000B failed");
    }

    #[test]
    fn test_roundtrip_4b() {
        let data: Vec<u8> = vec![0x01, 0x02, 0x03, 0x04];
        let confused = lgv2_confuse(&data, 42);
        let restored = lgv2_deconfuse(&confused, 42);
        assert_eq!(data, restored, "round-trip 4B failed");
    }

    #[test]
    fn test_roundtrip_1b() {
        let data: Vec<u8> = vec![0xAA];
        let confused = lgv2_confuse(&data, 99);
        let restored = lgv2_deconfuse(&confused, 99);
        assert_eq!(data, restored, "round-trip 1B failed");
    }

    #[test]
    fn test_deterministic() {
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let r1 = lgv2_confuse(&data, 42);
        let r2 = lgv2_confuse(&data, 42);
        assert_eq!(r1, r2, "same seed must produce same output");
    }

    #[test]
    fn test_seed_sensitivity() {
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let r1 = lgv2_confuse(&data, 42);
        let r2 = lgv2_confuse(&data, 43);
        assert_ne!(r1, r2, "different seed must produce different output");
    }

    #[test]
    fn test_empty_input() {
        let data: Vec<u8> = vec![];
        let confused = lgv2_confuse(&data, 0);
        assert_eq!(confused.len(), 0);
    }

    /// 4-vector cross-verification vs Python lgv2_nonlinear.py (2026-07-10)
    #[test]
    fn test_cross_verify_python_full() {
        // 4B seed=42: confused=[8, 184, 103, 124]
        let c4 = lgv2_confuse(&[1u8,2,3,4], 42);
        assert_eq!(&c4[..4], &[8u8,184,103,124], "4B cross-verify");

        // 100B seed=0x1234: confused[:8]=[215,243,99,104,54,216,205,254]
        let d100: Vec<u8> = (0..100).map(|i| (i*7) as u8).collect();
        let c100 = lgv2_confuse(&d100, 0x1234);
        assert_eq!(&c100[..8], &[215u8,243,99,104,54,216,205,254], "100B cross-verify");

        // 840B seed=0xDEADBEEF: confused[:8]=[87,6,82,189,17,133,120,101]
        let d840: Vec<u8> = (0..840).map(|i| (i^0xAA) as u8).collect();
        let c840 = lgv2_confuse(&d840, 0xDEADBEEF);
        assert_eq!(&c840[..8], &[87u8,6,82,189,17,133,120,101], "840B cross-verify");

        // 2000B seed=0xCAFE: confused[:8]=[120,86,168,124,208,10,211,172]
        let d2000: Vec<u8> = (0..2000).map(|i| (i&0xFF) as u8).collect();
        let c2000 = lgv2_confuse(&d2000, 0xCAFE);
        assert_eq!(&c2000[..8], &[120u8,86,168,124,208,10,211,172], "2000B cross-verify");
    }

    /// 5-vector cross-verify vs Python LGV2Nonlinear.confuse (2026-07-14)
    #[test]
    fn test_python_cross_verify_5vec() {
        // 5B "hello" seed=0x1234 u2192 [207,240,152,132,123]
        let c5 = lgv2_confuse(b"hello", 0x1234);
        assert_eq!(&c5[..5], &[207u8,240,152,132,123], "5B cross-verify");

        // 100B seq=i seed=0xDEAD u2192 [209,19,169,27,62,198,24,52]
        let d100: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let c100 = lgv2_confuse(&d100, 0xDEAD);
        assert_eq!(&c100[..8], &[209u8,19,169,27,62,198,24,52], "100B seq cross-verify");

        // 840B seq=i seed=0xCAFE1234 u2192 [215,68,66,249,17,14,156,65]
        let d840: Vec<u8> = (0..840).map(|i| i as u8).collect();
        let c840 = lgv2_confuse(&d840, 0xCAFE1234);
        assert_eq!(&c840[..8], &[215u8,68,66,249,17,14,156,65], "840B seq cross-verify");

        // 64B zeros seed=0xBEEF u2192 [151,85,234,245,83,210,164,107]
        let c64z = lgv2_confuse(&[0u8;64], 0xBEEF);
        assert_eq!(&c64z[..8], &[151u8,85,234,245,83,210,164,107], "64B zeros cross-verify");

        // 32B FF seed=0x55 u2192 [143,174,209,228,135,100,99,94]
        let c32f = lgv2_confuse(&[0xFFu8;32], 0x55);
        assert_eq!(&c32f[..8], &[143u8,174,209,228,135,100,99,94], "32B FF cross-verify");
    }
}
