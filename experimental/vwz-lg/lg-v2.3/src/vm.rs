// lg-v2.3/src/vm.rs — Obfuscation-pipeline stack VM
//
// Stage-2 (VM layer). This is a *mathematical obfuscation pipeline executor*,
// NOT a general-purpose code virtualizer. The VM executes the obfuscation
// algorithm (Wreath layers, Fisher-Yates shuffle, AES S-box, XOR-keystream,
// mod-256 add, rotations, swaps) against a byte buffer, using a small
// operand stack for control flow and data manipulation.
//
// The bytecode program itself is a sequence of (opcode, operand) pairs where
// opcodes are encoded through a seed-driven OpcodeMap (see opcode.rs), so no
// two seeds share the same bytecode layout. This raises static-analysis cost:
// without the seed, opcodes are opaque.
//
// Entry/exit are pipeline_enter / pipeline_exit (never VM_ENTER/VM_EXIT).
//
// OPERAND CONVENTION:
//   - bit 7 (0x80) is the INVERSE flag. Forward ops clear it; inverse ops set
//     it. This lets a single compiled program be inverted deterministically.
//   - bits 0..6 (0x7F) are the operation parameter.
//   - Self-inverse ops (XOR, Swap, Rev) ignore the flag.

use crate::opcode::{Op, OpcodeMap};
use crate::sbox::{SBOX, INV_SBOX};
use crate::wreath::{layer_seed, XorShift64};

/// A single decoded instruction: the op plus a small operand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Instr {
    pub op: Op,
    pub operand: u8,
}

/// A compiled program: a sequence of instructions plus the opcode map used
/// to encode them. Encoding and execution share this struct.
pub struct Program {
    pub instrs: Vec<Instr>,
    pub map: OpcodeMap,
}

impl Program {
    /// Serialize the program into raw bytecode (opcodes encoded via the map,
    /// operands stored verbatim after each opcode). An enter marker is
    /// prepended and a halt marker appended automatically.
    pub fn to_bytecode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(self.instrs.len() * 2 + 2);
        out.push(self.map.encode(Op::OpEnter)); // encoded enter marker
        for ins in &self.instrs {
            out.push(self.map.encode(ins.op));
            out.push(ins.operand);
        }
        out.push(self.map.encode(Op::OpHalt)); // encoded halt marker
        out
    }

    /// Decode raw bytecode back into a Program (using the same seed so the
    /// opcode map matches). Returns None if the bytecode is malformed.
    pub fn from_bytecode(bytes: &[u8], seed: u64) -> Option<Program> {
        if bytes.len() < 2 {
            return None;
        }
        let map = OpcodeMap::new(seed);
        let mut instrs = Vec::with_capacity(bytes.len() / 2);
        let mut i = 0;
        // Skip leading enter marker if present.
        if map.decode(bytes[0]) == Op::OpEnter {
            i = 1;
        }
        while i < bytes.len() {
            let op = map.decode(bytes[i]);
            if op == Op::OpHalt {
                break;
            }
            // Every non-halt instruction carries one operand byte.
            if i + 1 >= bytes.len() {
                return None;
            }
            let operand = bytes[i + 1];
            instrs.push(Instr { op, operand });
            i += 2;
        }
        Some(Program { instrs, map })
    }
}

/// The pipeline VM execution context.
pub struct Vm {
    /// The data buffer being obfuscated / deobfuscated.
    pub data: Vec<u8>,
    /// Operand stack (bounded, for control flow / data manipulation).
    stack: Vec<u8>,
    /// Program counter.
    pc: usize,
    /// Execution step budget (prevents runaway loops).
    steps: u64,
}

/// Max operand-stack depth and execution-step budget — safety bounds.
const MAX_STACK: usize = 64;
const MAX_STEPS: u64 = 4096;

impl Vm {
    pub fn new(data: Vec<u8>) -> Self {
        Self {
            data,
            stack: Vec::with_capacity(16),
            pc: 0,
            steps: 0,
        }
    }

    /// Execute a decoded program against the VM's data buffer.
    /// Returns true on clean halt, false on budget/stack overflow.
    pub fn run(&mut self, prog: &Program) -> bool {
        self.pc = 0;
        self.steps = 0;
        let n = prog.instrs.len();

        while self.pc < n {
            if self.steps >= MAX_STEPS {
                return false; // runaway guard
            }
            self.steps += 1;

            let ins = prog.instrs[self.pc];
            let next_pc = self.pc + 1;

            match ins.op {
                Op::OpNop => {}
                Op::OpWreath => self.exec_wreath(ins.operand),
                Op::OpShuffle => self.exec_shuffle(ins.operand),
                Op::OpSbox => self.exec_sbox(ins.operand),
                Op::OpXor => self.exec_xor(ins.operand),
                Op::OpAdd => self.exec_add(ins.operand),
                Op::OpMix => self.exec_mix(ins.operand),
                Op::OpSwap => self.exec_swap(ins.operand),
                Op::OpRot => self.exec_rot(ins.operand),
                Op::OpJmp => {
                    // Jump to operand offset (clamped to program bounds).
                    let target = (ins.operand as usize).min(n);
                    self.pc = target;
                    continue; // skip the default pc advance
                }
                Op::OpPush => {
                    if self.stack.len() >= MAX_STACK {
                        return false;
                    }
                    self.stack.push(ins.operand);
                }
                Op::OpPop => {
                    let _ = self.stack.pop();
                }
                Op::OpDup => {
                    if self.stack.len() >= MAX_STACK {
                        return false;
                    }
                    let top = self.stack.last().copied().unwrap_or(0);
                    self.stack.push(top);
                }
                Op::OpRev => self.exec_rev(),
                Op::OpEnter => {} // setup marker: no-op
                Op::OpHalt => return true,
            }

            self.pc = next_pc;
        }
        true
    }

    // ---- individual pipeline operations (all invertible via bit-7 flag) ----

    fn exec_wreath(&mut self, layer: u8) {
        // Apply one Wreath layer. This is NOT used by the compiled pipeline
        // program (the pipeline applies Wreath separately via premix); it is
        // kept as a standalone op for completeness. Bit 7 is ignored.
        let n = self.data.len();
        if n == 0 {
            return;
        }
        let li = (layer as usize) % 7;
        let seed = layer_seed(0x4C47_5632_3300_0001, li); // "LGV23" domain-separated base
        let mut rng = XorShift64::new(seed);
        let mut perm = vec![0usize; n];
        for i in 0..n {
            perm[i] = i;
        }
        for i in (1..n).rev() {
            let j = (rng.next() % (i as u64 + 1)) as usize;
            perm.swap(i, j);
        }
        let mut tmp = vec![0u8; n];
        for i in 0..n {
            tmp[i] = self.data[i] ^ rng.next_u8();
        }
        for i in 0..n {
            self.data[perm[i]] = SBOX[(tmp[i] ^ rng.next_u8()) as usize];
        }
    }

    fn exec_shuffle(&mut self, operand: u8) {
        let n = self.data.len();
        if n == 0 {
            return;
        }
        let inv = (operand & 0x80) != 0;
        let k = operand & 0x7F;
        let mut rng = XorShift64::new((k as u64).wrapping_add(0x5FFF_1E00_0000_0001));
        if inv {
            // Record all swap choices, then apply in reverse.
            let mut choices = Vec::with_capacity(n);
            for i in (1..n).rev() {
                let j = (rng.next() % (i as u64 + 1)) as usize;
                choices.push((i, j));
            }
            for &(i, j) in choices.iter().rev() {
                self.data.swap(i, j);
            }
        } else {
            // Fisher-Yates over the buffer indices.
            for i in (1..n).rev() {
                let j = (rng.next() % (i as u64 + 1)) as usize;
                self.data.swap(i, j);
            }
        }
    }

    fn exec_sbox(&mut self, operand: u8) {
        let inv = (operand & 0x80) != 0;
        for b in self.data.iter_mut() {
            *b = if inv {
                INV_SBOX[*b as usize]
            } else {
                SBOX[*b as usize]
            };
        }
    }

    fn exec_xor(&mut self, operand: u8) {
        // XOR the buffer with a keystream derived from the low 7 bits.
        let mut rng = XorShift64::new(((operand & 0x7F) as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15));
        for b in self.data.iter_mut() {
            *b ^= rng.next_u8();
        }
    }

    fn exec_add(&mut self, operand: u8) {
        let inv = (operand & 0x80) != 0;
        let k = operand & 0x7F;
        for b in self.data.iter_mut() {
            *b = if inv {
                b.wrapping_sub(k)
            } else {
                b.wrapping_add(k)
            };
        }
    }

    fn exec_mix(&mut self, operand: u8) {
        let inv = (operand & 0x80) != 0;
        let k = operand & 0x7F;
        let mut rng = XorShift64::new((k as u64).wrapping_add(0x4D49_5800_0000_0001));
        if inv {
            // Inverse mix: INV_SBOX then XOR (keystream order preserved).
            for b in self.data.iter_mut() {
                *b = INV_SBOX[*b as usize] ^ rng.next_u8();
            }
        } else {
            // Forward mix: XOR then SBOX.
            for b in self.data.iter_mut() {
                let x = *b ^ rng.next_u8();
                *b = SBOX[x as usize];
            }
        }
    }

    fn exec_swap(&mut self, operand: u8) {
        let n = self.data.len();
        if n < 2 {
            return;
        }
        // Swap positions (operand % n) and ((operand >> 1) % n). Self-inverse.
        let k = operand & 0x7F;
        let a = (k as usize) % n;
        let b = ((k >> 1) as usize) % n;
        self.data.swap(a, b);
    }

    fn exec_rot(&mut self, operand: u8) {
        let n = self.data.len();
        if n == 0 {
            return;
        }
        let inv = (operand & 0x80) != 0;
        let k = ((operand & 0x7F) as usize) % n;
        if k == 0 {
            return;
        }
        if inv {
            self.data.rotate_right(k);
        } else {
            self.data.rotate_left(k);
        }
    }

    fn exec_rev(&mut self) {
        self.data.reverse();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(n: usize) -> Vec<u8> {
        (0..n).map(|i| (i * 7) as u8).collect()
    }

    #[test]
    fn test_program_bytecode_roundtrip() {
        let seed = 0x1234;
        let map = OpcodeMap::new(seed);
        let instrs = vec![
            Instr { op: Op::OpSbox, operand: 0 },
            Instr { op: Op::OpRot, operand: 3 },
        ];
        let prog = Program { instrs, map };
        let bc = prog.to_bytecode();
        let decoded = Program::from_bytecode(&bc, seed).expect("decode failed");
        assert_eq!(decoded.instrs.len(), prog.instrs.len());
        for (a, b) in prog.instrs.iter().zip(decoded.instrs.iter()) {
            assert_eq!(a.op, b.op);
            assert_eq!(a.operand, b.operand);
        }
    }

    #[test]
    fn test_vm_sbox_roundtrip() {
        // Forward program: SBOX; inverse program: INV_SBOX (bit7 set).
        let seed = 42;
        let fwd = Program {
            instrs: vec![Instr { op: Op::OpSbox, operand: 0 }],
            map: OpcodeMap::new(seed),
        };
        let inv = Program {
            instrs: vec![Instr { op: Op::OpSbox, operand: 0x80 }],
            map: OpcodeMap::new(seed),
        };
        let data = sample(256);
        let mut vm = Vm::new(data.clone());
        assert!(vm.run(&fwd));
        let mut vm2 = Vm::new(vm.data.clone());
        assert!(vm2.run(&inv));
        assert_eq!(vm2.data, data, "SBOX round-trip must recover original");
    }

    #[test]
    fn test_vm_rot_reversible() {
        // Rotate left by k forward, rotate right by k (bit7) to reverse.
        let data = sample(100);
        let k = 17u8;
        let seed = 7;
        let fwd = Program {
            instrs: vec![Instr { op: Op::OpRot, operand: k }],
            map: OpcodeMap::new(seed),
        };
        let inv = Program {
            instrs: vec![Instr { op: Op::OpRot, operand: k | 0x80 }],
            map: OpcodeMap::new(seed),
        };
        let mut vm = Vm::new(data.clone());
        assert!(vm.run(&fwd));
        let mut vm2 = Vm::new(vm.data.clone());
        assert!(vm2.run(&inv));
        assert_eq!(vm2.data, data, "rotate round-trip must recover");
    }

    #[test]
    fn test_vm_shuffle_reversible() {
        let data = sample(200);
        let operand = 11u8;
        let seed = 9;
        let fwd = Program {
            instrs: vec![Instr { op: Op::OpShuffle, operand }],
            map: OpcodeMap::new(seed),
        };
        let inv = Program {
            instrs: vec![Instr { op: Op::OpShuffle, operand: operand | 0x80 }],
            map: OpcodeMap::new(seed),
        };
        let mut vm = Vm::new(data.clone());
        assert!(vm.run(&fwd));
        assert_ne!(vm.data, data, "shuffle must change data");
        let mut vm2 = Vm::new(vm.data.clone());
        assert!(vm2.run(&inv));
        assert_eq!(vm2.data, data, "shuffle round-trip must recover");
    }

    #[test]
    fn test_vm_add_reversible() {
        let data = sample(256);
        let k = 0x42u8;
        let seed = 11;
        let fwd = Program {
            instrs: vec![Instr { op: Op::OpAdd, operand: k }],
            map: OpcodeMap::new(seed),
        };
        let inv = Program {
            instrs: vec![Instr { op: Op::OpAdd, operand: k | 0x80 }],
            map: OpcodeMap::new(seed),
        };
        let mut vm = Vm::new(data.clone());
        assert!(vm.run(&fwd));
        let mut vm2 = Vm::new(vm.data.clone());
        assert!(vm2.run(&inv));
        assert_eq!(vm2.data, data, "add round-trip must recover");
    }

    #[test]
    fn test_vm_mix_reversible() {
        let data = sample(256);
        let k = 0x33u8;
        let seed = 13;
        let fwd = Program {
            instrs: vec![Instr { op: Op::OpMix, operand: k }],
            map: OpcodeMap::new(seed),
        };
        let inv = Program {
            instrs: vec![Instr { op: Op::OpMix, operand: k | 0x80 }],
            map: OpcodeMap::new(seed),
        };
        let mut vm = Vm::new(data.clone());
        assert!(vm.run(&fwd));
        let mut vm2 = Vm::new(vm.data.clone());
        assert!(vm2.run(&inv));
        assert_eq!(vm2.data, data, "mix round-trip must recover");
    }

    #[test]
    fn test_vm_runaway_guard() {
        // A self-loop jump should be stopped by the step budget.
        let seed = 3;
        let prog = Program {
            instrs: vec![Instr { op: Op::OpJmp, operand: 0 }], // jump to self
            map: OpcodeMap::new(seed),
        };
        let mut vm = Vm::new(sample(10));
        assert!(!vm.run(&prog), "runaway loop must be stopped");
    }

    #[test]
    fn test_vm_stack_ops() {
        let seed = 5;
        let prog = Program {
            instrs: vec![
                Instr { op: Op::OpPush, operand: 0xAB },
                Instr { op: Op::OpDup, operand: 0 },
                Instr { op: Op::OpPop, operand: 0 },
            ],
            map: OpcodeMap::new(seed),
        };
        let mut vm = Vm::new(sample(10));
        assert!(vm.run(&prog));
        assert_eq!(vm.stack.len(), 1);
        assert_eq!(vm.stack[0], 0xAB);
    }
}
