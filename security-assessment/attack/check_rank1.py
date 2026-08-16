import json

Q = 3329

def load():
    d = json.load(open('/tmp/vwz_keys.json'))
    return d

def mat_rank(rows):
    M = [r[:] for r in rows]
    rows_n = len(M)
    cols = len(M[0]) if rows_n else 0
    rank = 0
    for c in range(cols):
        piv = None
        for r in range(rank, rows_n):
            if M[r][c] % Q != 0:
                piv = r; break
        if piv is None: continue
        M[rank], M[piv] = M[piv], M[rank]
        inv = pow(M[rank][c], Q-2, Q)
        for j in range(c, cols):
            M[rank][j] = M[rank][j] * inv % Q
        for r in range(rows_n):
            if r != rank and M[r][c] % Q != 0:
                f = M[r][c]
                for j in range(c, cols):
                    M[r][j] = (M[r][j] - f * M[rank][j]) % Q
        rank += 1
    return rank

for k in (2, 4, 8):
    e = load()[str(k)]
    n = 2*k+1
    m = k+1
    ranks = []
    for i1 in range(n):
        rows = e['pk'][i1]
        r = mat_rank(rows)
        ranks.append(r)
    print(f"k={k}: slice ranks = {set(ranks)}, min={min(ranks)} max={max(ranks)}")
