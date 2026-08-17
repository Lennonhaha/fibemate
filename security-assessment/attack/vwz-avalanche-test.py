"""
VWZ 雪崩实验：原始 rank-1 VWZ vs 混合张量修复版。

测量内容：
  1. target 雪崩：消息 1 bit 翻转 → hash_to_sparse_target 变化比例
  2. 签名结构雪崩：消息 1 bit 翻转 → (w2, w3) 元素变化比例

两份 oracle 均为 Python 复刻：
  - 混合张量修复版：与 Rust WASM sign() 输出字节级一致（已验证）
  - 原始 rank-1 版：git 19c8940 的 solve_preimage_sparse（分区 + P3 乘积 + Lagrange）
"""
import hashlib, struct, sys

Q = 3329

def inv(a): return pow(a, Q-2, Q)
def add(a,b): return (a+b) % Q
def sub(a,b): return (a-b) % Q
def mul(a,b): return (a*b) % Q

def vand(lam, m):
    v = [1]*m
    for j in range(1,m): v[j] = mul(v[j-1], lam)
    return v

def dot(a,b):
    return sum(x*y for x,y in zip(a,b)) % Q

def mat_vec(A, x):
    return [dot(r,x) for r in A]

def mat_t_vec(A, x):
    ncols = len(A[0])
    return [sum(A[i][j]*x[i] for i in range(len(A))) % Q for j in range(ncols)]

def transpose(A):
    return [[A[r][c] for r in range(len(A))] for c in range(len(A[0]))]

def mat_mul(A,B):
    n = len(A); m = len(B[0]); p = len(B)
    return [[sum(A[i][k]*B[k][j] for k in range(p)) % Q for j in range(m)] for i in range(n)]

def mat_inv(A):
    n = len(A)
    aug = [A[i][:] + [1 if i==j else 0 for j in range(n)] for i in range(n)]
    for c in range(n):
        p = next((r for r in range(c,n) if aug[r][c]!=0), None)
        if p is None: return None
        aug[c], aug[p] = aug[p], aug[c]
        iv = inv(aug[c][c])
        for j in range(2*n): aug[c][j] = mul(aug[c][j], iv)
        for r in range(n):
            if r!=c and aug[r][c]!=0:
                f = aug[r][c]
                for j in range(2*n): aug[r][j] = sub(aug[r][j], mul(f, aug[c][j]))
    return [row[n:] for row in aug]

def rref_and_ns(rows):
    n = len(rows)
    if n == 0: return []
    m = len(rows[0])
    mat = [r[:] for r in rows]
    pivot_row = []
    r = 0
    for c in range(m):
        p = next((rr for rr in range(r, n) if mat[rr][c] != 0), None)
        if p is None: continue
        mat[r], mat[p] = mat[p], mat[r]
        iv = inv(mat[r][c])
        for j in range(m): mat[r][j] = mul(mat[r][j], iv)
        for rr in range(n):
            if rr != r and mat[rr][c] != 0:
                f = mat[rr][c]
                for j in range(m): mat[rr][j] = sub(mat[rr][j], mul(f, mat[r][j]))
        pivot_row.append((c, r))
        r += 1
        if r == n: break
    piv_cols = set(pc for pc, _ in pivot_row)
    free = [c for c in range(m) if c not in piv_cols]
    basis = []
    for fc in free:
        vec = [0]*m
        vec[fc] = 1
        for pc, rr in pivot_row:
            vec[pc] = (-mat[rr][fc]) % Q
        basis.append(vec)
    return basis

def solve_linear(a, b):
    n = len(a)
    if n == 0: return []
    m = len(a[0])
    mat = [a[r][:] + [b[r]] for r in range(n)]
    piv = []
    r = 0
    for c in range(m):
        p = next((rr for rr in range(r, n) if mat[rr][c] != 0), None)
        if p is None: continue
        mat[r], mat[p] = mat[p], mat[r]
        iv = inv(mat[r][c])
        for j in range(m+1): mat[r][j] = mul(mat[r][j], iv)
        for rr in range(n):
            if rr != r and mat[rr][c] != 0:
                f = mat[rr][c]
                for j in range(m+1): mat[rr][j] = sub(mat[rr][j], mul(f, mat[r][j]))
        piv.append(c)
        r += 1
        if r == n: break
    for rr in range(n):
        if all(v==0 for v in mat[rr][:m]) and mat[rr][m] != 0: return None
    sol = [0]*m
    for i, c in enumerate(piv): sol[c] = mat[i][m]
    return sol

def lagrange_interpolate(xs, ys):
    n = len(xs)
    m_coeffs = [1]
    for xm in xs:
        neg_x = 0 if xm == 0 else Q - xm
        new_m = [0]*(len(m_coeffs)+1)
        for i, c in enumerate(m_coeffs):
            new_m[i] = add(new_m[i], mul(c, neg_x))
            new_m[i+1] = add(new_m[i+1], c)
        m_coeffs = new_m
    m_n = m_coeffs[n]
    denoms = [1]*n
    for j in range(n):
        for mm in range(n):
            if mm == j: continue
            denoms[j] = mul(denoms[j], sub(xs[j], xs[mm]))
    result = [0]*n
    for j in range(n):
        q = [0]*n
        q[n-1] = m_n
        for i in range(n-1, 0, -1):
            q[i-1] = add(m_coeffs[i], mul(q[i], xs[j]))
        inv_denom = inv(denoms[j])
        scale = mul(ys[j], inv_denom)
        for i in range(n):
            result[i] = add(result[i], mul(q[i], scale))
    return result

# ================= SHAKE-256 hash → sparse target =================

def hash_to_sparse_target(msg, k, n):
    weight = k + 1
    xof = hashlib.shake_256(msg)
    xof_bytes = xof.digest(128)
    def u16(b): return (b[0]<<8) | b[1]
    positions = list(range(n))
    for i in range(weight):
        if 2*i+2 > len(xof_bytes):
            xof2 = hashlib.shake_256(xof_bytes + msg)
            xof_bytes = xof2.digest(128)
        rand_val = u16(xof_bytes[2*i:2*i+2])
        j = i + (rand_val % (n - i))
        positions[i], positions[j] = positions[j], positions[i]
    selected = sorted(positions[:weight])
    xof2 = hashlib.shake_256(xof_bytes + msg)
    xof_bytes2 = xof2.digest(128)
    target = [0]*n
    for pos, idx in enumerate(selected):
        if 2*pos+2 > len(xof_bytes2):
            xof3 = hashlib.shake_256(xof_bytes2 + msg)
            xof_bytes2 = xof3.digest(128)
        val = u16(xof_bytes2[2*pos:2*pos+2]) % (Q-1) + 1
        target[idx] = val
    return target

# ================= Deterministic RNG (同 Rust SeedRng/LCRNG) =================

MASK64 = (1<<64)-1
def lcrng_next(state):
    return (state * 6364136223846793005 + 1442695040888963407) & MASK64

class SeedRng:
    def __init__(self, seed):
        self.state = (seed + 0xDEADBEEF_CAFEBABE) & MASK64
    def next_u64(self):
        self.state = lcrng_next(self.state)
        return self.state
    def next_u16_mod(self, modulus):
        return (self.next_u64() % 0x100000000) % modulus
    def randrange(self, lo, hi):
        return lo + self.next_u16_mod(hi - lo)

def sample_seed_mixed(keygen_seed, target):
    h = (keygen_seed + 0x9E3779B97F4A7C15) & MASK64
    for t in target:
        h = (h * 0x5851F42D4C957F2D + t + 0x14057B7EF767814F) & MASK64
    return h

def distinct_lam(n, rng):
    while True:
        ls = [rng.randrange(1, Q) for _ in range(n)]
        if len(set(ls)) == n: return ls

def random_invertible_matrix(n, rng):
    mat = [[0]*n for _ in range(n)]
    for i in range(n): mat[i][i] = 1
    for _ in range(n*n):
        i = rng.next_u16_mod(n)
        j = rng.next_u16_mod(n)
        if i == j: continue
        factor = rng.randrange(1, Q)
        for c in range(n):
            mat[i][c] = (mat[i][c] + factor*mat[j][c]) % Q
    return mat

# ================= 混合张量修复版 =================

def gen_sk_mixed(k, seed):
    rng = SeedRng(seed)
    n = 2*k+2; m = 2*k+1
    la = distinct_lam(n, rng)
    lb = distinct_lam(n, rng)
    lc = distinct_lam(n, rng)
    x2a = random_invertible_matrix(m, rng)
    x2b = random_invertible_matrix(m, rng)
    x3a = random_invertible_matrix(m, rng)
    x3b = random_invertible_matrix(m, rng)
    x2a_inv = mat_inv(x2a)
    x3a_inv = mat_inv(x3a)
    m2 = mat_mul(x2b, x2a_inv)
    m3 = mat_mul(x3b, x3a_inv)
    x1 = [rng.randrange(1, Q) for _ in range(n)]
    return dict(k=k, n=n, m=m, la=la, lb=lb, lc=lc, x2a=x2a, x2b=x2b,
                x3a=x3a, x3b=x3b, x2a_inv=x2a_inv, x3a_inv=x3a_inv, m2=m2, m3=m3, x1=x1, seed=seed)

def sample_mixed(sk, target):
    m, n = sk['m'], sk['n']
    adapted = [mul(target[i1], inv(sk['x1'][i1])) for i1 in range(n)]
    z = [i for i in range(n) if adapted[i] == 0]
    s = [i for i in range(n) if adapted[i] != 0]
    if len(z) < 2: return None
    m3t = transpose(sk['m3']); m2t = transpose(sk['m2'])
    zl = len(z)
    rng = SeedRng(sample_seed_mixed(sk['seed'], target))
    for a in range(1, zl):
        za = z[:a]; zb = z[a-1:]
        if len(za) + len(zb) != zl + 1: continue
        rows3 = []
        for i1 in za: rows3.append(vand(sk['lc'][i1], m))
        for i1 in zb: rows3.append(mat_vec(m3t, vand(sk['lc'][i1], m)))
        ns3 = rref_and_ns(rows3)
        if not ns3: continue
        z_only_a = [i for i in za if i not in zb]
        z_only_b = [i for i in zb if i not in za]
        for _attempt in range(400):
            u3 = [0]*m
            nonzero = False
            for basis in ns3:
                c = rng.randrange(1, Q)
                if c != 0: nonzero = True
                for j in range(m): u3[j] = add(u3[j], mul(c, basis[j]))
            if not nonzero or all(x == 0 for x in u3): continue
            m3u3 = mat_vec(sk['m3'], u3)
            p3a_s = []; p3b_s = []
            ok = True
            for i1 in s:
                vc = vand(sk['lc'][i1], m)
                pa = dot(vc, u3); pb = dot(vc, m3u3)
                if pa == 0 or pb == 0: ok = False; break
                p3a_s.append(pa); p3b_s.append(pb)
            if not ok: continue
            rows2 = []; b2 = []
            for idx, i1 in enumerate(s):
                va = vand(sk['la'][i1], m); vb = vand(sk['lb'][i1], m)
                m2t_vb = mat_vec(m2t, vb)
                row = [add(mul(va[j], p3a_s[idx]), mul(m2t_vb[j], p3b_s[idx])) for j in range(m)]
                rows2.append(row); b2.append(adapted[i1])
            for i1 in z_only_a:
                rows2.append(mat_vec(m2t, vand(sk['lb'][i1], m))); b2.append(0)
            for i1 in z_only_b:
                rows2.append(vand(sk['la'][i1], m)); b2.append(0)
            u2 = solve_linear(rows2, b2)
            if u2 is None: continue
            w2 = mat_vec(sk['x2a_inv'], u2)
            w3 = mat_vec(sk['x3a_inv'], u3)
            return (w2, w3)
    return None

# ================= 原始 rank-1 版（git 19c8940） =================

def random_vwz_rank1(k, rng):
    n = 2*k + 1
    while True:
        col2 = [rng.randrange(1, Q) for _ in range(n)]
        col3 = [rng.randrange(1, Q) for _ in range(n)]
        if len(set(col2)) == n and len(set(col3)) == n:
            return [ [col2[i], col3[i]] for i in range(n) ]

def gen_sk_rank1(k, seed):
    rng = SeedRng(seed)
    n = 2*k + 1; m = k + 1
    lambda_ = random_vwz_rank1(k, rng)
    x1 = [rng.randrange(1, Q) for _ in range(n)]
    x2 = random_invertible_matrix(m, rng)
    x3 = random_invertible_matrix(m, rng)
    x2_inv = mat_inv(x2)
    x3_inv = mat_inv(x3)
    return dict(k=k, n=n, m=m, lambda_=lambda_, x1=x1, x2=x2, x3=x3, x2_inv=x2_inv, x3_inv=x3_inv)

def solve_preimage_sparse_rank1(tensor, target):
    """solve_preimage_sparse：rank-1 张量（仅用 lambda 两列），确定性。"""
    k = tensor['k']; k1 = tensor['k1']
    n = k1 + 1
    m = k + 1
    nonzero = [i for i in range(n) if target[i] != 0]
    if len(nonzero) > m: return None
    target_is_zero = (len(nonzero) == 0)
    zeros = [i for i in range(n) if target[i] == 0]
    pad_count = m - len(nonzero)
    pad = zeros[:pad_count]
    i2 = sorted(nonzero + pad)
    i2_set = set(i2)
    i3 = [i for i in range(n) if i not in i2_set]
    if len(i2) != m or len(i3) != k: return None
    w3 = [1]
    for i1 in i3:
        lam3 = tensor['lambda'][i1][1]
        neg = 0 if lam3 == 0 else Q - lam3
        new_w3 = [0]*(len(w3)+1)
        for i, c in enumerate(w3):
            new_w3[i] = add(new_w3[i], mul(c, neg))
            new_w3[i+1] = add(new_w3[i+1], c)
        w3 = new_w3
    w3 = w3[:m] + [0]*(m - len(w3)) if len(w3) < m else w3[:m]
    xs_i2 = []; adjusted_y = []
    for i1 in i2:
        lam3 = tensor['lambda'][i1][1]
        p3_val = 0
        for c in reversed(w3):
            p3_val = mul(p3_val, lam3)
            p3_val = add(p3_val, c)
        if p3_val == 0: return None
        adjusted_y.append(mul(target[i1], inv(p3_val)))
        xs_i2.append(tensor['lambda'][i1][0])
    if target_is_zero:
        w2 = [0]*m
    else:
        w2 = lagrange_interpolate(xs_i2, adjusted_y)
    return (w2, w3)

def sample_rank1(sk, target):
    n = sk['n']
    adapted = [mul(target[i], inv(sk['x1'][i])) for i in range(n)]
    tensor = {'k': sk['k'], 'k1': 2*sk['k'], 'lambda': sk['lambda_']}
    res = solve_preimage_sparse_rank1(tensor, adapted)
    if res is None: return None
    w2p, w3p = res
    w2 = mat_vec(sk['x2_inv'], w2p)
    w3 = mat_vec(sk['x3_inv'], w3p)
    return (w2, w3)

# ================= 公共张量求值（用于验证） =================

def tensor_eval_rank1(sk, w2, w3):
    """验签：public_tensor_eval(ψ, w2, w3)。ψ[i1]=x1[i1]·((X2ᵀu)⊗(X3ᵀv))。
    w2/w3 为经 x2_inv/x3_inv 变换后的签名向量。"""
    n = sk['n']; m = sk['m']
    lam = sk['lambda_']
    x2t = transpose(sk['x2'])
    x3t = transpose(sk['x3'])
    res = []
    for i1 in range(n):
        u = vand(lam[i1][0], m)
        v = vand(lam[i1][1], m)
        r = mat_vec(x2t, u)
        s = mat_vec(x3t, v)
        # Σ_{i2,i3} ψ[i1][i2][i3]·w2[i2]·w3[i3]
        total = 0
        for i2 in range(m):
            for i3 in range(m):
                total += mul(mul(sk['x1'][i1], mul(r[i2], s[i3])), mul(w2[i2], w3[i3]))
        res.append(total % Q)
    return res

def public_eval_mixed(sk, w2, w3):
    """修复版验签：公开 ψ[i1][i2][i3] = x1[i1]·((X2aᵀu)⊗(X3aᵀv) + (X2bᵀu)⊗(X3bᵀv))"""
    m = sk['m']; n = sk['n']
    res = []
    for i1 in range(n):
        ua = vand(sk['la'][i1], m); va = vand(sk['lc'][i1], m)
        ub = vand(sk['lb'][i1], m); vb = vand(sk['lc'][i1], m)
        r = mat_t_vec(sk['x2a'], ua); s = mat_t_vec(sk['x3a'], va)
        r2 = mat_t_vec(sk['x2b'], ub); s2 = mat_t_vec(sk['x3b'], vb)
        total = 0
        for i2 in range(m):
            for i3 in range(m):
                a = mul(r[i2], s[i3]); b = mul(r2[i2], s2[i3])
                total += mul(w2[i2], mul(w3[i3], mul(sk['x1'][i1], add(a, b))))
        res.append(total % Q)
    return res

# ================= 雪崩测量 =================

def diff_ratio(a, b):
    return sum(1 for x, y in zip(a, b) if x != y) / max(1, len(a))

def flip_bit(msg, bitpos):
    m = bytearray(msg)
    m[bitpos >> 3] ^= (1 << (bitpos & 7))
    return bytes(m)

def run_avalanche(k, seed, ntrials, nbits):
    """对修复版与原始版各测 ntrials 条消息 × nbits 个 bit 翻转。"""
    skm = gen_sk_mixed(k, seed)
    skr = gen_sk_rank1(k, seed)

    stat = {
        'mixed': {'target': [], 'w2': [], 'w3': [], 'sig': []},
        'rank1': {'target': [], 'w2': [], 'w3': [], 'sig': []},
    }
    fails = {'mixed': 0, 'rank1': 0}

    rng = SeedRng(seed ^ 0xA11CE)
    for trial in range(ntrials):
        msg = bytes(rng.randrange(0, 256) for _ in range(16))
        for b in range(nbits):
            msg2 = flip_bit(msg, b)

            tm = hash_to_sparse_target(msg, k, skm['n'])
            tm2 = hash_to_sparse_target(msg2, k, skm['n'])
            sm = sample_mixed(skm, tm)
            sm2 = sample_mixed(skm, tm2)
            if sm is None or sm2 is None:
                fails['mixed'] += 1; continue
            stat['mixed']['target'].append(diff_ratio(tm, tm2))
            stat['mixed']['w2'].append(diff_ratio(sm[0], sm2[0]))
            stat['mixed']['w3'].append(diff_ratio(sm[1], sm2[1]))
            stat['mixed']['sig'].append((diff_ratio(sm[0], sm2[0]) + diff_ratio(sm[1], sm2[1]))/2)

            tr = hash_to_sparse_target(msg, k, skr['n'])
            tr2 = hash_to_sparse_target(msg2, k, skr['n'])
            sr = sample_rank1(skr, tr)
            sr2 = sample_rank1(skr, tr2)
            if sr is None or sr2 is None:
                fails['rank1'] += 1; continue
            stat['rank1']['target'].append(diff_ratio(tr, tr2))
            stat['rank1']['w2'].append(diff_ratio(sr[0], sr2[0]))
            stat['rank1']['w3'].append(diff_ratio(sr[1], sr2[1]))
            stat['rank1']['sig'].append((diff_ratio(sr[0], sr2[0]) + diff_ratio(sr[1], sr2[1]))/2)

    def report(name, d):
        v = d[name]
        if not v: return 'n/a'
        avg = sum(v)/len(v)
        mn = min(v); mx = max(v)
        return f'{avg*100:6.2f}%  [{mn*100:.2f}%..{mx*100:.2f}%]  n={len(v)}'

    print(f'k={k}, seed={seed}, trials={ntrials}, bits/msg={nbits}')
    print(f'{"metric":<10} {"mixed-fix":<32} {"rank1-orig":<32}')
    for metric in ['target', 'w2', 'w3', 'sig']:
        print(f'{metric:<10} {report(metric, stat["mixed"]):<32} {report(metric, stat["rank1"]):<32}')
    print(f'{"sample-fail":<10} {"mixed="+str(fails["mixed"]):<32} {"rank1="+str(fails["rank1"]):<32}')

# ================= 自检（与 Rust WASM 字节级一致） =================

def selfcheck(k=8, seed=12345):
    skm = gen_sk_mixed(k, seed)
    msg = b'msgA'
    target = hash_to_sparse_target(msg, k, skm['n'])
    sig = sample_mixed(skm, target)
    if sig is None:
        print('SELFCHECK: sample fail'); return False
    # 与已记录 WASM serialize 字节对比（k=8, seed=12345, msg=msgA）
    wasm_bytes = [8,222,1,69,10,63,5,196,2,221,4,77,11,19,5,99,4,226,9,226,11,106,7,
                  147,2,213,0,22,10,225,5,235,1,110,5,26,12,57,12,36,11,76,11,186,7,
                  211,0,213,12,144,5,1,3,196,1,71,8,214,5,10,5,35,8,59,11,89,10,167,6]
    buf = bytes([k])
    for v in sig[0]: buf += struct.pack('<H', v)
    for v in sig[1]: buf += struct.pack('<H', v)
    ok = list(buf) == wasm_bytes
    print(f'SELFCHECK mixed-vs-WASM: {"PASS" if ok else "FAIL"}')
    # 验签 roundtrip
    ev = public_eval_mixed(skm, sig[0], sig[1])
    print(f'SELFCHECK mixed verify: {"PASS" if ev == target else "FAIL"}')
    # rank1 roundtrip
    skr = gen_sk_rank1(k, 999)
    tr = hash_to_sparse_target(b'rank1test', k, skr['n'])
    sr = sample_rank1(skr, tr)
    evr = tensor_eval_rank1(skr, sr[0], sr[1])
    print(f'SELFCHECK rank1 verify: {"PASS" if evr == tr else "FAIL"}')
    return ok

if __name__ == '__main__':
    selfcheck()
    print()
    if len(sys.argv) > 1:
        k = int(sys.argv[1])
    else:
        k = 8
    ntrials = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    nbits = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    run_avalanche(k, 424242, ntrials, nbits)
