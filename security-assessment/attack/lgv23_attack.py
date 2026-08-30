#!/usr/bin/env python3
"""黑盒攻击 LG v2.3 最复杂变体：confuse_full（premix+Wreath+KEM绑定）与 pipeline（+VM层）。
方法（与 v2.2.3 黑盒攻击相同，见 security-assessment/attack/lg_recover.js）：
  1) 单字节扰动：定位输入位置 i -> 输出位置 sigma(i)
  2) 逐字节扫描：重建每个位置的双射 F_i
  3) 验证：随机输入 oracle 输出 == 重建模型输出（100% 精度要求）
"""
import random
from lgv23_oracle import (
    lgv2_confuse_full, lgv2_deconfuse_full,
    lgv3_pipeline_obfuscate, lgv3_pipeline_deobfuscate,
    lgv2_confuse_ex, lgv2_deconfuse_ex,
    lgv3_confuse_mix, lgv3_deconfuse_mix,
    MASK64,
)


def attack(oracle, N, seed, session_key, depth, ss, label):
    """通用黑盒攻击。返回 (模型正确率, oracle 调用次数)。"""
    calls = 0
    # 基准：全零输入（黑盒约束：调用方只传字节数组）
    base_in = bytes([0]*N)
    base_out = bytes(oracle(list(base_in)))
    calls += 1

    # ---- 1) 单字节扰动定位 sigma ----
    sigma = [None]*N  # sigma[i] = 输出位置，映射来自输入位置 i
    used = set()
    for i in range(N):
        inp = bytearray(base_in)
        inp[i] = 1
        out = bytes(oracle(list(inp)))
        calls += 1
        changed = [j for j in range(N) if out[j] != base_out[j]]
        if len(changed) != 1:
            raise RuntimeError(f"位置 {i}: {len(changed)} 个字节变化，非逐字节映射!")
        sigma[i] = changed[0]
    assert len(set(sigma)) == N, f"sigma 非置换: {sorted(sigma)}"

    # ---- 2) 逐字节扫描重建 F_i ----
    F = [None]*N  # F[i] = 输入位置 i 的逐字节双射（256 项）
    for i in range(N):
        table = [0]*256
        for v in range(256):
            inp = bytearray(base_in)
            inp[i] = v
            out = bytes(oracle(list(inp)))
            calls += 1
            table[v] = out[sigma[i]]
        assert len(set(table)) == 256, f"位置 {i} 非双射"
        F[i] = table

    # ---- 3) 随机输入验证 ----
    random.seed(20260816)
    trials = 200
    for _ in range(trials):
        inp = bytearray(random.randrange(256) for _ in range(N))
        out = bytes(oracle(list(inp)))
        calls += 1
        model = [0]*N
        for i in range(N):
            model[sigma[i]] = F[i][inp[i]]
        if bytes(model) != out:
            raise RuntimeError(f"模型预测错误 @ {label}")
    print(f"[{label}] sigma 正确, 双射正确, 200 随机输入 100% 命中 | oracle 调用 {calls}")
    return True


def main():
    N = 64
    seed, sk, depth = 0x1234, 0xDEAD, 7
    ss = bytes([0x42]*32)

    # confuse_ex: 单层结合 session
    oracle_ex = lambda inp: lgv2_confuse_ex(bytes(inp), seed, sk, depth)
    attack(oracle_ex, N, seed, sk, depth, ss, "confuse_ex  N=64")

    # confuse_mix: premix + Wreath + postmix
    oracle_mix = lambda inp: lgv3_confuse_mix(bytes(inp), seed, sk, depth)
    attack(oracle_mix, N, seed, sk, depth, ss, "confuse_mix N=64")

    # confuse_full: premix + Wreath + KEM bind（最复杂）
    oracle_full = lambda inp: lgv2_confuse_full(bytes(inp), seed, sk, ss, depth)
    attack(oracle_full, N, seed, sk, depth, ss, "confuse_full N=64")

    # pipeline: premix + Wreath + VM 层（含 Shuffle/Xor/Sbox/Rot/Add/Swap/Mix/Rev）
    oracle_pipe = lambda inp: lgv3_pipeline_obfuscate(bytes(inp), seed, sk, depth)
    attack(oracle_pipe, N, seed, sk, depth, ss, "pipeline     N=64")

    # 换一组参数再测 pipeline（验证 seed/session/depth 无关性）
    for (s2, sk2, d2) in [(0xDEADBEEF, 0xBEEF, 3), (0x1, 0xCAFE, 1)]:
        oracle_p2 = lambda inp, s=s2, k=sk2, d=d2: lgv3_pipeline_obfuscate(bytes(inp), s, k, d)
        attack(oracle_p2, N, s2, sk2, d2, ss, f"pipeline     N=64 seed={s2:#x} sk={sk2:#x} d={d2}")

    # N=16 短块（验证长度无关）
    for n in (16, 128):
        sk2 = 0xBEEF; d2 = 5
        oracle_p3 = lambda inp, s=seed, k=sk2, d=d2: lgv3_pipeline_obfuscate(bytes(inp), s, k, d)
        attack(oracle_p3, n, seed, sk2, d2, ss, f"pipeline     N={n}")


if __name__ == "__main__":
    main()
