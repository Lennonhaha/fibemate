// lg-v2.3/src/opcode.rs — Obfuscation-specific instruction set + randomized opcode map
//
// Stage-2 (VM layer). Design goals:
//   - NOT a general-purpose virtual machine (no user-code virtualization)
//   - A *mathematical obfuscation pipeline* executor: the VM runs the
//     obfuscation algorithm itself (Wreath + S-box + XOR-keystream), not
//     arbitrary external code.
//   - Randomized opcode mapping (seed-driven) so every build/seed produces
//     a different bytecode encoding — no fixed mapping can be claimed as a
//     clone of any commercial product (e.g. VMProtect).
//
// Differentiation from commercial VM protectors:
//   - Instruction names are obfuscation-specific (OP_WREATH, OP_SBOX, ...)
//     not generic VM mnemonics (VM_PUSH, VM_POP, VM_ENTER, VM_EXIT).
//   - Opcode values are a seed-driven bijection over 0..15, regenerated per
//     seed, so there is no static opcode table to reverse-engineer.
//   - Entry/exit are pipeline_enter / pipeline_exit, not VM_ENTER/VM_EXIT.

use crate::wreath::XorShift64;

/// Number of distinct instructions in the obfuscation pipeline.
pub const NUM_OPS: usize = 16;

/// Obfuscation-pipeline instruction set (16 opcodes).
/// Each instruction operates on the VM's data buffer and is invertible,
/// so the inverse program (compiled for deobfuscation) reverses it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Op {
    /// No-op — padding / timing-noise filler.
    OpNop,
    /// Apply one Wreath layer (carries a layer index operand).
    OpWreath,
    /// Fisher-Yates shuffle (carries a seed operand).
    OpShuffle,
    /// AES S-box substitution over the buffer (SBOX / INV_SBOX).
    OpSbox,
    /// XOR offset over the buffer (self-inverse).
    OpXor,
    /// Modular add (mod 256) offset over the buffer (inverse = subtract).
    OpAdd,
    /// Combined mix: XOR then S-box (composed invertible step).
    OpMix,
    /// Swap two buffer positions (self-inverse).
    OpSwap,
    /// Rotate buffer bytes by k (inverse = rotate by n-k).
    OpRot,
    /// Unconditional jump to a program offset.
    OpJmp,
    /// Push a value onto the operand stack.
    OpPush,
    /// Pop a value off the operand stack.
    OpPop,
    /// Duplicate the top of the operand stack.
    OpDup,
    /// Reverse the buffer order (self-inverse).
    OpRev,
    /// Enter the pipeline (setup marker — no-op on execution).
    OpEnter,
    /// Halt execution (end of program).
    OpHalt,
}

impl Op {
    /// Canonical index 0..15 for this instruction.
    pub fn index(self) -> u8 {
        match self {
            Op::OpNop => 0,
            Op::OpWreath => 1,
            Op::OpShuffle => 2,
            Op::OpSbox => 3,
            Op::OpXor => 4,
            Op::OpAdd => 5,
            Op::OpMix => 6,
            Op::OpSwap => 7,
            Op::OpRot => 8,
            Op::OpJmp => 9,
            Op::OpPush => 10,
            Op::OpPop => 11,
            Op::OpDup => 12,
            Op::OpRev => 13,
            Op::OpEnter => 14,
            Op::OpHalt => 15,
        }
    }

    /// Inverse canonical index (for decoding the opcode back to an Op).
    pub fn from_index(i: u8) -> Op {
        match i & 0x0F {
            0 => Op::OpNop,
            1 => Op::OpWreath,
            2 => Op::OpShuffle,
            3 => Op::OpSbox,
            4 => Op::OpXor,
            5 => Op::OpAdd,
            6 => Op::OpMix,
            7 => Op::OpSwap,
            8 => Op::OpRot,
            9 => Op::OpJmp,
            10 => Op::OpPush,
            11 => Op::OpPop,
            12 => Op::OpDup,
            13 => Op::OpRev,
            14 => Op::OpEnter,
            _ => Op::OpHalt,
        }
    }
}

/// A seed-driven bijection over the 16 opcode values.
///
/// `map[op.index()]` gives the actual byte emitted in the bytecode for `op`.
/// `unmap[b]` recovers the canonical index from a raw bytecode byte.
/// Different seeds produce different bijections, so there is no fixed
/// opcode table baked into the binary.
pub struct OpcodeMap {
    pub map: [u8; NUM_OPS],
    pub unmap: [u8; 256],
}

impl OpcodeMap {
    /// Build a random bijection over 0..15 from a seed.
    pub fn new(seed: u64) -> Self {
        let mut rng = XorShift64::new(seed.wrapping_add(0x5EED_5EED_0B5E_0B5E));
        let mut map = [0u8; NUM_OPS];
        // Fisher-Yates shuffle over the identity 0..15.
        for i in 0..NUM_OPS {
            map[i] = i as u8;
        }
        for i in (1..NUM_OPS).rev() {
            let j = (rng.next() % (i as u64 + 1)) as usize;
            map.swap(i, j);
        }

        // Build the inverse map (unmap[b] = canonical index).
        let mut unmap = [0u8; 256];
        for i in 0..NUM_OPS {
            unmap[map[i] as usize] = i as u8;
        }

        Self { map, unmap }
    }

    /// Encode an instruction into its raw bytecode value.
    #[inline]
    pub fn encode(&self, op: Op) -> u8 {
        self.map[op.index() as usize]
    }

    /// Decode a raw bytecode value back into an instruction.
    #[inline]
    pub fn decode(&self, raw: u8) -> Op {
        Op::from_index(self.unmap[(raw & 0x0F) as usize])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opcode_map_is_bijection() {
        for seed in [0u64, 1, 0x1234, 0xDEADBEEF, u64::MAX] {
            let m = OpcodeMap::new(seed);
            // Every canonical index maps to a unique value in 0..15.
            let mut seen = [false; NUM_OPS];
            for i in 0..NUM_OPS {
                let raw = m.map[i];
                assert!((raw as usize) < NUM_OPS, "raw opcode out of range");
                assert!(!seen[raw as usize], "duplicate opcode value {} for seed {}", raw, seed);
                seen[raw as usize] = true;
            }
            // Round-trip: encode -> decode == identity.
            for i in 0..NUM_OPS {
                let op = Op::from_index(i as u8);
                assert_eq!(m.decode(m.encode(op)), op, "encode/decode round-trip failed for seed {}", seed);
            }
        }
    }

    #[test]
    fn test_different_seeds_different_maps() {
        let m1 = OpcodeMap::new(42);
        let m2 = OpcodeMap::new(43);
        assert_ne!(m1.map, m2.map, "different seeds must produce different opcode maps");
    }

    #[test]
    fn test_op_index_roundtrip() {
        for i in 0..16u8 {
            assert_eq!(Op::from_index(i).index(), i);
        }
    }
}
