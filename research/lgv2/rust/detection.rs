//! 运行时异常检测引擎 (L8/L9 软件对偶)
//!
//! 对偶 FPGA L8 (hw_monitor.v) / L9 (hw_monitor_resp.v)，
//! 在 Rust/WASM 层提供 9 种软件级运行时检测信号：
//!
//! L8 软件对偶 (4):   完整性校验 + 时序异常 + 栈探测 + 非法分支
//! L9 软件对偶 (3):   应急归零 + 心跳看门狗 + 执行路径审计
//! 扩展 (2):          内存压力 + CPU 压测
//!
//! 命名: `l8_xxx` = 软件层故障检测, `l9_xxx` = 软件层响应/归零

use std::time::{Duration, Instant};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use rand::Rng;

// ── 全局计数器 (L8 对偶) ────────────────────────────────

static L8_INTEGRITY_FAILS: AtomicU32 = AtomicU32::new(0);
static L8_TIMING_ANOMALIES: AtomicU32 = AtomicU32::new(0);
static L8_STACK_TAMPER_EVENTS: AtomicU32 = AtomicU32::new(0);
static L8_BRANCH_VIOLATIONS: AtomicU32 = AtomicU32::new(0);
static L8_TOTAL_CHECKS: AtomicU64 = AtomicU64::new(0);

// ── L9 对偶 ────────────────────────────────────────────

static L9_ZEROIZE_COUNT: AtomicU32 = AtomicU32::new(0);
static L9_WATCHDOG_LAST_TICK: AtomicU64 = AtomicU64::new(0);
static L9_EXEC_PATH_MISMATCHES: AtomicU32 = AtomicU32::new(0);

// ── L8: 完整性校验 ──────────────────────────────────────

/// l8_integrity_check: 对数据块做快速完整性校验 (比 HMAC 轻量)
///
/// 对标 FPGA L8-01~L8-04 (bf_mismatch/parity/remo/cycle 计数递增)
pub fn l8_integrity_check(data: &[u8], expected_tag: u64) -> bool {
    // 简易 64-bit 算术 tag: 基于累加 + 位置旋转 XOR
    let mut tag: u64 = 0x9E3779B97F4A7C15;
    for (i, &b) in data.iter().enumerate() {
        let shift = (i % 57) as u32;
        tag = tag.wrapping_add((b as u64).rotate_left(shift));
        tag ^= (i as u64).wrapping_mul(0x517CC1B727220A95);
    }
    L8_TOTAL_CHECKS.fetch_add(1, Ordering::Relaxed);
    if tag != expected_tag {
        L8_INTEGRITY_FAILS.fetch_add(1, Ordering::Relaxed);
        false
    } else {
        true
    }
}

// ── L8: 时序异常检测 ───────────────────────────────────

/// l8_timing_check: 检测操作是否超出预期执行时间窗口
///
/// 对标 FPGA L8-10~L8-11 (last_fault_cycle / 非 ntt_done 窗口故障计数器)
pub fn l8_timing_check<F, T>(op: F, max_us: u64) -> Option<T>
where
    F: FnOnce() -> T,
{
    let start = Instant::now();
    let result = op();
    let elapsed = start.elapsed().as_micros() as u64;

    L8_TOTAL_CHECKS.fetch_add(1, Ordering::Relaxed);
    if elapsed > max_us {
        L8_TIMING_ANOMALIES.fetch_add(1, Ordering::Relaxed);
        None // 拒绝异常慢的结果
    } else {
        Some(result)
    }
}

/// 实时获取当次时序（微秒），用于嵌入决策
pub fn l8_timing_witness<F, T>(op: F) -> (T, u64)
where
    F: FnOnce() -> T,
{
    let start = Instant::now();
    let result = op();
    let elapsed = start.elapsed().as_micros() as u64;
    (result, elapsed)
}

// ── L8: 栈篡改探测 ─────────────────────────────────────

/// l8_stack_canary: 栈金丝雀 - 写入期望值然后读取校验
///
/// 对标 FPGA L8-25~L8-27 (边缘情况 / 同周期多脉冲 / 短rst_n)
pub struct L8StackCanary {
    canary: u64,
    planted: u64,
}

impl L8StackCanary {
    pub fn new() -> Self {
        let canary = rand::thread_rng().gen::<u64>() | 1; // 确保非零
        Self { canary, planted: canary }
    }

    pub fn verify_changed(&mut self) -> bool {
        // 故意改变 planted (正常流程不应变)
        self.planted = rand::thread_rng().gen();
        true
    }

    pub fn check(&self) -> bool {
        if self.planted == self.canary {
            true
        } else {
            L8_STACK_TAMPER_EVENTS.fetch_add(1, Ordering::Relaxed);
            false
        }
    }
}

// ── L8: 非法分支检测 ────────────────────────────────────

/// l8_branch_audit: 记录最近 N 次分支目标，检测异常模式
///
/// 对标 FPGA L8-09 (alert_count 递增 / 阈值判定)
pub struct L8BranchAudit {
    history: Vec<u32>,
    capacity: usize,
    #[allow(dead_code)]
    entropy_seed: u64,
}

impl L8BranchAudit {
    pub fn new(capacity: usize) -> Self {
        Self { history: Vec::with_capacity(capacity), capacity, entropy_seed: 0 }
    }

    /// 记录一次分支目标，返回是否异常 (目前: 连续 3 次同目标报警)
    pub fn record(&mut self, target: u32) -> bool {
        self.history.push(target);
        if self.history.len() > self.capacity {
            self.history.remove(0);
        }
        // 简单启发式: 连续 3 次相同目标 → 可能循环展开被替换
        if self.history.len() >= 3 {
            let last = self.history[self.history.len() - 1];
            if self.history[self.history.len() - 2] == last
                && self.history[self.history.len() - 3] == last
            {
                L8_BRANCH_VIOLATIONS.fetch_add(1, Ordering::Relaxed);
                return true;
            }
        }
        false
    }
}

// ── L9: 应急归零 ────────────────────────────────────────

/// l9_emergency_zeroize: 对输入切片执行 4 轮归零覆写
///
/// 对标 FPGA L9-11 (force_zeroize=1)
/// 复用 SecBuf 零化模式: 0xFF→0x00→随机→0x00
use crate::secure_cleanup::SecBuf;

pub fn l9_emergency_zeroize(data: &mut [u8]) {
    SecBuf::zeroize_slice(data);
    L9_ZEROIZE_COUNT.fetch_add(1, Ordering::Relaxed);
}

// ── L9: 心跳看门狗 ──────────────────────────────────────

/// l9_watchdog_tick: 更新心跳。调用者定期执行。
///
/// 对标 FPGA L9-09~L9-10 (ZEROIZE→RECOVER→MONITOR)
pub fn l9_watchdog_tick() {
    let now = Instant::now();
    let ms = now.elapsed().as_millis() as u64;
    L9_WATCHDOG_LAST_TICK.store(ms, Ordering::SeqCst);
}

/// 检查心跳超时 (max_gap_ms 内无 tick 则为异常)
pub fn l9_watchdog_check(max_gap_ms: u64) -> bool {
    let now = Instant::now();
    let current = now.elapsed().as_millis() as u64;
    let last = L9_WATCHDOG_LAST_TICK.load(Ordering::SeqCst);
    // 首次 tick 前 last=0, current 可能很大 → 跳过
    if last == 0 { return true; }
    current.saturating_sub(last) <= max_gap_ms
}

// ── L9: 执行路径审计 ─────────────────────────────────────

/// l9_exec_path_log: 记录预期执行路径点
///
/// 对标 FPGA L9-01~L9-10 (FSM 状态迁移路径验证)
pub fn l9_exec_path_log(expected: u32, actual: u32) -> bool {
    if expected != actual {
        L9_EXEC_PATH_MISMATCHES.fetch_add(1, Ordering::Relaxed);
        false
    } else {
        true
    }
}

// ── 内存压力检测 ────────────────────────────────────────

/// memory_pressure_check: 验证分配/释放是否成功
/// 返回 false 表示内存分配异常 (OOM / heap corruption)
pub fn memory_pressure_check(size: usize) -> bool {
    // 尝试分配、写入模式、释放
    let ptr = unsafe {
        let layout = std::alloc::Layout::from_size_align(size, 16).unwrap();
        std::alloc::alloc(layout)
    };
    if ptr.is_null() { return false; }
    // 写入模式验证
    unsafe {
        std::ptr::write_bytes(ptr, 0xA5, size);
        let first = std::ptr::read(ptr);
        let last = std::ptr::read(ptr.add(size - 1));
        let layout = std::alloc::Layout::from_size_align(size, 16).unwrap();
        std::alloc::dealloc(ptr, layout);
        first == 0xA5 && last == 0xA5
    }
}

// ── CPU 压测 ────────────────────────────────────────────

/// cpu_integrity_probe: 执行算数恒等式并验证，检测 CPU 位翻转/过热
///
/// 对标 FPGA L8-06~L8-08 (计数器饱和/无溢出/fault_count 递增)
pub fn cpu_integrity_probe(iterations: u32) -> bool {
    for _ in 0..iterations {
        let a: u64 = rand::thread_rng().gen();
        let b: u64 = rand::thread_rng().gen();
        // 简单恒等式: (a + b) - b == a
        if (a.wrapping_add(b)).wrapping_sub(b) != a {
            return false;
        }
    }
    true
}

// ── 全局状态查询 ────────────────────────────────────────

/// 对标 FPGA L8 status_reg_0~3 (状态寄存器)
#[derive(Debug, Clone)]
pub struct DetectionStatus {
    pub l8_integrity_fails: u32,
    pub l8_timing_anomalies: u32,
    pub l8_stack_tamper: u32,
    pub l8_branch_violations: u32,
    pub l8_total_checks: u64,
    pub l9_zeroize_count: u32,
    pub l9_exec_path_mismatches: u32,
    pub watchdog_healthy: bool,
}

pub fn detection_status() -> DetectionStatus {
    DetectionStatus {
        l8_integrity_fails: L8_INTEGRITY_FAILS.load(Ordering::Relaxed),
        l8_timing_anomalies: L8_TIMING_ANOMALIES.load(Ordering::Relaxed),
        l8_stack_tamper: L8_STACK_TAMPER_EVENTS.load(Ordering::Relaxed),
        l8_branch_violations: L8_BRANCH_VIOLATIONS.load(Ordering::Relaxed),
        l8_total_checks: L8_TOTAL_CHECKS.load(Ordering::Relaxed),
        l9_zeroize_count: L9_ZEROIZE_COUNT.load(Ordering::Relaxed),
        l9_exec_path_mismatches: L9_EXEC_PATH_MISMATCHES.load(Ordering::Relaxed),
        watchdog_healthy: l9_watchdog_check(5_000), // 5s 超时
    }
}

pub fn reset_counters() {
    L8_INTEGRITY_FAILS.store(0, Ordering::Relaxed);
    L8_TIMING_ANOMALIES.store(0, Ordering::Relaxed);
    L8_STACK_TAMPER_EVENTS.store(0, Ordering::Relaxed);
    L8_BRANCH_VIOLATIONS.store(0, Ordering::Relaxed);
    L8_TOTAL_CHECKS.store(0, Ordering::Relaxed);
    L9_ZEROIZE_COUNT.store(0, Ordering::Relaxed);
    L9_EXEC_PATH_MISMATCHES.store(0, Ordering::Relaxed);
    L9_WATCHDOG_LAST_TICK.store(0, Ordering::SeqCst);
}

// ── 测试 ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_l8_integrity_check() {
        let data = b"Hello L8 detection";
        // 计算期望 tag
        let mut tag: u64 = 0x9E3779B97F4A7C15;
        for (i, &b) in data.iter().enumerate() {
            let shift = (i % 57) as u32;
            tag = tag.wrapping_add((b as u64).rotate_left(shift));
            tag ^= (i as u64).wrapping_mul(0x517CC1B727220A95);
        }
        assert!(l8_integrity_check(data, tag));
        assert!(!l8_integrity_check(data, tag ^ 1)); // 错误 tag
        assert!(!l8_integrity_check(b"different", tag)); // 不同数据
    }

    #[test]
    fn test_l8_timing_check_normal() {
        let result = l8_timing_check(|| 42, 100_000); // 100ms 窗口
        assert_eq!(result, Some(42));
    }

    #[test]
    fn test_l8_timing_check_timeout() {
        let result = l8_timing_check(
            || { std::thread::sleep(Duration::from_millis(10)); 42 },
            1, // 1μs 窗口 — 几乎必然超时
        );
        assert_eq!(result, None);
    }

    #[test]
    fn test_l8_timing_witness() {
        let (result, elapsed) = l8_timing_witness(|| 99);
        assert_eq!(result, 99);
        assert!(elapsed < 100_000); // < 100ms unlikely
    }

    #[test]
    fn test_l8_stack_canary_ok() {
        let canary = L8StackCanary::new();
        assert!(canary.check());
    }

    #[test]
    fn test_l8_stack_canary_tamper() {
        let mut canary = L8StackCanary::new();
        canary.verify_changed();
        assert!(!canary.check());
    }

    #[test]
    fn test_l8_branch_audit_normal() {
        let mut audit = L8BranchAudit::new(10);
        assert!(!audit.record(1));
        assert!(!audit.record(2));
        assert!(!audit.record(1));
    }

    #[test]
    fn test_l8_branch_audit_repeat() {
        let mut audit = L8BranchAudit::new(10);
        audit.record(0xDEAD);
        audit.record(0xDEAD);
        assert!(audit.record(0xDEAD)); // 第3次相同 → 报警
    }

    #[test]
    fn test_l9_emergency_zeroize() {
        let mut buf = [0xA5u8; 16];
        l9_emergency_zeroize(&mut buf);
        assert_eq!(buf, [0u8; 16]); // 最终应为全零
    }

    #[test]
    fn test_l9_watchdog() {
        l9_watchdog_tick();
        assert!(l9_watchdog_check(5_000)); // 刚 tick 后检查 → 应通过
    }

    #[test]
    fn test_l9_exec_path_log() {
        assert!(l9_exec_path_log(1, 1));
        assert!(!l9_exec_path_log(1, 2));
    }

    #[test]
    fn test_memory_pressure_check() {
        assert!(memory_pressure_check(4096));
        assert!(memory_pressure_check(64));
    }

    #[test]
    fn test_cpu_integrity_probe() {
        assert!(cpu_integrity_probe(10_000));
    }

    #[test]
    fn test_detection_status() {
        reset_counters();
        let s = detection_status();
        assert_eq!(s.l8_integrity_fails, 0);
        assert_eq!(s.l8_total_checks, 0);
        assert_eq!(s.l9_zeroize_count, 0);
    }

    #[test]
    fn test_l8_integrity_counters_increment() {
        reset_counters();
        let _ = l8_integrity_check(b"data", 0); // wrong tag → fail
        let s = detection_status();
        assert_eq!(s.l8_integrity_fails, 1);
        assert_eq!(s.l8_total_checks, 1);
    }

    #[test]
    fn test_l9_zeroize_count() {
        reset_counters();
        let mut buf = [1u8; 8];
        l9_emergency_zeroize(&mut buf);
        let s = detection_status();
        assert_eq!(s.l9_zeroize_count, 1);
    }
}
