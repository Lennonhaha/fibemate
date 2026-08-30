//! 动态不透明谓词生成器
//!
//! 支持 10+ 种运行时生成的不透明谓词，用于控制流混淆。
//! 每个谓词在运行时动态生成，无法在静态分析中确定结果。

use rand::Rng;
use rand::SeedableRng;
use rand::rngs::StdRng;
use std::time::{SystemTime, UNIX_EPOCH};

/// 不透明谓词类型
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OpaquePredicateType {
    /// 恒真谓词（始终返回 true）
    AlwaysTrue,
    /// 恒假谓词（始终返回 false）
    AlwaysFalse,
    /// 基于时间戳的谓词（编译时与运行时差值）
    TimeBased,
    /// 基于栈地址的谓词（ASLR 依赖）
    StackAddressBased,
    /// 基于 PID 的谓词（进程依赖）
    PidBased,
    /// 算术恒等式谓词 (a^2 - b^2 = (a-b)(a+b))
    ArithmeticIdentity,
    /// 多项式恒等式谓词
    PolynomialIdentity,
    /// 基于内存布局的谓词
    MemoryLayoutBased,
    /// 基于 CPU 周期的谓词
    CpuCycleBased,
    /// 复合谓词（多个条件组合）
    Composite,
}

/// 动态不透明谓词生成器
pub struct OpaquePredicateGenerator {
    seed: u64,
    rng: StdRng,
}

impl OpaquePredicateGenerator {
    /// 创建一个新的生成器，使用当前时间作为种子
    pub fn new() -> Self {
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;
        Self::with_seed(seed)
    }

    /// 使用指定种子创建生成器（用于可重现测试）
    pub fn with_seed(seed: u64) -> Self {
        Self {
            seed,
            rng: StdRng::seed_from_u64(seed),
        }
    }

    /// 生成指定数量的不透明谓词，返回 (值, 类型) 对
    pub fn generate(&mut self, count: usize) -> Vec<(bool, OpaquePredicateType)> {
        let mut results = Vec::with_capacity(count);
        let types = self.select_predicate_types(count);

        for pred_type in types {
            let value = match pred_type {
                OpaquePredicateType::AlwaysTrue => true,
                OpaquePredicateType::AlwaysFalse => false,
                OpaquePredicateType::TimeBased => self.time_based_predicate(),
                OpaquePredicateType::StackAddressBased => self.stack_address_based_predicate(),
                OpaquePredicateType::PidBased => self.pid_based_predicate(),
                OpaquePredicateType::ArithmeticIdentity => self.arithmetic_identity_predicate(),
                OpaquePredicateType::PolynomialIdentity => self.polynomial_identity_predicate(),
                OpaquePredicateType::MemoryLayoutBased => self.memory_layout_predicate(),
                OpaquePredicateType::CpuCycleBased => self.cpu_cycle_predicate(),
                OpaquePredicateType::Composite => self.composite_predicate(),
            };
            results.push((value, pred_type));
        }
        results
    }

    /// 选择谓词类型（支持全部 10 种）
    fn select_predicate_types(&mut self, count: usize) -> Vec<OpaquePredicateType> {
        let all_types = [
            OpaquePredicateType::AlwaysTrue,
            OpaquePredicateType::AlwaysFalse,
            OpaquePredicateType::TimeBased,
            OpaquePredicateType::StackAddressBased,
            OpaquePredicateType::PidBased,
            OpaquePredicateType::ArithmeticIdentity,
            OpaquePredicateType::PolynomialIdentity,
            OpaquePredicateType::MemoryLayoutBased,
            OpaquePredicateType::CpuCycleBased,
            OpaquePredicateType::Composite,
        ];

        let mut selected = Vec::with_capacity(count);
        for _ in 0..count {
            let idx = self.rng.gen_range(0..all_types.len());
            selected.push(all_types[idx]);
        }
        selected
    }

    // ============ 具体谓词实现 ============

    /// 时间戳谓词：编译时时间与运行时时间的差值，动态注入
    fn time_based_predicate(&self) -> bool {
        let compile_time = 1742400000u64;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now.saturating_sub(compile_time) > 3600
    }

    /// 栈地址谓词：基于当前栈地址的位数混合
    fn stack_address_based_predicate(&self) -> bool {
        let stack_addr = &self as *const _ as usize;
        let hash = stack_addr ^ (stack_addr >> 16) ^ (stack_addr >> 32);
        hash & 0x1 == 0
    }

    /// PID 谓词：进程 ID 的模运算
    fn pid_based_predicate(&mut self) -> bool {
        #[cfg(target_os = "linux")]
        {
            let pid = std::process::id() as u64;
            let threshold = 1000 + (self.seed % 1000);
            pid % (threshold + 1) == 0
        }
        #[cfg(not(target_os = "linux"))]
        {
            self.rng.gen::<bool>()
        }
    }

    /// 算术恒等式谓词: (a - b)(a + b) = a² - b²
    fn arithmetic_identity_predicate(&mut self) -> bool {
        let a: i64 = self.rng.gen_range(1..1000);
        let b: i64 = self.rng.gen_range(1..1000);
        let left = (a - b).checked_mul(a + b).unwrap_or(0);
        let right = a.checked_mul(a).unwrap_or(0).checked_sub(b.checked_mul(b).unwrap_or(0)).unwrap_or(0);
        left == right
    }

    /// 多项式恒等式谓词: (a + b)² = a² + 2ab + b²
    fn polynomial_identity_predicate(&mut self) -> bool {
        let a: i64 = self.rng.gen_range(-100..100);
        let b: i64 = self.rng.gen_range(-100..100);
        let left = (a + b).checked_mul(a + b).unwrap_or(0);
        let a2 = a.checked_mul(a).unwrap_or(0);
        let ab = 2i64.checked_mul(a).and_then(|x| x.checked_mul(b)).unwrap_or(0);
        let b2 = b.checked_mul(b).unwrap_or(0);
        let right = a2.checked_add(ab).and_then(|x| x.checked_add(b2)).unwrap_or(0);
        left == right
    }

    /// 内存布局谓词：检查两个不同栈变量的地址差异
    fn memory_layout_predicate(&self) -> bool {
        let x: u8 = 42;
        let y: u8 = 43;
        let addr_x = &x as *const _ as usize;
        let addr_y = &y as *const _ as usize;
        let diff = if addr_x > addr_y { addr_x - addr_y } else { addr_y - addr_x };
        diff > 0 && diff < 128
    }

    /// CPU 周期谓词：基于 rdtsc 的时间差
    fn cpu_cycle_predicate(&self) -> bool {
        #[cfg(target_arch = "x86_64")]
        {
            let start = unsafe { std::arch::x86_64::_rdtsc() };
            let end = unsafe { std::arch::x86_64::_rdtsc() };
            end.saturating_sub(start) < 1000
        }
        #[cfg(not(target_arch = "x86_64"))]
        {
            let start = std::time::Instant::now();
            std::thread::sleep(std::time::Duration::from_micros(10));
            start.elapsed().as_micros() < 20
        }
    }

    /// 复合谓词：组合多个条件
    fn composite_predicate(&mut self) -> bool {
        let cond1 = self.time_based_predicate();
        let cond2 = self.stack_address_based_predicate();
        let cond3 = self.arithmetic_identity_predicate();
        (cond1 && cond2) || (!cond3 && cond1) || (cond2 && !cond3)
    }

    /// 获取当前已生成的谓词摘要（用于调试）
    pub fn summary(&self) -> String {
        format!(
            "OpaquePredicateGenerator {{ seed: {} }}",
            self.seed
        )
    }
}

impl Default for OpaquePredicateGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generator_creation() {
        let gen = OpaquePredicateGenerator::new();
        assert!(gen.seed > 0);
    }

    #[test]
    fn test_generate_predicates() {
        let mut gen = OpaquePredicateGenerator::new();
        let results = gen.generate(10);
        assert_eq!(results.len(), 10);
        for (value, pred_type) in &results {
            println!("Predicate: {:?} => {}", pred_type, value);
        }
    }

    #[test]
    fn test_arithmetic_identity() {
        let mut gen = OpaquePredicateGenerator::with_seed(42);
        for _ in 0..100 {
            assert!(gen.arithmetic_identity_predicate(),
                "Arithmetic identity should always hold");
        }
    }

    #[test]
    fn test_polynomial_identity() {
        let mut gen = OpaquePredicateGenerator::with_seed(42);
        for _ in 0..100 {
            assert!(gen.polynomial_identity_predicate(),
                "Polynomial identity should always hold");
        }
    }

    #[test]
    fn test_composite_predicate() {
        let mut gen = OpaquePredicateGenerator::with_seed(42);
        for _ in 0..100 {
            let _result = gen.composite_predicate();
        }
    }

    #[test]
    fn test_deterministic_output() {
        let mut gen1 = OpaquePredicateGenerator::with_seed(123);
        let mut gen2 = OpaquePredicateGenerator::with_seed(123);

        let results1 = gen1.generate(5);
        let results2 = gen2.generate(5);

        assert_eq!(results1.len(), results2.len());
        for (r1, r2) in results1.iter().zip(results2.iter()) {
            assert_eq!(r1.0, r2.0);
            assert_eq!(r1.1, r2.1);
        }
    }
}
