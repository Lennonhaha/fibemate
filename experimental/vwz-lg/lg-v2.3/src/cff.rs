// lg-v2.3/src/cff.rs — Control-Flow Flattening dispatch for the VM
//
// Sprint 2 (v2.4-dynamic). The VM interpreter dispatches on `match ins.op`.
// That structured switch is directly recoverable by angr/IDA/Ghidra CFG
// reconstruction. This module replaces the direct op dispatch with a
// seed-derived permutation table, so the static mapping opcode -> handler is
// not baked into the binary and varies per (seed, session_key, depth).
//
// Design constraints:
//   - zero data-plane overhead: one array lookup per decoded instruction
//   - no hardcoded dispatch table (differs from any commercial protector)
//   - dispatch is a bijection, so every opcode maps to exactly one handler

use crate::wreath::XorShift64;
use crate::opcode::{Op, NUM_OPS};

/// A seed-derived permutation over the 16 handler slots.
///
/// `order[s]` is the slot assigned to canonical op index `s`. At dispatch
/// time the VM looks up `order[op.index()]` and switches on that slot value.
#[derive(Debug, Clone)]
pub struct CffMap {
    pub order: [u8; NUM_OPS],
}

impl CffMap {
    /// Build a bijection over 0..15 derived from a seed.
    pub fn new(seed: u64) -> Self {
        let mut rng = XorShift64::new(seed.wrapping_add(0xC0FF_EE00_4E00_C0FF));
        let mut order = [0u8; NUM_OPS];
        for i in 0..NUM_OPS {
            order[i] = i as u8;
        }
        // Fisher-Yates shuffle — same technique as OpcodeMap, different domain.
        for i in (1..NUM_OPS).rev() {
            let j = (rng.next() % (i as u64 + 1)) as usize;
            order.swap(i, j);
        }
        Self { order }
    }

    /// Map a canonical op index to its flattened handler slot.
    #[inline]
    pub fn slot(&self, op: Op) -> u8 {
        self.order[op.index() as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cff_map_is_bijection() {
        for seed in [0u64, 1, 0x1234, 0xDEADBEEF, u64::MAX] {
            let m = CffMap::new(seed);
            let mut seen = [false; NUM_OPS];
            for i in 0..NUM_OPS {
                let s = m.order[i];
                assert!((s as usize) < NUM_OPS, "slot out of range");
                assert!(!seen[s as usize], "duplicate slot {} for seed {}", s, seed);
                seen[s as usize] = true;
            }
        }
    }

    #[test]
    fn test_cff_map_seed_sensitive() {
        let m1 = CffMap::new(42);
        let m2 = CffMap::new(43);
        assert_ne!(m1.order, m2.order, "different seeds must produce different dispatch order");
    }

    #[test]
    fn test_cff_map_covers_all_ops() {
        // Every canonical op must map to a distinct slot; Op::index is 0..15
        // so bijection over slots implies full coverage.
        let m = CffMap::new(0x1234);
        for i in 0..16u8 {
            let op = Op::from_index(i);
            assert!((m.slot(op) as usize) < NUM_OPS);
        }
    }
}
