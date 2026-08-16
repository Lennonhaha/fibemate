// lg-v3/src/bind.rs — ML-KEM 密码学绑定层
// Extracted from v2.2.2 lib.rs (identical logic, zero change)
// Keccak-256 based symmetric XOR binding

use crate::wreath::XorShift64;

/// SHA-3 / Keccak-256 简化实现 (只够 32-byte 输出)
/// 用于混淆输出与 ML-KEM 共享密钥的密码学绑定
pub struct CryptoBinding {
    ss: [u8; 32],
}

// Keccak-256 常量
const KECCAK_RATE: usize = 136; // 1088 bits
const KECCAK_CAPACITY: usize = 32;

const KECCAK_ROUNDS: usize = 24;
static RC: [u64; KECCAK_ROUNDS] = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A,
    0x8000000080008000, 0x000000000000808B, 0x0000000080000001,
    0x8000000080008081, 0x8000000000008009, 0x000000000000008A,
    0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
    0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
    0x000000000000800A, 0x800000008000000A, 0x8000000080008081,
    0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
];

static RHO: [u32; 25] = [
     0,  1, 62, 28, 27,
    36, 44,  6, 55, 20,
     3, 10, 43, 25, 39,
    41, 45, 15, 21,  8,
    18,  2, 61, 56, 14,
];

fn rotl64(x: u64, n: u32) -> u64 { (x << n) | (x >> (64 - n)) }

fn keccak_f(state: &mut [u64; 25]) {
    let mut c = [0u64; 5];
    let mut d = [0u64; 5];
    for r in 0..KECCAK_ROUNDS {
        // theta
        for x in 0..5 {
            c[x] = state[x] ^ state[5 + x] ^ state[10 + x] ^ state[15 + x] ^ state[20 + x];
        }
        for x in 0..5 {
            d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
        }
        for x in 0..5 {
            for y in 0..5 {
                state[x + 5 * y] ^= d[x];
            }
        }
        // rho + pi
        let mut temp = [0u64; 25];
        temp[0] = state[0];
        let mut x = 1usize; let mut y = 0usize;
        for t in 0..24 {
            let nx = y;
            let ny = (2 * x + 3 * y) % 5;
            temp[nx + 5 * ny] = rotl64(state[t + 1], RHO[t + 1]);
            x = nx; y = ny;
        }
        // chi
        for y in 0..5 {
            let i0 = 5 * y;
            for x in 0..5 { state[x + i0] = temp[x + i0]; }
            for x in 0..5 {
                temp[x + i0] = state[x + i0] ^ ((!state[(x + 1) % 5 + i0]) & state[(x + 2) % 5 + i0]);
            }
        }
        // iota
        state[0] ^= RC[r];
    }
}

pub(crate) fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut state = [0u64; 25];
    let mut block = [0u8; KECCAK_RATE];
    let mut i = 0;
    while i + KECCAK_RATE <= data.len() {
        for j in 0..KECCAK_RATE { block[j] = data[i + j]; }
        for j in 0..(KECCAK_RATE / 8) {
            state[j] ^= u64::from_le_bytes(block[j * 8..(j + 1) * 8].try_into().unwrap());
        }
        keccak_f(&mut state);
        i += KECCAK_RATE;
    }
    let remaining = data.len() - i;
    for j in 0..remaining { block[j] = data[i + j]; }
    block[remaining] = 0x01;
    block[KECCAK_RATE - 1] |= 0x80;
    for j in 0..(KECCAK_RATE / 8) {
        state[j] ^= u64::from_le_bytes(block[j * 8..(j + 1) * 8].try_into().unwrap());
    }
    keccak_f(&mut state);
    let mut out = [0u8; 32];
    for j in 0..4 {
        out[j * 8..(j + 1) * 8].copy_from_slice(&state[j].to_le_bytes());
    }
    out
}

impl CryptoBinding {
    pub fn new(shared_secret: &[u8; 32]) -> Self {
        Self { ss: *shared_secret }
    }

    /// 绑定: output = data XOR Keccak-256(label || MLKEM_SS)
    pub fn bind(&self, data: &[u8]) -> Vec<u8> {
        if data.is_empty() { return vec![]; }
        let label = b"LGv2-KEM-BIND-v1";
        let mut input = Vec::with_capacity(label.len() + 32);
        input.extend_from_slice(label);
        input.extend_from_slice(&self.ss);
        let hash = keccak256(&input);
        let mut result = data.to_vec();
        for i in 0..result.len() {
            result[i] ^= hash[i % 32];
        }
        result
    }

    /// 解绑: 自身为 XOR 逆
    pub fn unbind(&self, data: &[u8]) -> Vec<u8> {
        self.bind(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keccak256_self_inverse() {
        let data = b"test vector 32 bytes long!!!!!";
        let h1 = keccak256(data);
        let h2 = keccak256(data);
        assert_eq!(h1, h2, "keccak256 must be deterministic");
        assert_ne!(h1, [0u8; 32], "keccak256 output must not be zero");
    }

    #[test]
    fn test_bind_unbind() {
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let ss = [0x42u8; 32];
        let binding = CryptoBinding::new(&ss);
        let bound = binding.bind(&data);
        let unbound = binding.unbind(&bound);
        assert_eq!(data, unbound, "bind/unbind roundtrip must recover original");
    }

    #[test]
    fn test_different_ss_different_output() {
        let data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let ss1 = [0x11u8; 32];
        let ss2 = [0x22u8; 32];
        let b1 = CryptoBinding::new(&ss1).bind(&data);
        let b2 = CryptoBinding::new(&ss2).bind(&data);
        assert_ne!(b1, b2, "different shared secrets must produce different bindings");
    }
}
