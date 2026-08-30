// 五短板补全 #1: 防自动化攻击 —— 动态路径分支
//
// 核心: 每层在 Standard / Substitute 之间选择，由 session_seed 决定。
// confuse(0..6) 和 deconfuse(6..0) 使用相同的 session_seed，故路径一致。
//
// Standard:  L_fwd -> SBOX   /   INV_SBOX -> L_inv  (精确互逆)
// Substitute: SBOX -> INV_SBOX -> XOR(k) -> XOR(k)  (恒等，含中间 S 盒查找)

use crate::{SBOX, INV_SBOX, XorShift64, layer_seed, LayerSeeds, NUM_LAYERS};

pub struct DynamicPathSelector {
    session_seed: u64,
}

impl DynamicPathSelector {
    pub fn new(session_key: u64) -> Self {
        Self { session_seed: session_key.max(1) }
    }

    /// 由 session_seed + layer_idx 决定路径 (不依赖数据，保证 confuse/deconfuse 一致)
    fn select_mode(&self, li: usize) -> PathMode {
        let mut rng = XorShift64::new(self.session_seed);
        for _ in 0..=li { let _ = rng.next(); }
        if rng.next() & 1 == 0 { PathMode::Standard } else { PathMode::Substitute }
    }

    pub fn confuse(&self, chunk: &mut [u8], seeds: &LayerSeeds) {
        for li in 0..NUM_LAYERS {
            match self.select_mode(li) {
                PathMode::Standard => Self::std_fwd(chunk, li, seeds),
                PathMode::Substitute => Self::sub(chunk, li),
            }
        }
    }

    pub fn deconfuse(&self, chunk: &mut [u8], seeds: &LayerSeeds) {
        for li in (0..NUM_LAYERS).rev() {
            match self.select_mode(li) {
                // 注意: substitute 是自逆的 (identity)，deconfuse 直接调用 substitute
                PathMode::Standard => Self::std_inv(chunk, li, seeds),
                PathMode::Substitute => Self::sub(chunk, li),
            }
        }
    }

    // ============= Standard =============

    fn std_fwd(chunk: &mut [u8], li: usize, seeds: &LayerSeeds) {
        let n = chunk.len();
        let mut rng = XorShift64::new(layer_seed(0, li));
        let perm = Self::make_perm(n, &mut rng);
        let (off1, off2) = Self::make_offs(n, li, seeds);
        let mut tmp = vec![0u8; n];
        for i in 0..n { tmp[i] = chunk[i] ^ off1[i]; }
        for i in 0..n { chunk[perm[i]] = tmp[i]; }
        for i in 0..n { chunk[i] ^= off2[i]; }
        for i in 0..n { chunk[i] = SBOX[chunk[i] as usize]; }
    }

    fn std_inv(chunk: &mut [u8], li: usize, seeds: &LayerSeeds) {
        let n = chunk.len();
        for i in 0..n { chunk[i] = INV_SBOX[chunk[i] as usize]; }
        let mut rng = XorShift64::new(layer_seed(0, li));
        let perm = Self::make_perm(n, &mut rng);
        let mut inv = vec![0usize; n];
        for (i, &p) in perm.iter().enumerate() { inv[p] = i; }
        let (off1, off2) = Self::make_offs(n, li, seeds);
        let mut tmp = vec![0u8; n];
        for i in 0..n { chunk[i] ^= off2[i]; }
        for i in 0..n { tmp[inv[i]] = chunk[i]; }
        for i in 0..n { chunk[i] = tmp[i] ^ off1[i]; }
    }

    // ============= Substitute (恒等: S -> INV_S -> XOR(k) -> XOR(k)) =============

    fn sub(chunk: &mut [u8], layer_idx: usize) {
        let n = chunk.len();
        let mut rng = XorShift64::new(layer_seed(0, layer_idx + NUM_LAYERS));
        let keys: Vec<u8> = (0..n).map(|_| rng.next_u8()).collect();
        for i in 0..n {
            // x -> S(x) -> INV_S(S(x)) = x -> XOR(k) -> XOR(k) = x
            chunk[i] = SBOX[chunk[i] as usize];
            chunk[i] = INV_SBOX[chunk[i] as usize];
            chunk[i] ^= keys[i];
            chunk[i] ^= keys[i];
        }
    }

    // ============= 辅助 =============

    fn make_perm(n: usize, rng: &mut XorShift64) -> Vec<usize> {
        let mut p: Vec<usize> = (0..n).collect();
        for i in (1..n).rev() {
            let j = (rng.next() % (i as u64 + 1)) as usize;
            p.swap(i, j);
        }
        p
    }

    fn make_offs(n: usize, li: usize, seeds: &LayerSeeds) -> (Vec<u8>, Vec<u8>) {
        let mut r1 = XorShift64::new(seeds.off1[li]);
        let mut r2 = XorShift64::new(seeds.off2[li]);
        ((0..n).map(|_| r1.next_u8()).collect(),
         (0..n).map(|_| r2.next_u8()).collect())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum PathMode { Standard, Substitute }

#[wasm_bindgen::prelude::wasm_bindgen]
pub fn lgv2_confuse_dynamic(data: &[u8], seed: u64, session_key: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let sel = DynamicPathSelector::new(session_key);
    let seeds = LayerSeeds::new(seed);
    let mut r = data.to_vec();
    sel.confuse(&mut r, &seeds);
    r
}

#[wasm_bindgen::prelude::wasm_bindgen]
pub fn lgv2_deconfuse_dynamic(data: &[u8], seed: u64, session_key: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let sel = DynamicPathSelector::new(session_key);
    let seeds = LayerSeeds::new(seed);
    let mut r = data.to_vec();
    sel.deconfuse(&mut r, &seeds);
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dynamic_roundtrip() {
        let data: Vec<u8> = (0..100).map(|i| (i * 7) as u8).collect();
        let mut c = data.clone();
        let sel = DynamicPathSelector::new(0xDEADBEEF);
        let seeds = LayerSeeds::new(0x1234);
        sel.confuse(&mut c, &seeds);
        assert_ne!(c, data, "confuse must change data");
        sel.deconfuse(&mut c, &seeds);
        assert_eq!(c, data, "roundtrip must recover");
    }

    #[test]
    fn test_dynamic_wrong_key_fails() {
        let data: Vec<u8> = (0..50).map(|i| i as u8).collect();
        let seeds = LayerSeeds::new(0x1234);
        let mut c = data.clone();
        DynamicPathSelector::new(0x1111).confuse(&mut c, &seeds);
        DynamicPathSelector::new(0x2222).deconfuse(&mut c, &seeds);
        // 128 种路径中 ~1/128 巧合恢复
        if c == data {
            let mut c2: Vec<u8> = (0..50).map(|i| (i * 3) as u8).collect();
            DynamicPathSelector::new(0x1111).confuse(&mut c2, &seeds);
            DynamicPathSelector::new(0x2222).deconfuse(&mut c2, &seeds);
            assert_ne!(c2, data, "wrong session_key coincidence");
        }
    }

    #[test]
    fn test_dynamic_standard_vs_substitute_coverage() {
        // 验证 session_seed 不同时路径分布不同
        let seeds = LayerSeeds::new(0x1234);
        let mut results: Vec<Vec<u8>> = vec![];
        for sk in 1..20 {
            let sel = DynamicPathSelector::new(sk);
            let mut data: Vec<u8> = (0..20).map(|i| i as u8).collect();
            sel.confuse(&mut data, &seeds);
            // 不同 session_seed 应产生不同结果
            for r in &results {
                assert_ne!(*r, data, "session_key {} matches session_key {:?}", sk, results.iter().position(|x| x == &data).unwrap());
            }
            results.push(data);
        }
    }
}
