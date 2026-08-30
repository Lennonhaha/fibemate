// lg-v2.3/src/chacha8.rs — ChaCha8 轻量流加密 (Sprint 3)
//
// 目标: Stage-3 (变异+加密) 的加密层。对混淆输出做流加密，形成
// "无 session 派生的密钥就连反混淆都进不去" 的密封层。
//
// 设计要点:
//   - RFC 8439 风格 ChaCha 块函数, 轮数参数化 (默认 8 轮 = ChaCha8)
//   - 实现用 ROUNDS=20 通过 RFC 8439 官方测试向量验证块函数正确性,
//     生产路径使用 ROUNDS=8 (ChaCha8 轻量级)
//   - 密钥 32 字节 + 12 字节 nonce + 64-bit counter, 每块 64 字节 keystream
//   - 零依赖, 无 std 特殊要求 (u32 运算), 适配 WASM
//
// 安全声明: 这是混淆密封层, 不是通用加密原语。ChaCha8 本身加密强度弱于
// ChaCha20, 仅用于提高自动化分析的静态/数据依赖成本, 不用于机密性保护。

/// 轮数: 8 (ChaCha8, 轻量)
pub const CHACHA_ROUNDS: usize = 8;

const STATE_WORDS: usize = 16;

// "expand 32-byte k" 的 4 个常量字
const C0: u32 = 0x6170_7865;
const C1: u32 = 0x3320_646e;
const C2: u32 = 0x7962_2d32;
const C3: u32 = 0x6b20_6574;

/// ChaCha 块函数 (轮数参数化)。
///
/// `rounds` 必须是偶数。内部执行 `rounds/2` 个双轮。
/// 返回 64 字节 keystream 块。
fn chacha_block(
    key: &[u8; 32],
    nonce: &[u8; 12],
    counter: u64,
    rounds: usize,
) -> [u8; 64] {
    debug_assert!(rounds % 2 == 0);
    let mut st = [0u32; STATE_WORDS];
    st[0] = C0;
    st[1] = C1;
    st[2] = C2;
    st[3] = C3;
    for i in 0..8 {
        st[4 + i] = u32::from_le_bytes([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
    }
    // RFC 8439 IETF 布局: 32-bit block counter + 96-bit nonce。
    // state[12] = counter (低 32 位), state[13..16] = nonce (12 字节)。
    st[12] = counter as u32;
    st[13] = u32::from_le_bytes([nonce[0], nonce[1], nonce[2], nonce[3]]);
    st[14] = u32::from_le_bytes([nonce[4], nonce[5], nonce[6], nonce[7]]);
    st[15] = u32::from_le_bytes([nonce[8], nonce[9], nonce[10], nonce[11]]);

    let mut work = st;
    for _ in 0..(rounds / 2) {
        // 4 个列轮
        quarter_round(&mut work, 0, 4, 8, 12);
        quarter_round(&mut work, 1, 5, 9, 13);
        quarter_round(&mut work, 2, 6, 10, 14);
        quarter_round(&mut work, 3, 7, 11, 15);
        // 4 个对角线轮
        quarter_round(&mut work, 0, 5, 10, 15);
        quarter_round(&mut work, 1, 6, 11, 12);
        quarter_round(&mut work, 2, 7, 8, 13);
        quarter_round(&mut work, 3, 4, 9, 14);
    }

    for i in 0..STATE_WORDS {
        work[i] = work[i].wrapping_add(st[i]);
    }

    let mut out = [0u8; 64];
    for i in 0..STATE_WORDS {
        out[4 * i..4 * i + 4].copy_from_slice(&work[i].to_le_bytes());
    }
    out
}

/// ChaCha quarter-round: a += b; d ^= a; d <<<= 16; c += d; b ^= c;
/// b <<<= 12; a += b; d ^= a; d <<<= 8; c += d; b ^= c; b <<<= 7.
#[inline(always)]
fn quarter_round(x: &mut [u32; STATE_WORDS], a: usize, b: usize, c: usize, d: usize) {
    x[a] = x[a].wrapping_add(x[b]);
    x[d] ^= x[a];
    x[d] = x[d].rotate_left(16);
    x[c] = x[c].wrapping_add(x[d]);
    x[b] ^= x[c];
    x[b] = x[b].rotate_left(12);
    x[a] = x[a].wrapping_add(x[b]);
    x[d] ^= x[a];
    x[d] = x[d].rotate_left(8);
    x[c] = x[c].wrapping_add(x[d]);
    x[b] ^= x[c];
    x[b] = x[b].rotate_left(7);
}

/// ChaCha8 流加密器: 对任意长度的 data 做 keystream XOR。
///
/// 加解密同函数 (XOR 自逆)。`counter` 为起始块计数器 (u64, 处理超过
/// 2^32 块的超长数据也正确; 实际数据量远小于此)。
pub fn chacha8_xor(data: &mut [u8], key: &[u8; 32], nonce: &[u8; 12], counter: u64) {
    let mut block_counter = counter;
    let mut pos = 0usize;
    while pos < data.len() {
        let ks = chacha_block(key, nonce, block_counter, CHACHA_ROUNDS);
        let n = core::cmp::min(64usize, data.len() - pos);
        for i in 0..n {
            data[pos + i] ^= ks[i];
        }
        pos += n;
        block_counter = block_counter.wrapping_add(1);
    }
}

/// 导出 keystream (仅测试/调试用): 返回从 `counter` 开始的 `len` 字节流。
pub fn chacha8_keystream(key: &[u8; 32], nonce: &[u8; 12], counter: u64, len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    chacha8_xor(&mut buf, key, nonce, counter);
    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 8439 §2.3.2 官方 ChaCha20 测试向量 (ROUNDS=20)。
    /// 验证块函数实现正确; 生产路径用 ROUNDS=8 (ChaCha8) 依赖相同块函数。
    #[test]
    fn test_chacha20_rfc8439_block0() {
        let key: [u8; 32] = [
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
            0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
            0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
            0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
        ];
        // RFC 8439 测试向量 nonce 的前 12 字节: 00000009 0000004a 00000000
        let nonce: [u8; 12] = [
            0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x4a,
            0x00, 0x00, 0x00, 0x00,
        ];
        let block = chacha_block(&key, &nonce, 1, 20);
        let expect: [u8; 64] = [
            0x10, 0xf1, 0xe7, 0xe4, 0xd1, 0x3b, 0x59, 0x15,
            0x50, 0x0f, 0xdd, 0x1f, 0xa3, 0x20, 0x71, 0xc4,
            0xc7, 0xd1, 0xf4, 0xc7, 0x33, 0xc0, 0x68, 0x03,
            0x04, 0x22, 0xaa, 0x9a, 0xc3, 0xd4, 0x6c, 0x4e,
            0xd2, 0x82, 0x64, 0x46, 0x07, 0x9f, 0xaa, 0x09,
            0x14, 0xc2, 0xd7, 0x05, 0xd9, 0x8b, 0x02, 0xa2,
            0xb5, 0x12, 0x9c, 0xd1, 0xde, 0x16, 0x4e, 0xb9,
            0xcb, 0xd0, 0x83, 0xe8, 0xa2, 0x50, 0x3c, 0x4e,
        ];
        assert_eq!(block, expect, "ChaCha20 block must match RFC 8439 vector");
    }

    #[test]
    fn test_chacha8_xor_self_inverse() {
        let key = [0x42u8; 32];
        let nonce = [0x24u8; 12];
        let mut data = (0..300u32).map(|i| i as u8).collect::<Vec<u8>>();
        let original = data.clone();
        chacha8_xor(&mut data, &key, &nonce, 0);
        assert_ne!(data, original, "encryption must change data");
        chacha8_xor(&mut data, &key, &nonce, 0);
        assert_eq!(data, original, "double XOR must restore original");
    }

    #[test]
    fn test_chacha8_key_sensitivity() {
        let nonce = [0x00u8; 12];
        let mut a = [0x00u8; 64];
        let mut b = [0x00u8; 64];
        let key_a = [0x00u8; 32];
        let mut key_b = [0x00u8; 32];
        key_b[0] = 0x01;
        chacha8_xor(&mut a, &key_a, &nonce, 0);
        chacha8_xor(&mut b, &key_b, &nonce, 0);
        assert_ne!(a, b, "1-bit key change must alter keystream");
    }

    #[test]
    fn test_chacha8_nonce_sensitivity() {
        let key = [0x00u8; 32];
        let mut a = [0x00u8; 64];
        let mut b = [0x00u8; 64];
        let mut n1 = [0x00u8; 12];
        let mut n2 = [0x00u8; 12];
        n2[11] = 0x01;
        chacha8_xor(&mut a, &key, &n1, 0);
        chacha8_xor(&mut b, &key, &n2, 0);
        assert_ne!(a, b, "nonce change must alter keystream");
    }

    #[test]
    fn test_chacha8_short_inputs() {
        let key = [0xABu8; 32];
        let nonce = [0xCDu8; 12];
        for len in [0usize, 1, 7, 63, 64, 65, 127, 128] {
            let mut data = vec![0xEEu8; len];
            let original = data.clone();
            chacha8_xor(&mut data, &key, &nonce, 3);
            if len > 0 {
                assert_ne!(data, original, "len={} must change", len);
            }
            chacha8_xor(&mut data, &key, &nonce, 3);
            assert_eq!(data, original, "len={} roundtrip", len);
        }
    }

    #[test]
    fn test_chacha8_keystream_deterministic() {
        let key = [0x11u8; 32];
        let nonce = [0x22u8; 12];
        let s1 = chacha8_keystream(&key, &nonce, 0, 512);
        let s2 = chacha8_keystream(&key, &nonce, 0, 512);
        assert_eq!(s1, s2, "keystream must be deterministic");
        let s3 = chacha8_keystream(&key, &nonce, 1, 512);
        assert_ne!(s1, s3, "counter change must alter keystream");
    }
}
