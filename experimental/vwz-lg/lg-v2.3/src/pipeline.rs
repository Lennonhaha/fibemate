// lg-v2.3/src/pipeline.rs — Programmable obfuscation pipeline (Stage-2)
//
// Combines the Stage-1 premix/Wreath core with the Stage-2 VM into a
// single, seed-parameterized obfuscation pipeline. The pipeline:
//
//   Forward:  premix(seed,session) -> VM program(seed) -> Wreath(seed)
//   Inverse:  de-Wreath(seed) -> VM inverse program(seed) -> unpremix
//
// The VM program is *compiled from the seed* (see compile_program), so the
// exact instruction sequence — and its opcode encoding — vary with the seed.
// This is the defensive core of Stage-2: an analyst cannot statically learn
// the bytecode layout without the seed.
//
// OPERAND CONVENTION (see vm.rs): bit 7 = inverse flag, bits 0..6 = parameter.
// Forward ops use operands < 0x80; inverse ops set bit 7. Self-inverse ops
// (XOR, Swap, Rev) need no inverse counterpart.

use crate::opcode::{Op, OpcodeMap};
use crate::premix::{full_mix_forward_depth, full_mix_inverse_depth};
use crate::vm::{Instr, Program, Vm};

/// Extract the 7-bit parameter from a seed byte (mask off bit 7 so operands
/// never accidentally carry the inverse flag).
#[inline]
fn param(b: u8) -> u8 {
    b & 0x7F
}

/// Compile a forward (obfuscation) VM program from a seed.
///
/// The program is a deterministic, seed-driven sequence of invertible
/// pipeline operations. Because opcodes are encoded through `OpcodeMap::new
/// (seed)`, the raw bytecode differs per seed.
pub fn compile_program(seed: u64) -> Program {
    let map = OpcodeMap::new(seed);

    // Derive per-program operands from the seed (deterministic, varied).
    let o1 = param((seed & 0xFF) as u8);
    let o2 = param(((seed >> 8) & 0xFF) as u8);
    let o3 = param(((seed >> 16) & 0xFF) as u8);
    let o4 = param(((seed >> 24) & 0xFF) as u8);
    let o5 = param(((seed >> 32) & 0xFF) as u8);
    let o6 = param(((seed >> 40) & 0xFF) as u8);

    let instrs = vec![
        Instr { op: Op::OpShuffle, operand: o1 },
        Instr { op: Op::OpXor, operand: o2 },
        Instr { op: Op::OpSbox, operand: 0 }, // forward S-box
        Instr { op: Op::OpRot, operand: o3 },
        Instr { op: Op::OpAdd, operand: o4 },
        Instr { op: Op::OpSwap, operand: o5 },
        Instr { op: Op::OpMix, operand: o6 },
        Instr { op: Op::OpRev, operand: 0 },
    ];

    Program { instrs, map }
}

/// Compile the inverse (deobfuscation) VM program from the same seed.
///
/// The inverse must exactly reverse the forward program's effect. Forward
/// order was:
///   Shuffle, Xor, Sbox, Rot, Add, Swap, Mix, Rev
/// Inverse order (reverse, self-inverse ops reused, inverse flag set on the
/// non-self-inverse ops):
///   Rev, Mix(inv), Swap, Add(inv), Rot(inv), Sbox(inv), Xor, Shuffle(inv)
pub fn compile_inverse_program(seed: u64) -> Program {
    let map = OpcodeMap::new(seed);

    let o1 = param((seed & 0xFF) as u8);
    let o2 = param(((seed >> 8) & 0xFF) as u8);
    let o3 = param(((seed >> 16) & 0xFF) as u8);
    let o4 = param(((seed >> 24) & 0xFF) as u8);
    let o5 = param(((seed >> 32) & 0xFF) as u8);
    let o6 = param(((seed >> 40) & 0xFF) as u8);

    let instrs = vec![
        Instr { op: Op::OpRev, operand: 0 },            // undo final Rev (self-inverse)
        Instr { op: Op::OpMix, operand: o6 | 0x80 },    // inverse mix
        Instr { op: Op::OpSwap, operand: o5 },          // swap self-inverse
        Instr { op: Op::OpAdd, operand: o4 | 0x80 },    // subtract
        Instr { op: Op::OpRot, operand: o3 | 0x80 },    // rotate right
        Instr { op: Op::OpSbox, operand: 0x80 },        // inverse S-box
        Instr { op: Op::OpXor, operand: o2 },           // XOR self-inverse
        Instr { op: Op::OpShuffle, operand: o1 | 0x80 }, // inverse shuffle
    ];

    Program { instrs, map }
}

/// Run the full Stage-2 obfuscation pipeline (forward) on a byte buffer.
///
///   data -> premix -> VM(forward program) -> Wreath(seed)
pub fn obfuscate(data: &mut [u8], seed: u64, session_key: u64) {
    if data.is_empty() {
        return;
    }
    // Stage-1 premix covers all bytes first.
    full_mix_forward_depth(data, seed, session_key, 7);
    // Stage-2 VM program adds a second, independent confusion layer.
    let prog = compile_program(seed);
    let mut vm = Vm::new(data.to_vec());
    vm.run(&prog);
    data.copy_from_slice(&vm.data);
}

/// Run the full Stage-2 deobfuscation pipeline (inverse) on a byte buffer.
pub fn deobfuscate(data: &mut [u8], seed: u64, session_key: u64) {
    if data.is_empty() {
        return;
    }
    // Undo the VM layer first (inverse program).
    let prog = compile_inverse_program(seed);
    let mut vm = Vm::new(data.to_vec());
    vm.run(&prog);

    // Undo the premix/Wreath (Stage-1 inverse).
    let mut buf = vm.data;
    full_mix_inverse_depth(&mut buf, seed, session_key, 7);
    data.copy_from_slice(&buf);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(n: usize) -> Vec<u8> {
        (0..n).map(|i| (i * 7) as u8).collect()
    }

    #[test]
    fn test_pipeline_roundtrip_various_sizes() {
        for n in [1usize, 4, 100, 256, 1000] {
            let data = sample(n);
            for seed in [0u64, 1, 0x1234, 0xDEADBEEF] {
                for sk in [0u64, 0xBEEF, 0xCAFE] {
                    let mut c = data.clone();
                    obfuscate(&mut c, seed, sk);
                    assert_ne!(c, data, "obfuscate must change data (n={}, seed={}, sk={})", n, seed, sk);
                    deobfuscate(&mut c, seed, sk);
                    assert_eq!(c, data, "roundtrip failed (n={}, seed={}, sk={})", n, seed, sk);
                }
            }
        }
    }

    #[test]
    fn test_pipeline_deterministic() {
        let data = sample(256);
        let mut a = data.clone();
        let mut b = data.clone();
        obfuscate(&mut a, 0x1234, 0xDEAD);
        obfuscate(&mut b, 0x1234, 0xDEAD);
        assert_eq!(a, b, "same seed+session must be deterministic");
    }

    #[test]
    fn test_pipeline_session_sensitivity() {
        let data = sample(256);
        let mut a = data.clone();
        let mut b = data.clone();
        obfuscate(&mut a, 0x1234, 0xDEAD);
        obfuscate(&mut b, 0x1234, 0xBEEF);
        assert_ne!(a, b, "different session must differ");
    }

    #[test]
    fn test_bytecode_differs_per_seed() {
        let p1 = compile_program(1).to_bytecode();
        let p2 = compile_program(2).to_bytecode();
        assert_ne!(p1, p2, "different seeds must produce different bytecode");
    }
}
