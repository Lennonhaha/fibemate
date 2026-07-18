//! VWZ Native Rust Benchmark
//!
//! Measures keygen/sign/verify latency without WASM overhead.
//! Run: cargo bench -- no special harness needed, just release-mode accuracy.
//!
//! Comparison target: Python vwz_signature.py benchmarks (from MEMORY.md)

use std::time::Instant;
use vwz_signature::hash_target::hash_to_sparse_target;
use vwz_signature::preimage::solve_preimage_sparse;
use vwz_signature::signature::{keygen_seeded, sign, verify, Keypair};
use vwz_signature::tensor::{public_tensor_eval, PubTensor};
use vwz_signature::trapdoor::{generate_trapdoor, sample_preimage};

const WARMUP: usize = 5;
const ROUNDS: usize = 20;

fn measure<F: FnMut()>(mut f: F, warmup: usize, rounds: usize) -> (f64, f64, f64, f64) {
    for _ in 0..warmup { f(); }
    let mut times = Vec::with_capacity(rounds);
    for _ in 0..rounds {
        let t0 = Instant::now();
        f();
        times.push(t0.elapsed().as_secs_f64() * 1_000.0);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    (
        times[0],                                                // min
        times[times.len() / 2],                                  // median
        times[(times.len() as f64 * 0.95) as usize],             // p95
        times.iter().sum::<f64>() / times.len() as f64,          // avg
    )
}

fn main() {
    println!("VWZ Native Rust Benchmark");
    println!("warmup={WARMUP} rounds={ROUNDS}");
    let sep = "─".repeat(65);
    println!("{sep}");

    for k in [8, 16] {
        let msg = format!("Fibemate VWZ native bench {k}").into_bytes();
        let n = 2 * k + 1;
        let m = k + 1;
        let pk_full = n * m * m * 2;
        let pk_rank1 = 2 * n * m * 2;
        let sig_bytes = 2 * m * 2;

        // ─── keygen ───
        let mut kp: Option<Keypair> = None;
        let (kg_min, kg_p50, kg_p95, kg_avg) = measure(
            || { kp = Some(keygen_seeded(k, 12345)); },
            WARMUP, ROUNDS,
        );
        let kp = kp.unwrap();

        // ─── sign ───
        let pk = kp.public_key_ref();
        let sk = kp.secret_key_ref();
        let mut sig = None;
        let (s_min, s_p50, s_p95, s_avg) = measure(
            || { sig = Some(sign(sk, &msg)); },
            WARMUP, ROUNDS,
        );
        let sig = sig.unwrap();

        // ─── verify ───
        let (v_min, v_p50, v_p95, v_avg) = measure(
            || { verify(pk, &msg, &sig); },
            WARMUP, ROUNDS,
        );

        println!();
        println!("=== k={k} ===");
        println!("  PK full: {pk_full}B  PK rank-1: {pk_rank1}B  Sig: {sig_bytes}B");
        println!("  keygen │ min {kg_min:.3}ms │ p50 {kg_p50:.3}ms │ p95 {kg_p95:.3}ms │ avg {kg_avg:.3}ms");
        println!("  sign   │ min {s_min:.3}ms │ p50 {s_p50:.3}ms │ p95 {s_p95:.3}ms │ avg {s_avg:.3}ms");
        println!("  verify │ min {v_min:.3}ms │ p50 {v_p50:.3}ms │ p95 {v_p95:.3}ms │ avg {v_avg:.3}ms");
    }

    println!();
    println!("WASM estimate (~2-4× slower):");
    for k in [8, 16] {
        let n = 2 * k + 1;
        let m = k + 1;
        let pk_full = n * m * m * 2;
        let pk_rank1 = 2 * n * m * 2;
        let sig_bytes = 2 * m * 2;
        println!("  k={k}: pk={pk_full}B rank1={pk_rank1}B sig={sig_bytes}B (gzip WASM ~46KB)");
    }
}
