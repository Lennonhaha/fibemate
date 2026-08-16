// lg-v3/src/premix.rs — Pre/Post-mixer: XOR-Keystream over full chunk
//
// Problem: Wreath active dimension = 48/256 (19% of bytes get S-box treatment).
// Solution: XOR-keystream pre-mix before Wreath, post-mix after Wreath.
//   - Covers ALL bytes (any chunk size)
//   - Perfectly invertible (XOR is its own inverse)
//   - Session-key-dependent keystream (different sessions = different keystream)
//   - Composable: pre_mix -> Wreath -> post_mix
//
// Architecture:
//   Forward:  pre_mix(key) -> Wreath(seed) -> post_mix(key)  [symmetric for inverse]
//   where key = combined_seed = seed ^ session_key
//
// Layer 0: XOR-Keystream pre-mix  (all 256 bytes)
// Layer 1..7: Wreath layers       (48-dim S-box + Fisher-Yates)
// Layer 8: XOR-Keystream post-mix (all 256 bytes)
// Total coverage: ALL bytes (full 256), not just 48.

use crate::wreath::XorShift64;

// ---- XOR keystream pre-mix: data[i] ^= keystream[i] ----
pub fn premix(data: &mut [u8], key: u64) {
    if data.is_empty() { return; }
    let n = data.len();
    let mut rng = XorShift64::new(key);
    for i in 0..n {
        data[i] ^= rng.next_u8();
    }
}

// ---- XOR keystream post-mix (inverse of premix, same operation) ----
pub fn postmix(data: &mut [u8], key: u64) {
    // XOR is its own inverse: postmix == premix
    premix(data, key);
}

// ---- Combined forward: premix -> Wreath -> postmix ----
// This is the main entry point for confuse_ex / deconfuse_ex
pub fn full_mix_forward(data: &mut [u8], seed: u64, session_key: u64) {
    let key = seed.wrapping_add(session_key);
    premix(data, key);            // Layer 0: all bytes
    crate::wreath::confuse_full(data, seed);  // Layers 1-7: Wreath
    postmix(data, key);           // Layer 8: all bytes
}

pub fn full_mix_inverse(data: &mut [u8], seed: u64, session_key: u64) {
    let key = seed.wrapping_add(session_key);
    premix(data, key);            // Layer 8: undo postmix (XOR inverse)
    crate::wreath::deconfuse_full(data, seed);  // Layers 7-1: undo Wreath
    postmix(data, key);           // Layer 0: undo premix
}

// ---- Depth variant (for confuse_d / deconfuse_d) ----
pub fn full_mix_forward_depth(data: &mut [u8], seed: u64, session_key: u64, depth: usize) {
    let key = seed.wrapping_add(session_key);
    premix(data, key);
    crate::wreath::confuse_chunk_depth(data, seed, &crate::wreath::LayerSeeds::new(seed), depth);
    postmix(data, key);
}

pub fn full_mix_inverse_depth(data: &mut [u8], seed: u64, session_key: u64, depth: usize) {
    let key = seed.wrapping_add(session_key);
    premix(data, key);
    crate::wreath::deconfuse_chunk_depth(data, seed, &crate::wreath::LayerSeeds::new(seed), depth);
    postmix(data, key);
}

// ---- Depth=0 variant (premix only, for testing) ----
pub fn premix_only(data: &mut [u8], seed: u64, session_key: u64) {
    let key = seed.wrapping_add(session_key);
    premix(data, key);
    postmix(data, key);
}
pub fn unpremix_only(data: &mut [u8], seed: u64, session_key: u64) {
    premix_only(data, seed, session_key) // premix is its own inverse
}
