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

use crate::cff::CffMap;
use crate::defense::{self, fnv1a64, DefenseEngine};
use crate::opaque::{self, OpaqueConfig};
use crate::opcode::{Op, OpcodeMap, NUM_OPS};
use crate::sbox::{SBOX, INV_SBOX};
use crate::wreath::{layer_seed, XorShift64};

/// A single decoded instruction: the op plus a small operand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Instr {
    pub op: Op,
    pub operand: u8,
}

/// Control-flow outcome of one flattened dispatch step.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Step {
    Next,
    Jump(usize),
    Halt,
    Abort,
}

/// A compiled program: a sequence of instructions plus the opcode map used
/// to encode them. Encoding and execution share this struct.
///
/// Sprint 2: the `cff` table reorders opcode -> handler dispatch, and
/// `handlers` is the dispatch vector indexed by `cff.slot(op)`. The mapping
/// is seed-derived, so no static opcode -> handler table is baked into the
/// binary and every (seed, session_key, depth) triple dispatches differently.
pub struct Program {
    pub instrs: Vec<Instr>,
    pub map: OpcodeMap,
    pub cff: CffMap,
    /// Sprint 5: seed-derived opaque-predicate config (family + salt). Derived
    /// from the opcode map + CFF table so it varies with (seed, session_key,
    /// depth) and is identical for forward/inverse programs of one triple.
    pub opaque: OpaqueConfig,
    handlers: [StepHandler; NUM_OPS],
}

/// Handler signature: operate on the VM buffer for one decoded instruction.
type StepHandler = fn(&mut Vm, Instr) -> Step;

// Per-canonical-op handlers, in canonical order (slot = cff.order[op.index()]).
fn h_nop(_vm: &mut Vm, _ins: Instr) -> Step {
    Step::Next
}
fn h_wreath(vm: &mut Vm, ins: Instr) -> Step {
    vm.exec_wreath(ins.operand);
    Step::Next
}
fn h_shuffle(vm: &mut Vm, ins: Instr) -> Step {
    vm.exec_shuffle(ins.operand);
    Step::Next
}
fn h_sbox(vm: &mut Vm, ins: Instr) -> Step {
    vm.exec_sbox(ins.operand);
    Step::Next
}
fn h_xor(vm: &mut Vm, ins: Instr) -> Step {
    vm.exec_xor(ins.operand);
    Step::Next
}
fn h_add(vm: &mut Vm, ins: Instr) -> Step {
    vm.exec_add(ins.operand);
    Step::Next
}
fn h_mix(vm: &mut Vm, ins: Instr) -> Step {
    vm.exec_mix(ins.operand);
    Step::Next
}
fn h_swap(vm: &mut Vm, ins: Instr) -> Step {
    vm.exec_swap(ins.operand);
    Step::Next
}
fn h_rot(vm: &mut Vm, ins: Instr) -> Step {
    vm.exec_rot(ins.operand);
    Step::Next
}
fn h_jmp(_vm: &mut Vm, ins: Instr) -> Step {
    Step::Jump(ins.operand as usize)
}
fn h_push(vm: &mut Vm, ins: Instr) -> Step {
    if vm.stack.len() >= MAX_STACK {
        return Step::Abort;
    }
    vm.stack.push(ins.operand);
    Step::Next
}
fn h_pop(vm: &mut Vm, _ins: Instr) -> Step {
    let _ = vm.stack.pop();
    Step::Next
}
fn h_dup(vm: &mut Vm, _ins: Instr) -> Step {
    if vm.stack.len() >= MAX_STACK {
        return Step::Abort;
    }
    let top = vm.stack.last().copied().unwrap_or(0);
    vm.stack.push(top);
    Step::Next
}
fn h_rev(vm: &mut Vm, _ins: Instr) -> Step {
    vm.exec_rev();
    Step::Next
}
fn h_enter(_vm: &mut Vm, _ins: Instr) -> Step {
    Step::Next
}
fn h_halt(_vm: &mut Vm, _ins: Instr) -> Step {
    Step::Halt
}

const HANDLERS_BY_OP: [StepHandler; NUM_OPS] = [
    h_nop,
    h_wreath,
    h_shuffle,
    h_sbox,
    h_xor,
    h_add,
    h_mix,
    h_swap,
    h_rot,
    h_jmp,
    h_push,
    h_pop,
    h_dup,
    h_rev,
    h_enter,
    h_halt,
];

impl Program {
    /// Build a program with a seed-derived flattening table.
    ///
    /// `handlers[slot]` is the handler for the op whose flattened slot equals
    /// `slot`, i.e. `handlers[cff.order[op.index()]]` always reaches the
    /// correct op handler — but the correspondence is invisible statically.
    pub fn new(instrs: Vec<Instr>, map: OpcodeMap, cff: CffMap) -> Self {
        let mut rev = [0usize; NUM_OPS];
        for i in 0..NUM_OPS {
            rev[cff.order[i] as usize] = i;
        }
        let mut handlers: [StepHandler; NUM_OPS] = [h_nop as StepHandler; NUM_OPS];
        for slot in 0..NUM_OPS {
            handlers[slot] = HANDLERS_BY_OP[rev[slot]];
        }
        // Sprint 5: opaque config derives from the seed-parameterized dispatch
        // tables (map + CFF), never from instruction content, so forward and
        // inverse programs of the same (seed, session, depth) share one config.
        let mut seed_buf = Vec::with_capacity(map.map.len() + cff.order.len());
        seed_buf.extend_from_slice(&map.map);
        seed_buf.extend_from_slice(&cff.order);
        let opaque = opaque::config_from_seed(fnv1a64(&seed_buf));
        Self {
            instrs,
            map,
            cff,
            opaque,
            handlers,
        }
    }

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
        let cff = CffMap::new(seed);
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
        Some(Program::new(instrs, map, cff))
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

            // Sprint 5: opaque-predicate checkpoint — always true on a clean
            // binary (arithmetic identity), so it never alters semantics or
            // output bytes. A false return here means the program state was
            // patched at runtime (statically unreachable).
            if !opaque::checkpoint(&prog.opaque, self.pc, self.steps) {
                return false;
            }

            let ins = prog.instrs[self.pc];
            let next_pc = self.pc + 1;

            // Flattened dispatch: slot = cff.order[op.index()], handler is
            // looked up by slot so the opcode -> handler mapping is invisible
            // to static CFG recovery.
            let slot = prog.cff.slot(ins.op);
            match prog.handlers[slot as usize](self, ins) {
                Step::Next => {}
                Step::Jump(target) => {
                    self.pc = target.min(n);
                    continue;
                }
                Step::Halt => return true,
                Step::Abort => return false,
            }

            self.pc = next_pc;
        }
        true
    }

    /// Execute a decoded program under the active-defense watchdog.
    ///
    /// Same semantics as [`Self::run`] (returns true on clean halt) but:
    ///   - records the full execution time and feeds it to the engine
    ///   - samples ~`sample_ratio`-th of VM steps for a memory-integrity check
    ///
    /// The watchdog is passive: it never aborts execution and never crashes.
    /// If the engine flips to Poisoning mode the caller decides how to respond.
    pub fn run_defended(&mut self, prog: &Program, engine: &mut DefenseEngine) -> bool {
        let start = defense::clock_ns();
        let mem_base = prog_checksum(prog);
        self.pc = 0;
        self.steps = 0;
        let n = prog.instrs.len();

        while self.pc < n {
            if self.steps >= MAX_STEPS {
                engine.check_memory(mem_base, prog_checksum(prog));
                engine.check_execution(defense::clock_ns() - start);
                return false;
            }
            self.steps += 1;

            // Sprint 5: opaque-predicate checkpoint. Feeds the watchdog with a
            // tamper verdict; on a clean binary it is always true so no anomaly
            // is ever recorded.
            let ok = opaque::checkpoint(&prog.opaque, self.pc, self.steps);
            if !ok {
                engine.check_opaque(false);
            }

            let ins = prog.instrs[self.pc];
            let next_pc = self.pc + 1;

            let slot = prog.cff.slot(ins.op);
            match prog.handlers[slot as usize](self, ins) {
                Step::Next => {}
                Step::Jump(target) => {
                    self.pc = target.min(n);
                    continue;
                }
                Step::Halt => {
                    engine.check_memory(mem_base, prog_checksum(prog));
                    engine.check_execution(defense::clock_ns() - start);
                    return true;
                }
                Step::Abort => {
                    engine.check_memory(mem_base, prog_checksum(prog));
                    engine.check_execution(defense::clock_ns() - start);
                    return false;
                }
            }

            if self.steps % engine.config.sample_ratio == 0 {
                engine.check_memory(mem_base, prog_checksum(prog));
            }

            self.pc = next_pc;
        }

        engine.check_memory(mem_base, prog_checksum(prog));
        engine.check_execution(defense::clock_ns() - start);
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

/// FNV-1a checksum over a compiled program's opcode map + CFF dispatch table
/// + instruction stream. This is the memory-integrity reference for the VM
/// Context: tampering with the program bytes (patch), the seed-derived opcode
/// map, or the flattened dispatch table flips the checksum.
pub fn prog_checksum(prog: &Program) -> u64 {
    let mut buf = Vec::with_capacity(prog.instrs.len() * 2 + prog.map.map.len() + 16);
    buf.extend_from_slice(&prog.map.map);
    buf.extend_from_slice(&prog.cff.order);
    for ins in &prog.instrs {
        buf.push(ins.op.index());
        buf.push(ins.operand);
    }
    fnv1a64(&buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(n: usize) -> Vec<u8> {
        (0..n).map(|i| (i * 7) as u8).collect()
    }

    fn prog(instrs: Vec<Instr>, seed: u64) -> Program {
        Program::new(instrs, OpcodeMap::new(seed), CffMap::new(seed))
    }

    #[test]
    fn test_program_bytecode_roundtrip() {
        let seed = 0x1234;
        let map = OpcodeMap::new(seed);
        let instrs = vec![
            Instr { op: Op::OpSbox, operand: 0 },
            Instr { op: Op::OpRot, operand: 3 },
        ];
        let prog = prog(instrs, seed);
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
        let fwd = prog(vec![Instr { op: Op::OpSbox, operand: 0 }], seed);
        let inv = prog(vec![Instr { op: Op::OpSbox, operand: 0x80 }], seed);
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
        let fwd = prog(vec![Instr { op: Op::OpRot, operand: k }], seed);
        let inv = prog(vec![Instr { op: Op::OpRot, operand: k | 0x80 }], seed);
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
        let fwd = prog(vec![Instr { op: Op::OpShuffle, operand }], seed);
        let inv = prog(vec![Instr { op: Op::OpShuffle, operand: operand | 0x80 }], seed);
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
        let fwd = prog(vec![Instr { op: Op::OpAdd, operand: k }], seed);
        let inv = prog(vec![Instr { op: Op::OpAdd, operand: k | 0x80 }], seed);
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
        let fwd = prog(vec![Instr { op: Op::OpMix, operand: k }], seed);
        let inv = prog(vec![Instr { op: Op::OpMix, operand: k | 0x80 }], seed);
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
        let prog = prog(vec![Instr { op: Op::OpJmp, operand: 0 }], seed); // jump to self
        let mut vm = Vm::new(sample(10));
        assert!(!vm.run(&prog), "runaway loop must be stopped");
    }

    #[test]
    fn test_vm_stack_ops() {
        let seed = 5;
        let prog = prog(
            vec![
                Instr { op: Op::OpPush, operand: 0xAB },
                Instr { op: Op::OpDup, operand: 0 },
                Instr { op: Op::OpPop, operand: 0 },
            ],
            seed,
        );
        let mut vm = Vm::new(sample(10));
        assert!(vm.run(&prog));
        assert_eq!(vm.stack.len(), 1);
        assert_eq!(vm.stack[0], 0xAB);
    }

    #[test]
    fn test_run_defended_bypass_matches_run() {
        // Level 0 (default) must behave byte-identically to plain run().
        use crate::defense::{DefenseConfig, DEFENSE_LEVEL_OFF};
        let seed = 0x1234;
        let prog = prog(vec![Instr { op: Op::OpSbox, operand: 0 }], seed);
        let mut engine = DefenseEngine::new(DefenseConfig {
            level: DEFENSE_LEVEL_OFF,
            ..Default::default()
        });
        let data = sample(256);
        let mut vm = Vm::new(data.clone());
        assert!(vm.run(&prog));
        let expected = vm.data.clone();

        let mut vm2 = Vm::new(data.clone());
        assert!(vm2.run_defended(&prog, &mut engine));
        assert_eq!(vm2.data, expected, "level-0 defended run must match plain run");
    }

    #[test]
    fn test_run_defended_calibrates_and_stays_clean() {
        use crate::defense::{DefenseConfig, DEFENSE_LEVEL_STANDARD};
        let seed = 0xDEAD;
        let prog = prog(
            vec![
                Instr { op: Op::OpShuffle, operand: 3 },
                Instr { op: Op::OpXor, operand: 7 },
                Instr { op: Op::OpSbox, operand: 0 },
                Instr { op: Op::OpRev, operand: 0 },
            ],
            seed,
        );
        let mut engine = DefenseEngine::new(DefenseConfig {
            level: DEFENSE_LEVEL_STANDARD,
            ..Default::default()
        });
        let data = sample(128);
        for _ in 0..6 {
            let mut vm = Vm::new(data.clone());
            assert!(vm.run_defended(&prog, &mut engine));
        }
        assert!(!engine.poisoning(), "normal timing must not poison");
        assert!(engine.baseline_sample_count() >= 4);
    }
}
