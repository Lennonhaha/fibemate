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
use crate::tensor::public_tensor_eval_data;
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
    let m = 2 * sig.k + 1;
    if sig.w2.len() != m || sig.w3.len() != m { return false; }

    let target = hash_to_sparse_target(msg, pk.k);
    let result = public_tensor_eval_data(pk.k, &pk.data, &sig.w2, &sig.w3);
    result == target
}

/// Batch-verify many signatures against a single public key.
///
/// Inputs (parallel JS arrays, same length):
///   - `msgs`: array of `Uint8Array` (the messages)
///   - `sigs`: array of `Uint8Array` (signatures serialized via `serialize_signature`)
/// Output: a JS array of booleans, one per item, in input order.
///
/// The public key tensor is cloned **once** and reused for every signature,
/// whereas calling `verify` N times clones the tensor N times. For large k
/// (e.g. k=16, PK ~19KB) this removes the dominant per-call allocation cost.
#[wasm_bindgen]
pub fn verify_batch(pk: &PublicKey, msgs: js_sys::Array, sigs: js_sys::Array) -> js_sys::Array {
    // Convert JS inputs to pure-Rust types.
    let n = msgs.length();
    let mut msg_vecs: Vec<Vec<u8>> = Vec::with_capacity(n as usize);
    let mut sig_vecs: Vec<Vec<u8>> = Vec::with_capacity(n as usize);
    for idx in 0..n {
        msg_vecs.push(js_sys::Uint8Array::new(&msgs.get(idx)).to_vec());
        sig_vecs.push(js_sys::Uint8Array::new(&sigs.get(idx)).to_vec());
    }

    let results = verify_batch_core(pk, &msg_vecs, &sig_vecs);
    let arr = js_sys::Array::new();
    for ok in results {
        arr.push(&JsValue::from_bool(ok));
    }
    arr
}

/// Pure-Rust batch verification core (testable without wasm runtime).
///
/// `sigs` are serialized signatures (see `serialize_signature`).
/// Returns one bool per item, in input order.
pub fn verify_batch_core(pk: &PublicKey, msgs: &[Vec<u8>], sigs: &[Vec<u8>]) -> Vec<bool> {
    let mut results = Vec::with_capacity(msgs.len());

    for idx in 0..msgs.len() {
        let ok = {
            let msg = &msgs[idx];
            let sig: VwzSignature = match deserialize_signature(&sigs[idx]) {
                Ok(s) => s,
                Err(_) => { results.push(false); continue; }
            };

            // Core verification (borrowed data — no tensor clone).
            if sig.k != pk.k {
                false
            } else {
                let m = 2 * sig.k + 1;
                if sig.w2.len() != m || sig.w3.len() != m {
                    false
                } else {
                    let target = hash_to_sparse_target(msg, pk.k);
                    let result = public_tensor_eval_data(pk.k, &pk.data, &sig.w2, &sig.w3);
                    result == target
                }
            }
        };
        results.push(ok);
    }

    results
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

impl SecretKey {
    /// Borrow the underlying trapdoor (bench / advanced use).
    pub fn td_ref(&self) -> &Trapdoor { &self.td }
}

// ============================================================
// Serialization (compact binary)
// ============================================================

/// Serialize public key to bytes.
#[wasm_bindgen]
pub fn serialize_public_key(pk: &PublicKey) -> Vec<u8> {
    let n = 2 * pk.k + 2;
    let m = 2 * pk.k + 1;
    let mut buf = vec![pk.k as u8];
    for i1 in 0..n {
        for i2 in 0..m {
            for i3 in 0..m {
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
    let n = 2 * k + 2;
    let m = 2 * k + 1;
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

/// Serialize signature to bytes. Format: 1-byte k + 2(2k+1)·2-byte LE.
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
    let m = 2 * k + 1;
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
    let n = 2 * k + 2;
    let m = 2 * k + 1;
    let pk_entries = n * m * m;
    let pk_bytes = pk_entries * 2;
    let sig_bytes = 2 * m * 2;

    let result = serde_json::json!({
        "k": k, "N": n, "M": m,
        "pk_tensor_entries": pk_entries,
        "pk_bytes": pk_bytes,
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
    use crate::preimage::{self, solve_linear, SeedRng};

    // ----------------------------------------------------------
    // Attack-reconstruction helpers (mirror security-assessment/attack)
    // ----------------------------------------------------------

    /// Old rank-1 extraction attack: factor each slice as an outer product,
    /// separate the bilinear equation, and forge. Returns a forgery if the
    /// rank-1 assumption holds; `None` otherwise.
    ///
    /// Faithful port of `security-assessment/attack/attack_vwz.py`:
    ///   1. extract rank-1 factors u[i1], v[i1] from each slice
    ///   2. w2 in nullspace of {u[i1] : i1 ∈ Z} with u[i1]·w2 ≠ 0 on S
    ///   3. w3 from affine system v[i1]·w3 = target[i1]/(u[i1]·w2) on S
    fn attack_rank1(pk: &PublicKey, target: &[u16]) -> Option<()> {
        let n = 2 * pk.k + 2;
        let m = 2 * pk.k + 1;
        let mut u = vec![vec![0u16; m]; n];
        let mut v = vec![vec![0u16; m]; n];
        for i1 in 0..n {
            let mut l0 = None;
            'outer: for l in 0..m {
                for i2 in 0..m {
                    if pk.data[i1][i2][l] != 0 {
                        l0 = Some(l);
                        break 'outer;
                    }
                }
            }
            let l0 = match l0 {
                Some(l) => l,
                None => return None,
            };
            for i2 in 0..m {
                u[i1][i2] = pk.data[i1][i2][l0];
            }
            let j0 = match (0..m).find(|&j| u[i1][j] != 0) {
                Some(j) => j,
                None => return None,
            };
            let iv = crate::field::inv(u[i1][j0]);
            for i3 in 0..m {
                v[i1][i3] = crate::field::mul(pk.data[i1][j0][i3], iv);
            }
        }

        let z: Vec<usize> = (0..n).filter(|&i| target[i] == 0).collect();
        let s: Vec<usize> = (0..n).filter(|&i| target[i] != 0).collect();

        // Step 3: w2 in nullspace of u[i1] for i1 in Z (exactly the real attack).
        let rows_z: Vec<Vec<u16>> = z.iter().map(|&i1| u[i1].clone()).collect();
        let basis = crate::preimage::rref_and_ns(&rows_z);
        if basis.is_empty() {
            return None;
        }
        let mut found = None;
        for (bi, bv) in basis.iter().enumerate() {
            let w2 = bv.clone();
            let ok_on_s = s.iter().all(|&i1| preimage::dot(&u[i1], &w2) != 0);
            if !ok_on_s {
                // also try a sum of this basis vector with the previous one
                if bi > 0 {
                    let mut w2s = w2.clone();
                    for j in 0..m {
                        w2s[j] = crate::field::add(w2s[j], basis[bi - 1][j]);
                    }
                    if s.iter().all(|&i1| preimage::dot(&u[i1], &w2s) != 0) {
                        found = Some(w2s);
                        break;
                    }
                }
                continue;
            }
            found = Some(w2);
            break;
        }
        let w2 = found?;

        // Step 4: w3 from affine system on S.
        let rows_v: Vec<Vec<u16>> = s.iter().map(|&i1| v[i1].clone()).collect();
        let need: Vec<u16> = s
            .iter()
            .map(|&i1| {
                let d = preimage::dot(&u[i1], &w2);
                crate::field::mul(target[i1], crate::field::inv(d))
            })
            .collect();
        let w3 = solve_linear(&rows_v, &need)?;

        let result = public_tensor_eval_data(pk.k, &pk.data, &w2, &w3);
        if result == target {
            Some(())
        } else {
            None
        }
    }

    /// Fix arbitrary w2, solve w3 from the linear system. Over-determined
    /// (n = m+1), so success would mean the fixed-w2 attack works.
    fn attack_fixed_w2(pk: &PublicKey, target: &[u16]) -> Option<()> {
        let n = 2 * pk.k + 2;
        let m = 2 * pk.k + 1;
        let mut rng = SeedRng::new(0xdead_beef);
        for _cand in 0..16 {
            let w2: Vec<u16> = (0..m).map(|_| rng.randrange(1, crate::field::Q)).collect();
            // R[i1][i3] = Σ_{i2} pk[i1][i2][i3]·w2[i2]  (n×m)
            let mut r = vec![vec![0u16; m]; n];
            for i1 in 0..n {
                for i3 in 0..m {
                    let mut s = 0u64;
                    for i2 in 0..m {
                        s += pk.data[i1][i2][i3] as u64 * w2[i2] as u64;
                    }
                    r[i1][i3] = (s % crate::field::Q as u64) as u16;
                }
            }
            // Solve the first m equations, then check all n.
            let w3 = match solve_linear(&r[..m], &target[..m]) {
                Some(w3) => w3,
                None => continue,
            };
            let result = public_tensor_eval_data(pk.k, &pk.data, &w2, &w3);
            if result == target {
                return Some(());
            }
        }
        None
    }

    fn targets_for(k: usize, msgs: &[Vec<u8>]) -> Vec<Vec<u16>> {
        msgs.iter().map(|m| hash_to_sparse_target(m, k)).collect()
    }

    // ----------------------------------------------------------
    // Core tests
    // ----------------------------------------------------------

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

    #[test]
    fn test_verify_batch_all_valid() {
        let kp = keygen_seeded(4, 7);
        let pk = kp.public_key_ref();

        let mut msgs: Vec<Vec<u8>> = Vec::new();
        let mut sigs: Vec<Vec<u8>> = Vec::new();
        for i in 0..5u32 {
            let msg: Vec<u8> = format!("batch msg {i}").into_bytes();
            let sig = sign(kp.secret_key_ref(), &msg);
            msgs.push(msg);
            sigs.push(serialize_signature(&sig));
        }

        let results = verify_batch_core(pk, &msgs, &sigs);
        assert_eq!(results.len(), 5);
        for (i, ok) in results.iter().enumerate() {
            assert!(*ok, "item {i} should verify");
        }
    }

    #[test]
    fn test_verify_batch_detects_tamper() {
        let kp = keygen_seeded(4, 99);
        let pk = kp.public_key_ref();

        let mut msgs: Vec<Vec<u8>> = Vec::new();
        let mut sigs: Vec<Vec<u8>> = Vec::new();
        // valid
        let msg_ok: Vec<u8> = b"ok".to_vec();
        let sig_ok = sign(kp.secret_key_ref(), &msg_ok);
        msgs.push(msg_ok);
        sigs.push(serialize_signature(&sig_ok));

        // tampered: wrong message with a valid signature
        let msg_bad: Vec<u8> = b"tampered".to_vec();
        msgs.push(msg_bad);
        sigs.push(serialize_signature(&sig_ok));

        let results = verify_batch_core(pk, &msgs, &sigs);
        assert_eq!(results[0], true);
        assert_eq!(results[1], false);
    }

    // ----------------------------------------------------------
    // Security regression: known attacks must fail
    // ----------------------------------------------------------

    #[test]
    fn test_rank1_attack_fails() {
        // The old rank-1 extraction attack must not forge valid signatures.
        for k in [2, 4, 8] {
            let kp = keygen_seeded(k, 2026);
            let pk = kp.public_key_ref();
            let msgs: Vec<Vec<u8>> = (0..8)
                .map(|i| format!("rank1-attack k={k} m={i}").into_bytes())
                .collect();
            let targets = targets_for(k, &msgs);
            let forgeries = targets.iter().filter(|t| attack_rank1(pk, t).is_some()).count();
            assert_eq!(forgeries, 0, "k={k}: rank-1 attack forged {forgeries}/{} targets", targets.len());
        }
    }

    #[test]
    fn test_fixed_w2_attack_fails() {
        // Over-determined system (n = m+1) must block the fixed-w2 attack.
        for k in [2, 4, 8] {
            let kp = keygen_seeded(k, 31337);
            let pk = kp.public_key_ref();
            let msgs: Vec<Vec<u8>> = (0..8)
                .map(|i| format!("fixed-w2 k={k} m={i}").into_bytes())
                .collect();
            let targets = targets_for(k, &msgs);
            let forgeries = targets.iter().filter(|t| attack_fixed_w2(pk, t).is_some()).count();
            assert_eq!(forgeries, 0, "k={k}: fixed-w2 attack forged {forgeries}/{} targets", targets.len());
        }
    }

    // ----------------------------------------------------------
    // Cross-language conformance: Rust vs Python reference
    // ----------------------------------------------------------

    /// Normative cross-check against `vwz_reference.py` — an independent
    /// Python rendering of `fibemate-vwz-specification_20260906.md`.
    ///
    /// Both implementations must produce byte-identical serializations for the
    /// same `(k, seed, msg)`. A failure here means one of the two has drifted
    /// from the specification; do NOT "fix" by editing the expected values
    /// without determining which side is non-conformant.
    ///
    /// Digests are the first 16 bytes of SHA3-256 (hex) of the serialized
    /// outputs defined in §8.
    #[test]
    fn test_conformance_vs_python_reference() {
        use sha3::Digest;

        fn hex16(bytes: &[u8]) -> String {
            let h = sha3::Sha3_256::digest(bytes);
            h.iter().take(16).map(|b| format!("{b:02x}")).collect()
        }

        let cases: &[(usize, u64, &str, &str, &str)] = &[
            (2, 42,   "Fibemate VWZ test k=2",
             "12af48a13545bb02615071ff077a235e", "07b32e88d9b8c09db5cd4adaeefe13a3"),
            (2, 2026, "Fibemate VWZ test k=2",
             "f79d750fc0a4f5be0a0684be6854073a", "c2cdceaeed52b608f02f9a1083c6e947"),
            (4, 42,   "Fibemate VWZ test k=4",
             "28e09b1d7e5b92ba803a8d063953cedf", "a34bfd493cafa0e92a4dff350e882de2"),
            (4, 2026, "Fibemate VWZ test k=4",
             "83d38369f66644e0f5e64337c4300fb4", "7e7498fd932708e64bbab41afdb4e981"),
            (8, 42,   "Fibemate VWZ test k=8",
             "2e8499c7a1764f2102b1d781b3bcd37d", "fb8deab03cd9cb8d1af7381455d75e8a"),
            (8, 2026, "Fibemate VWZ test k=8",
             "5c9e5f96ffa87a224a5a6752c3a09d79", "62cc5b9b0f4b8e86ddb7dfb370a35852"),
        ];

        for &(k, seed, msg, want_pk, want_sig) in cases {
            let kp = keygen_seeded(k, seed);
            let pk_bytes = serialize_public_key(kp.public_key_ref());
            assert_eq!(
                hex16(&pk_bytes), want_pk,
                "k={k} seed={seed}: PUBLIC KEY diverges from Python reference \
                 (spec §3/§8.1) — one of the two implementations is non-conformant"
            );
            let sig = sign(kp.secret_key_ref(), msg.as_bytes());
            let sig_bytes = serialize_signature(&sig);
            assert_eq!(
                hex16(&sig_bytes), want_sig,
                "k={k} seed={seed}: SIGNATURE diverges from Python reference \
                 (spec §6/§8.2) — one of the two implementations is non-conformant"
            );
            assert!(verify(kp.public_key_ref(), msg.as_bytes(), &sig));
        }
    }

    #[test]
    fn test_slices_are_rank2() {
        // Sanity: no public-key slice may factor as a single outer product.
        let kp = keygen_seeded(4, 555);
        let pk = kp.public_key_ref();
        let m = 2 * 4 + 1;
        for i1 in 0..(2 * 4 + 2) {
            // Pick pivot; check that the rank-1 reconstruction is NOT exact.
            let mut l0 = None;
            'outer: for l in 0..m {
                for i2 in 0..m {
                    if pk.data[i1][i2][l] != 0 {
                        l0 = Some(l);
                        break 'outer;
                    }
                }
            }
            let l0 = l0.expect("nonzero slice");
            let mut u = vec![0u16; m];
            for i2 in 0..m {
                u[i2] = pk.data[i1][i2][l0];
            }
            let j0 = (0..m).find(|&j| u[j] != 0).unwrap();
            let iv = crate::field::inv(u[j0]);
            let mut v = vec![0u16; m];
            for i3 in 0..m {
                v[i3] = crate::field::mul(pk.data[i1][j0][i3], iv);
            }
            // If the slice were rank-1, psi[i1][i2][i3] == u[i2]·v[i3] for all.
            let rank1_exact = (0..m).all(|i2| {
                (0..m).all(|i3| {
                    crate::field::mul(u[i2], v[i3]) == pk.data[i1][i2][i3]
                })
            });
            assert!(!rank1_exact, "k=4 slice {i1} is rank-1 (fix ineffective)");
        }
    }
}
