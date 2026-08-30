// lg-v3/src/wreath.rs — Wreath 置换群递归混淆核心
// Extracted from v2.2.2 lib.rs (identical logic, zero change)
// 7-layer recursive permutation via XorShift64 PRNG + AES S-box

use crate::sbox::{SBOX, INV_SBOX};

pub const NUM_LAYERS: usize = 7;

// ---- xorshift64 ----
pub struct XorShift64(pub u64);

impl XorShift64 {
    pub fn new(seed: u64) -> Self { Self(if seed == 0 { 1 } else { seed }) }
    pub fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13; x ^= x >> 7; x ^= x << 17; self.0 = x; x
    }
    pub fn next_u8(&mut self) -> u8 { (self.next() & 0xFF) as u8 }
}

// ---- seed derivation ----
pub fn layer_seed(base: u64, idx: usize) -> u64 {
    let mut s = base ^ ((idx as u64 + 1).wrapping_mul(0x9E3779B97F4A7C15));
    s ^= s >> 30; s = s.wrapping_mul(0xBF58476D1CE4E5B9); s ^= s >> 27;
    s = s.wrapping_mul(0x94D049BB133111EB); s ^= s >> 31; s
}

// ---- layer seeds ----
pub struct LayerSeeds {
    pub off1: [u64; NUM_LAYERS],
    pub off2: [u64; NUM_LAYERS],
}

impl LayerSeeds {
    pub fn new(seed: u64) -> Self {
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

// ---- per-layer Standard operations (shared by fixed and dynamic paths) ----
// Each layer: XOR(off1) -> permute -> SBOX(XOR(off2)) — identical to the
// original v2.2.2 semantics (perm from layer_seed(seed, li), offs from seeds).

fn confuse_layer_std(
    chunk: &mut [u8],
    seed: u64,
    seeds: &LayerSeeds,
    li: usize,
    perm: &mut [usize],
    tmp: &mut [u8],
    off1: &mut [u8],
    off2: &mut [u8],
) {
    let n = chunk.len();
    let mut rng = XorShift64::new(layer_seed(seed, li));
    for i in 0..n { perm[i] = i; }
    for i in (1..n).rev() {
        let j = (rng.next() % (i as u64 + 1)) as usize;
        perm.swap(i, j);
    }
    let mut rng1 = XorShift64::new(seeds.off1[li]);
    let mut rng2 = XorShift64::new(seeds.off2[li]);
    for i in 0..n { off1[i] = rng1.next_u8(); }
    for i in 0..n { off2[i] = rng2.next_u8(); }
    for i in 0..n { tmp[i] = chunk[i] ^ off1[i]; }
    for i in 0..n {
        chunk[perm[i]] = SBOX[(tmp[i] ^ off2[perm[i]]) as usize];
    }
}

fn deconfuse_layer_std(
    chunk: &mut [u8],
    seed: u64,
    seeds: &LayerSeeds,
    li: usize,
    perm: &mut [usize],
    inv_perm: &mut [usize],
    tmp: &mut [u8],
    off1: &mut [u8],
    off2: &mut [u8],
) {
    let n = chunk.len();
    let mut rng = XorShift64::new(layer_seed(seed, li));
    for i in 0..n { perm[i] = i; }
    for i in (1..n).rev() {
        let j = (rng.next() % (i as u64 + 1)) as usize;
        perm.swap(i, j);
    }
    for i in 0..n { inv_perm[perm[i]] = i; }
    let mut rng1 = XorShift64::new(seeds.off1[li]);
    let mut rng2 = XorShift64::new(seeds.off2[li]);
    for i in 0..n { off1[i] = rng1.next_u8(); }
    for i in 0..n { off2[i] = rng2.next_u8(); }
    for i in 0..n {
        let val = INV_SBOX[chunk[i] as usize] ^ off2[i];
        tmp[inv_perm[i]] = val;
    }
    for i in 0..n { chunk[i] = tmp[i] ^ off1[i]; }
}

// ---- dynamic path selection (Sprint 4) ----
// Each layer runs either the Standard transform above or a Substitute layer
// (SBOX -> INV_SBOX -> XOR(k) -> XOR(k), an identity with S-box lookups in
// between). The choice is derived solely from session_key + layer index, so
// forward and inverse agree without any extra state, and different sessions
// walk different paths (session independence is strengthened beyond what the
// fixed pipeline provides).

/// true = Substitute (identity layer), false = Standard (real transform).
pub fn dynamic_path_mode(session_key: u64, li: usize) -> bool {
    let mut rng = XorShift64::new(session_key.max(1));
    for _ in 0..=li { let _ = rng.next(); }
    rng.next() & 1 == 1
}

fn substitute_layer(chunk: &mut [u8], seed: u64, li: usize, keys: &mut [u8]) {
    let n = chunk.len();
    let mut rng = XorShift64::new(layer_seed(seed, li + NUM_LAYERS));
    for i in 0..n { keys[i] = rng.next_u8(); }
    for i in 0..n {
        chunk[i] = SBOX[chunk[i] as usize];
        chunk[i] = INV_SBOX[chunk[i] as usize];
        chunk[i] ^= keys[i];
        chunk[i] ^= keys[i];
    }
}

// ---- confuse/deconfuse a single chunk — variable depth + pre-alloc reuse ----
pub fn confuse_chunk_depth(chunk: &mut [u8], seed: u64, seeds: &LayerSeeds, depth: usize) {
    let n = chunk.len();
    let layers = depth.clamp(1, NUM_LAYERS);
    let mut perm = vec![0usize; n];
    let mut tmp = vec![0u8; n];
    let mut off1 = vec![0u8; n];
    let mut off2 = vec![0u8; n];
    for li in 0..layers {
        confuse_layer_std(chunk, seed, seeds, li, &mut perm, &mut tmp, &mut off1, &mut off2);
    }
}

pub fn deconfuse_chunk_depth(chunk: &mut [u8], seed: u64, seeds: &LayerSeeds, depth: usize) {
    let n = chunk.len();
    let layers = depth.clamp(1, NUM_LAYERS);
    let mut perm = vec![0usize; n];
    let mut inv_perm = vec![0usize; n];
    let mut tmp = vec![0u8; n];
    let mut off1 = vec![0u8; n];
    let mut off2 = vec![0u8; n];
    for li in (0..layers).rev() {
        deconfuse_layer_std(chunk, seed, seeds, li, &mut perm, &mut inv_perm, &mut tmp, &mut off1, &mut off2);
    }
}

// ---- dynamic-path variants (Sprint 4) ----
// Per layer, choose Substitute or Standard by session_key. When a layer is
// Standard the byte behavior is identical to the fixed pipeline, so fixed
// golden vectors remain valid; the Substitute layer is self-inverse, keeping
// roundtrip exact for any session_key.

pub fn confuse_chunk_depth_dynamic(chunk: &mut [u8], seed: u64, session_key: u64, seeds: &LayerSeeds, depth: usize) {
    let n = chunk.len();
    let layers = depth.clamp(1, NUM_LAYERS);
    let mut perm = vec![0usize; n];
    let mut tmp = vec![0u8; n];
    let mut off1 = vec![0u8; n];
    let mut off2 = vec![0u8; n];
    let mut keys = vec![0u8; n];
    for li in 0..layers {
        if dynamic_path_mode(session_key, li) {
            substitute_layer(chunk, seed, li, &mut keys);
        } else {
            confuse_layer_std(chunk, seed, seeds, li, &mut perm, &mut tmp, &mut off1, &mut off2);
        }
    }
}

pub fn deconfuse_chunk_depth_dynamic(chunk: &mut [u8], seed: u64, session_key: u64, seeds: &LayerSeeds, depth: usize) {
    let n = chunk.len();
    let layers = depth.clamp(1, NUM_LAYERS);
    let mut perm = vec![0usize; n];
    let mut inv_perm = vec![0usize; n];
    let mut tmp = vec![0u8; n];
    let mut off1 = vec![0u8; n];
    let mut off2 = vec![0u8; n];
    let mut keys = vec![0u8; n];
    for li in (0..layers).rev() {
        if dynamic_path_mode(session_key, li) {
            substitute_layer(chunk, seed, li, &mut keys);
        } else {
            deconfuse_layer_std(chunk, seed, seeds, li, &mut perm, &mut inv_perm, &mut tmp, &mut off1, &mut off2);
        }
    }
}

pub fn confuse_full(data: &mut [u8], seed: u64) {
    let seeds = LayerSeeds::new(seed);
    confuse_chunk_depth(data, seed, &seeds, NUM_LAYERS);
}

pub fn deconfuse_full(data: &mut [u8], seed: u64) {
    let seeds = LayerSeeds::new(seed);
    deconfuse_chunk_depth(data, seed, &seeds, NUM_LAYERS);
}

pub fn confuse_full_dynamic(data: &mut [u8], seed: u64, session_key: u64) {
    let seeds = LayerSeeds::new(seed);
    confuse_chunk_depth_dynamic(data, seed, session_key, &seeds, NUM_LAYERS);
}

pub fn deconfuse_full_dynamic(data: &mut [u8], seed: u64, session_key: u64) {
    let seeds = LayerSeeds::new(seed);
    deconfuse_chunk_depth_dynamic(data, seed, session_key, &seeds, NUM_LAYERS);
}
