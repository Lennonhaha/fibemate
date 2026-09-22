// SPDX-License-Identifier: GPL-3.0-only
/**
 * Type definitions for the FIBEMATE ML-KEM-768 KEM surface.
 *
 * These declarations describe the public shape of `src/crypto/ml-kem-768-td.js`
 * (exported as `MLKEM768`). They are hand-maintained and intentionally conservative:
 * arrays are typed as `Uint8Array` because the implementation operates on raw byte
 * buffers, NOT on the structured `{ k, c, t }` objects used by @noble/post-quantum.
 *
 * NOTE: This is a self-test / educational implementation. It is NOT constant-time
 * (JS BigInt) and is NOT a production KEM. See docs/security-limitations.html.
 */

export interface MlKem768KeyPair {
  /** ML-KEM-768 encapsulation key, 1184 bytes (FIPS 203 pk). */
  publicKey: Uint8Array;
  /** ML-KEM-768 decapsulation key, 2400 bytes (FIPS 203 sk). */
  secretKey: Uint8Array;
}

export interface EncapsulatedKey {
  /** Ciphertext, 1088 bytes (FIPS 203 ct). */
  ciphertext: Uint8Array;
  /** Shared secret, 32 bytes (FIPS 203 ss). */
  sharedSecret: Uint8Array;
}

export interface SharedSecret {
  /** 32-byte symmetric key material. */
  sharedSecret: Uint8Array;
}

export interface MlKem768HybridSession {
  kemKeypair: MlKem768KeyPair | null;
  ecdhKeypair: CryptoKeyPair | null;
  init(ecdh?: boolean): Promise<void>;
  encapsulateToPeer(pk: Uint8Array, ecdhPk: Uint8Array): Promise<EncapsulatedKey>;
  decapsulateFromPeer(ct: Uint8Array, ecdhPk: Uint8Array): Promise<SharedSecret>;
}

export interface MlKem768 {
  /** Generate a fresh ML-KEM-768 key pair. */
  generateKeypair(): MlKem768KeyPair;
  /** Deterministically generate a key pair from a 32-byte seed. */
  generateKeypairWithSeed(seed: Uint8Array): MlKem768KeyPair;
  /** Encapsulate to `publicKey`, producing a ciphertext + shared secret. */
  encapsulate(publicKey: Uint8Array): EncapsulatedKey;
  /** Deterministic encapsulate from a 32-byte seed. */
  encapsulateWithSeed(publicKey: Uint8Array, seed: Uint8Array): EncapsulatedKey;
  /** Decapsulate `ciphertext` with `secretKey`, returning the shared secret. */
  decapsulate(secretKey: Uint8Array, ciphertext: Uint8Array): Uint8Array;
  /** Hybrid (ML-KEM + ECDH P-256) session helper. */
  HybridKeyExchange: new () => MlKem768HybridSession;
}

declare const MLKEM768: MlKem768;
export default MLKEM768;
