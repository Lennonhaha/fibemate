import json

Q = 3329

def inv(a):
    return pow(a, Q-2, Q)

def load():
    return json.load(open('/tmp/vwz_keys.json'))

def solve_homogeneous(rows):
    """Solve M x = 0 mod Q. rows: list of equations (coefficients). Returns a basis of null space."""
    # Gaussian elimination, augmented = rows (homogeneous)
    A = [r[:] for r in rows]
    nrows = len(A)
    ncols = len(A[0]) if nrows else 0
    piv_cols = []
    r = 0
    for c in range(ncols):
        piv = None
        for rr in range(r, nrows):
            if A[rr][c] % Q != 0:
                piv = rr; break
        if piv is None:
            continue
        A[r], A[piv] = A[piv], A[r]
        iv = inv(A[r][c])
        for j in range(c, ncols):
            A[r][j] = A[r][j] * iv % Q
        for rr in range(nrows):
            if rr != r and A[rr][c] % Q != 0:
                f = A[rr][c]
                for j in range(c, ncols):
                    A[rr][j] = (A[rr][j] - f * A[r][j]) % Q
        piv_cols.append(c)
        r += 1
        if r == nrows:
            break
    piv_set = set(piv_cols)
    free_cols = [c for c in range(ncols) if c not in piv_set]
    basis = []
    for fc in free_cols:
        vec = [0]*ncols
        vec[fc] = 1
        for (rr, pc) in enumerate(piv_cols):
            # row rr: A[rr][pc]=1, other pivots 0. Equation: x_pc + sum_{free} A[rr][f] x_f = 0
            vec[pc] = (-A[rr][fc]) % Q
        basis.append(vec)
    return basis

def solve_affine(rows, rhs):
    """Solve M x = rhs mod Q. rows: coefficients, rhs: vector. Returns (sol, ok)."""
    nrows = len(rows)
    ncols = len(rows[0]) if nrows else 0
    A = [rows[r][:] + [rhs[r]] for r in range(nrows)]
    piv_cols = []
    r = 0
    for c in range(ncols):
        piv = None
        for rr in range(r, nrows):
            if A[rr][c] % Q != 0:
                piv = rr; break
        if piv is None:
            continue
        A[r], A[piv] = A[piv], A[r]
        iv = inv(A[r][c])
        for j in range(c, ncols+1):
            A[r][j] = A[r][j] * iv % Q
        for rr in range(nrows):
            if rr != r and A[rr][c] % Q != 0:
                f = A[rr][c]
                for j in range(c, ncols+1):
                    A[rr][j] = (A[rr][j] - f * A[r][j]) % Q
        piv_cols.append(c)
        r += 1
        if r == nrows:
            break
    # check consistency: rows with all-zero coeffs but nonzero rhs
    for rr in range(nrows):
        if all(A[rr][j] % Q == 0 for j in range(ncols)) and A[rr][ncols] % Q != 0:
            return None, False
    sol = [0]*ncols
    for (rr, pc) in enumerate(piv_cols):
        sol[pc] = A[rr][ncols] % Q
    return sol, True

def attack(data, target, k):
    """Forge signature (w2, w3) s.t. public_tensor_eval(pk,w2,w3)==target, WITHOUT secret key."""
    n = 2*k+1
    m = k+1
    # Step 1: decompose each slice psi[i1] = u[i1] (x) v[i1]
    u = [None]*n
    v = [None]*n
    for i1 in range(n):
        psi = data[i1]
        # find nonzero column
        l0 = None
        for l in range(m):
            if any(psi[j][l] % Q != 0 for j in range(m)):
                l0 = l; break
        assert l0 is not None, f"zero slice i1={i1}"
        uu = [psi[j][l0] % Q for j in range(m)]
        j0 = next(j for j in range(m) if uu[j] != 0)
        iv_u = inv(uu[j0])
        vv = [psi[j0][l] % Q * iv_u % Q for l in range(m)]
        u[i1] = uu
        v[i1] = vv
    # Step 2: zero positions Z, nonzero positions S
    Z = [i1 for i1 in range(n) if target[i1] == 0]
    S = [i1 for i1 in range(n) if target[i1] != 0]
    assert len(Z) == k and len(S) == k+1
    # Step 3: find w2 in null space of (u[i1]) for i1 in Z
    basis = solve_homogeneous([u[i1] for i1 in Z])
    assert len(basis) >= 1, "w2 null space empty?!"
    # w2 = random linear combo of basis; require u[i1]·w2 != 0 for i1 in S
    w2 = None
    for trial in range(200):
        cand = [0]*m
        for b in basis:
            # random coeff (use simple LCG for determinism)
            pass
        # use deterministic simple choice: combos of basis
        # try basis vectors individually and sums
        cand = basis[trial % len(basis)][:]
        ok = all(sum(u[i1][j]*cand[j] for j in range(m)) % Q != 0 for i1 in S)
        if ok:
            w2 = cand; break
    assert w2 is not None, "failed to find w2 with nonzero u·w2 on S"
    # Step 4: solve for w3: v[i1]·w3 = target[i1]/(u[i1]·w2) for i1 in S
    rows = [v[i1] for i1 in S]
    need = []
    for i1 in S:
        d = sum(u[i1][j]*w2[j] for j in range(m)) % Q
        need.append(target[i1] * inv(d) % Q)
    w3, ok = solve_affine(rows, need)
    assert ok, "affine system for w3 inconsistent"
    # verify
    result = [0]*n
    for i1 in range(n):
        s = 0
        for i2 in range(m):
            for i3 in range(m):
                s = (s + data[i1][i2][i3]*w2[i2]*w3[i3]) % Q
        result[i1] = s
    return w2, w3, result

for k in (2, 4, 8):
    e = load()[str(k)]
    w2, w3, result = attack(e['pk'], e['target'], k)
    ok = result == e['target']
    print(f"k={k}: forged signature ok={ok}")
    if not ok:
        mism = [i for i,(a,b) in enumerate(zip(result, e['target'])) if a!=b]
        print(f"  mismatches at {mism[:10]}")
    json.dump({'k': k, 'w2': w2, 'w3': w3}, open(f'/tmp/forge_k{k}.json','w'))
