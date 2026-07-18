//! VWZ Hash-and-Sign Signature — Rust/WASM Implementation
//!
//! Based on IACR 2025/624: Trapdoor one-way functions from tensors.
//! Implements Lemma 1 (sparse Lagrange interpolation) and Theorem 2
//! (preimage sampling) for 3D boundary format (2k+1)×(k+1)×(k+1).
//!
//! Module structure:
//! - field: F_q arithmetic with q=3329
//! - tensor: VWZ tensor definition and evaluation
//! - trapdoor: key generation with basis change
//! - preimage: sparse Lagrange interpolation (Lemma 1)
//! - hash_target: SHAKE-256 → sparse target expansion
//! - signature: Hash-and-Sign scheme with serialization

pub mod field;
pub mod tensor;
pub mod trapdoor;
pub mod preimage;
pub mod hash_target;
pub mod signature;
pub mod structured;
pub mod constants;
pub mod vwz_rank1;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
