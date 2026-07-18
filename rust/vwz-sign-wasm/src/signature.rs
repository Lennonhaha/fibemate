//! Hash-and-Sign signature scheme + WASM bindings.
//!
//! Sign(sk, msg):
//!   1. target = hash_to_sparse_target(msg, k)
//!   2. (w2, w3) = solve_preimage_sparse(sk.tensor, target)
//!   3. Return (w2, w3)
//!
//! Verify(pk, msg, sig):
//!   1. target = hash_to_sparse_target(msg, k)
//!   2. Check public_tensor_eval(pk, sig.w2, sig.w3) == target

use crate::hash_target::hash_to_sparse_target;
use crate::preimage::PreimageVec;
use crate::tensor::{public_tensor_eval, PubTensor};
use crate::trapdoor::{generate_trapdoor, sample_preimage, Trapdoor};
use wasm_bindgen::prelude::*;

// ============================================================
// Public types (only fields are Copy or private)
// ============================================================

/// VWZ public key.
#[wasm_bindgen]
#[derive(Clone)]
pub struct PublicKey {
    k: usize,
    data: Vec<Vec<Vec<u16>>>,
}

/// VWZ secret key (trapdoor).
#[wasm_bindgen]
#[derive(Clone)]
pub struct SecretKey {
    td: Trapdoor,
}

/// VWZ signature: preimage (w2, w3).
#[wasm_bindgen]
#[derive(Clone)]
pub struct VwzSignature {
    k: usize,
    w2: PreimageVec,
    w3: PreimageVec,
}

/// Keypair returned by keygen.
#[wasm_bindgen]
pub struct Keypair {
    pk: PublicKey,
    sk: SecretKey,
}

#[wasm_bindgen]
impl Keypair {
    pub fn public_key(&self) -> PublicKey { self.pk.clone() }
    pub fn secret_key(&self) -> SecretKey { self.sk.clone() }
}

// ============================================================
// WASM-exported functions
// ============================================================

/// Generate a new keypair with parameter k.
/// k=8 → PK ~468B, Sig ~36B, security ~73 bits (tensor OWF lower bound)
/// k=16 → PK ~1.7KB, Sig ~68B
/// k=32 → PK ~6.3KB, Sig ~132B
#[wasm_bindgen]
pub fn keygen(k: usize) -> Keypair {
    keygen_seeded_impl(k, None)
}

fn keygen_seeded_impl(k: usize, seed: Option<u64>) -> Keypair {
    let (psi_data, td) = generate_trapdoor(k, seed);
    Keypair {
        pk: PublicKey { k, data: psi_data },
        sk: SecretKey { td },
    }
}

/// Generate deterministic keypair from seed (for testing).
#[wasm_bindgen]
pub fn keygen_seeded(k: usize, seed: u64) -> Keypair {
    keygen_seeded_impl(k, Some(seed))
}

/// Sign a message.
#[wasm_bindgen]
pub fn sign(sk: &SecretKey, msg: &[u8]) -> VwzSignature {
    let k = sk.td.k;
    let target = hash_to_sparse_target(msg, k);
    let (w2, w3) = sample_preimage(&sk.td, &target)
        .expect("Signing failed: target not sparse or tensor singular");
    VwzSignature { k, w2, w3 }
}

/// Verify a signature.
#[wasm_bindgen]
pub fn verify(pk: &PublicKey, msg: &[u8], sig: &VwzSignature) -> bool {
    if sig.k != pk.k { return false; }
    let m = sig.k + 1;
    if sig.w2.len() != m || sig.w3.len() != m { return false; }

    let pk_tensor = PubTensor::new(pk.k, pk.data.clone());
    let target = hash_to_sparse_target(msg, pk.k);
    let result = public_tensor_eval(&pk_tensor, &sig.w2, &sig.w3);
    result == target
}

// ============================================================
// Accessors for test modules
// ============================================================

impl VwzSignature {
    #[cfg(test)]
    pub fn w2(&self) -> &[u16] { &self.w2 }
    #[cfg(test)]
    pub fn w3(&self) -> &[u16] { &self.w3 }
}

impl Keypair {
    pub fn public_key_ref(&self) -> &PublicKey { &self.pk }
    pub fn secret_key_ref(&self) -> &SecretKey { &self.sk }
}

// ============================================================
// Serialization (compact binary)
// ============================================================

/// Serialize public key to bytes.
#[wasm_bindgen]
pub fn serialize_public_key(pk: &PublicKey) -> Vec<u8> {
    let mut buf = vec![pk.k as u8];
    for i1 in 0..(2 * pk.k + 1) {
        for i2 in 0..(pk.k + 1) {
            for i3 in 0..(pk.k + 1) {
                buf.extend_from_slice(&pk.data[i1][i2][i3].to_le_bytes());
            }
        }
    }
    buf
}

/// Deserialize public key from bytes.
#[wasm_bindgen]
pub fn deserialize_public_key(data: &[u8]) -> Result<PublicKey, JsValue> {
    if data.is_empty() {
        return Err(JsValue::from_str("Empty data"));
    }
    let k = data[0] as usize;
    let n = 2 * k + 1;
    let m = k + 1;
    let expected = 1 + n * m * m * 2;
    if data.len() != expected {
        return Err(JsValue::from_str(&format!("Invalid length: {} != {}", data.len(), expected)));
    }
    let mut psi = vec![vec![vec![0u16; m]; m]; n];
    let mut offset = 1;
    for i1 in 0..n {
        for i2 in 0..m {
            for i3 in 0..m {
                psi[i1][i2][i3] = u16::from_le_bytes([data[offset], data[offset + 1]]);
                offset += 2;
            }
        }
    }
    Ok(PublicKey { k, data: psi })
}

/// Serialize signature to bytes. Format: 1-byte k + 2(k+1)·2-byte LE.
#[wasm_bindgen]
pub fn serialize_signature(sig: &VwzSignature) -> Vec<u8> {
    let mut buf = vec![sig.k as u8];
    for &v in &sig.w2 { buf.extend_from_slice(&v.to_le_bytes()); }
    for &v in &sig.w3 { buf.extend_from_slice(&v.to_le_bytes()); }
    buf
}

/// Deserialize signature from bytes.
#[wasm_bindgen]
pub fn deserialize_signature(data: &[u8]) -> Result<VwzSignature, JsValue> {
    if data.is_empty() { return Err(JsValue::from_str("Empty data")); }
    let k = data[0] as usize;
    let m = k + 1;
    let expected = 1 + 4 * m;
    if data.len() != expected {
        return Err(JsValue::from_str(&format!("Invalid sig length: {} != {}", data.len(), expected)));
    }
    let mut offset = 1;
    let w2: Vec<u16> = (0..m).map(|_| {
        let v = u16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2; v
    }).collect();
    let w3: Vec<u16> = (0..m).map(|_| {
        let v = u16::from_le_bytes([data[offset], data[offset + 1]]);
        offset += 2; v
    }).collect();
    Ok(VwzSignature { k, w2, w3 })
}

/// Get key/signature sizes for given parameter k.
#[wasm_bindgen]
pub fn estimate_sizes(k: usize) -> JsValue {
    let n = 2 * k + 1;
    let m = k + 1;
    let pk_entries = n * m * m;
    let pk_bytes = pk_entries * 2;
    let pk_rank1 = (n * m + m * m) * 2;
    let sig_bytes = 2 * m * 2;

    let result = serde_json::json!({
        "k": k, "N": n, "M": m,
        "pk_tensor_entries": pk_entries,
        "pk_bytes": pk_bytes,
        "pk_bytes_rank1_compressed": pk_rank1,
        "sig_bytes": sig_bytes,
        "sig_elements": 2 * m,
    });
    JsValue::from_str(&result.to_string())
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sign_verify_basic() {
        for k in [2, 4, 8] {
            let kp = keygen_seeded(k, 42);
            let msg = format!("Fibemate VWZ test k={k}").into_bytes();
            let sig = sign(kp.secret_key_ref(), &msg);
            assert!(verify(kp.public_key_ref(), &msg, &sig), "k={k}: verify failed");
            assert!(!verify(kp.public_key_ref(), b"wrong message", &sig), "k={k}: reject wrong msg");
            let mut mod_msg = msg.clone(); mod_msg.push(b'x');
            assert!(!verify(kp.public_key_ref(), &mod_msg, &sig), "k={k}: reject modified msg");
        }
    }

    #[test]
    fn test_deterministic() {
        let kp = keygen_seeded(4, 42);
        let msg = b"deterministic test";
        let sig1 = sign(kp.secret_key_ref(), msg);
        let sig2 = sign(kp.secret_key_ref(), msg);
        assert_eq!(sig1.w2, sig2.w2);
        assert_eq!(sig1.w3, sig2.w3);
    }

    #[test]
    fn test_serialization_roundtrip() {
        let kp = keygen_seeded(4, 42);
        let msg = b"serialization test";
        let sig = sign(kp.secret_key_ref(), msg);

        let sig_bytes = serialize_signature(&sig);
        let sig2 = deserialize_signature(&sig_bytes).unwrap();
        assert_eq!(sig.w2, sig2.w2);
        assert_eq!(sig.w3, sig2.w3);
        assert!(verify(kp.public_key_ref(), msg, &sig2));

        let pk_bytes = serialize_public_key(kp.public_key_ref());
        let pk2 = deserialize_public_key(&pk_bytes).unwrap();
        assert!(verify(&pk2, msg, &sig));
    }

    #[test]
    fn test_large_k() {
        let kp = keygen_seeded(16, 12345);
        let msg = b"large k test";
        let sig = sign(kp.secret_key_ref(), msg);
        assert!(verify(kp.public_key_ref(), msg, &sig));
    }
}
