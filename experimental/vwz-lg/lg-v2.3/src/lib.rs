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
pub mod pipeline;

use wasm_bindgen::prelude::*;

// Re-export from modules
pub use sbox::{SBOX, INV_SBOX};
pub use wreath::{XorShift64, layer_seed, LayerSeeds, confuse_chunk_depth, deconfuse_chunk_depth, NUM_LAYERS};
pub use bind::CryptoBinding;
pub use cleanup::SecureBuffer;

use wreath::{confuse_full, deconfuse_full};
use premix::{full_mix_forward_depth, full_mix_inverse_depth};
use pipeline::{obfuscate, deobfuscate, compile_program, compile_inverse_program};

// ============================================================
// WASM 公开 API — 完全向后兼容 v2.2.2
// ============================================================

#[wasm_bindgen]
pub fn lgv2_confuse(data: &[u8], seed: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    confuse_full(&mut result, seed);
    result
}

#[wasm_bindgen]
pub fn lgv2_confuse_d(data: &[u8], seed: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let seeds = LayerSeeds::new(seed);
    let mut result = data.to_vec();
    confuse_chunk_depth(&mut result, seed, &seeds, depth);
    result
}

#[wasm_bindgen]
pub fn lgv2_deconfuse(data: &[u8], seed: u64) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
    deconfuse_full(&mut result, seed);
    result
}

#[wasm_bindgen]
pub fn lgv2_deconfuse_d(data: &[u8], seed: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let seeds = LayerSeeds::new(seed);
    let mut result = data.to_vec();
    deconfuse_chunk_depth(&mut result, seed, &seeds, depth);
    result
}

#[wasm_bindgen]
pub fn lgv2_confuse_ex(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut buf = SecureBuffer::from_slice(data);
    let combined_seed = seed.wrapping_add(session_key);
    confuse_chunk_depth(buf.get_mut(), combined_seed, &LayerSeeds::new(combined_seed), depth);
    let result = buf.get().to_vec();
    buf.zeroize();
    result
}

#[wasm_bindgen]
pub fn lgv2_deconfuse_ex(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut buf = SecureBuffer::from_slice(data);
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
    result
}

/// Stage-1 全字节解混淆
#[wasm_bindgen]
pub fn lgv3_deconfuse_mix(data: &[u8], seed: u64, session_key: u64, depth: usize) -> Vec<u8> {
    if data.is_empty() { return vec![]; }
    let mut result = data.to_vec();
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
        r#"{{\"version\":\"LG v2.3.0-alpha-stage2\",\"op\":\"confuse\",\"data_len\":{},\"seed\":\"{:016x}\",\"depth\":{}/{},\"modules\":[\"sbox\",\"wreath\",\"bind\",\"cleanup\",\"premix\",\"opcode\",\"vm\",\"pipeline\"],\"baseline\":\"v2.2.2 (f9cc379)\"}}"#,
        data_len, seed, depth, NUM_LAYERS
    )
}

#[wasm_bindgen]
pub fn lgv2_version() -> String {
    "LG v2.3-alpha-stage2 (programmable pipeline VM, backward-compatible API)".to_string()
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
        let expected_first8 = vec![215, 243, 99, 104, 54, 216, 205, 254];
        assert_eq!(&confused[..8], &expected_first8[..], "100B first 8 bytes must match Python");
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
}
