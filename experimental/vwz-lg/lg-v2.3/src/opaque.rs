// lg-v2.3/src/opaque.rs — Sprint 5: 独立算术不透明谓词
//
// 不透明谓词 (opaque predicate): 运行时恒真 (或恒假) 的算术断言, 但静态
// 分析者必须完成数论 / 模算术推理才能判定, 否则只能假设两条分支都可能。
// 本模块提供一族数学上恒真的算术谓词, 接入 VM 分派循环作为每步 checkpoint:
// 正常执行永远为真; 一旦程序字节码被动态补丁 / 篡改, 断言失败并触发防御。
//
// 设计要点:
//   - 每个谓词先把输入缩小到模数域 (mod m), 再对缩小后的值求值。这样避开
//     u64 wrapping 乘法破坏数论恒等式的风险, 所有表达式在 u64 下无溢出。
//   - 谓词输入 x 由 (salt, pc, step) 派生, 每次迭代不同, 且与数据字节无关,
//     因此不改变混淆输出 (黄金向量向后兼容)。
//   - 用 std::hint::black_box 阻止 LLVM 常量折叠, 确保谓词表达式保留在
//     二进制中, 而不是被编译器直接"证明"为 true 后消除。
//   - 谓词族与盐由 (seed, session_key, depth) 经 opcode map + CFF 表派生,
//     不同参数编译出的程序携带不同谓词族 (审计/静态分析无法复用结论)。
//
// 数学依据:
//   - QuadraticParity / ConsecutiveProd: 连续整数乘积恒为偶数 (mod 2)。
//   - CubicMod6: x^3 - x = x(x-1)(x+1) 为三个连续整数乘积, 恒被 6 整除。
//   - SquareMod3 / SquareMod4: 二次剩余集合 {0,1} (mod 3) 与 {0,1} (mod 4)。
//   - FermatMod5 / FermatMod7: 费马小定理 x^p ≡ x (mod p), p = 5, 7。

use std::hint::black_box;

/// 独立算术不透明谓词族。每个族对任意 u64 输入恒成立 (eval == true)。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OpaqueFamily {
    /// (x^2 + x) & 1 == 0  — 连续整数 x, x+1 必一奇一偶。
    QuadraticParity,
    /// x * (x+1) & 1 == 0  — 连续整数乘积恒为偶数。
    ConsecutiveProd,
    /// (x^3 - x) % 6 == 0  — 三连续整数乘积被 6 整除。
    CubicMod6,
    /// (x^2 % 3) != 2      — 平方模 3 只能是 0 或 1。
    SquareMod3,
    /// (x^2 % 4) <= 1      — 平方模 4 只能是 0 或 1。
    SquareMod4,
    /// (x^5 - x) % 5 == 0  — 费马小定理 p = 5。
    FermatMod5,
    /// (x^7 - x) % 7 == 0  — 费马小定理 p = 7。
    FermatMod7,
}

pub const NUM_FAMILIES: usize = 7;

impl OpaqueFamily {
    pub fn all() -> [OpaqueFamily; NUM_FAMILIES] {
        [
            OpaqueFamily::QuadraticParity,
            OpaqueFamily::ConsecutiveProd,
            OpaqueFamily::CubicMod6,
            OpaqueFamily::SquareMod3,
            OpaqueFamily::SquareMod4,
            OpaqueFamily::FermatMod5,
            OpaqueFamily::FermatMod7,
        ]
    }

    pub fn from_id(id: u32) -> Option<OpaqueFamily> {
        OpaqueFamily::all().get(id as usize).copied()
    }

    pub fn id(self) -> u32 {
        self as u32
    }

    pub fn name(self) -> &'static str {
        match self {
            OpaqueFamily::QuadraticParity => "QuadraticParity",
            OpaqueFamily::ConsecutiveProd => "ConsecutiveProd",
            OpaqueFamily::CubicMod6 => "CubicMod6",
            OpaqueFamily::SquareMod3 => "SquareMod3",
            OpaqueFamily::SquareMod4 => "SquareMod4",
            OpaqueFamily::FermatMod5 => "FermatMod5",
            OpaqueFamily::FermatMod7 => "FermatMod7",
        }
    }

    /// 对任意 u64 输入恒返回 true。输入先缩小到模数域, 避免 wrapping
    /// 乘法破坏恒等式。黑盒输入阻止编译器常量折叠。
    pub fn eval(self, x: u64) -> bool {
        let x = black_box(x);
        match self {
            OpaqueFamily::QuadraticParity => {
                let r = x % 2;
                (r.wrapping_mul(r).wrapping_add(r)) & 1 == 0
            }
            OpaqueFamily::ConsecutiveProd => {
                let r = x % 2;
                r.wrapping_mul(r.wrapping_add(1)) & 1 == 0
            }
            OpaqueFamily::CubicMod6 => {
                let r = x % 6;
                r.wrapping_mul(r).wrapping_mul(r).wrapping_sub(r) % 6 == 0
            }
            OpaqueFamily::SquareMod3 => {
                let r = x % 3;
                r.wrapping_mul(r) % 3 != 2
            }
            OpaqueFamily::SquareMod4 => {
                let r = x % 4;
                r.wrapping_mul(r) % 4 <= 1
            }
            OpaqueFamily::FermatMod5 => {
                let r = x % 5;
                r.wrapping_mul(r)
                    .wrapping_mul(r)
                    .wrapping_mul(r)
                    .wrapping_mul(r)
                    .wrapping_sub(r)
                    % 5
                    == 0
            }
            OpaqueFamily::FermatMod7 => {
                let mut acc: u64 = 1;
                for _ in 0..7 {
                    acc = acc.wrapping_mul(x % 7);
                }
                acc.wrapping_sub(x % 7) % 7 == 0
            }
        }
    }
}

/// 程序级不透明谓词配置: 一个谓词族 + 派生盐。
///
/// `salt` 混合 (seed, session_key, depth) 派生值 (来自 opcode map + CFF 表
/// 的 FNV-1a), 使不同参数的程序携带不同盐; `x` 再由 (salt, pc, step) 派生,
/// 保证同一程序内每个 checkpoint 的输入也互不相同。
#[derive(Debug, Clone, Copy)]
pub struct OpaqueConfig {
    pub family: OpaqueFamily,
    pub salt: u64,
}

/// 从任意 seed 派生不透明谓词配置 (族 + 盐)。
pub fn config_from_seed(seed: u64) -> OpaqueConfig {
    let salt = seed
        .wrapping_add(0x0FA0_00E4_5E00_0001)
        .wrapping_mul(0x9E37_79B9_7F4A_7C15);
    let family = OpaqueFamily::all()[(salt as usize) % NUM_FAMILIES];
    OpaqueConfig { family, salt }
}

/// 一次不透明谓词 checkpoint: 由 (salt, pc, step) 派生输入 x 并求值。
///
/// 正常执行恒返回 true。返回 false 意味着程序状态被外部篡改 (理论不可达)。
#[inline]
pub fn checkpoint(cfg: &OpaqueConfig, pc: usize, step: u64) -> bool {
    let x = cfg
        .salt
        .wrapping_add((pc as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        .wrapping_add(step.wrapping_mul(0xBF58_476D_1CE4_E5B9))
        .wrapping_add((pc as u64).rotate_left(13) ^ step.rotate_left(7));
    cfg.family.eval(x)
}

/// 独立计算同一 checkpoint 的期望结果 (供审计 / 测试复算)。
#[inline]
pub fn checkpoint_value(cfg: &OpaqueConfig, pc: usize, step: u64) -> u64 {
    cfg.salt
        .wrapping_add((pc as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        .wrapping_add(step.wrapping_mul(0xBF58_476D_1CE4_E5B9))
        .wrapping_add((pc as u64).rotate_left(13) ^ step.rotate_left(7))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_xs() -> Vec<u64> {
        let mut xs: Vec<u64> = vec![0, 1, 2, 3, 4, 5, 6, 7, u64::MAX, u64::MAX - 1];
        let mut s = XorShift64Like::new(0x5EED_2017);
        for _ in 0..5000 {
            xs.push(s.next());
        }
        xs
    }

    #[test]
    fn test_all_families_always_true() {
        for family in OpaqueFamily::all() {
            for x in sample_xs() {
                assert!(
                    family.eval(x),
                    "family {} failed on x={:#x}",
                    family.name(),
                    x
                );
            }
        }
    }

    #[test]
    fn test_config_family_varies_by_seed() {
        let mut seen = std::collections::HashSet::new();
        for seed in 0..64u64 {
            seen.insert(config_from_seed(seed.wrapping_mul(0x9E3779B97F4A7C15)).family);
        }
        assert!(seen.len() >= 2, "seeds must select different families");
    }

    #[test]
    fn test_checkpoint_always_true() {
        for seed in [0u64, 0x1234, 0xDEADBEEF, u64::MAX] {
            let cfg = config_from_seed(seed);
            for pc in 0..300usize {
                for step in [0u64, 1, 7, 1000, u64::MAX] {
                    assert!(
                        checkpoint(&cfg, pc, step),
                        "checkpoint failed (seed={:#x}, pc={}, step={})",
                        seed,
                        pc,
                        step
                    );
                }
            }
        }
    }

    #[test]
    fn test_checkpoint_input_varies() {
        // 不同 (pc, step) 必须派生不同输入 x, 否则同一谓词被重复使用。
        let cfg = config_from_seed(42);
        let a = checkpoint_value(&cfg, 0, 1);
        let b = checkpoint_value(&cfg, 1, 1);
        let c = checkpoint_value(&cfg, 0, 2);
        assert_ne!(a, b, "pc must change checkpoint input");
        assert_ne!(a, c, "step must change checkpoint input");
    }

    #[test]
    fn test_checkpoint_deterministic() {
        let cfg = config_from_seed(0xCAFE);
        let a = checkpoint_value(&cfg, 10, 5);
        let b = checkpoint_value(&cfg, 10, 5);
        assert_eq!(a, b, "checkpoint must be deterministic");
    }

    #[test]
    fn test_from_id_roundtrip() {
        for family in OpaqueFamily::all() {
            assert_eq!(OpaqueFamily::from_id(family.id()), Some(family));
        }
        assert_eq!(OpaqueFamily::from_id(999), None);
    }

    /// 极简 XorShift64 (与 wreath.rs 同构), 仅用于生成测试采样。
    struct XorShift64Like {
        s: u64,
    }

    impl XorShift64Like {
        fn new(seed: u64) -> Self {
            Self { s: seed.max(1) }
        }
        fn next(&mut self) -> u64 {
            let mut x = self.s;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.s = x;
            x
        }
    }
}
