//! VWZ Native Rust Benchmark
//!
//! Measures keygen/sign/verify latency without WASM overhead.
//! Run: cargo run --release --bin bench

use std::time::Instant;
use vwz_signature::hash_target::hash_to_sparse_target;
use vwz_signature::signature::{keygen_seeded, sign, verify, Keypair};
use vwz_signature::trapdoor::sample_preimage;

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
    println!("VWZ Native Rust Benchmark (mixed rank-2 scheme)");
    println!("warmup={WARMUP} rounds={ROUNDS}");
    let sep = "─".repeat(65);
    println!("{sep}");

    for k in [8, 16] {
        let msg = format!("Fibemate VWZ native bench {k}").into_bytes();
        let n = 2 * k + 2;
        let m = 2 * k + 1;
        let pk_full = n * m * m * 2;
        let sig_bytes = 2 * m * 2;

        // ─── keygen ───
        let mut kp: Option<Keypair> = None;
        let (kg_min, kg_p50, kg_p95, kg_avg) = measure(
            || { kp = Some(keygen_seeded(k, 12345)); },
            WARMUP, ROUNDS,
        );
        let kp = kp.unwrap();

        // ─── sign (incl. preimage sampling) ───
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

        // ─── raw preimage sampling latency ───
        let target = hash_to_sparse_target(&msg, k);
        let (sp_min, sp_p50, sp_p95, sp_avg) = measure(
            || { sample_preimage(sk.td_ref(), &target).unwrap(); },
            WARMUP, ROUNDS,
        );

        println!();
        println!("=== k={k} ===");
        println!("  PK: {pk_full}B  Sig: {sig_bytes}B  (N={n}, M={m})");
        println!("  keygen │ min {kg_min:.3}ms │ p50 {kg_p50:.3}ms │ p95 {kg_p95:.3}ms │ avg {kg_avg:.3}ms");
        println!("  sign   │ min {s_min:.3}ms │ p50 {s_p50:.3}ms │ p95 {s_p95:.3}ms │ avg {s_avg:.3}ms");
        println!("  verify │ min {v_min:.3}ms │ p50 {v_p50:.3}ms │ p95 {v_p95:.3}ms │ avg {v_avg:.3}ms");
        println!("  sample │ min {sp_min:.3}ms │ p50 {sp_p50:.3}ms │ p95 {sp_p95:.3}ms │ avg {sp_avg:.3}ms");
    }
}
