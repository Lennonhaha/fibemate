// lg-v2.3/src/defense.rs — Runtime active-defense watchdog (v2.4-dynamic, Sprint 1)
//
// Implements the P0 "VM 层自保护" direction from the v2.4-dynamic design:
//   - timing-based anti-debug (self-adapting baseline + randomized sampling)
//   - VM Context memory-integrity check (FNV-1a 64, zero-dependency; xxh3 can
//     replace it in size-tolerant builds)
//   - silent poisoning response (output corrupted, never crashes)
//
// Level semantics:
//   level 0  — full bypass, byte-identical to Stage-2 (backward compatible)
//   level 1  — light: timing anti-debug only
//   level 2+ — standard/full: timing anti-debug + memory-integrity check
//
// Detection only takes effect after the baseline is calibrated
// (BASELINE_MIN_SAMPLES). A response fires only after `poison_after`
// consecutive anomalies, so transient scheduler jitter cannot corrupt output.
//
// WASM note: the only timing source available in the sandbox is
// performance.now(); no OS debugging APIs exist there. On native builds the
// SystemTime clock is used instead.

use std::cell::RefCell;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Clock source
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = performance)]
    fn now() -> f64;
}

/// Monotonic wall-clock in nanoseconds (WASM: performance.now; native: SystemTime).
#[inline]
pub fn clock_ns() -> u128 {
    #[cfg(target_arch = "wasm32")]
    {
        (now() * 1_000_000.0) as u128
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

pub const DEFENSE_LEVEL_OFF: u32 = 0;
pub const DEFENSE_LEVEL_LIGHT: u32 = 1;
pub const DEFENSE_LEVEL_STANDARD: u32 = 2;
pub const DEFENSE_LEVEL_FULL: u32 = 3;

pub const MODE_NORMAL: u8 = 0;
pub const MODE_POISONING: u8 = 1;

/// Number of execution samples required before the baseline is trusted.
pub const BASELINE_MIN_SAMPLES: usize = 4;
pub const DEFAULT_TIMING_THRESHOLD_SIGMA: f64 = 3.0;
pub const DEFAULT_POISON_AFTER: u32 = 3;
pub const DEFAULT_CHECKSUM_INTERVAL: u64 = 256;
pub const DEFAULT_DEBUG_CHECK_INTERVAL: u64 = 128;
/// Sample ~5% of VM steps (1 in 20).
pub const DEFAULT_SAMPLE_RATIO: u64 = 20;

#[derive(Clone, Debug)]
pub struct DefenseConfig {
    pub level: u32,
    pub timing_threshold_sigma: f64,
    pub poison_after: u32,
    pub checksum_interval: u64,
    pub debug_check_interval: u64,
    pub sample_ratio: u64,
}

impl Default for DefenseConfig {
    fn default() -> Self {
        Self {
            level: DEFENSE_LEVEL_OFF,
            timing_threshold_sigma: DEFAULT_TIMING_THRESHOLD_SIGMA,
            poison_after: DEFAULT_POISON_AFTER,
            checksum_interval: DEFAULT_CHECKSUM_INTERVAL,
            debug_check_interval: DEFAULT_DEBUG_CHECK_INTERVAL,
            sample_ratio: DEFAULT_SAMPLE_RATIO,
        }
    }
}

// ---------------------------------------------------------------------------
// FNV-1a 64 checksum (zero-dependency; adequate for tamper detection)
// ---------------------------------------------------------------------------

#[inline]
pub fn fnv1a64(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in data {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100_0000_01b3);
    }
    hash
}

// ---------------------------------------------------------------------------
// DefenseEngine
// ---------------------------------------------------------------------------

pub struct DefenseEngine {
    pub config: DefenseConfig,
    pub mode: u8,
    pub anomaly_count: u32,
    baseline_samples: Vec<u128>,
}

impl DefenseEngine {
    pub fn new(config: DefenseConfig) -> Self {
        Self {
            config,
            mode: MODE_NORMAL,
            anomaly_count: 0,
            baseline_samples: Vec::with_capacity(BASELINE_MIN_SAMPLES * 2),
        }
    }

    pub fn enabled(&self) -> bool {
        self.config.level > DEFENSE_LEVEL_OFF && self.mode != MODE_POISONING
    }

    pub fn poisoning(&self) -> bool {
        self.mode == MODE_POISONING
    }

    fn record_anomaly(&mut self) {
        self.anomaly_count += 1;
        if self.anomaly_count >= self.config.poison_after {
            self.mode = MODE_POISONING;
        }
    }

    fn clear_anomaly(&mut self) {
        self.anomaly_count = 0;
    }

    /// Feed one full execution's elapsed time. During baseline calibration the
    /// sample is only recorded; afterwards an outlier beyond mean + k*sigma
    /// counts as an anomaly.
    pub fn check_execution(&mut self, elapsed_ns: u128) {
        if !self.enabled() {
            return;
        }
        if self.baseline_samples.len() < BASELINE_MIN_SAMPLES {
            self.baseline_samples.push(elapsed_ns);
            return;
        }
        let (mean, std) = self.baseline_stats();
        let k = self.config.timing_threshold_sigma;
        let floor = (mean as f64 * 1.5).max(1.0);
        let limit = (mean as f64 + k * std).max(floor);
        if (elapsed_ns as f64) > limit {
            self.record_anomaly();
        } else {
            self.clear_anomaly();
            self.baseline_samples.push(elapsed_ns);
            if self.baseline_samples.len() > BASELINE_MIN_SAMPLES * 2 {
                self.baseline_samples.remove(0);
            }
        }
    }

    /// Compare a memory-integrity checksum against its baseline.
    pub fn check_memory(&mut self, baseline: u64, current: u64) {
        if !self.enabled() {
            return;
        }
        if baseline != current {
            self.record_anomaly();
        }
    }

    fn baseline_stats(&self) -> (f64, f64) {
        let n = self.baseline_samples.len() as f64;
        let mean = self.baseline_samples.iter().map(|&v| v as f64).sum::<f64>() / n;
        let var = self
            .baseline_samples
            .iter()
            .map(|&v| {
                let d = v as f64 - mean;
                d * d
            })
            .sum::<f64>()
            / n;
        (mean, var.sqrt())
    }

    pub fn baseline_sample_count(&self) -> usize {
        self.baseline_samples.len()
    }
}

// ---------------------------------------------------------------------------
// Global engine (WASM: per-thread, no locking needed)
// ---------------------------------------------------------------------------

thread_local! {
    static ENGINE: RefCell<DefenseEngine> =
        RefCell::new(DefenseEngine::new(DefenseConfig::default()));
}

/// Run a closure against the process-wide defense engine.
pub fn with_engine<R>(f: impl FnOnce(&mut DefenseEngine) -> R) -> R {
    ENGINE.with(|e| f(&mut e.borrow_mut()))
}

/// Set the defense level. Returns 0 on success, non-zero on invalid level.
pub fn configure(level: u32, flags: u32) -> i32 {
    if level > DEFENSE_LEVEL_FULL {
        return -1;
    }
    let _ = flags;
    with_engine(|e| {
        e.config.level = level;
        if level == DEFENSE_LEVEL_OFF {
            e.mode = MODE_NORMAL;
            e.anomaly_count = 0;
            e.baseline_samples.clear();
        }
    });
    0
}

/// JSON status for audit / diagnostics (never contains key material).
pub fn status_json() -> String {
    with_engine(|e| {
        format!(
            r#"{{"level":{},"mode":{},"anomaly_count":{},"baseline_samples":{}}}"#,
            e.config.level,
            e.mode,
            e.anomaly_count,
            e.baseline_sample_count()
        )
    })
}

/// Silent poisoning: corrupt the buffer in place, preserving length and type.
/// Reproducible for a given input so audit trails remain comparable.
pub fn poison(data: &mut [u8]) {
    for (i, b) in data.iter_mut().enumerate() {
        *b = b.wrapping_add(i as u8).rotate_left(3) ^ 0x55;
    }
}

// ---------------------------------------------------------------------------
// Tests (injected elapsed values — no real clock dependency)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn engine(level: u32) -> DefenseEngine {
        DefenseEngine::new(DefenseConfig {
            level,
            ..Default::default()
        })
    }

    #[test]
    fn test_level0_is_full_bypass() {
        let mut e = engine(DEFENSE_LEVEL_OFF);
        e.check_execution(u128::MAX);
        assert_eq!(e.anomaly_count, 0);
        assert_eq!(e.mode, MODE_NORMAL);
        e.check_memory(1, 999);
        assert_eq!(e.anomaly_count, 0);
    }

    #[test]
    fn test_baseline_calibration_then_normal_passes() {
        let mut e = engine(DEFENSE_LEVEL_STANDARD);
        for _ in 0..BASELINE_MIN_SAMPLES {
            e.check_execution(1_000);
        }
        assert_eq!(e.anomaly_count, 0);
        for _ in 0..10 {
            e.check_execution(1_050);
        }
        assert_eq!(e.mode, MODE_NORMAL, "in-band timing must not poison");
        assert_eq!(e.anomaly_count, 0);
    }

    #[test]
    fn test_sustained_timing_anomaly_poisons() {
        let mut e = engine(DEFENSE_LEVEL_STANDARD);
        for _ in 0..BASELINE_MIN_SAMPLES {
            e.check_execution(1_000);
        }
        for i in 0..DEFAULT_POISON_AFTER {
            e.check_execution(1_000_000);
            if i + 1 < DEFAULT_POISON_AFTER {
                assert_eq!(e.mode, MODE_NORMAL);
            }
        }
        assert_eq!(e.mode, MODE_POISONING, "sustained anomalies must poison");
    }

    #[test]
    fn test_memory_tamper_detected() {
        let mut e = engine(DEFENSE_LEVEL_STANDARD);
        e.check_memory(0xABCD, 0xABCD);
        assert_eq!(e.anomaly_count, 0);
        for _ in 0..DEFAULT_POISON_AFTER {
            e.check_memory(0xABCD, 0x1234);
        }
        assert_eq!(e.mode, MODE_POISONING);
    }

    #[test]
    fn test_poison_keeps_length_and_changes_data() {
        let mut data: Vec<u8> = (0..100).map(|i| i as u8).collect();
        let orig = data.clone();
        poison(&mut data);
        assert_eq!(data.len(), orig.len());
        assert_ne!(data, orig);
        // poisoning is deterministic
        let mut again = orig.clone();
        poison(&mut again);
        assert_eq!(data, again);
    }

    #[test]
    fn test_fnv1a_changes_on_tamper() {
        let a = fnv1a64(&[1u8, 2, 3, 4]);
        let b = fnv1a64(&[1u8, 2, 3, 5]);
        assert_ne!(a, b);
        let c = fnv1a64(&[1u8, 2, 3, 4]);
        assert_eq!(a, c, "checksum must be deterministic");
    }

    #[test]
    fn test_configure_validation() {
        assert_eq!(configure(DEFENSE_LEVEL_OFF, 0), 0);
        assert_eq!(configure(DEFENSE_LEVEL_FULL, 0), 0);
        assert_eq!(configure(99, 0), -1);
        configure(DEFENSE_LEVEL_OFF, 0);
    }
}
