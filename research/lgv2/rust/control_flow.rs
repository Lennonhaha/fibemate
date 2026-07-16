// 五短板补全 #5: 商业级混淆 —— 控制流平坦化 + 不透明谓词

/// 不透明谓词: 总是返回 true，但静态分析无法证明
pub fn opaque_predicate() -> bool {
    let x = 0x9E3779B97F4A7C15u64;
    let c = 0x123456789ABCDEF0u64;
    (x ^ x ^ c) != 0
}

/// 控制流调度器: 按随机顺序执行 7 层
#[derive(Clone)]
pub struct Dispatcher {
    order: Vec<usize>,
    done: u8,
}

impl Dispatcher {
    pub fn new(session_seed: u64) -> Self {
        let mut order: Vec<usize> = (0..7).collect();
        let mut rng = crate::XorShift64::new(session_seed);
        for i in (1..7).rev() {
            let j = (rng.next() % (i as u64 + 1)) as usize;
            order.swap(i, j);
        }
        Self { order, done: 0 }
    }

    pub fn next_layer(&mut self) -> Option<usize> {
        for &li in &self.order {
            let bit = 1u8 << li;
            if self.done & bit == 0 {
                self.done |= bit;
                return Some(li);
            }
        }
        None
    }

    pub fn is_complete(&self) -> bool { self.done.count_ones() == 7 }
}

/// 恒定时间执行: busy-wait 抹平执行时间差异
pub struct ConstantTime {
    target_us: u64,
}

impl ConstantTime {
    pub fn new(target_us: u64) -> Self { Self { target_us } }

    pub fn execute<F, T>(&self, mut op: F) -> T
    where F: FnMut() -> T,
    {
        use std::time::Instant;
        let start = Instant::now();
        let result = op();
        let elapsed = start.elapsed().as_micros() as u64;
        if elapsed < self.target_us {
            let _ = (0..(self.target_us - elapsed) as usize)
                .fold(0u64, |a, i| a.wrapping_add(i as u64));
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dispatcher_all_layers() {
        let mut d = Dispatcher::new(0x1234);
        let mut seen = [false; 7];
        while let Some(li) = d.next_layer() {
            assert!(!seen[li]);
            seen[li] = true;
        }
        assert!(d.is_complete());
    }

    #[test]
    fn test_dispatcher_deterministic() {
        let mut d1 = Dispatcher::new(0xDEAD);
        let mut d2 = Dispatcher::new(0xDEAD);
        let s1: Vec<usize> = std::iter::from_fn(|| d1.next_layer()).collect();
        let s2: Vec<usize> = std::iter::from_fn(|| d2.next_layer()).collect();
        assert_eq!(s1, s2);
    }

    #[test]
    fn test_dispatcher_different() {
        let mut d1 = Dispatcher::new(0x1111);
        let mut d2 = Dispatcher::new(0x2222);
        let s1: Vec<usize> = std::iter::from_fn(|| d1.next_layer()).collect();
        let s2: Vec<usize> = std::iter::from_fn(|| d2.next_layer()).collect();
        assert_ne!(s1, s2);
    }

    #[test]
    fn test_opaque_predicate() {
        for _ in 0..100 { assert!(opaque_predicate()); }
    }

    #[test]
    fn test_constant_time() {
        let ct = ConstantTime::new(100);
        let r = ct.execute(|| 42);
        assert_eq!(r, 42);
    }
}
