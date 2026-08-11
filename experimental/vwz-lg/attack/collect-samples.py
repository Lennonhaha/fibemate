#!/usr/bin/env python3
"""
collect-samples.py — 批量采集 LG v2.2 置换映射样本

Target: LG v2.2 7-layer wreath-product finite group obfuscation
Output: lg-samples.json (10,000+ 对 {in: hex, out: hex, seed: hex, depth: int})

依赖: pip install frida
用法:
  1. 先用 node 加载 LG v2.2 WASM: node lgv2-bench.js (监听中)
  2. python3 collect-samples.py --target node --count 10000
  3. 或: python3 collect-samples.py --input samples-raw.txt (从 frida 输出解析)
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

# ---- 纯 Python 模拟: 当 Frida 不可用时用已知数学结构生成样本 ----
# 这允许不依赖 WASM 运行即可验证步骤 3/4 的拟合+去混淆算法正确性。

def xorshift64(seed: int) -> int:
    """XorShift64 PRNG (与 LG v2.2 wreath.rs 一致)"""
    x = seed if seed != 0 else 1
    x ^= (x << 13) & 0xFFFFFFFFFFFFFFFF
    x ^= x >> 7
    x ^= (x << 17) & 0xFFFFFFFFFFFFFFFF
    return x

def layer_seed(base: int, idx: int) -> int:
    s = base ^ (((idx + 1) * 0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFFFFFF)
    s ^= (s >> 30)
    s = (s * 0xBF58476D1CE4E5B9) & 0xFFFFFFFFFFFFFFFF
    s ^= (s >> 27)
    s = (s * 0x94D049BB133111EB) & 0xFFFFFFFFFFFFFFFF
    s ^= (s >> 31)
    return s

# AES S-box (直接复用 v2.2 sbox.rs)
SBOX = [
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]

def simulate_lg_confuse(data: bytes, seed: int, depth: int = 7) -> bytes:
    """模拟 LG v2.2 confuse（XOR + S-box 置换, 与 wreath.rs 语义一致）"""
    n = len(data)
    layers = min(max(depth, 1), 7)
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
        tmp = bytearray(n)
        mask = bytearray(n)
        for i in range(n):
            rng = xorshift64(rng)
            mask[i] = rng & 0xFF
        for i in range(n):
            tmp[i] = chunk[i] ^ mask[i]
        for i in range(n):
            chunk[perm[i]] = SBOX[tmp[i] ^ (mask[perm[i]] ^ 0x5A) & 0xFF]

    return bytes(chunk)


# ---- 主逻辑 ----

def generate_simulated_samples(count: int = 10000, block_size: int = 48) -> list[dict]:
    """用纯 Python 模拟生成样本（无需 Frida/WASM）"""
    import random
    samples = []
    for i in range(count):
        seed = random.randint(1, 0xFFFFFFFFFFFFFFFF)
        depth = random.randint(1, 7)
        plain = bytes(random.randint(0, 255) for _ in range(block_size))
        obf = simulate_lg_confuse(plain, seed, depth)
        samples.append({
            "id": i,
            "seed": f"0x{seed:016x}",
            "depth": depth,
            "in": plain.hex(),
            "out": obf.hex(),
        })
    return samples


def parse_frida_output(input_file: str) -> list[dict]:
    """从 Frida 的 JSONL 输出解析样本"""
    samples = []
    with open(input_file, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("["):
                continue
            try:
                samples.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return samples


def main():
    parser = argparse.ArgumentParser(description="Collect LG v2.2 confused↔plain mapping samples")
    parser.add_argument("--count", type=int, default=10000, help="样本数量 (simulated 模式)")
    parser.add_argument("--block-size", type=int, default=48, help="每个样本的字节数")
    parser.add_argument("--input", type=str, help="从 Frida JSONL 输出解析（替代模拟）")
    parser.add_argument("--output", type=str, default="lg-samples.json", help="输出文件")
    parser.add_argument("--seed", type=int, default=42, help="随机种子 (simulated 模式)")
    args = parser.parse_args()

    if args.input:
        print(f"[collect-samples] Parsing Frida output: {args.input}")
        samples = parse_frida_output(args.input)
        print(f"[collect-samples] Parsed {len(samples)} samples")
    else:
        import random
        random.seed(args.seed)
        print(f"[collect-samples] Generating {args.count} simulated samples (block={args.block_size}B)...")
        samples = generate_simulated_samples(args.count, args.block_size)

    # 统计
    seeds = set(s["seed"] for s in samples)
    depths = defaultdict(int)
    for s in samples:
        depths[s.get("depth", 7)] += 1

    print(f"[collect-samples] Total: {len(samples)} samples")
    print(f"[collect-samples] Unique seeds: {len(seeds)}")
    print(f"[collect-samples] Depth distribution: {dict(depths)}")

    with open(args.output, "w") as f:
        json.dump({
            "meta": {
                "target": "LG v2.2 7-layer wreath-product finite group",
                "method": "simulated" if not args.input else "frida-live",
                "count": len(samples),
                "block_size": args.block_size,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
            "samples": samples,
        }, f, indent=2)

    print(f"[collect-samples] Saved to {args.output} ({os.path.getsize(args.output)} bytes)")

if __name__ == "__main__":
    main()
