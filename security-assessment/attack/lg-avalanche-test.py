#!/usr/bin/env python3
"""雪崩效应测试 —— 量化加固前后各变体的扩散强度。

对应 lg-v2.3/src/{diffuse.rs,hardening.rs} 与 lg-hardening-review.md §2：
  逐字节独立混淆的雪崩效应极低（1 bit 翻转只影响 1 个输出字节 ≈ 1/N）；
  加固后（全块扩散 + 逐字节层交替）应接近理想雪崩（字节级近全块、bit 级 ≈ 50%）。

指标：
  - 字节级雪崩：输出字节发生变化的比例（满扩散下 → 接近 100%）
  - bit 级雪崩：输出 bit 翻转的比例（理想 ≈ 50%）

用法: python3 lg-avalanche-test.py [trials]
"""
import random
import statistics
import sys

import lgv23_oracle
from lgv23_oracle import (
    confuse_full, deconfuse_full,
    lgv2_confuse, lgv2_confuse_ex, lgv3_confuse_mix,
    lgv2_confuse_full, lgv3_pipeline_obfuscate, lgv3_pipeline_deobfuscate,
)


def _install_gf_table():
    """用原逐位算法预计算完整 256×256 乘法表，替换 gf_mul（结果完全一致，O(1) 查表）。"""
    orig = lgv23_oracle.gf_mul
    table = [[orig(a, b) for b in range(256)] for a in range(256)]

    def gf_mul_table(a, b):
        return table[a][b]

    for a in range(256):
        for b in range(256):
            assert gf_mul_table(a, b) == orig(a, b), f"gf table mismatch a={a} b={b}"
    lgv23_oracle.gf_mul = gf_mul_table


_install_gf_table()

TRIALS = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
N = 256
SEED, SK, DEPTH = 0x1234, 0xDEAD, 7
SS = bytes([0x42] * 32)


def _raw_v2(data, seed):
    """原始 LG v2.3 逐字节混淆（无 harden，模拟加固前的 Wreath-only 行为）。"""
    d = bytearray(data)
    confuse_full(d, seed)
    return bytes(d)


VARIANTS = {
    "原始 LG v2.3 (Wreath, 无扩散)": lambda inp: _raw_v2(inp, SEED),
    "lgv2_confuse (+harden)": lambda inp: lgv2_confuse(bytes(inp), SEED),
    "lgv2_confuse_ex (+harden)": lambda inp: lgv2_confuse_ex(bytes(inp), SEED, SK, DEPTH),
    "lgv3_confuse_mix (+harden)": lambda inp: lgv3_confuse_mix(bytes(inp), SEED, SK, DEPTH),
    "lgv2_confuse_full (+harden,KEM)": lambda inp: lgv2_confuse_full(bytes(inp), SEED, SK, SS, DEPTH),
    "lgv3_pipeline_obfuscate (+harden)": lambda inp: lgv3_pipeline_obfuscate(bytes(inp), SEED, SK, DEPTH),
}


def popcount(x):
    return bin(x).count("1")


def avalanche_stats(oracle, data_length=N, trials=TRIALS):
    """随机输入 + 随机 1 bit 翻转，统计字节级 / bit 级雪崩。"""
    byte_ratios = []
    bit_ratios = []
    rng = random.Random(0xC0FFEE)
    for _ in range(trials):
        data = bytearray(rng.getrandbits(8) for _ in range(data_length))
        bit_pos = rng.randrange(data_length * 8)
        modified = bytearray(data)
        modified[bit_pos // 8] ^= 1 << (bit_pos % 8)

        orig_out = oracle(bytes(data))
        mod_out = oracle(bytes(modified))

        diff_bytes = 0
        diff_bits = 0
        for a, b in zip(orig_out, mod_out):
            if a != b:
                diff_bytes += 1
                diff_bits += popcount(a ^ b)
        byte_ratios.append(diff_bytes / data_length)
        bit_ratios.append(diff_bits / (data_length * 8))
    return {
        "byte_mean": statistics.mean(byte_ratios),
        "byte_median": statistics.median(byte_ratios),
        "byte_min": min(byte_ratios),
        "byte_max": max(byte_ratios),
        "byte_std": statistics.stdev(byte_ratios),
        "bit_mean": statistics.mean(bit_ratios),
        "bit_median": statistics.median(bit_ratios),
        "bit_std": statistics.stdev(bit_ratios),
    }


def main():
    print("=" * 78)
    print(f"雪崩效应测试  N={N} bytes  trials={TRIALS}  (seed=0x1234 sk=0xDEAD depth=7)")
    print("=" * 78)
    print(f"{'变体':<36}{'字节级均值':>12}{'bit级均值':>12}{'byte min':>10}{'byte max':>10}")
    print("-" * 78)

    # 原始 Wreath 先自检 roundtrip（确保 _raw_v2 可逆）
    data = bytes((i * 7) & 0xFF for i in range(N))
    rt = _raw_v2(data, SEED)
    d = bytearray(rt)
    deconfuse_full(d, SEED)
    assert bytes(d) == data, "raw v2 roundtrip must hold"
    # 加固后 pipeline roundtrip 抽查
    rt = lgv3_pipeline_obfuscate(data, SEED, SK, DEPTH)
    assert lgv3_pipeline_deobfuscate(rt, SEED, SK, DEPTH) == data, "pipeline roundtrip must hold"

    rows = []
    for name, oracle in VARIANTS.items():
        s = avalanche_stats(oracle)
        rows.append((name, s))
        print(f"{name:<36}{s['byte_mean']:>11.2%}{s['bit_mean']:>11.2%}"
              f"{s['byte_min']:>9.1%}{s['byte_max']:>9.1%}")

    print("-" * 78)
    print(f"理想 bit 级雪崩 ≈ 50%；加固后字节级应接近 100%（每输出字节都依赖全部输入字节）")

    ok = True
    raw = rows[0][1]
    for name, s in rows[1:]:
        if s["byte_mean"] < 0.9:
            ok = False
            print(f"[FAIL] {name}: 字节级雪崩 {s['byte_mean']:.1%} 偏低")
        if not (0.30 <= s["bit_mean"] <= 0.70):
            ok = False
            print(f"[FAIL] {name}: bit 级雪崩 {s['bit_mean']:.1%} 偏离理想区间")
    print()
    print(f"原始 Wreath 字节级均值: {raw['byte_mean']:.2%} (≈1/{N}={1/N:.2%}，逐字节独立特征)")
    print(ok and "ALL PASS" or "SOME FAILED")


if __name__ == "__main__":
    main()
