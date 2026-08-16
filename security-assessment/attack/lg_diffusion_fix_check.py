#!/usr/bin/env python3
"""全块扩散加固后的黑盒攻击失效验证。
对应 lg-v2.3/src/diffuse.rs 与 lg-hardening-review.md §2 的结论：
  原黑盒攻击依赖"单字节扰动恰好影响 1 个输出字节"定位 σ；
  加入 seed 派生全块线性扩散后，单字节扰动扩散到近全块，σ 定位失败。
"""
import random
from lgv23_oracle import (
    lgv3_pipeline_obfuscate, lgv3_pipeline_deobfuscate,
    diffuse_forward, diffuse_inverse,
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


def _diffuse_copy(inp, seed, sk):
    """diffuse_forward 原位修改：克隆后返回 bytes。"""
    d = bytearray(inp)
    diffuse_forward(d, seed, sk)
    return bytes(d)


def main():
    N = 64
    seed, sk, depth = 0x1234, 0xDEAD, 7
    print("=" * 72)
    print(f"加固后 pipeline (premix -> Wreath -> diffuse -> VM), N={N}")
    print("=" * 72)

    # 1) roundtrip 仍须通过
    data = bytes((i * 7) & 0xFF for i in range(N))
    c = lgv3_pipeline_obfuscate(data, seed, sk, depth)
    r = lgv3_pipeline_deobfuscate(c, seed, sk, depth)
    print(f"roundtrip: {'PASS' if r == data else 'FAIL'}")
    assert r == data

    # 2) 扩散：单字节扰动影响近全块
    or_pipe = lambda inp: lgv3_pipeline_obfuscate(bytes(inp), seed, sk, depth)
    counts = perturbation_map(or_pipe, N)
    mn, mx = min(counts), max(counts)
    print(f"单字节扰动影响字节数: min={mn}, max={mx} (N={N})")
    ok = mn >= N // 2
    print(f"[{'PASS' if ok else 'FAIL'}] 扩散达标 (min >= N/2)")

    # 3) 原攻击失效：sigma 定位要求恰好 1 个输出字节变化
    if mn == 1:
        print("[FAIL] 存在恰好 1 字节依赖，原攻击仍可能定位 σ")
        ok = False
    else:
        print(f"[PASS] 无 1 字节依赖 => σ 定位失败，原攻击失效 (min={mn})")

    # 4) 独立 diffuse 层自检
    d = bytearray(data)
    diffuse_forward(d, seed, sk)
    assert d != bytearray(data), "diffuse must change data"
    diffuse_inverse(d, seed, sk)
    assert bytes(d) == data, "diffuse roundtrip must recover"
    cts = perturbation_map(
        lambda inp: _diffuse_copy(inp, seed, sk), N
    )
    print(f"diffuse 层单字节扰动影响: min={min(cts)}, max={max(cts)}")
    assert min(cts) >= N // 2

    # 5) 多种子/会话/depth 下均失效
    for (s2, sk2, d2) in [(0xDEADBEEF, 0xBEEF, 3), (0x1, 0xCAFE, 1), (42, 7, 5)]:
        o2 = lambda inp, s=s2, k=sk2, d=d2: lgv3_pipeline_obfuscate(bytes(inp), s, k, d)
        c2 = perturbation_map(o2, N)
        mn2 = min(c2)
        assert mn2 >= N // 2, f"seed={s2:#x} 扩散不足 min={mn2}"
        print(f"  seed={s2:#x} sk={sk2:#x} d={d2}: min={mn2}/{N} PASS")

    print()
    print("结论: 全块扩散达标，单字节扰动无 1 字节依赖，原黑盒攻击失效。")
    return ok


if __name__ == "__main__":
    if main():
        print("ALL PASS")
