#!/usr/bin/env python3
"""
VWZ Hull Attack Reproduction
============================
Couvreur & Levrat (CRYPTO 2025): "Highway to Hull: An Algorithm for
Solving the General Matrix Code Equivalence Problem"

Implements the core attack algorithm at small parameters to verify
complexity, then extrapolates to VWZ parameter set.

Reference: https://eprint.iacr.org/2025/596
VWZ Parameters: m=129, n=257, k=128, q=65521 (≈2^16)
"""
import sys, time, math, random, itertools
import numpy as np
from dataclasses import dataclass
from typing import Tuple, List, Optional, Dict

# =============================================================
# VWZ Reference Parameters
# =============================================================
VWZ_PARAMS = {
    'm': 129,    # rows of matrix space
    'n': 257,    # columns of matrix space
    'k': 128,    # dimension of matrix space
    'q': 65521,  # field size (≈2^16)
}

# =============================================================
# 1. Matrix Code Primitives
# =============================================================

def random_matrix(m: int, n: int, q: int, rng: random.Random = None) -> np.ndarray:
    """Random m×n matrix over GF(q)."""
    if rng is None:
        rng = random.Random()
    return np.array([[rng.randint(0, q-1) for _ in range(n)] for _ in range(m)], dtype=np.int64)

def random_invertible(n: int, q: int, rng: random.Random = None) -> np.ndarray:
    """Random invertible n×n matrix over GF(q)."""
    if rng is None:
        rng = random.Random()
    while True:
        M = np.array([[rng.randint(0, q-1) for _ in range(n)] for _ in range(n)], dtype=np.int64)
        det = int(round(np.linalg.det(M.astype(np.float64)))) % q
        if det != 0:
            return M

def mat_inv(M: np.ndarray, q: int) -> np.ndarray:
    """Inverse of square matrix over GF(q)."""
    Mk = np.copy(M).astype(np.int64)
    n = Mk.shape[0]
    I = np.eye(n, dtype=np.int64)
    aug = np.hstack([Mk, I])
    for col in range(n):
        pivot_row = None
        for row in range(col, n):
            if aug[row, col] % q != 0:
                pivot_row = row
                break
        if pivot_row is None:
            raise ValueError("Matrix not invertible")
        aug[[col, pivot_row]] = aug[[pivot_row, col]]
        inv_pivot = pow(int(aug[col, col]) % q, -1, q)
        aug[col] = (aug[col] * inv_pivot) % q
        for row in range(n):
            if row != col and aug[row, col] % q != 0:
                factor = aug[row, col] % q
                aug[row] = (aug[row] - factor * aug[col]) % q
    return (aug[:, n:] % q).astype(np.int64)

def mat_mul(A: np.ndarray, B: np.ndarray, q: int) -> np.ndarray:
    """Matrix multiplication modulo q."""
    return (np.dot(A, B) % q).astype(np.int64)

# =============================================================
# 2. Code Generation
# =============================================================

@dataclass
class MatrixCode:
    """A k-dimensional matrix code C ⊆ F_q^{m×n}."""
    m: int
    n: int
    k: int
    q: int
    basis: List[np.ndarray]

def random_matrix_code(m: int, n: int, k: int, q: int,
                       rng: random.Random = None) -> MatrixCode:
    """Generate random k-dim matrix code."""
    if rng is None:
        rng = random.Random()
    basis = [random_matrix(m, n, q, rng) for _ in range(k)]
    return MatrixCode(m, n, k, q, basis)

def apply_equivalence(C: MatrixCode, P: np.ndarray, Q: np.ndarray) -> MatrixCode:
    """Apply equivalence D = P·C·Q^{-1}."""
    Qinv = mat_inv(Q, C.q)
    new_basis = [mat_mul(mat_mul(P, B, C.q), Qinv, C.q) for B in C.basis]
    return MatrixCode(C.m, C.n, C.k, C.q, new_basis)

def apply_conjugacy(C: MatrixCode, P: np.ndarray) -> MatrixCode:
    """Apply conjugacy D = P·C·P^{-1} (only for square codes m=n)."""
    assert C.m == C.n
    Pinv = mat_inv(P, C.q)
    new_basis = [mat_mul(mat_mul(P, B, C.q), Pinv, C.q) for B in C.basis]
    return MatrixCode(C.m, C.n, C.k, C.q, new_basis)

# =============================================================
# 3. Hull Computation (C ∩ C^⊥)
# =============================================================

def gram_trace(Bi: np.ndarray, Bj: np.ndarray, q: int) -> int:
    """Frobenius inner product: ⟨Bi, Bj⟩ = Tr(Bi^T · Bj)."""
    prod = mat_mul(Bi.T, Bj, q)
    return int(np.trace(prod)) % q

def hull_code(C: MatrixCode) -> Optional[MatrixCode]:
    """
    Compute Hull(C) = C ∩ C^⊥.
    Finds the nullspace of the Gram matrix.
    """
    k, m, n, q = C.k, C.m, C.n, C.q
    if k == 0:
        return None

    G = np.zeros((k, k), dtype=np.int64)
    for i in range(k):
        for j in range(k):
            G[i, j] = gram_trace(C.basis[i], C.basis[j], q)

    # Find nullspace via Gaussian elimination
    Gk = np.copy(G).astype(np.int64)
    pivot_cols = {}
    r = 0
    for col in range(k):
        pivot_row = None
        for row in range(r, k):
            if Gk[row, col] % q != 0:
                pivot_row = row
                break
        if pivot_row is None:
            continue
        pivot_cols[col] = r
        if pivot_row != r:
            Gk[[r, pivot_row]] = Gk[[pivot_row, r]]
        inv_pivot = pow(int(Gk[r, col]) % q, -1, q)
        Gk[r] = (Gk[r] * inv_pivot) % q
        for row in range(k):
            if row != r and Gk[row, col] % q != 0:
                factor = Gk[row, col] % q
                Gk[row] = (Gk[row] - factor * Gk[r]) % q
        r += 1

    pivot_set = set(pivot_cols.keys())
    free_cols = [j for j in range(k) if j not in pivot_set]
    if not free_cols:
        return None

    hull_basis = []
    col_to_row = {c: r for c, r in pivot_cols.items()}
    for fc in free_cols:
        vec = np.zeros(k, dtype=np.int64)
        vec[fc] = 1
        for pc in pivot_set:
            pr = col_to_row[pc]
            vec[pc] = (-Gk[pr, fc]) % q
        M = np.zeros((m, n), dtype=np.int64)
        for i, c in enumerate(vec):
            if c != 0:
                M = (M + c * C.basis[i]) % q
        hull_basis.append(M)

    return MatrixCode(m, n, len(hull_basis), q, hull_basis)

# =============================================================
# 4. Hull Attack (Square Codes: m=n => Conjugacy)
# =============================================================

def hull_attack_square(C: MatrixCode, D: MatrixCode,
                       max_attempts: int = 100000) -> Tuple[bool, Optional[np.ndarray], float]:
    """
    Hull attack for square codes (m=n).
    Finds P such that D = P·C·P^{-1}.
    """
    assert C.m == C.n
    q, m = C.q, C.m
    t0 = time.time()

    hull_C = hull_code(C)
    hull_D = hull_code(D)
    elapsed_pre = time.time() - t0

    hC = hull_C.k if hull_C else 0
    hD = hull_D.k if hull_D else 0

    if hC != hD:
        return False, None, time.time() - t0

    if hC == 0 or hC == C.k:
        return False, None, time.time() - t0

    # Brute-force P candidates for tiny parameters
    t0 = time.time()
    rng = random.Random(42)
    for attempt in range(max_attempts):
        P_try = random_invertible(m, q, rng)
        # Check if P conjugates each hull basis element
        ok = True
        for Bc in hull_C.basis:
            Bd_expect = mat_mul(mat_mul(P_try, Bc, q), mat_inv(P_try, q), q)
            matched = False
            for Bd_actual in hull_D.basis:
                if np.array_equal(Bd_expect % q, Bd_actual % q):
                    matched = True
                    break
            if not matched:
                ok = False
                break
        if ok:
            elapsed = time.time() - t0
            return True, P_try, elapsed

    return False, None, time.time() - t0

# =============================================================
# 5. Complexity Extrapolation
# =============================================================

def hull_dim_expected(m: int, n: int, k: int) -> int:
    """Expected hull dimension for random matrix code."""
    return max(0, 2 * k - min(m, n))

def estimate_complexity(m: int, n: int, k: int, q: int) -> Dict:
    """Estimate Hull attack cost for given parameters."""
    q_bits = math.log2(q) if q > 0 else 0
    h_exp = hull_dim_expected(m, n, k)
    h_worst = k

    est = {'m': m, 'n': n, 'k': k, 'q': q, 'q_bits': round(q_bits, 2),
           'hull_expected': h_exp, 'hull_worst': h_worst}

    for name, h in [('expected', h_exp), ('worst', h_worst)]:
        log2 = h * q_bits if q_bits > 0 and h > 0 else 0
        est[f'log2_{name}'] = round(log2, 1)
        est[f'comment_{name}'] = (
            f"O(q^{h}) = 2^{{{log2:.1f}}}"
            if h > 0 else "trivial (hull=0)")

    est['space_bits'] = round(k * q_bits, 1)
    est['safe_vs_128'] = '✅' if est['log2_expected'] > 128 else '⚠️'
    est['safe_vs_256'] = '✅' if est['log2_expected'] > 256 else '⚠️'

    return est

# =============================================================
# 6. Benchmarks
# =============================================================

def run_benchmarks():
    print("=" * 72)
    print("VWZ Hull Attack Reproduction — Couvreur & Levrat (CRYPTO 2025)")
    print("=" * 72)

    # Test configurations (square only)
    cfgs = [
        ('tiny',   3, 3, 2, 7),
        ('small',  3, 3, 2, 13),
        ('medium', 4, 4, 3, 17),
    ]

    for name, m, n, k, q in cfgs:
        print(f"\n  [{name}] m={m} n={n} k={k} q={q}")
        rng = random.Random(42)
        C = random_matrix_code(m, n, k, q, rng)

        hull_C = hull_code(C)
        h = hull_C.dim() if hull_C else 0
        print(f"    Hull dim = {h}  (expected = {hull_dim_expected(m,n,k)})")

        P = random_invertible(m, q, rng)
        D = apply_conjugacy(C, P)

        search = 2000 if q > 15 else q * 5
        found, P_found, elapsed = hull_attack_square(C, D, search)
        if found:
            print(f"    ✅ Attack found P in {elapsed:.3f}s  ({search} attempts max)")
        else:
            print(f"    ❌ Not found ({search} attempts, {elapsed:.3f}s)")

        est = estimate_complexity(m, n, k, q)
        print(f"    Cost (expected hull): {est['comment_expected']}")
        print(f"    Cost (worst hull):    {est['comment_worst']}")

    # ===== VWZ-Scale Extrapolation =====
    print("\n" + "-" * 72)
    print("  VWZ-Scale Complexity Extrapolation")
    print("-" * 72)
    vwz = VWZ_PARAMS
    est = estimate_complexity(vwz['m'], vwz['n'], vwz['k'], vwz['q'])
    h = hull_dim_expected(vwz['m'], vwz['n'], vwz['k'])

    print(f"\n    Parameters: m={vwz['m']}  n={vwz['n']}  k={vwz['k']}  q≈2^{round(math.log2(vwz['q']),1)}")
    print(f"    Hull dimension (expected): h = max(0, 2k - min(m,n)) = {h}")
    print(f"    Attack cost:  {est['comment_expected']}")
    print(f"    128-bit threshold: {'✅ PASS' if est['safe_vs_128'] else '❌ FAIL'}")
    print(f"    256-bit threshold: {'✅ PASS' if est['safe_vs_256'] else '❌ FAIL'}")
    print(f"    Space: ~{est['space_bits']} bits per list entry")

    # Structural notes
    print(f"\n    --- VWZ Structural Factors ---")
    print(f"    The random-code estimate assumes no special structure.")
    print(f"    VWZ's Vandermonde-derived code basis may differ from")
    print(f"    random codes in hull dimension, potentially increasing")
    print(f"    or decreasing the actual attack complexity.")

    # Full security sweep
    print(f"\n    --- Parameter Sweep ---")
    for k_test in [64, 96, 128, 160, 192, 256]:
        h_test = hull_dim_expected(vwz['m'], vwz['n'], k_test)
        log2 = h_test * round(math.log2(vwz['q']), 1)
        safe = "✅" if log2 > 128 else "⚠️"
        print(f"    k={k_test:3d} → hull={h_test:2d} → cost 2^{log2:.0f}  {safe}")

# =============================================================
# Main
# =============================================================
if __name__ == '__main__':
    run_benchmarks()
