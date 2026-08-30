//! VWZ Hash-and-Sign Signature — Rust/WASM Implementation
//!
//! Based on IACR 2025/624: Trapdoor one-way functions from tensors.
//! Implements preimage sampling for a security-hardened **mixed
//! Vandermonde tensor** of boundary format (2k+2)×(2k+1)×(2k+1), whose
//! slices are rank-2 (defeating the rank-1 separation attack).
//!
//! Module structure:
//! - field: F_q arithmetic with q=3329
//! - tensor: mixed tensor definition, public key build and evaluation
//! - trapdoor: key generation with (X2a,X2b,X3a,X3b) basis changes
//! - preimage: linear algebra + Za/Zb-split preimage sampling
//! - hash_target: SHAKE-256 → sparse target expansion
//! - signature: Hash-and-Sign scheme with serialization

pub mod field;
pub mod tensor;
pub mod trapdoor;
pub mod preimage;
pub mod hash_target;
pub mod signature;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}
