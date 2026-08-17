/* @ts-self-types="./lgv2_3.d.ts" */

/**
 * @param {Uint8Array} data
 * @param {Uint8Array} kem_ss
 * @returns {Uint8Array}
 */
export function lgv2_bind_kem(data, kem_ss) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(kem_ss, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_bind_kem(ptr0, len0, ptr1, len1);
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @returns {Uint8Array}
 */
export function lgv2_confuse(data, seed) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_confuse(ptr0, len0, seed);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv2_confuse_d(data, seed, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_confuse_d(ptr0, len0, seed, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv2_confuse_ex(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_confuse_ex(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {Uint8Array} kem_ss
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv2_confuse_full(data, seed, session_key, kem_ss, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(kem_ss, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_confuse_full(ptr0, len0, seed, session_key, ptr1, len1, depth);
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @returns {Uint8Array}
 */
export function lgv2_deconfuse(data, seed) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_deconfuse(ptr0, len0, seed);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv2_deconfuse_d(data, seed, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_deconfuse_d(ptr0, len0, seed, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv2_deconfuse_ex(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_deconfuse_ex(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {Uint8Array} kem_ss
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv2_deconfuse_full(data, seed, session_key, kem_ss, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(kem_ss, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_deconfuse_full(ptr0, len0, seed, session_key, ptr1, len1, depth);
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {Uint8Array} data
 * @param {Uint8Array} kem_ss
 * @returns {Uint8Array}
 */
export function lgv2_unbind_kem(data, kem_ss) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(kem_ss, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.lgv2_unbind_kem(ptr0, len0, ptr1, len1);
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @returns {string}
 */
export function lgv2_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv2_version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Stage-1: 报告当前活跃维度 (改进后: 所有字节都被 premix 覆盖)
 * @returns {number}
 */
export function lgv3_active_dim() {
    const ret = wasm.lgv3_active_dim();
    return ret >>> 0;
}

/**
 * LG v3 新增: 操作审计日志
 * 返回当前混淆操作的序列化参数 (深度、种子、模块版本)
 * @param {number} data_len
 * @param {bigint} seed
 * @param {number} depth
 * @returns {string}
 */
export function lgv3_audit_log(data_len, seed, depth) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv3_audit_log(data_len, seed, depth);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Stage-1 全字节混淆: XOR-keystream pre/post-mix + Wreath
 * Architecture: premix(all_bytes) -> Wreath(seed) -> postmix(all_bytes)
 * Covers ALL bytes (premix), not just 48 active dimensions (Wreath only)
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv3_confuse_mix(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_confuse_mix(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Stage-1 全字节解混淆
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv3_deconfuse_mix(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_deconfuse_mix(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Set the runtime active-defense level. Returns 0 on success, non-zero if the
 * level is invalid. level=0 fully bypasses and is byte-identical to Stage-2.
 * @param {number} level
 * @param {number} flags
 * @returns {number}
 */
export function lgv3_defense_configure(level, flags) {
    const ret = wasm.lgv3_defense_configure(level, flags);
    return ret;
}

/**
 * JSON status of the defense engine (level, mode, anomaly count, baseline
 * sample count). Never contains seed/session/depth material.
 * @returns {string}
 */
export function lgv3_defense_status() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv3_defense_status();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Stage-3: 全块扩散 (seed 派生 GF(256) 下/上三角线性混合)
 * 单字节扰动扩散到近全块，黑盒攻击的 sigma 定位步骤失效。
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @returns {Uint8Array}
 */
export function lgv3_diffuse(data, seed, session_key) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_diffuse(ptr0, len0, seed, session_key);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Stage-3: 全块扩散逆运算
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @returns {Uint8Array}
 */
export function lgv3_diffuse_inverse(data, seed, session_key) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_diffuse_inverse(ptr0, len0, seed, session_key);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Sprint 4: 返回 session_key 下 NUM_LAYERS 层的路径选择字符串
 * ('S' = Substitute 恒等层, 'T' = Standard 真实变换层)，供审计/测试
 * 验证不同 session 产生不同路径分布。
 * @param {bigint} session_key
 * @returns {string}
 */
export function lgv3_dynamic_path_profile(session_key) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv3_dynamic_path_profile(session_key);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Sprint 5: 求值第 `family_id` 个不透明谓词在输入 `x` 下的结果。
 * 对任意 x 恒返回 true (数学恒真)；若返回 false 说明实现被破坏。
 * @param {number} family_id
 * @param {bigint} x
 * @returns {boolean}
 */
export function lgv3_opaque_check(family_id, x) {
    const ret = wasm.lgv3_opaque_check(family_id, x);
    return ret !== 0;
}

/**
 * Sprint 5: 返回全部不透明谓词族的名称 (逗号分隔，审计用)。
 * @returns {string}
 */
export function lgv3_opaque_families() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv3_opaque_families();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Sprint 5: 返回 (seed, session_key, depth) 编译出的 VM 程序所携带的
 * 不透明谓词配置 "family,salt_hex" (与 compile_program 完全一致)。
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {string}
 */
export function lgv3_opaque_program_cfg(seed, session_key, depth) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv3_opaque_program_cfg(seed, session_key, depth);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Stage-2: 返回 (seed, session_key, depth) 编译出的 VM 字节码 (hex 编码，供审计/调试)
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {string}
 */
export function lgv3_pipeline_bytecode(seed, session_key, depth) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv3_pipeline_bytecode(seed, session_key, depth);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Stage-2: 返回 (seed, session_key, depth) 编译出的逆 VM 字节码 (hex 编码)
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {string}
 */
export function lgv3_pipeline_bytecode_inverse(seed, session_key, depth) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv3_pipeline_bytecode_inverse(seed, session_key, depth);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Stage-2: 全管道解混淆 (inverse)
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv3_pipeline_deobfuscate(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_pipeline_deobfuscate(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Sprint 4: 动态路径解混淆 (须与 lgv3_pipeline_obfuscate_dynamic 用相同
 * seed/session_key/depth)。
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv3_pipeline_deobfuscate_dynamic(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_pipeline_deobfuscate_dynamic(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Stage-2: 全管道混淆 (premix + Wreath(depth) + VM program)
 * Architecture: premix -> Wreath(depth) -> VM(seed,session,depth 编译的程序)
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv3_pipeline_obfuscate(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_pipeline_obfuscate(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Sprint 4: 动态路径混淆 — Wreath 核心在 Standard/Substitute 之间按
 * session_key 逐层选择。不同 session 走不同混淆路径，session 独立性
 * 高于固定管线。路径选择不依赖数据, forward/inverse 天然一致。
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv3_pipeline_obfuscate_dynamic(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_pipeline_obfuscate_dynamic(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Sprint 3: 返回 (seed, session_key, depth) 的 rand_seed 派生值 (hex, 审计用)。
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {string}
 */
export function lgv3_rand_seed(seed, session_key, depth) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.lgv3_rand_seed(seed, session_key, depth);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Sprint 3: 密封解混淆 — 先 ChaCha8 解密, 再 deobfuscate(seed,session,depth)。
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv3_sealed_deobfuscate(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_sealed_deobfuscate(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Sprint 3: 密封混淆 — obfuscate(seed,session,depth) 后叠加 ChaCha8 流加密。
 *
 * 密钥/nonce 由 keccak256(seed, session_key, depth) 派生 (rand_seed 随机化,
 * 非线性, 打破 Stage-2 的 seed^session_key 线性可逆)。输出为密文, 没有
 * session 派生的密钥连反混淆管道都无法直接作用。
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} session_key
 * @param {number} depth
 * @returns {Uint8Array}
 */
export function lgv3_sealed_obfuscate(data, seed, session_key, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_sealed_obfuscate(ptr0, len0, seed, session_key, depth);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Sprint 2: quantify how much two different session keys diverge the output.
 *
 * Returns the fraction of bytes that differ between `obfuscate(data, seed,
 * sk1, depth)` and `obfuscate(data, seed, sk2, depth)`. A value near 1 means
 * the session key perturbs essentially the whole block; 0 would mean the
 * session key never reached the confusion path (a regression signal).
 * @param {Uint8Array} data
 * @param {bigint} seed
 * @param {bigint} sk1
 * @param {bigint} sk2
 * @param {number} depth
 * @returns {number}
 */
export function lgv3_session_diff_ratio(data, seed, sk1, sk2, depth) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lgv3_session_diff_ratio(ptr0, len0, seed, sk1, sk2, depth);
    return ret;
}

/**
 * LG v3 新增: 运行时可逆性自检
 * 对 100-byte 测试向量执行 confuse → deconfuse，验证无损还原
 * @param {bigint} seed
 * @returns {boolean}
 */
export function lgv3_verify_invertibility(seed) {
    const ret = wasm.lgv3_verify_invertibility(seed);
    return ret !== 0;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_now_49845adcf51f66a2: function() {
            const ret = performance.now();
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./lgv2_3_bg.js": import0,
    };
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('lgv2_3_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
