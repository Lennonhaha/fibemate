// 五短板补全 #4: 密码学增益 —— ML-KEM 密钥绑定
// 混淆输出 XOR Keccak-256(MLKEM_SS)，剥离混淆后仍需 SS 才能还原

/// 简单的 Keccak-256 实现 (用于绑定密钥派生)
pub struct Keccak256 {
    state: [u64; 25],
    rate: usize,
    pos: usize,
}

impl Keccak256 {
    pub fn new() -> Self {
        Self { state: [0u64; 25], rate: 136, pos: 0 }
    }

    pub fn update(&mut self, data: &[u8]) {
        for &b in data {
            self.state[self.pos / 8] ^= (b as u64) << (8 * (self.pos % 8));
            self.pos += 1;
            if self.pos == self.rate {
                self.keccak_f();
                self.pos = 0;
            }
        }
    }

    pub fn finalize(mut self) -> [u8; 32] {
        if self.pos < self.rate - 1 {
            self.state[self.pos / 8] ^= 1u64 << (8 * (self.pos % 8));
            self.state[(self.rate - 1) / 8] ^= 0x80u64 << (8 * ((self.rate - 1) % 8));
            self.keccak_f();
        }
        let mut out = [0u8; 32];
        for (i, chunk) in out.chunks_mut(8).enumerate() {
            chunk.copy_from_slice(&self.state[i].to_le_bytes());
        }
        out
    }

    fn keccak_f(&mut self) {
        for _ in 0..12 {
            self.theta();
            self.rho_pi();
            self.chi();
            self.iota();
        }
    }

    fn theta(&mut self) {
        let s = self.state;
        let mut c = [0u64; 5];
        for x in 0..5 { c[x] = s[x] ^ s[x+5] ^ s[x+10] ^ s[x+15] ^ s[x+20]; }
        for x in 0..5 {
            let d = c[(x+4)%5] ^ c[(x+1)%5].rotate_left(1);
            for y in 0..5 { self.state[y*5+x] ^= d; }
        }
    }

    fn rho_pi(&mut self) {
        let old = self.state;
        let mut x = 1; let mut y = 0;
        self.state[0] = old[0];
        for t in 0..24 {
            self.state[y*5+((2*x+3*y)%5)] = old[x+5*y].rotate_left(((t+1)*(t+2)/2) as u32);
            let nx = y; y = (2*x+3*y)%5; x = nx;
        }
    }

    fn chi(&mut self) {
        let old = self.state;
        for y in 0..5 {
            for x in 0..5 {
                self.state[y*5+x] = old[y*5+x] ^ ((!old[y*5+((x+1)%5)]) & old[y*5+((x+2)%5)]);
            }
        }
    }

    fn iota(&mut self) {
        self.state[0] ^= 0x0000000000000001;
    }
}

/// 绑定器: MLKEM_SS -> Keccak-256 -> XOR with confused data
pub struct Binder {
    key: [u8; 32],
}

impl Binder {
    pub fn new(mlkem_ss: &[u8; 32]) -> Self {
        let mut h = Keccak256::new();
        h.update(b"LGv2-CryptoBinding-v1");
        h.update(mlkem_ss);
        Self { key: h.finalize() }
    }

    pub fn bind(&self, data: &[u8]) -> Vec<u8> {
        data.iter().zip(self.key.iter().cycle()).map(|(&a, &b)| a ^ b).collect()
    }

    pub fn unbind(&self, data: &[u8]) -> Vec<u8> {
        self.bind(data) // XOR is self-inverse
    }

    pub fn verify(&self, bound: &[u8], expected: &[u8]) -> bool {
        self.unbind(bound) == expected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bind_unbind() {
        let ss = [0xAB; 32];
        let b = Binder::new(&ss);
        let data = b"secret data".to_vec();
        let bound = b.bind(&data);
        assert_ne!(bound, data);
        assert_eq!(b.unbind(&bound), data);
    }

    #[test]
    fn test_wrong_key() {
        let b1 = Binder::new(&[0x11; 32]);
        let b2 = Binder::new(&[0x22; 32]);
        let data = b"test".to_vec();
        let bound = b1.bind(&data);
        assert_ne!(b2.unbind(&bound), data);
    }

    #[test]
    fn test_keccak_deterministic() {
        let mut h1 = Keccak256::new(); h1.update(b"test");
        let mut h2 = Keccak256::new(); h2.update(b"test");
        let r1 = h1.finalize();
        let r2 = h2.finalize();
        assert_eq!(r1, r2);
        let mut h3 = Keccak256::new(); h3.update(b"TEST");
        let r3 = h3.finalize();
        assert_ne!(r1, r3);
    }
}
