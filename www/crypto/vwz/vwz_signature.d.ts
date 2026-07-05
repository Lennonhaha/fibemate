/* tslint:disable */
/* eslint-disable */

/**
 * Keypair returned by keygen.
 */
export class Keypair {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    public_key(): PublicKey;
    secret_key(): SecretKey;
}

/**
 * VWZ public key.
 */
export class PublicKey {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * VWZ secret key (trapdoor).
 */
export class SecretKey {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * VWZ signature: preimage (w2, w3).
 */
export class VwzSignature {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * Deserialize public key from bytes.
 */
export function deserialize_public_key(data: Uint8Array): PublicKey;

/**
 * Deserialize signature from bytes.
 */
export function deserialize_signature(data: Uint8Array): VwzSignature;

/**
 * Get key/signature sizes for given parameter k.
 */
export function estimate_sizes(k: number): any;

export function init(): void;

/**
 * Generate a new keypair with parameter k.
 * k=8 → PK ~468B, Sig ~36B, security ~73 bits (tensor OWF lower bound)
 * k=16 → PK ~1.7KB, Sig ~68B
 * k=32 → PK ~6.3KB, Sig ~132B
 */
export function keygen(k: number): Keypair;

/**
 * Generate deterministic keypair from seed (for testing).
 */
export function keygen_seeded(k: number, seed: bigint): Keypair;

/**
 * Serialize public key to bytes.
 */
export function serialize_public_key(pk: PublicKey): Uint8Array;

/**
 * Serialize signature to bytes. Format: 1-byte k + 2(k+1)·2-byte LE.
 */
export function serialize_signature(sig: VwzSignature): Uint8Array;

/**
 * Sign a message.
 */
export function sign(sk: SecretKey, msg: Uint8Array): VwzSignature;

/**
 * Verify a signature.
 */
export function verify(pk: PublicKey, msg: Uint8Array, sig: VwzSignature): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_keypair_free: (a: number, b: number) => void;
    readonly __wbg_publickey_free: (a: number, b: number) => void;
    readonly __wbg_secretkey_free: (a: number, b: number) => void;
    readonly __wbg_vwzsignature_free: (a: number, b: number) => void;
    readonly deserialize_public_key: (a: number, b: number, c: number) => void;
    readonly deserialize_signature: (a: number, b: number, c: number) => void;
    readonly estimate_sizes: (a: number) => number;
    readonly init: () => void;
    readonly keygen: (a: number) => number;
    readonly keygen_seeded: (a: number, b: bigint) => number;
    readonly keypair_public_key: (a: number) => number;
    readonly keypair_secret_key: (a: number) => number;
    readonly serialize_public_key: (a: number, b: number) => void;
    readonly serialize_signature: (a: number, b: number) => void;
    readonly sign: (a: number, b: number, c: number) => number;
    readonly verify: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
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
