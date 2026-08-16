import json

Q = 3329

def inv(a):
    return pow(a, Q-2, Q)

def solve_homogeneous(rows):
    A = [r[:] for r in rows]
    nrows = len(A); ncols = len(A[0]) if nrows else 0
    piv_cols = []; r = 0
    for c in range(ncols):
        piv = None
        for rr in range(r, nrows):
            if A[rr][c] % Q != 0: piv = rr; break
        if piv is None: continue
        A[r], A[piv] = A[piv], A[r]
        iv = inv(A[r][c])
        for j in range(c, ncols): A[r][j] = A[r][j]*iv % Q
        for rr in range(nrows):
            if rr != r and A[rr][c] % Q != 0:
                f = A[rr][c]
                for j in range(c, ncols): A[rr][j] = (A[rr][j]-f*A[r][j]) % Q
        piv_cols.append(c); r += 1
        if r == nrows: break
    piv_set = set(piv_cols)
    free_cols = [c for c in range(ncols) if c not in piv_set]
    basis = []
    for fc in free_cols:
        vec = [0]*ncols; vec[fc] = 1
        for (rr, pc) in enumerate(piv_cols):
            vec[pc] = (-A[rr][fc]) % Q
        basis.append(vec)
    return basis

def solve_affine(rows, rhs):
    nrows = len(rows); ncols = len(rows[0]) if nrows else 0
    A = [rows[r][:] + [rhs[r]] for r in range(nrows)]
    piv_cols = []; r = 0
    for c in range(ncols):
        piv = None
        for rr in range(r, nrows):
            if A[rr][c] % Q != 0: piv = rr; break
        if piv is None: continue
        A[r], A[piv] = A[piv], A[r]
        iv = inv(A[r][c])
        for j in range(c, ncols+1): A[r][j] = A[r][j]*iv % Q
        for rr in range(nrows):
            if rr != r and A[rr][c] % Q != 0:
                f = A[rr][c]
                for j in range(c, ncols+1): A[rr][j] = (A[rr][j]-f*A[r][j]) % Q
        piv_cols.append(c); r += 1
        if r == nrows: break
    for rr in range(nrows):
        if all(A[rr][j] % Q == 0 for j in range(ncols)) and A[rr][ncols] % Q != 0:
            return None, False
    sol = [0]*ncols
    for (rr, pc) in enumerate(piv_cols):
        sol[pc] = A[rr][ncols] % Q
    return sol, True

def attack(data, target, k):
    n = 2*k+1; m = k+1
    u = [None]*n; v = [None]*n
    for i1 in range(n):
        psi = data[i1]
        l0 = None
        for l in range(m):
            if any(psi[j][l] % Q != 0 for j in range(m)): l0 = l; break
        uu = [psi[j][l0] % Q for j in range(m)]
        j0 = next(j for j in range(m) if uu[j] != 0)
        vv = [psi[j0][l] % Q * inv(uu[j0]) % Q for l in range(m)]
        u[i1] = uu; v[i1] = vv
    Z = [i1 for i1 in range(n) if target[i1] == 0]
    S = [i1 for i1 in range(n) if target[i1] != 0]
    assert len(Z) == k and len(S) == k+1, (len(Z), len(S))
    basis = solve_homogeneous([u[i1] for i1 in Z])
    w2 = None
    for trial in range(100):
        cand = basis[trial % len(basis)][:]
        if all(sum(u[i1][j]*cand[j] for j in range(m)) % Q != 0 for i1 in S):
            w2 = cand; break
    if w2 is None:
        return None, None
    rows = [v[i1] for i1 in S]
    need = []
    for i1 in S:
        d = sum(u[i1][j]*w2[j] for j in range(m)) % Q
        need.append(target[i1] * inv(d) % Q)
    w3, ok = solve_affine(rows, need)
    if not ok:
        return None, None
    result = [0]*n
    for i1 in range(n):
        s = 0
        for i2 in range(m):
            for i3 in range(m):
                s = (s + data[i1][i2][i3]*w2[i2]*w3[i3]) % Q
        result[i1] = s
    return (w2, w3, result), None

d = json.load(open('/tmp/vwz_bulk.json'))
ok_cnt = 0; fail_cnt = 0
for key, e in d.items():
    k = (len(e['target']) - 1) // 2  # n=2k+1
    (w2, w3, result), err = attack(e['pk'], e['target'], k)
    if err is None and result == e['target']:
        ok_cnt += 1
    else:
        fail_cnt += 1
        print("FAIL", key)
print(f"total={len(d)} success={ok_cnt} fail={fail_cnt}")
