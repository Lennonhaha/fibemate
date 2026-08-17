// lg-v2.3/src/seal.rs — Stage-3 密封层 (变异+加密) (Sprint 3)
//
// 目标: 在 Stage-2 混淆管道之外再加一层密钥派生的流加密:
//
//   Forward:  data -> obfuscate(seed,session,depth) -> ChaCha8(key,nonce) -> ciphertext
//   Inverse:  ciphertext -> ChaCha8(key,nonce) -> deobfuscate(seed,session,depth) -> data
//
// 作用:
//   1. rand_seed 随机化: 密钥/nonce 由 keccak256(seed || session_key || depth)
//      派生, 替代 Stage-2 的线性 seed^session_key。线性组合可被差分/代数
//      方法还原, keccak 打散破坏该可逆性。
//   2. 无密钥连反混淆都进不去: 没有 session 派生的密钥, ciphertext 本身
//      就是密文, 反混淆管道无法直接作用在其上。分析成本从"还原混淆"升级
//      为"先破解流加密"。
//
// 向后兼容: 不修改既有 obfuscate/deobfuscate 语义 (Stage-2 黄金向量不变量
// 保持), 仅新增 sealed 变体。旧 API 无密钥则输出不变。
//
// 性能: ChaCha8 每字节约 1-2 次 u32 轮操作, 相对 harden O(n²) 开销可忽略。

use crate::bind::keccak256;
use crate::chacha8::chacha8_xor;
use crate::pipeline::{obfuscate, deobfuscate};

/// ChaCha8 密钥长度 (字节)。
const KEY_LEN: usize = 32;
/// ChaCha8 nonce 长度 (字节)。
const NONCE_LEN: usize = 12;

/// 派生密封密钥材料: (key[32], nonce[12]).
///
/// 输入域标签 (domain tag) 区分密钥派生与 nonce 派生, 避免同域碰撞。
fn derive_key_material(seed: u64, session_key: u64, depth: usize) -> ([u8; KEY_LEN], [u8; NONCE_LEN]) {
    let mut key_input = Vec::with_capacity(8 + 8 + 8 + 4 + 8);
    key_input.extend_from_slice(&seed.to_le_bytes());
    key_input.extend_from_slice(&session_key.to_le_bytes());
    key_input.extend_from_slice(&(depth as u64).to_le_bytes());
    key_input.extend_from_slice(b"seal-key");
    let key = keccak256(&key_input);
    let mut nonce_input = Vec::with_capacity(8 + 8 + 8 + 4 + 8);
    nonce_input.extend_from_slice(&seed.to_le_bytes());
    nonce_input.extend_from_slice(&session_key.to_le_bytes());
    nonce_input.extend_from_slice(&(depth as u64).to_le_bytes());
    nonce_input.extend_from_slice(b"seal-nonce");
    let h = keccak256(&nonce_input);
    let mut nonce = [0u8; NONCE_LEN];
    nonce.copy_from_slice(&h[..NONCE_LEN]);
    (key, nonce)
}

/// rand_seed 随机化: 由 (seed, session_key, depth) 派生一个 64-bit 派生种子。
///
/// Stage-2 的 `map_seed` 使用线性组合 `seed ^ session_key ^ depth*k`, 其
/// 输入输出关系可直接求解。这里用 keccak256 打散, 任意一比特输入变化都
/// 扩散到全部 64 比特, 消除线性可逆性。
pub fn rand_seed(seed: u64, session_key: u64, depth: usize) -> u64 {
    let mut input = Vec::with_capacity(8 + 8 + 8 + 4 + 8);
    input.extend_from_slice(&seed.to_le_bytes());
    input.extend_from_slice(&session_key.to_le_bytes());
    input.extend_from_slice(&(depth as u64).to_le_bytes());
    input.extend_from_slice(b"rand-seed");
    let h = keccak256(&input);
    u64::from_le_bytes([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]])
}

/// 密封混淆: obfuscate 之后叠加 ChaCha8 流加密。
///
/// 返回密文。相同输入 + 相同 (seed, session_key, depth) 输出确定 (流加密
/// 密钥派生自参数, 非随机), 保证 deobfuscate 可还原。
pub fn obfuscate_sealed(data: &mut [u8], seed: u64, session_key: u64, depth: usize) {
    if data.is_empty() {
        return;
    }
    obfuscate(data, seed, session_key, depth);
    let (key, nonce) = derive_key_material(seed, session_key, depth);
    chacha8_xor(data, &key, &nonce, 0);
}

/// 密封解混淆: 先 ChaCha8 解密, 再 deobfuscate。
pub fn deobfuscate_sealed(data: &mut [u8], seed: u64, session_key: u64, depth: usize) {
    if data.is_empty() {
        return;
    }
    let (key, nonce) = derive_key_material(seed, session_key, depth);
    chacha8_xor(data, &key, &nonce, 0);
    deobfuscate(data, seed, session_key, depth);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rand_seed_derivation() {
        let a = rand_seed(0x1234, 0xDEAD, 7);
        assert_ne!(a, 0x1234 ^ 0xDEAD ^ (7u64).wrapping_mul(0x9E37_79B9_7F4A_7C15),
            "rand_seed must not equal the linear Stage-2 mix");
        assert_ne!(rand_seed(0x1234, 0xDEAD, 7), rand_seed(0x1235, 0xDEAD, 7));
        assert_ne!(rand_seed(0x1234, 0xDEAD, 7), rand_seed(0x1234, 0xDEAD, 8));
        assert_ne!(rand_seed(0x1234, 0xDEAD, 7), rand_seed(0x1234, 0xDEADF, 7));
    }

    #[test]
    fn test_sealed_roundtrip() {
        for n in [0usize, 1, 64, 100, 256, 840, 2000] {
            let data: Vec<u8> = (0..n as u32).map(|i| (i * 3 + 7) as u8).collect();
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
    fn test_sealed_differs_from_plain_obfuscate() {
        let data: Vec<u8> = (0..100u32).map(|i| i as u8).collect();
        let mut plain = data.clone();
        obfuscate(&mut plain, 0x1234, 0xDEAD, 7);
        let mut sealed = data.clone();
        obfuscate_sealed(&mut sealed, 0x1234, 0xDEAD, 7);
        assert_ne!(plain, sealed, "sealed layer must add an extra transform");
    }

    #[test]
    fn test_sealed_key_sensitivity() {
        let data: Vec<u8> = (0..256u32).map(|i| i as u8).collect();
        let mut c1 = data.clone();
        obfuscate_sealed(&mut c1, 0x1234, 0xDEAD, 7);
        let mut c2 = data.clone();
        obfuscate_sealed(&mut c2, 0x1234, 0xDEAD_1, 7);
        let diff: usize = c1.iter().zip(c2.iter()).filter(|(a, b)| a != b).count();
        assert!(diff > 0, "different session_key must diverge sealed output");
    }

    #[test]
    fn test_sealed_wrong_key_fails_roundtrip() {
        let data: Vec<u8> = (0..200u32).map(|i| (i * 5) as u8).collect();
        let mut enc = data.clone();
        obfuscate_sealed(&mut enc, 0x1111, 0x2222, 7);
        let mut dec = enc.clone();
        // 错误的 session_key -> 错误密钥 -> 解密后再 deobfuscate 必然还原失败
        deobfuscate_sealed(&mut dec, 0x1111, 0x3333, 7);
        assert_ne!(dec, data, "wrong session key must not restore data");
    }
}
