// SPDX-License-Identifier: GPL-3.0-only
/**
 * mlkem-ct-wasm-bridge.js
 * ML-KEM-768 WASM 集成桥 — 用恒定时间 WASM 替换 JS BigInt 向量操作
 *
 * 覆盖: compress(d), decompress(d), polyMul
 *
 * 设计原则:
 *   WASM 原语全部为 256 元向量操作 → 仅替换多项式级运算
 *   scalar 操作 (modAdd/modSub/modMul) 保留 JS —
 *   polyMul 已被 WASM 替换，scalar 残余调用可以忽略
 *
 * 双路径:
 *   浏览器: fetch() → default()
 *   Node.js: fs.readFileSync → WebAssembly.Module → initSync()
 */
const MLKEM_CT_WASM = (() => {
    let wasm = null;

    const _ISNODE = typeof process !== 'undefined' && process.versions && process.versions.node;
    const _DIR = _ISNODE ? __dirname : '/crypto/wasm';

    // ================================================================
    // 初始化
    // ================================================================
    async function init(jsUrl, wasmUrl) {
        if (wasm) return wasm;
        const js = jsUrl || (_DIR + '/mlkem_ct_wasm.js');
        const wm = wasmUrl || (_DIR + '/mlkem_ct_wasm_bg.wasm');

        const mod = await import(js);
        if (_ISNODE) {
            const fs = require('fs');
            const buf = fs.readFileSync(wm);
            mod.initSync(new WebAssembly.Module(buf));
        } else {
            await mod.default(wm);
        }
        wasm = mod;
        const mode = _ISNODE ? 'node' : 'browser';
        console.log('[MLKEM-CT-WASM] 初始化完成 (' + mode + ')');
        return wasm;
    }

    function isReady() { return wasm !== null; }

    // ================================================================
    // 向量操作 (256 元素多项式)
    // ================================================================
    /** 恒定时间压缩 compress_vec: Int16Array(256)×d → Uint8Array(N*d/8) */
    function compress(f, d) {
        if (!wasm) throw new Error('WASM not initialized');
        return new Uint8Array(wasm.compress_vec(new Int32Array(f), d));
    }

    /** 恒定时间解压 decompress_vec: Uint8Array(N*d/8)×d → Int16Array(256) */
    function decompress(g, d) {
        if (!wasm) throw new Error('WASM not initialized');
        return new Int16Array(wasm.decompress_vec(new Uint8Array(g), d));
    }

    /** 恒定时间多项式乘法 poly_mul_ct: Int16Array(256)×Int16Array(256) → Int16Array(256)
     *  固定循环 256×256=65536 次，零系数不跳过
     *  Z_Q[x]/(x^256 + 1) 负循环卷积
     *  注意: WASM 输出值带大偏移量 (如 -2.5e8)，需 mod Q 规约后才加载 Int16Array */
    const POLY_Q = 3329;
    function polyMul(f, g) {
        if (!wasm) throw new Error('WASM not initialized');
        const raw = wasm.poly_mul_ct(new Int32Array(f), new Int32Array(g));
        const out = new Int16Array(256);
        for (let i = 0; i < 256; i++) {
            out[i] = ((raw[i] % POLY_Q) + POLY_Q) % POLY_Q;
        }
        return out;
    }

    // ================================================================
    // 性能基准
    // ================================================================
    async function benchmark(rounds = 100) {
        if (!wasm) await init();
        const f = new Int32Array(256), g = new Int32Array(256);
        for (let i = 0; i < 256; i++) { f[i] = (i * 7) % 3329; g[i] = (i * 13) % 3329; }
        for (let i = 0; i < 10; i++) wasm.poly_mul_ct(f, g);
        const t0 = performance.now();
        for (let i = 0; i < rounds; i++) wasm.poly_mul_ct(f, g);
        const elapsed = performance.now() - t0;
        const perOp = elapsed / rounds;
        console.log('[BENCH] poly_mul_ct WASM: ' + rounds + ' 轮, ' + perOp.toFixed(3) + 'ms/轮');
        return { totalMs: elapsed, perOpMs: perOp, rounds };
    }

    return {
        init, isReady,
        get wasm() { return wasm; },
        compress, decompress, polyMul,
        benchmark
    };
})();

if (typeof window !== 'undefined') window.MLKEM_CT_WASM = MLKEM_CT_WASM;
if (typeof module !== 'undefined') module.exports = MLKEM_CT_WASM;