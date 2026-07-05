/* tslint:disable */
/* eslint-disable */

/**
 * Apply forward Kronecker-recursive transform (256-dim, identity-padded)
 */
export function apply_forward(input: Uint16Array): Uint16Array;

/**
 * Apply inverse Kronecker-recursive transform (256-dim, identity-padded)
 */
export function apply_inverse(input: Uint16Array): Uint16Array;

/**
 * Number of active layers
 */
export function get_depth(): number;

/**
 * Roundtrip: forward → inverse must be identity
 */
export function roundtrip_test(input: Uint16Array): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly apply_forward: (a: number, b: number, c: number) => void;
    readonly apply_inverse: (a: number, b: number, c: number) => void;
    readonly roundtrip_test: (a: number, b: number) => number;
    readonly get_depth: () => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
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
