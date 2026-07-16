// 五短板补全 #2: 内存 Dump 防护 —— 运行时零化
// 4 轮覆写 (0xFF -> 0x00 -> 随机 -> 0x00) + RAII 自动清零

/// 安全缓冲区: drop 时零化
pub struct SecBuf(Vec<u8>);

impl SecBuf {
    pub fn new(size: usize) -> Self { Self(vec![0u8; size]) }
    pub fn from(data: &[u8]) -> Self { Self(data.to_vec()) }
    pub fn get(&self) -> &[u8] { &self.0 }
    pub fn get_mut(&mut self) -> &mut [u8] { &mut self.0 }
    pub fn len(&self) -> usize { self.0.len() }
    pub fn zeroize(&mut self) { Self::zeroize_slice(&mut self.0); }
    pub fn zeroize_slice(s: &mut [u8]) {
        for b in s.iter_mut() { *b = 0xFF; }
        for b in s.iter_mut() { *b = 0x00; }
        let mut rng = crate::XorShift64(0x123456789ABCDEF0);
        for b in s.iter_mut() { *b = rng.next() as u8; }
        for b in s.iter_mut() { *b = 0x00; }
    }
}

impl Drop for SecBuf {
    fn drop(&mut self) { self.zeroize(); }
}

/// RAII 安全数据处理
pub struct SecData {
    data: Vec<u8>,
    cleaned: bool,
}

impl SecData {
    pub fn new(data: Vec<u8>) -> Self { Self { data, cleaned: false } }
    pub fn as_slice(&self) -> &[u8] { &self.data }
    pub fn as_mut_slice(&mut self) -> &mut [u8] { &mut self.data }

    pub fn with<F, T>(&mut self, f: F) -> T where F: FnOnce(&[u8]) -> T {
        let r = f(&self.data);
        self.zeroize(); r
    }

    pub fn zeroize(&mut self) {
        if !self.cleaned { SecBuf::zeroize_slice(&mut self.data); self.cleaned = true; }
    }
}

impl Drop for SecData {
    fn drop(&mut self) { self.zeroize(); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secbuf_zeroize() {
        let mut buf = SecBuf::from(&[1,2,3,4,5]);
        assert_eq!(buf.get(), &[1,2,3,4,5]);
        buf.zeroize();
        assert_eq!(buf.get(), &[0u8; 5]);
    }

    #[test]
    fn test_secdata_with() {
        let mut d = SecData::new(vec![0xAA; 16]);
        let sum: u32 = d.with(|s| s.iter().map(|&b| b as u32).sum());
        assert_eq!(sum, 16 * 0xAA);
        assert!(d.cleaned);
    }
}
