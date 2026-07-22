// SPDX-License-Identifier: GPL-3.0-only
/* tslint:disable */
/* eslint-disable */

/**
 * ML-KEM-768 Encapsulation result
 */
export class KyberCiphertext {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Serialize to JSON string
     */
    toJSON(): string;
    readonly ciphertext: Uint8Array;
    readonly shared_secret: Uint8Array;
}

/**
 * ML-KEM-768 Keypair
 */
export class KyberKeypair {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Serialize to JSON string
     */
    toJSON(): string;
    readonly public_key: Uint8Array;
    readonly secret_key: Uint8Array;
}

/**
 * Decapsulate a shared secret using secret key and ciphertext
 *
 * Uses pqc_kyber decapsulate (FIPS 203 compliant).
 *
 * # Arguments
 * * `secret_key` - The recipient's secret key (2400 bytes)
 * * `ciphertext` - The ciphertext from encapsulation (1088 bytes)
 *
 * # Returns
 * The shared secret (32 bytes) — matches encapsulate output when keys are paired
 */
export function decapsulate(secret_key: Uint8Array, ciphertext: Uint8Array): Uint8Array;

/**
 * Encapsulate a shared secret using a public key
 *
 * Uses pqc_kyber encapsulate (FIPS 203 compliant).
 *
 * # Arguments
 * * `public_key` - The recipient's public key (1184 bytes)
 *
 * # Returns
 * KyberCiphertext containing the ciphertext (1088 bytes) and shared secret (32 bytes)
 */
export function encapsulate(public_key: Uint8Array): KyberCiphertext;

/**
 * Encapsulate a shared secret using a public key with deterministic seed
 *
 * Identical (pk, seed) → identical (ct, ss) across platforms.
 */
export function encapsulateWithSeed(public_key: Uint8Array, seed: Uint8Array): KyberCiphertext;

/**
 * Generate a new ML-KEM-768 keypair
 *
 * Uses pqc_kyber crate (FIPS 203 compliant Kyber-768).
 *
 * # Returns
 * KyberKeypair containing public (1184 bytes) and secret (2400 bytes) keys
 */
export function generateKeypair(): KyberKeypair;

/**
 * Generate ML-KEM-768 keypair from a deterministic seed (32 bytes)
 *
 * Uses ChaCha20 PRNG seeded from user-provided 32-byte seed.
 * Identical seed → identical keypair across platforms.
 */
export function generateKeypairWithSeed(seed: Uint8Array): KyberKeypair;

/**
 * Get ML-KEM-768 constants
 */
export function getConstants(): string;

/**
 * Hybrid key exchange: Combine ML-KEM-768 shared secret with ECDH
 *
 * Uses HKDF-SHA256 with domain separation for proper dual-PRF security.
 *
 * # Arguments
 * * `kem_secret` - ML-KEM-768 shared secret (32 bytes)
 * * `ecdh_secret` - ECDH shared secret (variable length)
 *
 * # Returns
 * Combined 32-byte keying material suitable for Double Ratchet root key
 */
export function hybridCombine(kem_secret: Uint8Array, ecdh_secret: Uint8Array): Uint8Array;

/**
 * Initialize panic hook for better error messages in WASM
 */
export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_kyberciphertext_free: (a: number, b: number) => void;
    readonly decapsulate: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly encapsulate: (a: number, b: number, c: number) => void;
    readonly encapsulateWithSeed: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly generateKeypair: (a: number) => void;
    readonly generateKeypairWithSeed: (a: number, b: number, c: number) => void;
    readonly getConstants: (a: number) => void;
    readonly hybridCombine: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly kyberciphertext_ciphertext: (a: number, b: number) => void;
    readonly kyberciphertext_shared_secret: (a: number, b: number) => void;
    readonly kyberciphertext_toJSON: (a: number, b: number) => void;
    readonly kyberkeypair_toJSON: (a: number, b: number) => void;
    readonly start: () => void;
    readonly __wbg_kyberkeypair_free: (a: number, b: number) => void;
    readonly kyberkeypair_public_key: (a: number, b: number) => void;
    readonly kyberkeypair_secret_key: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export3: (a: number, b: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
