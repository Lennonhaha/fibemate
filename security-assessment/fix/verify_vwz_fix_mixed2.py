import random, sys
Q = 3329

def inv(a): return pow(a, Q-2, Q)

def mat_vec(M, v):
    return [sum(M[r][j]*v[j] for j in range(len(v))) % Q for r in range(len(M))]

def mat_inv(M):
    n = len(M)
    A = [r[:] + [1 if i == j else 0 for j in range(n)] for i, r in enumerate(M)]
    for c in range(n):
        p = next((r for r in range(c, n) if A[r][c] % Q), None)
        if p is None: return None
        A[c], A[p] = A[p], A[c]
        iv = inv(A[c][c]); A[c] = [(x*iv) % Q for x in A[c]]
        for r in range(n):
            if r != c and A[r][c] % Q:
                f = A[r][c]
                A[r] = [(A[r][j] - f*A[c][j]) % Q for j in range(2*n)]
    return [row[n:] for row in A]

def rref_and_ns(rows):
    n = len(rows); m = len(rows[0]) if n else 0
    M = [rows[r][:] for r in range(n)]
    pivot_row = {}
    r = 0
    for c in range(m):
        p = next((rr for rr in range(r, n) if M[rr][c] % Q), None)
        if p is None: continue
        M[r], M[p] = M[p], M[r]
        iv = inv(M[r][c]); M[r] = [(x*iv) % Q for x in M[r]]
        for rr in range(n):
            if rr != r and M[rr][c] % Q:
                f = M[rr][c]
                M[rr] = [(M[rr][j]-f*M[r][j]) % Q for j in range(m)]
        pivot_row[c] = r
        r += 1
        if r == n: break
    free = [c for c in range(m) if c not in pivot_row]
    basis = []
    for fc in free:
        vec = [0]*m; vec[fc] = 1
        for pc, rr in pivot_row.items():
            vec[pc] = (-M[rr][fc]) % Q
        basis.append(vec)
    return basis

def solve(A, b):
    n = len(A); m = len(A[0]) if n else 0
    M = [A[r][:] + [b[r]] for r in range(n)]
    piv = []; r = 0
    for c in range(m):
        p = next((rr for rr in range(r, n) if M[rr][c] % Q), None)
        if p is None: continue
        M[r], M[p] = M[p], M[r]
        iv = inv(M[r][c]); M[r] = [(x*iv) % Q for x in M[r]]
        for rr in range(n):
            if rr != r and M[rr][c] % Q:
                f = M[rr][c]
                M[rr] = [(M[rr][j] - f*M[r][j]) % Q for j in range(m+1)]
        piv.append(c); r += 1
        if r == n: break
    for rr in range(n):
        if all(M[rr][j] % Q == 0 for j in range(m)) and M[rr][m] % Q:
            return None
    sol = [0]*m
    for rr, pc in enumerate(piv): sol[pc] = M[rr][m] % Q
    return sol

def rand_invertible(m):
    while True:
        M = [[random.randrange(Q) for _ in range(m)] for _ in range(m)]
        if mat_inv(M) is not None: return M

def vand(lam, m): return [pow(lam, j, Q) for j in range(m)]

def distinct_lam(n):
    while True:
        ls = [random.randrange(1, Q) for _ in range(n)]
        if len(set(ls)) == n: return ls

def gen_sk(k):
    m = 2*k+1; n = 2*k+2
    la, lb, lc = distinct_lam(n), distinct_lam(n), distinct_lam(n)
    X2a, X2b = rand_invertible(m), rand_invertible(m)
    X3a, X3b = rand_invertible(m), rand_invertible(m)
    x1 = [random.randrange(1, Q) for _ in range(n)]
    X2ai, X3ai = mat_inv(X2a), mat_inv(X3a)
    M2 = [[sum(X2b[i][t]*X2ai[t][j] for t in range(m)) % Q for j in range(m)] for i in range(m)]
    M3 = [[sum(X3b[i][t]*X3ai[t][j] for t in range(m)) % Q for j in range(m)] for i in range(m)]
    return dict(m=m, n=n, la=la, lb=lb, lc=lc, X2a=X2a, X2b=X2b, X3a=X3a, X3b=X3b,
                x1=x1, X2ai=X2ai, X3ai=X3ai, M2=M2, M3=M3)

def build_pk(sk):
    m, n = sk['m'], sk['n']
    pk = []
    for i1 in range(n):
        ua = vand(sk['la'][i1], m); va = vand(sk['lc'][i1], m)
        ub = vand(sk['lb'][i1], m); vb = vand(sk['lc'][i1], m)
        r = [sum(sk['X2a'][p][j]*ua[p] for p in range(m)) % Q for j in range(m)]
        s = [sum(sk['X3a'][p][j]*va[p] for p in range(m)) % Q for j in range(m)]
        A = [[r[j2]*s[j3] % Q for j3 in range(m)] for j2 in range(m)]
        r2 = [sum(sk['X2b'][p][j]*ub[p] for p in range(m)) % Q for j in range(m)]
        s2 = [sum(sk['X3b'][p][j]*vb[p] for p in range(m)) % Q for j in range(m)]
        B = [[r2[j2]*s2[j3] % Q for j3 in range(m)] for j2 in range(m)]
        slice_ = [[sk['x1'][i1]*(A[r][c] + B[r][c]) % Q for c in range(m)] for r in range(m)]
        pk.append(slice_)
    return pk

def public_eval(pk, w2, w3):
    n = len(pk); m = len(w2)
    return [sum(pk[i1][j2][j3]*w2[j2]*w3[j3]
                for j2 in range(m) for j3 in range(m)) % Q for i1 in range(n)]

def sample(sk, target):
    m, n = sk['m'], sk['n']
    x1i = [inv(x) for x in sk['x1']]
    adapted = [(x1i[i1]*target[i1]) % Q for i1 in range(n)]
    Z = [i for i in range(n) if adapted[i] == 0]
    S = [i for i in range(n) if adapted[i] != 0]
    if len(Z) + len(S) != n: return None, 'sparsity'
    M3T = [[sk['M3'][r][c] for r in range(m)] for c in range(m)]
    M2T = [[sk['M2'][r][c] for r in range(m)] for c in range(m)]
    # 覆盖策略: Za ∪ Zb = Z, |Za|+|Zb| = k+2, |Za∩Zb| = 1
    # 即 a+b = k+2, c=1; u3 约束 k+2 ≤ 2k, u2 约束 k+1+k = m(方阵)
    Zl = len(Z)
    if Zl < 2: return None, 'sparsity'
    best = None
    for a in range(1, Zl):
        if a + (Zl - (a-1)) != Zl + 1: continue   # |Za|+|Zb| = Zl+1 约束
        b = Zl - (a-1)
        Za = Z[:a]
        Zb = Z[a-1:]
        if len(Za)+len(Zb) != Zl + 1: continue
        rows3 = []
        for i1 in Za: rows3.append(vand(sk['lc'][i1], m))
        for i1 in Zb: rows3.append(mat_vec(M3T, vand(sk['lc'][i1], m)))
        ns3 = rref_and_ns(rows3)
        if not ns3: continue
        Z_only_a = [i for i in Za if i not in Zb]
        Z_only_b = [i for i in Zb if i not in Za]
        for attempt in range(400):
            coef = [random.randrange(1, Q) for _ in ns3]
            u3 = [(sum(ns3[i][j]*coef[i] for i in range(len(ns3)))) % Q for j in range(m)]
            if all(x == 0 for x in u3): continue
            M3u3 = mat_vec(sk['M3'], u3)
            p3a = {i1: sum(u3[j]*pow(sk['lc'][i1], j, Q) % Q for j in range(m)) % Q for i1 in range(n)}
            p3b = {i1: sum(M3u3[j]*pow(sk['lc'][i1], j, Q) % Q for j in range(m)) % Q for i1 in range(n)}
            if not all(p3a[i1] != 0 and p3b[i1] != 0 for i1 in S): continue
            rows2 = []; b2 = []
            for i1 in S:
                va = vand(sk['la'][i1], m); vb = vand(sk['lb'][i1], m)
                row = [va[j]*p3a[i1] % Q for j in range(m)]
                M2T_vb = mat_vec(M2T, vb)
                row = [(row[j] + M2T_vb[j]*p3b[i1]) % Q for j in range(m)]
                rows2.append(row); b2.append(adapted[i1] % Q)
            for i1 in Z_only_a:
                rows2.append(mat_vec(M2T, vand(sk['lb'][i1], m))); b2.append(0)
            for i1 in Z_only_b:
                rows2.append(vand(sk['la'][i1], m)); b2.append(0)
            u2 = solve(rows2, b2)
            if u2 is None: continue
            w2 = mat_vec(sk['X2ai'], u2)
            w3 = mat_vec(sk['X3ai'], u3)
            return (w2, w3), 'ok'
    return None, 'no sample found'

def attack_fixed_w2(pk, target):
    """攻击者思路: 随机/任意 w2, 解 w3 线性系统 (n x m 超定)"""
    n = len(pk); m = len(pk[0])
    w2 = [random.randrange(Q) for _ in range(m)]
    R = [[sum(pk[i1][j2][j3]*w2[j2] for j2 in range(m)) % Q for j3 in range(m)] for i1 in range(n)]
    # n x m, 超定 (n=m+1); 用最小二乘无法, 直接检查 target 是否在列空间(解前 m 个方程再验证)
    w3 = solve(R[:m], target[:m])
    if w3 is None: return None
    res = public_eval(pk, w2, w3)
    return (w2, w3) if res == target else None

def attack_rank1(data, target, k):
    n = len(data); m = len(data[0])
    u = []; v = []
    for i1 in range(n):
        psi = data[i1]
        l0 = next((l for l in range(m) if any(psi[j][l] % Q for j in range(m))), None)
        if l0 is None: return None, 'no col'
        uu = [psi[j][l0] % Q for j in range(m)]
        j0 = next((j for j in range(m) if uu[j] != 0), None)
        if j0 is None: return None, 'u zero'
        iv = inv(uu[j0])
        vv = [psi[j0][l] % Q*iv % Q for l in range(m)]
        u.append(uu); v.append(vv)
    Z = [i for i in range(n) if target[i] == 0]
    S = [i for i in range(n) if target[i] != 0]
    w2 = solve([u[i1] for i1 in Z], [0]*len(Z))
    if w2 is None or all(x == 0 for x in w2): return None, 'w2 null'
    d = {i1: sum(u[i1][j]*w2[j] for j in range(m)) % Q for i1 in S}
    if any(d[i1] == 0 for i1 in S): return None, 'zero on S'
    rows = [v[i1] for i1 in S]
    need = [target[i1]*inv(d[i1]) % Q for i1 in S]
    w3 = solve(rows, need)
    if w3 is None: return None, 'w3'
    result = public_eval(data, w2, w3)
    return (w2, w3, result) if result == target else (None, 'verify fail')

if __name__ == '__main__':
    random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
    for k in (2, 4, 8, 16):
        sk = gen_sk(k); pk = build_pk(sk)
        n, m = sk['n'], sk['m']
        ok = 0; a1 = 0; a2 = 0; total = 30
        for trial in range(total):
            target = [0]*n
            nz = random.sample(range(n), k+1)
            for idx in nz: target[idx] = random.randrange(1, Q)
            res, msg = sample(sk, target)
            if res is None: print(f'k={k} t{trial}: SAMPLE FAIL'); continue
            w2, w3 = res
            if public_eval(pk, w2, w3) == target: ok += 1
            else: print(f'k={k} t{trial}: VERIFY FAIL')
            if attack_rank1(pk, target, k)[0] is not None: a1 += 1
            if attack_fixed_w2(pk, target) is not None: a2 += 1
        print(f'k={k}(n={n},m={m}): 验签 {ok}/{total}, rank1攻击 {a1}, fixed-w2攻击 {a2}')
