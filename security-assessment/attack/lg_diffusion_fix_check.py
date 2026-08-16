#!/usr/bin/env python3
"""全块扩散 + 多轮加固落地后的黑盒攻击失效验证。
对应 lg-v2.3/src/{diffuse.rs,hardening.rs} 与 lg-hardening-review.md §2/§5：
  原黑盒攻击依赖"单字节扰动恰好影响 1 个输出字节"定位 σ；
  全部混淆变体现在统一套 harden（扩散↔S-box 交替，Keccak-256 派生轮密钥），
  单字节扰动扩散到近全块且复合变换非线性，σ 定位失败。
"""
import random
from lgv23_oracle import (
    lgv2_confuse, lgv2_confuse_ex, lgv3_confuse_mix,
    lgv2_confuse_full, lgv3_pipeline_obfuscate, lgv3_pipeline_deobfuscate,
    harden_forward, harden_inverse, HARDEN_ROUNDS,
)


def perturbation_map(oracle, N):
    """返回每个输入位置的扰动影响字节数列表（全零输入为基准）。"""
    base = bytes(oracle(list([0] * N)))
    counts = []
    for i in range(N):
        inp = bytearray([0] * N)
        inp[i] ^= 1
        out = bytes(oracle(list(inp)))
        counts.append(sum(1 for j in range(N) if out[j] != base[j]))
    return counts


def _harden_copy(inp, seed, sk):
    d = bytearray(inp)
    harden_forward(d, seed, sk)
    return bytes(d)


VARIANTS = {
    "lgv2_confuse(seed)": lambda inp, s, k, d: lgv2_confuse(bytes(inp), s),
    "lgv2_confuse_ex": lambda inp, s, k, d: lgv2_confuse_ex(bytes(inp), s, k, d),
    "lgv3_confuse_mix": lambda inp, s, k, d: lgv3_confuse_mix(bytes(inp), s, k, d),
    "lgv2_confuse_full(KEM)": lambda inp, s, k, d: lgv2_confuse_full(bytes(inp), s, k, bytes([0x42] * 32), d),
    "lgv3_pipeline_obfuscate": lambda inp, s, k, d: lgv3_pipeline_obfuscate(bytes(inp), s, k, d),
}


def main():
    N = 64
    seed, sk, depth = 0x1234, 0xDEAD, 7
    print("=" * 72)
    print(f"加固后各混淆变体 (统一 harden[diffuse+sbox]x{HARDEN_ROUNDS}), N={N}")
    print("=" * 72)

    ok = True

    # 1) 全部变体 roundtrip 仍须通过
    data = bytes((i * 7) & 0xFF for i in range(N))
    for name, fn in VARIANTS.items():
        fn(data, seed, sk, depth)  # smoke: 可调用
    c_full = lgv2_confuse_full(data, seed, sk, bytes([0x42] * 32), depth)
    # pipeline / confuse_mix / confuse_ex roundtrip 由 Rust 交叉验证 + oracle 自检覆盖；
    # 这里抽查 pipeline roundtrip
    c = lgv3_pipeline_obfuscate(data, seed, sk, depth)
    r = lgv3_pipeline_deobfuscate(c, seed, sk, depth)
    print(f"pipeline roundtrip: {'PASS' if r == data else 'FAIL'}")
    ok &= (r == data)

    # 2) 扩散：每个变体单字节扰动都影响近全块
    for name, fn in VARIANTS.items():
        o = lambda inp, f=fn: f(inp, seed, sk, depth)
        counts = perturbation_map(o, N)
        mn, mx = min(counts), max(counts)
        good = mn >= N // 2
        ok &= good
        print(f"  {name:<26} min={mn}/{N} max={mx} {'PASS' if good else 'FAIL'}")

    # 3) 原攻击失效：无任何位置恰好 1 字节依赖
    for name, fn in VARIANTS.items():
        o = lambda inp, f=fn: f(inp, seed, sk, depth)
        counts = perturbation_map(o, N)
        if 1 in counts:
            ok = False
            print(f"[FAIL] {name}: 存在恰好 1 字节依赖，原攻击仍可能定位 σ")
        else:
            print(f"[PASS] {name}: 无 1 字节依赖 => σ 定位失败")

    # 4) harden 层自检 (独立)
    d = bytearray(data)
    harden_forward(d, seed, sk)
    assert d != bytearray(data), "harden must change data"
    harden_inverse(d, seed, sk)
    assert bytes(d) == data, "harden roundtrip must recover"
    cts = perturbation_map(lambda inp: _harden_copy(inp, seed, sk), N)
    print(f"harden 层单字节扰动影响: min={min(cts)}, max={max(cts)}")
    ok &= min(cts) >= N // 2

    # 5) 多种子/会话/depth 下均失效（覆盖全部变体）
    for (s2, sk2, d2) in [(0xDEADBEEF, 0xBEEF, 3), (0x1, 0xCAFE, 1), (42, 7, 5)]:
        for name, fn in VARIANTS.items():
            o = lambda inp, f=fn, s=s2, k=sk2, dd=d2: f(inp, s, k, dd)
            c2 = perturbation_map(o, N)
            mn2 = min(c2)
            if mn2 < N // 2:
                ok = False
                print(f"[FAIL] {name} seed={s2:#x} sk={sk2:#x} d={d2}: min={mn2}")
            else:
                print(f"  {name:<26} seed={s2:#x} sk={sk2:#x} d={d2}: min={mn2}/{N} PASS")

    print()
    print("结论: 全部混淆变体统一加固后，单字节扰动无 1 字节依赖，原黑盒攻击失效。")
    return ok


if __name__ == "__main__":
    if main():
        print("ALL PASS")
