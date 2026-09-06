//! VWZ Rust → JS/WASM interoperability test
//!
//! Generates (kp, msg, sig) via the Rust native implementation and prints them as JSON.
//! Then the JS side feeds the bytes to the official WASM verify() to check they interoperate.

use vwz_signature::signature::{keygen_seeded, sign, serialize_public_key, serialize_signature};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let k: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(4);
    let seed: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(20260906);
    let msg_str: String = args.get(3).cloned().unwrap_or_else(|| "interop-test".to_string());
    let msg = msg_str.as_bytes();

    let kp = keygen_seeded(k, seed);
    let sig = sign(&kp.secret_key(), msg);
    let pk_bytes = serialize_public_key(&kp.public_key());
    let sig_bytes = serialize_signature(&sig);

    let pk_arr: Vec<u16> = pk_bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    let sig_arr: Vec<u16> = sig_bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();

    let json = serde_json::json!({
        "k": k,
        "seed": seed,
        "msg": msg_str,
        "pk_bytes": pk_bytes,
        "pk_u16": pk_arr,
        "sig_bytes": sig_bytes,
        "sig_u16": sig_arr,
        "pk_first4_pk_u16": pk_arr.iter().take(4).copied().collect::<Vec<_>>(),
        "sig_first4_u16": sig_arr.iter().take(4).copied().collect::<Vec<_>>(),
    });
    println!("{}", serde_json::to_string_pretty(&json).unwrap());
}