// SPDX-License-Identifier: Apache-2.0
//! ML-KEM-768 (FIPS 203) WASM surface backed by libcrux-ml-kem 0.0.10.
//!
//! Deterministic entry points only: the caller supplies d||z (keygen), m
//! (encapsulation) and the ciphertext. This keeps the module reproducible for
//! ACVP-style KATs and lets the JS layer own randomness.

use wasm_bindgen::prelude::*;

use libcrux_ml_kem::mlkem768::{self, MlKem768Ciphertext, MlKem768PrivateKey, MlKem768PublicKey};

fn arr32(label: &str, v: &[u8]) -> Result<[u8; 32], JsValue> {
    v.try_into()
        .map_err(|_| JsValue::from_str(&format!("{label} must be 32 bytes, got {}", v.len())))
}

/// KeyGen_internal(d, z): returns pk(1184) || sk(2400).
#[wasm_bindgen]
pub fn keygen_derand(d: &[u8], z: &[u8]) -> Result<Vec<u8>, JsValue> {
    let d = arr32("d", d)?;
    let z = arr32("z", z)?;
    let mut seed = [0u8; 64];
    seed[..32].copy_from_slice(&d);
    seed[32..].copy_from_slice(&z);
    let kp = mlkem768::generate_key_pair(seed);
    let mut out = Vec::with_capacity(1184 + 2400);
    out.extend_from_slice(kp.public_key().as_slice());
    out.extend_from_slice(kp.private_key().as_slice());
    Ok(out)
}

/// Encaps_internal(ek, m): returns ct(1088) || ss(32).
#[wasm_bindgen]
pub fn encaps_derand(pk: &[u8], m: &[u8]) -> Result<Vec<u8>, JsValue> {
    let m = arr32("m", m)?;
    let pk_arr: [u8; 1184] = pk
        .try_into()
        .map_err(|_| JsValue::from_str(&format!("pk must be 1184 bytes, got {}", pk.len())))?;
    let pk = MlKem768PublicKey::from(pk_arr);
    if !mlkem768::validate_public_key(&pk) {
        return Err(JsValue::from_str(
            "encapsulation key failed FIPS 203 section 7.2 checks",
        ));
    }
    let (ct, ss) = mlkem768::encapsulate(&pk, m);
    let mut out = Vec::with_capacity(1088 + 32);
    out.extend_from_slice(ct.as_slice());
    out.extend_from_slice(&ss);
    Ok(out)
}

/// Decaps(sk, ct): returns ss(32). FIPS 203 implicit rejection applies.
#[wasm_bindgen]
pub fn decaps(sk: &[u8], ct: &[u8]) -> Result<Vec<u8>, JsValue> {
    let sk_arr: [u8; 2400] = sk
        .try_into()
        .map_err(|_| JsValue::from_str(&format!("sk must be 2400 bytes, got {}", sk.len())))?;
    let ct_arr: [u8; 1088] = ct
        .try_into()
        .map_err(|_| JsValue::from_str(&format!("ct must be 1088 bytes, got {}", ct.len())))?;
    let sk = MlKem768PrivateKey::from(sk_arr);
    let ct = MlKem768Ciphertext::from(ct_arr);
    if !mlkem768::validate_private_key(&sk, &ct) {
        return Err(JsValue::from_str(
            "decapsulation key failed FIPS 203 section 7.3 checks",
        ));
    }
    let ss = mlkem768::decapsulate(&sk, &ct);
    Ok(ss.to_vec())
}

/// FIPS 203 section 7.2 encapsulation key checks only.
#[wasm_bindgen]
pub fn validate_public_key(pk: &[u8]) -> bool {
    match <[u8; 1184]>::try_from(pk) {
        Ok(a) => mlkem768::validate_public_key(&MlKem768PublicKey::from(a)),
        Err(_) => false,
    }
}

#[wasm_bindgen]
pub fn version() -> String {
    "ML-KEM-768 / FIPS 203 / libcrux-ml-kem 0.0.10".to_string()
}
