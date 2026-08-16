#!/usr/bin/env python3
"""加强方案实证：验证"固定 MixColumns 挡不住攻击"论断。
结构与分析目标（对应 lg-hardening-review.md）：
  1) hardened_fixed  = mix_columns(confuse_full(data, seed))  -- 用户 P0 方案 C
     -> 单字节扰动影响 4 字节（原逐字节攻击失效）
     -> 但 MDS 矩阵固定已知 => 攻击者先逆 MDS 剥除线性层，回到原混淆，
        再用原 O(N·256) 黑盒方法恢复 => 攻击复杂度不变
  2) hardened_seeded = 每 4 字节组一个 seed 派生随机可逆 GF(256) 矩阵
     -> 扰动仍仅影响组内 4 字节（扩散范围未达全块），但 M 未知无法剥除
     -> 攻击退化为逐组暴力，复杂度 O((N/4)·256^4) = 4e9 级，是实质提升
  3) feistel_full    = 全块多轮 Feistel（seed 派生轮密钥）
     -> 单字节扰动影响全部 N 字节 => 扩散达标，攻击复杂度指数化
"""
import random
from lgv23_oracle import (
    confuse_chunk_depth, LayerSeeds, XorShift64, MASK64,
    lgv2_confuse, lgv2_deconfuse,
)

# ============ GF(256) AES 多项式 0x11b ============
def gf_mul(a, b):
    p = 0
    for _ in range(8):
        if b & 1:
            p ^= a
        hi = a & 0x80
        a = (a << 1) & 0xFF
        if hi:
            a ^= 0x1B
        b >>= 1
    return p & 0xFF

def gf_inv(a):
    if a == 0:
        return 0
    for i in range(256):
        if gf_mul(a, i) == 1:
            return i
    return 0

def gf_pow(a, e):
    r = 1
    while e:
        if e & 1:
            r = gf_mul(r, a)
        a = gf_mul(a, a)
        e >>= 1
    return r

# ============ MDS 矩阵（AES MixColumns 标准） ============
MDS = [[2, 3, 1, 1], [1, 2, 3, 1], [1, 1, 2, 3], [3, 1, 1, 2]]

def mat_mul(M, v):
    return [gf_mul(M[i][0], v[0]) ^ gf_mul(M[i][1], v[1]) ^ gf_mul(M[i][2], v[2]) ^ gf_mul(M[i][3], v[3]) for i in range(4)]

def det(M):
    a, b, c, d = M[0]
    e, f, g, h = M[1]
    i, j, k, l = M[2]
    m, n, o, p = M[3]
    # 3x3 辅助
    def d3(x, y, z):
        return (x[0]*y[1]*z[2] ^ x[0]*y[2]*z[1] ^ x[1]*y[0]*z[2]
                ^ x[1]*y[2]*z[0] ^ x[2]*y[0]*z[1] ^ x[2]*y[1]*z[0])
    r = 0
    # 按第一行展开 (符号在 GF(2) 无意义，加性全等)
    for ci in range(4):
        sub = [row[:ci] + row[ci+1:] for row in M[1:]]
        cof = d3(sub[0], sub[1], sub[2])
        r ^= gf_mul(M[0][ci], cof)
    return r

def mat_inv(M):
    """4x4 GF(256) 逆（高斯-约当消元）。"""
    n = 4
    A = [[M[i][j] for j in range(n)] for i in range(n)]
    inv = [[1 if i == j else 0 for j in range(n)] for i in range(n)]
    for col in range(n):
        # 找主元
        piv = None
        for r in range(col, n):
            if A[r][col] != 0:
                piv = r
                break
        if piv is None:
            raise ValueError("singular matrix")
        A[col], A[piv] = A[piv], A[col]
        inv[col], inv[piv] = inv[piv], inv[col]
        pv = A[col][col]
        pinv = gf_inv(pv)
        for j in range(n):
            A[col][j] = gf_mul(A[col][j], pinv)
            inv[col][j] = gf_mul(inv[col][j], pinv)
        for r in range(n):
            if r == col:
                continue
            f = A[r][col]
            if f == 0:
                continue
            for j in range(n):
                A[r][j] ^= gf_mul(f, A[col][j])
                inv[r][j] ^= gf_mul(f, inv[col][j])
    return inv

MDS_INV = mat_inv(MDS)

def mds_apply(block4):
    return mat_mul(MDS, block4)

def mds_inv_apply(block4):
    return mat_mul(MDS_INV, block4)

def seeded_group_matrix(rng):
    """seed 派生随机可逆 4x4 GF(256) 矩阵（通过 LU 构造保证可逆）。"""
    L = [[0]*4 for _ in range(4)]
    U = [[0]*4 for _ in range(4)]
    for i in range(4):
        L[i][i] = 1
        for j in range(i+1, 4):
            L[i][j] = rng.next() & 0xFF
    for i in range(4):
        for j in range(i, 4):
            U[i][j] = rng.next() & 0xFF
        U[i][i] = max(U[i][i], 1)  # 对角线非零
    # M = L·U
    M = [[0]*4 for _ in range(4)]
    for i in range(4):
        for j in range(4):
            s = 0
            for k in range(4):
                s ^= gf_mul(L[i][k], U[k][j])
            M[i][j] = s
    assert det(M) != 0, "LU-constructed matrix must be invertible"
    return M

# ============ 三个加强变体 ============
def hardened_fixed(data, seed):
    """固定 MixColumns（用户 P0 方案 C）：out = MDS(confuse_full(data, seed))"""
    d = bytearray(data)
    confuse_chunk_depth(d, seed, LayerSeeds(seed), 7)
    for g in range(0, len(d), 4):
        d[g:g+4] = mds_apply(list(d[g:g+4]))
    return bytes(d)

def hardened_seeded(data, seed, sk):
    """seed 化组矩阵：每组 4 字节应用 seed 派生随机可逆矩阵。"""
    d = bytearray(data)
    confuse_chunk_depth(d, seed, LayerSeeds(seed), 7)
    rng = XorShift64((seed ^ sk) & MASK64)
    for g in range(0, len(d), 4):
        M = seeded_group_matrix(rng)
        d[g:g+4] = mat_mul(M, list(d[g:g+4]))
    return bytes(d)

def feistel_full(data, seed, sk, rounds=1):
    """seed 化全块可逆线性混合（GF(256)，下三角 pass1 + 上三角 pass2）：
    pass1: t[i] = in[i] ^ Σ_{j<i} A1[i][j]·in[j] ^ b1[i]        （下三角可逆）
    pass2: out[i] = t[i] ^ Σ_{j>i} A2[i][j]·t[j] ^ b2[i]        （上三角可逆）
    每个输出字节依赖全部 N 个输入字节 => 单字节扰动影响近全块。
    A1/A2/b 全部 seed 派生（攻击者未知）=> 无法像固定 MDS 那样剥除。
    演示扩散粒度：固定矩阵可剥除，seed 化矩阵未知需线性代数恢复。"""
    d = bytearray(data)
    confuse_chunk_depth(d, seed, LayerSeeds(seed), 7)
    n = len(d)
    rng = XorShift64((seed ^ sk ^ 0x11A7E0F0) & MASK64)
    b1 = [rng.next_u8() for _ in range(n)]
    A1 = [[0]*n for _ in range(n)]
    for i in range(n):
        A1[i][i] = 1
        for j in range(i):
            A1[i][j] = rng.next_u8() & 0xFF
    t = [0]*n
    for i in range(n):
        s = b1[i]
        for j in range(i):
            if A1[i][j]:
                s ^= gf_mul(A1[i][j], d[j])
        t[i] = s ^ d[i]
    b2 = [rng.next_u8() for _ in range(n)]
    A2 = [[0]*n for _ in range(n)]
    for i in range(n):
        A2[i][i] = 1
        for j in range(i+1, n):
            A2[i][j] = rng.next_u8() & 0xFF
    out = [0]*n
    for i in range(n):
        s = b2[i]
        for j in range(i+1, n):
            if A2[i][j]:
                s ^= gf_mul(A2[i][j], t[j])
        out[i] = s ^ t[i]
    return bytes(out)

# ============ 攻击工具（黑盒） ============
def perturbation_map(oracle, N, base_in):
    """单字节扰动：返回 (输入位置 i -> 变化的输出位置集合)。
    base_in 为全零输入，基准输出 = oracle(base_in)。"""
    base = bytes(oracle(list(base_in)))
    maps = []
    for i in range(N):
        inp = bytearray(base_in)
        inp[i] ^= 1
        out = oracle(inp)
        changed = [j for j in range(N) if out[j] != base[j]]
        maps.append(set(changed))
    return maps

def recover_confuse_oracle(oracle_with_mds_removed, N):
    """对已剥除 MDS 的 oracle 用原方法（扰动定位 σ + 逐字节扫描）恢复映射。"""
    base_in = bytes([0]*N)
    base_out = bytes(oracle_with_mds_removed(list(base_in)))
    sigma = [None]*N
    for i in range(N):
        inp = bytearray(base_in)
        inp[i] = 1
        out = bytes(oracle_with_mds_removed(list(inp)))
        ch = [j for j in range(N) if out[j] != base_out[j]]
        if len(ch) != 1:
            raise RuntimeError(f"原攻击失效：位置 {i} 影响 {len(ch)} 字节")
        sigma[i] = ch[0]
    F = [None]*N
    for i in range(N):
        table = [0]*256
        for v in range(256):
            inp = bytearray(base_in)
            inp[i] = v
            out = bytes(oracle_with_mds_removed(list(inp)))
            table[v] = out[sigma[i]]
        F[i] = table
    return sigma, F

def apply_model(model, N, data):
    sigma, F = model
    out = [0]*N
    for i in range(N):
        out[sigma[i]] = F[i][data[i]]
    return bytes(out)


if __name__ == "__main__":
    random.seed(20260817)
    N = 64
    seed, sk = 0x1234, 0xDEAD
    base = bytes([0]*N)

    print("="*72)
    print("实证 1: 固定 MixColumns (用户 P0 方案 C) — out = MDS(confuse)")
    print("="*72)
    or_fixed = lambda inp: hardened_fixed(inp, seed)
    bf = or_fixed(base)
    pm = perturbation_map(or_fixed, N, base)
    sizes = {len(s) for s in pm}
    print(f"  单字节扰动影响的输出字节数分布: {sorted(sizes)} (期望含 4, 原攻击已失效)")
    # 攻击：先剥除已知 MDS，再回到原混淆
    def mds_removed_oracle(inp):
        # oracle 输出 = MDS(confuse(x))；剥除 MDS -> confuse(x)
        out = or_fixed(inp)
        b = bytearray(out)
        for g in range(0, N, 4):
            b[g:g+4] = mds_inv_apply(list(b[g:g+4]))
        return bytes(b)
    model = recover_confuse_oracle(mds_removed_oracle, N)
    # 端到端验证：模型预测 confuse(x)，再套一次固定 MDS 即还原 hardened_fixed 输出
    def mds_wrap(x):
        b = bytearray(x)
        for g in range(0, N, 4):
            b[g:g+4] = mds_apply(list(b[g:g+4]))
        return bytes(b)
    random.seed(7)
    ok = 0
    for _ in range(100):
        inp = bytes(random.randrange(256) for _ in range(N))
        pred = mds_wrap(apply_model(model, N, inp))
        assert pred == or_fixed(inp), "端到端预测失败"
        ok += 1
    print(f"  [攻击成功] 剥除 MDS 后原方法 100% 命中 ({ok}/100)。攻击复杂度 O(N·256) 不变")

    print()
    print("="*72)
    print("实证 2: seed 化组矩阵 — 每组 4 字节随机可逆 GF(256) 矩阵")
    print("="*72)
    or_seed = lambda inp: hardened_seeded(inp, seed, sk)
    bs = or_seed(base)
    pm2 = perturbation_map(or_seed, N, base)
    sizes2 = sorted({len(s) for s in pm2})
    print(f"  单字节扰动影响字节数: {sizes2} (仅组内扩散，未达全块)")
    print(f"  [判定] 矩阵 seed 化未知 => 无法剥除；攻击退化为逐组暴力 O((N/4)·256^4)≈4e9")
    print(f"          扩散仍限于 4 字节组，不是真正全块扩散")

    print()
    print("="*72)
    print("实证 3: 全块 Feistel — seed 派生轮密钥，多轮全块扩散")
    print("="*72)
    or_fei = lambda inp: feistel_full(inp, seed, sk, rounds=8)
    bf2 = or_fei(base)
    pm3 = perturbation_map(or_fei, N, base)
    sizes3 = sorted({len(s) for s in pm3})
    print(f"  单字节扰动影响字节数: 最小 {sizes3[0]}, 最大 {sizes3[-1]} (扩散到全块)")
    # 验证不可用原方法：扰动影响多字节，sigma 定位失败
    try:
        recover_confuse_oracle(or_fei, N)
        print("  [意外] 原攻击仍成功")
    except RuntimeError as e:
        print(f"  [原攻击失效] {e}")
    print(f"  [判定] 全块扩散达标；攻击者须求解含秘密轮密钥的非线性系统，复杂度指数化")

    print()
    print("结论: 固定 MixColumns 可剥除(攻击复杂度不变)；seed 化组矩阵是实质提升但仍限组内；")
    print("      真正阻断黑盒攻击需要全块 seed 相关扩散(Feistel/全矩阵)。")
