#!/usr/bin/env python3
"""
collect-samples.py — 批量采集 LG v2.2 映射样本（矩阵版, 对齐 Rust 实现）

Target: LG v2.2 256×256 affine Kronecker + sparse offset (mod Q=3329)
        
数学结构: simulate_lg_matrix.py — 精确匹配 Rust matrices.rs + lib.rs
  - 7 层不可约表示 Kronecker product → 48×48 active subspace
  - 208-dim identity padding → 256×256 global matrix  
  - 7! layer permutations × Q^48 sparse offsets → session randomness
  - Barrett reduction (wrapping, branchless, matching Rust barrett_reduce)

用法:
  python collect-samples.py [count] [output.json]
  默认: 500 lg-samples.json
  块大小固定 256 (WASM 矩阵维度)
"""

import json
import os
import random
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) or '.')
from simulate_lg_matrix import (
    Q, ACTIVE_DIM, FULL_DIM, NUM_LAYERS,
    random_permutation,
    apply_forward,
    apply_inverse,
    roundtrip_test,
)

SAMPLE_COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 500
OUTPUT_FILE  = sys.argv[2] if len(sys.argv) > 2 else "lg-samples.json"

print(f"[collect-samples] count={SAMPLE_COUNT} block={FULL_DIM}B depth={NUM_LAYERS}")
print(f"[collect-samples] model=Kronecker+sparse-offset (Rust-equivalent)")
print(f"[collect-samples] out={OUTPUT_FILE}")


def main():
    samples = []
    seeds = set()
    
    for i in range(SAMPLE_COUNT):
        # 每次随机 perm_seed (7! 排列) + 随机 sparse offset
        perm_seed = random.randint(0, 2**64 - 1)
        plain = [random.randint(0, Q - 1) for _ in range(FULL_DIM)]
        
        # 7 层排列 + sparse offset (LG v2.2 固定 7 层)
        perm = random_permutation(perm_seed)
        offset = [random.randint(0, Q - 1) for _ in range(ACTIVE_DIM)] + [0] * (FULL_DIM - ACTIVE_DIM)
        
        obf = apply_forward(plain, perm=perm, offset=offset)
        rec = apply_inverse(obf, perm=perm, offset=offset)
        rt_ok = rec == plain
        
        samples.append({
            "id": i,
            "perm_seed": f"0x{perm_seed:016x}",
            "perm": perm,  # 7 层排列
            "in": plain,
            "out": obf,
            "roundtrip_ok": rt_ok,
        })
        seeds.add(perm_seed)

    # 统计
    rt_pass = sum(1 for s in samples if s["roundtrip_ok"])
    
    print(f"[collect-samples] Total: {len(samples)}")
    print(f"[collect-samples] Unique seeds: {len(seeds)}")
    print(f"[collect-samples] Roundtrip: {rt_pass}/{len(samples)}")
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump({
            "meta": {
                "target": "LG v2.2 affine Kronecker matrix + sparse offset (Q=3329, dim=256)",
                "method": "simulated-matrix",
                "engine": "simulate_lg_matrix.py (Rust-equivalent)",
                "count": len(samples),
                "block_size": FULL_DIM,
                "active_dim": ACTIVE_DIM,
                "depth": NUM_LAYERS,
                "roundtrip_pass": rt_pass,
            },
            "samples": samples,
        }, f, indent=2)
    
    print(f"[collect-samples] Saved to {OUTPUT_FILE} ({os.path.getsize(OUTPUT_FILE)} bytes)")

if __name__ == "__main__":
    main()
