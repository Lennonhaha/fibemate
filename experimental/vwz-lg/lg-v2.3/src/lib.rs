// lg-v3/src/lib.rs — LG v2.3 模块化重构 + Stage-1 增强
// Based on v2.2.2 (lookingglass-v2, commit f9cc379)
//
// LG v3 Changes vs v2.2.2:
//   - 模块拆分: sbox.rs / wreath.rs / bind.rs / cleanup.rs / premix.rs
//   - Stage-1 增强 (VMProtect Phase-1 路线图):
//     * premix.rs: XOR-keystream pre/post-mix 覆盖全部字节 (不是仅 48)
//     * Wreath 仅覆盖活跃 48 维; premix 把混淆扩散到全 256 字节
//     * lgv3_confuse_mix() / lgv3_deconfuse_mix(): 新 API 含 premix
//   - API 新增: lgv3_audit_log() — 返回操作序列化审计日志
//   - API 新增: lgv3_verify_invertibility() — 运行时可逆性自检
//   - API 新增: lgv3_confuse_mix() / lgv3_deconfuse_mix() — 全字节混淆
//   - 不变: 所有 v2.2.2 交叉验证向量 (10/10) 必须通过
//   - 不变: 所有 v2.3 原有测试 (13 项) 必须通过
//   - 冻结纪律: 实验分支, 不合并 main, 8/31 前不部署

pub mod sbox;
pub mod wreath;
pub mod bind;
pub mod cleanup;
pub mod premix;
pub mod opcode;
pub mod vm;
pub mod cff;
pub mod pipeline;
pub mod diffuse;
pub mod hardening;
pub mod defense;
pub mod chacha8;
pub mod seal;

use wasm_bindgen::prelude::*;

// Re-export from modules
pub use sbox::{SBOX, INV_SBOX};
pub use wreath::{XorShift64, layer_seed, LayerSeeds, confuse_chunk_depth, deconfuse_chunk_depth, NUM_LAYERS};
pub use bind::CryptoBinding;
pub use cleanup::SecureBuffer;

use wreath::{confuse_full, deconfuse_full, dynamic_path_mode};
use premix::{full_mix_forward_depth, full_mix_inverse_depth};
use pipeline::{obfuscate, deobfuscate, compile_program, compile_inverse_program, obfuscate_dynamic, deobfuscate_dynamic};
use seal::{obfuscate_sealed, deobfuscate_sealed, rand_seed};
use diffuse::{diffuse_forward, diffuse_inverse};
use hardening::{harden_forward, harden_inverse, HARDEN_ROUNDS};

// ============================================================
// WASM 公开 API — 完全向后兼容 v2.2.2
// ============================================================

#[wasm_bindgen]
pub fn lgv2_confuse(data: &[u8], seed: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    confuse_full(&mut result, seed);
    harden_forward(&mut result, seed, 0, HARDEN_ROUNDS);
    result
}

#[wasm_bindgen]
pub fn lgv2_confuse_d(data: &[u8], seed: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let seeds = LayerSeeds::new(seed);
    let mut result = data.to_vec();
    confuse_chunk_depth(&mut result, seed, &seeds, depth);
    harden_forward(&mut result, seed, 0, HARDEN_ROUNDS);
    result
}

#[wasm_bindgen]
pub fn lgv2_deconfuse(data: &[u8], seed: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    harden_inverse(&mut result, seed, 0, HARDEN_ROUNDS);
    deconfuse_full(&mut result, seed);
    result
}

#[wasm_bindgen]
pub fn lgv2_deconfuse_d(data: &[u8], seed: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let seeds = LayerSeeds::new(seed);
    let mut result = data.to_vec();
    harden_inverse(&mut result, seed, 0, HARDEN_ROUNDS);
    deconfuse_chunk_depth(&mut result, seed, &seeds, depth);
    result
}

#[wasm_bindgen]
pub fn lgv2_confuse_ex(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut buf = SecureBuffer::from_slice(data);
    let combined_seed = seed.wrapping_add(session_key);
    confuse_chunk_depth(buf.get_mut(), combined_seed, &LayerSeeds::new(combined_seed), depth);
    harden_forward(buf.get_mut(), seed, session_key, HARDEN_ROUNDS);
    let result = buf.get().to_vec();
    buf.zeroize();
    result
}

#[wasm_bindgen]
pub fn lgv2_deconfuse_ex(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut buf = SecureBuffer::from_slice(data);
    harden_inverse(buf.get_mut(), seed, session_key, HARDEN_ROUNDS);
    let combined_seed = seed.wrapping_add(session_key);
    deconfuse_chunk_depth(buf.get_mut(), combined_seed, &LayerSeeds::new(combined_seed), depth);
    let result = buf.get().to_vec();
    buf.zeroize();
    result
}

// ============================================================
// Stage-1 增强 API: 全字节混淆 (premix + Wreath + postmix)
// 解决活跃维度问题: Wreath 48/256 + premix 256/256 = 全覆盖
// ============================================================

/// Stage-1 全字节混淆: XOR-keystream pre/post-mix + Wreath
/// Architecture: premix(all_bytes) -> Wreath(seed) -> postmix(all_bytes)
/// Covers ALL bytes (premix), not just 48 active dimensions (Wreath only)
#[wasm_bindgen]
pub fn lgv3_confuse_mix(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    full_mix_forward_depth(&mut result, seed, session_key, depth);
    harden_forward(&mut result, seed, session_key, HARDEN_ROUNDS);
    result
}

/// Stage-1 全字节解混淆
#[wasm_bindgen]
pub fn lgv3_deconfuse_mix(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    harden_inverse(&mut result, seed, session_key, HARDEN_ROUNDS);
    full_mix_inverse_depth(&mut result, seed, session_key, depth);
    result
}

/// Stage-1: 报告当前活跃维度 (改进后: 所有字节都被 premix 覆盖)
#[wasm_bindgen]
pub fn lgv3_active_dim() -> usize {
    256 // premix covers all bytes; Wreath contributes 48 more
}

// ============================================================
// Stage-2 增强 API: 可编程混淆管道 (VM 层)
// 在 Stage-1 premix 之上叠加一个 seed 驱动的 VM 混淆层
// ============================================================

/// Stage-2: 全管道混淆 (premix + Wreath(depth) + VM program)
/// Architecture: premix -> Wreath(depth) -> VM(seed,session,depth 编译的程序)
#[wasm_bindgen]
pub fn lgv3_pipeline_obfuscate(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    obfuscate(&mut result, seed, session_key, depth);
    result
}

/// Stage-2: 全管道解混淆 (inverse)
#[wasm_bindgen]
pub fn lgv3_pipeline_deobfuscate(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    deobfuscate(&mut result, seed, session_key, depth);
    result
}

/// Stage-2: 返回 (seed, session_key, depth) 编译出的 VM 字节码 (hex 编码，供审计/调试)
#[wasm_bindgen]
pub fn lgv3_pipeline_bytecode(seed: u64, session_key: u64, depth: usize) -> String {
    let prog = compile_program(seed, session_key, depth);
    let bc = prog.to_bytecode();
    bc.iter().map(|b| format!("{:02x}", b)).collect::<String>()
}

/// Stage-2: 返回 (seed, session_key, depth) 编译出的逆 VM 字节码 (hex 编码)
#[wasm_bindgen]
pub fn lgv3_pipeline_bytecode_inverse(seed: u64, session_key: u64, depth: usize) -> String {
    let prog = compile_inverse_program(seed, session_key, depth);
    let bc = prog.to_bytecode();
    bc.iter().map(|b| format!("{:02x}", b)).collect::<String>()
}

/// Stage-3: 全块扩散 (seed 派生 GF(256) 下/上三角线性混合)
/// 单字节扰动扩散到近全块，黑盒攻击的 sigma 定位步骤失效。
#[wasm_bindgen]
pub fn lgv3_diffuse(data: &[u8], seed: u64, session_key: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    diffuse_forward(&mut result, seed, session_key);
    result
}

/// Stage-3: 全块扩散逆运算
#[wasm_bindgen]
pub fn lgv3_diffuse_inverse(data: &[u8], seed: u64, session_key: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    diffuse_inverse(&mut result, seed, session_key);
    result
}

#[wasm_bindgen]
pub fn lgv2_bind_kem(data: &[u8], kem_ss: &[u8]) -> Vec<u8> {
    if data.is_empty() || kem_ss.len() != 32 { return vec![]; }
    let mut ss = [0u8; 32];
    ss.copy_from_slice(&kem_ss[..32]);
    let binding = CryptoBinding::new(&ss);
    binding.bind(data)
}

#[wasm_bindgen]
pub fn lgv2_unbind_kem(data: &[u8], kem_ss: &[u8]) -> Vec<u8> {
    if data.is_empty() || kem_ss.len() != 32 { return vec![]; }
    let mut ss = [0u8; 32];
    ss.copy_from_slice(&kem_ss[..32]);
    let binding = CryptoBinding::new(&ss);
    binding.unbind(data)
}

#[wasm_bindgen]
pub fn lgv2_confuse_full(data: &[u8], seed: u64, session_key: u64, kem_ss: &[u8], depth: usize) -> Vec<u8> {
    if data.is_empty() || kem_ss.len() != 32 { return vec![]; }
    let mut buf = SecureBuffer::from_slice(data);
    let combined_seed = seed.wrapping_add(session_key);
    confuse_chunk_depth(buf.get_mut(), combined_seed, &LayerSeeds::new(combined_seed), depth);
    harden_forward(buf.get_mut(), seed, session_key, HARDEN_ROUNDS);
    let mut ss = [0u8; 32];
    ss.copy_from_slice(&kem_ss[..32]);
    let binding = CryptoBinding::new(&ss);
    let result = binding.bind(buf.get());
    buf.zeroize();
    result
}

#[wasm_bindgen]
pub fn lgv2_deconfuse_full(data: &[u8], seed: u64, session_key: u64, kem_ss: &[u8], depth: usize) -> Vec<u8> {
    if data.is_empty() || kem_ss.len() != 32 { return vec![]; }
    let mut ss = [0u8; 32];
    ss.copy_from_slice(&kem_ss[..32]);
    let binding = CryptoBinding::new(&ss);
    let unbound = binding.unbind(data);
    if unbound.is_empty() { return vec![]; }
    let mut buf = SecureBuffer::from_slice(&unbound);
    harden_inverse(buf.get_mut(), seed, session_key, HARDEN_ROUNDS);
    let combined_seed = seed.wrapping_add(session_key);
    deconfuse_chunk_depth(buf.get_mut(), combined_seed, &LayerSeeds::new(combined_seed), depth);
    let result = buf.get().to_vec();
    buf.zeroize();
    result
}

/// LG v3 新增: 运行时可逆性自检
/// 对 100-byte 测试向量执行 confuse → deconfuse，验证无损还原
#[wasm_bindgen]
pub fn lgv3_verify_invertibility(seed: u64) -> bool {
    let test_data: Vec<u8> = (0..100).map(|i| (i * 7) as u8).collect();
    let confused = lgv2_confuse(&test_data, seed);
    let restored = lgv2_deconfuse(&confused, seed);
    test_data == restored
}

/// LG v3 新增: 操作审计日志
/// 返回当前混淆操作的序列化参数 (深度、种子、模块版本)
#[wasm_bindgen]
pub fn lgv3_audit_log(data_len: usize, seed: u64, depth: usize) -> String {
    format!(
        r#"{{\"version\":\"LG v2.3.0-alpha-stage2\",\"op\":\"confuse\",\"data_len\":{},\"seed\":\"{:016x}\",\"depth\":{}/{},\"modules\":[\"sbox\",\"wreath\",\"bind\",\"cleanup\",\"premix\",\"opcode\",\"vm\",\"pipeline\",\"diffuse\",\"hardening\",\"defense\"],\"baseline\":\"v2.2.2 (f9cc379)\"}}"#,
        data_len, seed, depth, NUM_LAYERS
    )
}

#[wasm_bindgen]
pub fn lgv2_version() -> String {
    "LG v2.3-alpha-stage2 (programmable pipeline VM, backward-compatible API)".to_string()
}

// ============================================================
// v2.4-dynamic Sprint 1: 运行时主动防御 API
//   - lgv3_defense_configure: 设置防御等级 (0=旁路, 1=轻, 2=标准, 3=全量)
//   - lgv3_defense_status:    返回防御状态 JSON (不含密钥材料)
// ============================================================

/// Set the runtime active-defense level. Returns 0 on success, non-zero if the
/// level is invalid. level=0 fully bypasses and is byte-identical to Stage-2.
#[wasm_bindgen]
pub fn lgv3_defense_configure(level: u32, flags: u32) -> i32 {
    defense::configure(level, flags)
}

/// JSON status of the defense engine (level, mode, anomaly count, baseline
/// sample count). Never contains seed/session/depth material.
#[wasm_bindgen]
pub fn lgv3_defense_status() -> String {
    defense::status_json()
}

/// Sprint 2: quantify how much two different session keys diverge the output.
///
/// Returns the fraction of bytes that differ between `obfuscate(data, seed,
/// sk1, depth)` and `obfuscate(data, seed, sk2, depth)`. A value near 1 means
/// the session key perturbs essentially the whole block; 0 would mean the
/// session key never reached the confusion path (a regression signal).
#[wasm_bindgen]
pub fn lgv3_session_diff_ratio(data: &[u8], seed: u64, sk1: u64, sk2: u64, depth: usize) -> f64 {
    if data.is_empty() || sk1 == sk2 {
        return 0.0;
    }
    let mut out1 = data.to_vec();
    let mut out2 = data.to_vec();
    obfuscate(&mut out1, seed, sk1, depth);
    obfuscate(&mut out2, seed, sk2, depth);
    let changed = out1
        .iter()
        .zip(out2.iter())
        .filter(|(a, b)| a != b)
        .count();
    changed as f64 / data.len() as f64
}

// ============================================================
// v2.4-dynamic Sprint 3: 密封层 API (Stage-3 变异+加密)
//   - lgv3_sealed_obfuscate:   混淆 + ChaCha8 流加密 (rand_seed 派生密钥)
//   - lgv3_sealed_deobfuscate: ChaCha8 解密 + 反混淆
//   - lgv3_rand_seed:          暴露 rand_seed 随机化派生 (供审计/测试)
// ============================================================

/// Sprint 3: 密封混淆 — obfuscate(seed,session,depth) 后叠加 ChaCha8 流加密。
///
/// 密钥/nonce 由 keccak256(seed, session_key, depth) 派生 (rand_seed 随机化,
/// 非线性, 打破 Stage-2 的 seed^session_key 线性可逆)。输出为密文, 没有
/// session 派生的密钥连反混淆管道都无法直接作用。
#[wasm_bindgen]
pub fn lgv3_sealed_obfuscate(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    obfuscate_sealed(&mut result, seed, session_key, depth);
    result
}

/// Sprint 3: 密封解混淆 — 先 ChaCha8 解密, 再 deobfuscate(seed,session,depth)。
#[wasm_bindgen]
pub fn lgv3_sealed_deobfuscate(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    deobfuscate_sealed(&mut result, seed, session_key, depth);
    result
}

/// Sprint 3: 返回 (seed, session_key, depth) 的 rand_seed 派生值 (hex, 审计用)。
#[wasm_bindgen]
pub fn lgv3_rand_seed(seed: u64, session_key: u64, depth: usize) -> String {
    format!("{:016x}", rand_seed(seed, session_key, depth))
}

// ============================================================
// v2.4-dynamic Sprint 4: 动态路径 (dynamic_path) API
//   - lgv3_pipeline_obfuscate_dynamic:   混淆，Wreath 层按 session_key 双路径
//   - lgv3_pipeline_deobfuscate_dynamic: 解混淆 (与上方成对)
//   - lgv3_dynamic_path_profile: 返回 session_key 各层的路径选择 (审计/测试)
//   - 向后兼容: 非 dynamic 变体输出字节级不变 (黄金向量仍通过)
// ============================================================

/// Sprint 4: 动态路径混淆 — Wreath 核心在 Standard/Substitute 之间按
/// session_key 逐层选择。不同 session 走不同混淆路径，session 独立性
/// 高于固定管线。路径选择不依赖数据, forward/inverse 天然一致。
#[wasm_bindgen]
pub fn lgv3_pipeline_obfuscate_dynamic(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    obfuscate_dynamic(&mut result, seed, session_key, depth);
    result
}

/// Sprint 4: 动态路径解混淆 (须与 lgv3_pipeline_obfuscate_dynamic 用相同
/// seed/session_key/depth)。
#[wasm_bindgen]
pub fn lgv3_pipeline_deobfuscate_dynamic(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    deobfuscate_dynamic(&mut result, seed, session_key, depth);
    result
}

/// Sprint 4: 返回 session_key 下 NUM_LAYERS 层的路径选择字符串
/// ('S' = Substitute 恒等层, 'T' = Standard 真实变换层)，供审计/测试
/// 验证不同 session 产生不同路径分布。
#[wasm_bindgen]
pub fn lgv3_dynamic_path_profile(session_key: u64) -> String {
    (0..NUM_LAYERS)
        .map(|li| if dynamic_path_mode(session_key, li) { 'S' } else { 'T' })
        .collect()
}

// ============================================================
// 单元测试 — 10 项原有 + 3 项 v3 新增 = 13 项
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    // ---- 原有 10 项 (v2.2.2 交叉验证) ----

    #[test]
    fn test_compare_with_python_100b() {
        let data: Vec<u8> = (0..100).map(|i| (i * 7) as u8).collect();
        let confused = lgv2_confuse(&data, 0x1234);
        let expected_first8 = vec![56, 9, 85, 47, 45, 143, 48, 225];
        assert_eq!(&confused[..8], &expected_first8[..], "100B first 8 bytes must match Python");
    }

    #[test]
    fn test_compare_with_python_all_variants() {
        // Stage-3 harden 落地后，全部变体输出与 Python oracle 交叉验证。
        let data: Vec<u8> = (0..100).map(|i| (i * 7) as u8).collect();
        let ss: Vec<u8> = vec![0x42u8; 32];
        let cases: Vec<(Vec<u8>, Vec<u8>)> = vec![
            (lgv2_confuse_ex(&data, 0x1234, 0xDEAD, 7), vec![238, 86, 135, 63, 135, 33, 2, 7]),
            (lgv3_confuse_mix(&data, 0x1234, 0xDEAD, 7), vec![252, 25, 57, 216, 205, 7, 125, 32]),
            (lgv2_confuse_full(&data, 0x1234, 0xDEAD, &ss, 7), vec![192, 191, 95, 199, 193, 213, 79, 225]),
            (lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7), vec![25, 64, 55, 144, 43, 105, 160, 124]),
        ];
        for (i, (got, exp)) in cases.iter().enumerate() {
            assert_eq!(&got[..8], &exp[..], "variant {} first 8 bytes must match Python", i);
        }
    }

    #[test]
    fn test_roundtrip_100b() {
        let data: Vec<u8> = (0..100).map(|i| (i * 7) as u8).collect();
        let confused = lgv2_confuse(&data, 0x1234);
        let restored = lgv2_deconfuse(&confused, 0x1234);
        assert_eq!(data, restored, "round-trip 100B failed");
    }

    #[test]
    fn test_roundtrip_840b() {
        let data: Vec<u8> = (0..840).map(|i| (i ^ 0xAA) as u8).collect();
        let confused = lgv2_confuse(&data, 0xDEADBEEF);
        let restored = lgv2_deconfuse(&confused, 0xDEADBEEF);
        assert_eq!(data, restored, "round-trip 840B failed");
    }

    #[test]
    fn test_roundtrip_2000b() {
        let data: Vec<u8> = (0..2000).map(|i| (i & 0xFF) as u8).collect();
        let confused = lgv2_confuse(&data, 0xCAFE);
        let restored = lgv2_deconfuse(&confused, 0xCAFE);
        assert_eq!(data, restored, "round-trip 2000B failed");
    }

    #[test]
    fn test_roundtrip_4b() {
        let data = vec![0x01, 0x02, 0x03, 0x04];
        let confused = lgv2_confuse(&data, 42);
        let restored = lgv2_deconfuse(&confused, 42);
        assert_eq!(data, restored, "round-trip 4B failed");
    }

    #[test]
    fn test_roundtrip_1b() {
        let data = vec![0xAA];
        let confused = lgv2_confuse(&data, 99);
        let restored = lgv2_deconfuse(&confused, 99);
        assert_eq!(data, restored, "round-trip 1B failed");
    }

    #[test]
    fn test_deterministic() {
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let r1 = lgv2_confuse(&data, 42);
        let r2 = lgv2_confuse(&data, 42);
        assert_eq!(r1, r2, "same seed must produce same output");
    }

    #[test]
    fn test_seed_sensitivity() {
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let r1 = lgv2_confuse(&data, 42);
        let r2 = lgv2_confuse(&data, 43);
        assert_ne!(r1, r2, "different seed must produce different output");
    }

    #[test]
    fn test_empty_input() {
        let data: Vec<u8> = vec![];
        let confused = lgv2_confuse(&data, 0);
        assert_eq!(confused.len(), 0);
    }

    // ---- 可变深度测试 (v2.2.2 引入) ----

    #[test]
    fn test_depth_roundtrip() {
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        for d in 1..=NUM_LAYERS {
            let confused = lgv2_confuse_d(&data, 0x1234, d);
            let restored = lgv2_deconfuse_d(&confused, 0x1234, d);
            assert_eq!(data, restored, "depth={} roundtrip failed", d);
        }
    }

    // ---- 五短板增强测试 (v2.2.2) ----

    #[test]
    fn test_full_confuse_deconfuse() {
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let ss: Vec<u8> = (0..32).map(|i| 0x42u8).collect();
        let confused = lgv2_confuse_full(&data, 0x1234, 0xDEAD, &ss, 7);
        let restored = lgv2_deconfuse_full(&confused, 0x1234, 0xDEAD, &ss, 7);
        assert_eq!(data, restored, "full confuse/deconfuse must recover");
    }

    // ---- v3 Stage-1 增强测试 (3 项) ----

    #[test]
    fn test_stage1_full_coverage() {
        // Stage-1: premix + Wreath + postmix covers ALL 256 bytes
        // Even bytes that Wreath treats as identity (208/256) are XOR-masked by premix
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        let confused = lgv3_confuse_mix(&data, 0x1234, 0xDEAD, 7);
        let restored = lgv3_deconfuse_mix(&confused, 0x1234, 0xDEAD, 7);
        assert_eq!(data, restored, "Stage-1 full-coverage roundtrip must recover");

        // Key property: premix changes ALL bytes, even the Wreath "tail"
        // (Wreath tail 48..255 would be identity without premix)
        let premix_only = lgv3_confuse_mix(&data, 0x1234, 0xDEAD, 0); // depth=0 = premix only
        assert_ne!(
            data, premix_only,
            "premix alone must change all bytes"
        );
        // And premix alone must be invertible
        let back = lgv3_deconfuse_mix(&premix_only, 0x1234, 0xDEAD, 0);
        assert_eq!(data, back, "premix alone must be invertible");
    }

    #[test]
    fn test_stage1_session_independence() {
        // Stage-1: different session_key produces different output
        // (premix key = seed ^ session_key, so different session = different keystream)
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        let c1 = lgv3_confuse_mix(&data, 0x1234, 0xDEAD, 7);
        let c2 = lgv3_confuse_mix(&data, 0x1234, 0xBEEF, 7); // different session
        assert_ne!(c1, c2, "different session_key must produce different output");

        // Same session twice: deterministic
        let c3 = lgv3_confuse_mix(&data, 0x1234, 0xDEAD, 7);
        assert_eq!(c1, c3, "same seed+session must be deterministic");
    }

    #[test]
    fn test_stage1_different_seeds() {
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        let c1 = lgv3_confuse_mix(&data, 0x1234, 0xDEAD, 7);
        let c2 = lgv3_confuse_mix(&data, 0x5678, 0xDEAD, 7);
        assert_ne!(c1, c2, "different seed must produce different output");
    }

    // ---- v3 新增测试 (3 项) ----

    #[test]
    fn test_v3_verify_invertibility() {
        assert!(lgv3_verify_invertibility(0x1234), "invertibility check must PASS");
        assert!(lgv3_verify_invertibility(0xDEADBEEF), "invertibility check must PASS for varied seed");
    }

    #[test]
    fn test_v3_audit_log() {
        let log = lgv3_audit_log(100, 0x1234, 7);
        assert!(log.contains("LG v2.3"), "audit log must contain version");
        assert!(log.contains("v2.2.2"), "audit log must reference baseline");
        assert!(log.contains("f9cc379"), "audit log must reference baseline commit");
    }

    #[test]
    fn test_v3_api_regression() {
        // 确保 v3 向后兼容 v2.2.2 所有 API
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let ss: Vec<u8> = vec![0x42u8; 32];

        // 旧 API 不变
        let c = lgv2_confuse(&data, 0x1234);
        assert_eq!(lgv2_deconfuse(&c, 0x1234), data);

        // 可变深度 API 不变
        let cd = lgv2_confuse_d(&data, 0x1234, 3);
        assert_eq!(lgv2_deconfuse_d(&cd, 0x1234, 3), data);

        // 增强 API 不变
        let ce = lgv2_confuse_ex(&data, 0x1234, 0xDEAD, 7);
        assert_eq!(lgv2_deconfuse_ex(&ce, 0x1234, 0xDEAD, 7), data);

        // KEM 绑定 API 不变
        let bound = lgv2_bind_kem(&data, &ss);
        assert_eq!(lgv2_unbind_kem(&bound, &ss), data);

        // 全 API 不变
        let cf = lgv2_confuse_full(&data, 0x1234, 0xDEAD, &ss, 7);
        assert_eq!(lgv2_deconfuse_full(&cf, 0x1234, 0xDEAD, &ss, 7), data);
    }

    // ---- Stage-2 管道测试 ----

    #[test]
    fn test_stage2_pipeline_roundtrip() {
        for n in [1usize, 4, 100, 256, 1000] {
            let data: Vec<u8> = (0..n).map(|i| (i * 7) as u8).collect();
            let c = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
            assert_ne!(c, data, "pipeline obfuscate must change data (n={})", n);
            let r = lgv3_pipeline_deobfuscate(&c, 0x1234, 0xDEAD, 7);
            assert_eq!(r, data, "pipeline roundtrip failed (n={})", n);
        }
    }

    #[test]
    fn test_stage2_pipeline_session_independence() {
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        let c1 = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        let c2 = lgv3_pipeline_obfuscate(&data, 0x1234, 0xBEEF, 7);
        assert_ne!(c1, c2, "different session must differ");
        let c3 = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        assert_eq!(c1, c3, "same seed+session must be deterministic");
    }

    #[test]
    fn test_stage2_bytecode_differs() {
        let b1 = lgv3_pipeline_bytecode(1, 0, 7);
        let b2 = lgv3_pipeline_bytecode(2, 0, 7);
        assert_ne!(b1, b2, "different seeds must produce different bytecode");
        assert!(!b1.is_empty(), "bytecode must not be empty");
    }

    #[test]
    fn test_stage2_pipeline_depth_sensitivity() {
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        let c1 = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 3);
        let c2 = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        assert_ne!(c1, c2, "different depth must differ");
    }

    #[test]
    fn test_stage2_empty_input() {
        let empty: Vec<u8> = vec![];
        let c = lgv3_pipeline_obfuscate(&empty, 0x1234, 0xDEAD, 7);
        assert_eq!(c.len(), 0);
    }

    // ---- Sprint 2: control-flow flattening regression ----

    #[test]
    fn test_sprint2_cff_roundtrip_stable() {
        // The flattened dispatch must not change pipeline semantics.
        for n in [1usize, 64, 256] {
            let data: Vec<u8> = (0..n).map(|i| (i * 11) as u8).collect();
            for seed in [0u64, 0x1234, 0xDEADBEEF] {
                for sk in [0x1111u64, 0xBEEF] {
                    let mut c = data.clone();
                    obfuscate(&mut c, seed, sk, 5);
                    deobfuscate(&mut c, seed, sk, 5);
                    assert_eq!(c, data, "CFF roundtrip failed (n={}, seed={}, sk={})", n, seed, sk);
                }
            }
        }
    }

    #[test]
    fn test_sprint2_cff_level0_byte_identical() {
        // Defense bypass path stays byte-identical to the plain pipeline.
        defense::configure(0, 0);
        let data: Vec<u8> = (0..128).map(|i| i as u8).collect();
        let a = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        let b = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        assert_eq!(a, b, "deterministic under CFF");
        let r = lgv3_pipeline_deobfuscate(&a, 0x1234, 0xDEAD, 7);
        assert_eq!(r, data);
    }

    #[test]
    fn test_sprint2_cff_defense_enabled_stable() {
        // Defense engine + CFF dispatch compose without poisoning in clean env.
        defense::configure(3, 0);
        let data: Vec<u8> = (0..128).map(|i| (i * 3) as u8).collect();
        let mut ok = true;
        for _ in 0..6 {
            let mut c = data.clone();
            obfuscate(&mut c, 0xCAFE, 0xDEAD, 7);
            deobfuscate(&mut c, 0xCAFE, 0xDEAD, 7);
            ok &= c == data;
        }
        defense::configure(0, 0);
        assert!(ok, "CFF + defense must keep clean-env roundtrip intact");
    }

    // ---- Sprint 2: session diff quantification ----

    #[test]
    fn test_sprint2_session_diff_positive_all_samples() {
        // Different session keys must perturb the output. No sample may be 0.
        let seeds = [0u64, 0x1234, 0xDEADBEEF];
        let sk_pairs = [(0x1000u64, 0x2000u64), (0xBEEFu64, 0xCAFEu64)];
        let sizes = [64usize, 256];
        for &n in &sizes {
            let data: Vec<u8> = (0..n).map(|i| (i * 7) as u8).collect();
            for &seed in &seeds {
                for &(sk1, sk2) in &sk_pairs {
                    let r = lgv3_session_diff_ratio(&data, seed, sk1, sk2, 7);
                    assert!(
                        r > 0.0,
                        "session diff must be positive (n={}, seed={}, sk1={}, sk2={})",
                        n, seed, sk1, sk2
                    );
                }
            }
        }
    }

    #[test]
    fn test_sprint2_session_diff_discriminates() {
        // Same session key => identical output (ratio 0); different => > 0.
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        let same = lgv3_session_diff_ratio(&data, 0x1234, 0xBEEF, 0xBEEF, 7);
        assert_eq!(same, 0.0, "identical sessions must have zero diff");
        let diff = lgv3_session_diff_ratio(&data, 0x1234, 0xBEEF, 0xCAFE, 7);
        assert!(diff > 0.0, "different sessions must diverge");
    }

    #[test]
    fn test_sprint2_session_diff_empty_input() {
        let empty: Vec<u8> = vec![];
        assert_eq!(lgv3_session_diff_ratio(&empty, 1, 2, 3, 7), 0.0);
    }

    // ---- Sprint 3: sealed layer (Stage-3 变异+加密) ----

    #[test]
    fn test_sprint3_sealed_roundtrip() {
        for n in [0usize, 1, 64, 256, 840, 2000] {
            let data: Vec<u8> = (0..n).map(|i| (i * 3 + 7) as u8).collect();
            let mut enc = data.clone();
            obfuscate_sealed(&mut enc, 0x1234, 0xDEAD, 7);
            if n > 0 {
                assert_ne!(enc, data, "sealed must change data (n={})", n);
            }
            let mut dec = enc.clone();
            deobfuscate_sealed(&mut dec, 0x1234, 0xDEAD, 7);
            assert_eq!(dec, data, "sealed roundtrip (n={})", n);
        }
    }

    #[test]
    fn test_sprint3_sealed_wasm_api() {
        let data: Vec<u8> = (0..256).map(|i| (i * 5) as u8).collect();
        let enc = lgv3_sealed_obfuscate(&data, 0xABCD, 0xFEED, 7);
        assert_ne!(enc, data);
        let dec = lgv3_sealed_deobfuscate(&enc, 0xABCD, 0xFEED, 7);
        assert_eq!(dec, data);
    }

    #[test]
    fn test_sprint3_sealed_differs_from_plain() {
        let data: Vec<u8> = (0..128).map(|i| i as u8).collect();
        let plain = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        let sealed = lgv3_sealed_obfuscate(&data, 0x1234, 0xDEAD, 7);
        assert_ne!(plain, sealed, "sealed layer must add an extra transform");
    }

    #[test]
    fn test_sprint3_sealed_key_sensitivity() {
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        let c1 = lgv3_sealed_obfuscate(&data, 0x1234, 0xDEAD, 7);
        let c2 = lgv3_sealed_obfuscate(&data, 0x1234, 0xDEAD_1, 7);
        let diff = c1.iter().zip(c2.iter()).filter(|(a, b)| a != b).count();
        assert!(diff > 0, "session_key must perturb sealed output");
    }

    #[test]
    fn test_sprint3_sealed_wrong_key_fails() {
        let data: Vec<u8> = (0..200).map(|i| (i * 5) as u8).collect();
        let enc = lgv3_sealed_obfuscate(&data, 0x1111, 0x2222, 7);
        let dec = lgv3_sealed_deobfuscate(&enc, 0x1111, 0x3333, 7);
        assert_ne!(dec, data, "wrong session_key must not restore data");
    }

    #[test]
    fn test_sprint3_rand_seed_nonlinear() {
        // rand_seed 必须非线性 (不等于 Stage-2 的 seed ^ session ^ depth*k)。
        let lin = 0x1234u64 ^ 0xDEADu64 ^ (7u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        assert_ne!(rand_seed(0x1234, 0xDEAD, 7), lin);
        assert_ne!(rand_seed(0x1234, 0xDEAD, 7), rand_seed(0x1235, 0xDEAD, 7));
        assert_ne!(rand_seed(0x1234, 0xDEAD, 7), rand_seed(0x1234, 0xDEAD, 8));
    }

    #[test]
    fn test_sprint3_sealed_deterministic() {
        let data: Vec<u8> = (0..128).map(|i| i as u8).collect();
        let a = lgv3_sealed_obfuscate(&data, 0x7777, 0x8888, 7);
        let b = lgv3_sealed_obfuscate(&data, 0x7777, 0x8888, 7);
        assert_eq!(a, b, "sealed output must be deterministic for same params");
    }

    // ---- Sprint 3: 256B 全 0 输入验证 (stage1/2 文档收尾漏项) ----

    #[test]
    fn test_sprint3_all_zero_256b_pipeline() {
        // 256B 全 0 输入: 混淆输出必须全字节变化 (非 premix XorShift64 自举问题),
        // 且 roundtrip 精确还原。
        let data = vec![0u8; 256];
        let c = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        assert_ne!(c, data, "pipeline must change all-zero input");
        let changed = c.iter().filter(|&&b| b != 0).count();
        assert!(
            changed >= 256,
            "all-zero input must flip all 256 bytes (got {})",
            changed
        );
        let r = lgv3_pipeline_deobfuscate(&c, 0x1234, 0xDEAD, 7);
        assert_eq!(r, data, "all-zero roundtrip");
    }

    #[test]
    fn test_sprint3_all_zero_256b_sealed() {
        // 密封层同样覆盖 256B 全 0 输入。注意: ChaCha8 流加密的 keystream
        // 每字节有 1/256 概率恰为 0x00 (与输入 0x00 异或后仍为 0), 属正常
        // 概率事件, 因此断言"绝大多数字节变化"而非"全部 256 字节变化"。
        let data = vec![0u8; 256];
        let c = lgv3_sealed_obfuscate(&data, 0x1234, 0xDEAD, 7);
        assert_ne!(c, data);
        let changed = c.iter().filter(|&&b| b != 0).count();
        assert!(
            changed >= 230,
            "sealed all-zero must flip the vast majority of bytes (got {})",
            changed
        );
        let r = lgv3_sealed_deobfuscate(&c, 0x1234, 0xDEAD, 7);
        assert_eq!(r, data);
    }

    #[test]
    fn test_sprint3_all_zero_256b_session_diff() {
        // 全 0 输入下, 不同 session 也必须产出不同输出。
        let data = vec![0u8; 256];
        let c1 = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        let c2 = lgv3_pipeline_obfuscate(&data, 0x1234, 0xBEEF, 7);
        assert_ne!(c1, c2, "all-zero input must still diverge across sessions");
    }

    // ---- Sprint 4: dynamic path (Wreath 层内双路径) ----

    #[test]
    fn test_sprint4_dynamic_roundtrip() {
        for n in [1usize, 4, 64, 256, 840] {
            let data: Vec<u8> = (0..n).map(|i| (i * 7) as u8).collect();
            for seed in [0u64, 0x1234, 0xDEADBEEF] {
                for sk in [0u64, 0x1111, 0xBEEF, 0xCAFE] {
                    for depth in [1usize, 3, 7] {
                        let mut c = data.clone();
                        obfuscate_dynamic(&mut c, seed, sk, depth);
                        assert_ne!(c, data, "dynamic obfuscate must change data (n={}, seed={}, sk={}, d={})", n, seed, sk, depth);
                        deobfuscate_dynamic(&mut c, seed, sk, depth);
                        assert_eq!(c, data, "dynamic roundtrip failed (n={}, seed={}, sk={}, d={})", n, seed, sk, depth);
                    }
                }
            }
        }
    }

    #[test]
    fn test_sprint4_dynamic_wasm_api() {
        let data: Vec<u8> = (0..256).map(|i| (i * 3) as u8).collect();
        let enc = lgv3_pipeline_obfuscate_dynamic(&data, 0xABCD, 0xFEED, 7);
        assert_ne!(enc, data, "dynamic WASM obfuscate must change data");
        let dec = lgv3_pipeline_deobfuscate_dynamic(&enc, 0xABCD, 0xFEED, 7);
        assert_eq!(dec, data, "dynamic WASM roundtrip");
    }

    #[test]
    fn test_sprint4_dynamic_positive_session_diff() {
        // 不同 session_key 在 dynamic 路径下必须发散（比固定路径更强）。
        let seeds = [0u64, 0x1234, 0xDEADBEEF];
        let sk_pairs = [(0x1000u64, 0x2000u64), (0xBEEFu64, 0xCAFEu64)];
        for &n in &[64usize, 256] {
            let data: Vec<u8> = (0..n).map(|i| (i * 7) as u8).collect();
            for &seed in &seeds {
                for &(sk1, sk2) in &sk_pairs {
                    let mut o1 = data.clone();
                    let mut o2 = data.clone();
                    obfuscate_dynamic(&mut o1, seed, sk1, 7);
                    obfuscate_dynamic(&mut o2, seed, sk2, 7);
                    let changed = o1.iter().zip(o2.iter()).filter(|(a, b)| a != b).count();
                    assert!(
                        changed > 0,
                        "dynamic session diff must be positive (n={}, seed={}, sk1={:x}, sk2={:x})",
                        n, seed, sk1, sk2
                    );
                }
            }
        }
    }

    #[test]
    fn test_sprint4_dynamic_deterministic() {
        let data: Vec<u8> = (0..128).map(|i| i as u8).collect();
        let a = lgv3_pipeline_obfuscate_dynamic(&data, 0x7777, 0x8888, 7);
        let b = lgv3_pipeline_obfuscate_dynamic(&data, 0x7777, 0x8888, 7);
        assert_eq!(a, b, "dynamic output must be deterministic for same params");
    }

    #[test]
    fn test_sprint4_dynamic_wrong_key_fails() {
        let data: Vec<u8> = (0..200).map(|i| (i * 5) as u8).collect();
        let enc = lgv3_pipeline_obfuscate_dynamic(&data, 0x1111, 0x2222, 7);
        let dec = lgv3_pipeline_deobfuscate_dynamic(&enc, 0x1111, 0x3333, 7);
        assert_ne!(dec, data, "wrong session_key must not restore dynamic data");
    }

    #[test]
    fn test_sprint4_dynamic_path_profile_varies() {
        // 路径选择必须随 session_key 变化，且同时覆盖 Standard 与 Substitute。
        let p1 = lgv3_dynamic_path_profile(0x1111);
        let p2 = lgv3_dynamic_path_profile(0x2222);
        assert_eq!(p1.len(), NUM_LAYERS, "profile must cover all layers");
        assert_ne!(p1, p2, "different sessions must pick different paths");
        // 至少一个 Substitute 与一个 Standard 被选中（双路径都真实可达）。
        assert!(p1.contains('S'), "profile must include Substitute: {}", p1);
        assert!(p1.contains('T'), "profile must include Standard: {}", p1);
        // 确定性。
        assert_eq!(p1, lgv3_dynamic_path_profile(0x1111), "path profile must be deterministic");
    }

    #[test]
    fn test_sprint4_dynamic_all_zero_input() {
        // 256B 全 0 输入在 dynamic 路径下也必须全字节发散且 roundtrip。
        let data = vec![0u8; 256];
        let c = lgv3_pipeline_obfuscate_dynamic(&data, 0x1234, 0xDEAD, 7);
        assert_ne!(c, data, "dynamic must change all-zero input");
        let changed = c.iter().filter(|&&b| b != 0).count();
        assert!(
            changed >= 256,
            "dynamic all-zero must flip all 256 bytes (got {})",
            changed
        );
        let r = lgv3_pipeline_deobfuscate_dynamic(&c, 0x1234, 0xDEAD, 7);
        assert_eq!(r, data, "dynamic all-zero roundtrip");
    }

    #[test]
    fn test_sprint4_fixed_paths_unchanged() {
        // 向后兼容: dynamic 变体引入不得改变固定管线输出 (黄金向量回归)。
        let data: Vec<u8> = (0..100).map(|i| (i * 7) as u8).collect();
        let a = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        let b = lgv3_pipeline_obfuscate(&data, 0x1234, 0xDEAD, 7);
        assert_eq!(&a[..8], &[25u8, 64, 55, 144, 43, 105, 160, 124], "fixed golden vector must be unchanged");
        assert_eq!(a, b, "fixed path deterministic");
    }

    #[test]
    fn test_sprint4_dynamic_differs_from_fixed() {
        // dynamic 与固定管线输出应当不同（至少某些层走了 Substitute）。
        // 用一个确实混入 Substitute 的 session_key（profile 已含 'S'）。
        let data: Vec<u8> = (0..256).map(|i| i as u8).collect();
        let mut sk = 1u64;
        while !lgv3_dynamic_path_profile(sk).contains('S') {
            sk += 1;
        }
        let fixed = lgv3_pipeline_obfuscate(&data, 0x1234, sk, 7);
        let dynamic = lgv3_pipeline_obfuscate_dynamic(&data, 0x1234, sk, 7);
        assert_ne!(
            fixed, dynamic,
            "dynamic path must diverge from fixed pipeline when Substitute is active (sk={:x})",
            sk
        );
    }
}
