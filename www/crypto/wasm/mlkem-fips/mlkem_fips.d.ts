// SPDX-License-Identifier: GPL-3.0-only
/* tslint:disable */
/* eslint-disable */

/**
 * Decaps(sk, ct): returns ss(32). FIPS 203 implicit rejection applies.
 */
export function decaps(sk: Uint8Array, ct: Uint8Array): Uint8Array;

/**
 * Encaps_internal(ek, m): returns ct(1088) || ss(32).
 */
export function encaps_derand(pk: Uint8Array, m: Uint8Array): Uint8Array;

/**
 * KeyGen_internal(d, z): returns pk(1184) || sk(2400).
 */
export function keygen_derand(d: Uint8Array, z: Uint8Array): Uint8Array;

/**
 * FIPS 203 section 7.2 encapsulation key checks only.
 */
export function validate_public_key(pk: Uint8Array): boolean;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly decaps: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly encaps_derand: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly keygen_derand: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly validate_public_key: (a: number, b: number) => number;
    readonly version: () => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
