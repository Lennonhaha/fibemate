/**
 * C Addon Type Declarations — ML-KEM-768 Native Module
 *
 * This is the native Node.js C addon compiled from
 * the reference C implementation with node-gyp.
 *
 * Optimized flags: -O3 -march=native -flto -funroll-loops
 * Benchmark: 315.7 µs round-trip (Intel Xeon Platinum, AVX-512)
 *
 * @module @fibemate/pqc-kem/native
 * @license GPL-3.0
 */

/// <reference types="node" />

/**
 * Generate a new ML-KEM-768 keypair.
 *
 * @returns [publicKey, secretKey] — both as Node.js Buffers
 *   - publicKey: 1184 bytes
 *   - secretKey: 2400 bytes
 *
 * @example
 * const addon = require('@fibemate/pqc-kem/native');
 * const [pk, sk] = addon.keygen();
 */
export function keygen(): [Buffer, Buffer];

/**
 * Encapsulate a shared secret under a public key.
 *
 * @param publicKey - 1184-byte Node.js Buffer
 * @returns [ciphertext, sharedSecret] — both as Node.js Buffers
 *   - ciphertext: 1088 bytes
 *   - sharedSecret: 32 bytes
 *
 * @example
 * const [ct, ss] = addon.encaps(pk);
 */
export function encaps(publicKey: Buffer): [Buffer, Buffer];

/**
 * Decapsulate a shared secret using a secret key.
 *
 * @param secretKey - 2400-byte Node.js Buffer
 * @param ciphertext - 1088-byte Node.js Buffer
 * @returns sharedSecret — 32-byte Node.js Buffer
 *
 * NOTE: N-API parameter order is (ciphertext, secretKey), NOT (secretKey, ciphertext).
 * The JS wrapper in index.js handles this reversal for API consistency.
 *
 * @example
 * const ss = addon.decaps(ct, sk);
 */
export function decaps(ciphertext: Buffer, secretKey: Buffer): Buffer;  // N-API real order: (ct, sk)

// ═══════════════════════════════════════════════════════════════
// Batch API — one N-API call processes N operations internally
// ═══════════════════════════════════════════════════════════════

/** Result of keygen_batch */
export interface BatchKeygenResult {
  /** Flat concatenated public keys, count × PUBLICKEYBYTES each */
  pk: Buffer;
  /** Flat concatenated secret keys */
  sk: Buffer;
  count: number;
}

/** Result of encaps_batch */
export interface BatchEncapsResult {
  /** Flat concatenated ciphertexts, count × CIPHERTEXTBYTES each */
  ct: Buffer;
  /** Flat concatenated shared secrets */
  ss: Buffer;
  count: number;
}

/** Result of decaps_batch */
export interface BatchDecapsResult {
  /** Flat concatenated shared secrets */
  ss: Buffer;
  count: number;
}

/** Result of roundtrip_batch */
export interface BatchRoundtripResult {
  /** Number of matching shared-secret pairs */
  ok: number;
  count: number;
  /** Sender-side shared secrets (flat) */
  ss_sender: Buffer;
  /** Receiver-side shared secrets (flat) */
  ss_receiver: Buffer;
}

/**
 * Generate `count` keypairs in a single N-API call.
 * @param count - Number of keypairs (≤100000)
 */
export function keygen_batch(count: number): BatchKeygenResult;

/**
 * Encapsulate `count` shared secrets in a single N-API call.
 * @param pk_flat - Flat Buffer of count × PUBLICKEYBYTES public keys
 * @param count - Number of operations
 */
export function encaps_batch(pk_flat: Buffer, count: number): BatchEncapsResult;

/**
 * Decapsulate `count` shared secrets in a single N-API call.
 * @param ct_flat - Flat Buffer of count × CIPHERTEXTBYTES ciphertexts
 * @param sk_flat - Flat Buffer of count × SECRETKEYBYTES secret keys
 * @param count - Number of operations
 */
export function decaps_batch(
  ct_flat: Buffer,
  sk_flat: Buffer,
  count: number
): BatchDecapsResult;

/**
 * Full round-trip: keygen → encaps → decaps — all in one N-API call.
 * Verifies shared secrets match.  Ideal for KAT benchmarks.
 *
 * @param count - Number of round-trips (≤100000)
 * @returns ok === count means all shared secrets matched
 *
 * @example
 * const { ok, count } = addon.roundtrip_batch(10000);
 * console.assert(ok === count, 'KAT failed');
 */
export function roundtrip_batch(count: number): BatchRoundtripResult;
