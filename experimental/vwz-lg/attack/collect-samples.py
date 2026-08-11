#!/usr/bin/env python3
"""
collect-samples.py — 批量采集 LG v2.2 映射样本（零硬编码版）

Target: LG v2.2 wreath-product + sparse offset (Python simulation / Frida / Node-WASM)
Output: JSON samples [{in:hex, out:hex, seed:hex, depth:int}]

S-box 从种子动态生成（Fisher-Yates），非硬编码 AES S-box。
depth/block_size 均 CLI 可配置。

用法:
  python collect-samples.py [count] [block_size] [max_depth] [output.json]
  默认: 500 48 7 lg-samples.json
"""

import json
import os
import sys

# ── CLI ──
SAMPLE_COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 500
BLOCK_SIZE   = int(sys.argv[2]) if len(sys.argv) > 2 else 48
MAX_DEPTH    = int(sys.argv[3]) if len(sys.argv) > 3 else 7
OUTPUT_FILE  = sys.argv[4] if len(sys.argv) > 4 else "lg-samples.json"

print(f"[collect-samples] count={SAMPLE_COUNT} block={BLOCK_SIZE}B depth=1-{MAX_DEPTH} out={OUTPUT_FILE}")

# ── PRNG ──
def xorshift64(seed: int) -> int:
    x = seed if seed != 0 else 1
    x ^= (x << 13) & 0xFFFFFFFFFFFFFFFF
    x ^= x >> 7
    x ^= (x << 17) & 0xFFFFFFFFFFFFFFFF
    return x

def layer_seed(base: int, idx: int) -> int:
    s = base ^ (((idx + 1) * 0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFFFFFF)
    s ^= s >> 30
    s = (s * 0xBF58476D1CE4E5B9) & 0xFFFFFFFFFFFFFFFF
    s ^= s >> 27
    s = (s * 0x94D049BB133111EB) & 0xFFFFFFFFFFFFFFFF
    s ^= s >> 31
    return s

# ── 动态 S-box (从种子生成, 零硬编码) ──
def generate_sbox(seed: int) -> list[int]:
    """Fisher-Yates 置换生成 S-box"""
    sbox = list(range(256))
    rng = xorshift64(seed)
    for i in range(255, 0, -1):
        rng = xorshift64(rng)
        j = rng % (i + 1)
        sbox[i], sbox[j] = sbox[j], sbox[i]
    return sbox

def generate_inv_sbox(sbox: list[int]) -> list[int]:
    inv = [0] * 256
    for i in range(256):
        inv[sbox[i]] = i
    return inv

# 默认 S-box (固定种子, 可复现)
_DEFAULT_SBOX_SEED = 0xA55A5AA5A55A5AA5
SBOX = generate_sbox(_DEFAULT_SBOX_SEED)
INV_SBOX = generate_inv_sbox(SBOX)

# ── 模拟 confuse/deconfuse ──
def simulate_lg_confuse(data: bytes, seed: int, depth: int = 7, sbox: list[int] = None) -> bytes:
    """LG v2.2 forward — XOR + Fisher-Yates + S-box (与 wreath.rs 语义一致)"""
    if sbox is None:
        sbox = SBOX
    n = len(data)
    layers = min(max(depth, 1), MAX_DEPTH)
    chunk = bytearray(data)

    for li in range(layers):
        s = layer_seed(seed, li)
        rng = xorshift64(s)

        # Fisher-Yates 排列
        perm = list(range(n))
        for i in range(n - 1, 0, -1):
            rng = xorshift64(rng)
            j = rng % (i + 1)
            perm[i], perm[j] = perm[j], perm[i]

        # XOR mask + S-box
        mask = bytearray(n)
        for i in range(n):
            rng = xorshift64(rng)
            mask[i] = rng & 0xFF
        tmp = bytearray(n)
        for i in range(n):
            tmp[i] = chunk[i] ^ mask[i]
        for i in range(n):
            chunk[perm[i]] = sbox[tmp[i] ^ (mask[perm[i]] ^ 0x5A) & 0xFF]

    return bytes(chunk)

def simulate_lg_deconfuse(data: bytes, seed: int, depth: int = 7, inv_sbox: list[int] = None) -> bytes:
    """LG v2.2 inverse — INV_SBOX + unpermute + unmask"""
    if inv_sbox is None:
        inv_sbox = INV_SBOX
    n = len(data)
    layers = min(max(depth, 1), MAX_DEPTH)
    chunk = bytearray(data)

    for li in range(layers - 1, -1, -1):
        s = layer_seed(seed, li)
        rng = xorshift64(s)

        perm = list(range(n))
        for i in range(n - 1, 0, -1):
            rng = xorshift64(rng)
            j = rng % (i + 1)
            perm[i], perm[j] = perm[j], perm[i]

        inv_perm = [0] * n
        for i in range(n):
            inv_perm[perm[i]] = i

        mask = bytearray(n)
        for i in range(n):
            rng = xorshift64(rng)
            mask[i] = rng & 0xFF

        tmp = bytearray(n)
        for i in range(n):
            val = inv_sbox[chunk[i]] ^ (mask[i] ^ 0x5A) & 0xFF
            tmp[inv_perm[i]] = val
        for i in range(n):
            chunk[i] = tmp[i] ^ mask[i]

    return bytes(chunk)

def verify_roundtrip(plain: bytes, seed: int, depth: int) -> bool:
    obf = simulate_lg_confuse(plain, seed, depth)
    rec = simulate_lg_deconfuse(obf, seed, depth)
    return rec == plain

# ── 生成样本 ──
def main():
    import random
    samples = []
    
    for i in range(SAMPLE_COUNT):
        seed = random.randint(1, 0xFFFFFFFFFFFFFFFF)
        depth = random.randint(1, MAX_DEPTH)
        plain = bytes(random.randint(0, 255) for _ in range(BLOCK_SIZE))
        obf = simulate_lg_confuse(plain, seed, depth)
        
        # roundtrip 验证
        rec = simulate_lg_deconfuse(obf, seed, depth)
        rt_ok = rec == plain
        
        samples.append({
            "id": i,
            "seed": f"0x{seed:016x}",
            "depth": depth,
            "in": plain.hex(),
            "out": obf.hex(),
            "roundtrip_ok": rt_ok,
        })

    # 统计
    seeds = set(s["seed"] for s in samples)
    from collections import Counter
    depth_dist = Counter(s["depth"] for s in samples)
    rt_pass = sum(1 for s in samples if s["roundtrip_ok"])
    
    print(f"[collect-samples] Total: {len(samples)}")
    print(f"[collect-samples] Unique seeds: {len(seeds)}")
    print(f"[collect-samples] Depth distribution: {dict(sorted(depth_dist.items()))}")
    print(f"[collect-samples] Roundtrip: {rt_pass}/{len(samples)}")
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump({
            "meta": {
                "target": "LG v2.2 wreath-product + sparse offset (Python simulation)",
                "method": "simulated",
                "count": len(samples),
                "block_size": BLOCK_SIZE,
                "max_depth": MAX_DEPTH,
                "sbox_seed": f"0x{_DEFAULT_SBOX_SEED:016x}",
                "roundtrip_pass": rt_pass,
            },
            "samples": samples,
        }, f, indent=2)
    
    print(f"[collect-samples] Saved to {OUTPUT_FILE} ({os.path.getsize(OUTPUT_FILE)} bytes)")

if __name__ == "__main__":
    main()
