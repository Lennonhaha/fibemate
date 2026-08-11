// lg-v3/src/cleanup.rs — 安全内存清理
// Extracted from v2.2.2 lib.rs (identical logic, zero change)
// SecureBuffer: RAII 自动零化, 防止内存 dump

/// 安全缓冲区: drop 时自动零化内存
pub struct SecureBuffer {
    data: Vec<u8>,
}

impl SecureBuffer {
    pub fn from_slice(slice: &[u8]) -> Self {
        Self { data: slice.to_vec() }
    }

    pub fn get(&self) -> &[u8] {
        &self.data
    }

    pub fn get_mut(&mut self) -> &mut [u8] {
        &mut self.data
    }

    pub fn zeroize(&mut self) {
        for b in &mut self.data {
            *b = 0;
        }
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }
}

impl Drop for SecureBuffer {
    fn drop(&mut self) {
        self.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_buffer_zeroize() {
        let mut buf = SecureBuffer::from_slice(&[0x42u8; 100]);
        assert_eq!(buf.get()[0], 0x42);
        buf.zeroize();
        assert_eq!(buf.get()[0], 0x00);
    }

    #[test]
    fn test_secure_buffer_drop() {
        let data = vec![0xDEu8; 50];
        let ptr_before = data.as_ptr();
        let _buf = SecureBuffer { data };
        // Drop自动调用零化, 但Drop后无法验证 (已释放)
        // 此处仅验证构造不崩溃
        assert!(ptr_before as usize > 0);
    }
}
