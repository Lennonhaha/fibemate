#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""
VWZ Signature Scheme — Executable Specification (Python 3 reference)

This is an INDEPENDENT rendering of `fibemate-vwz-specification_20260906.md`.
It is written for CLARITY, not speed: every function maps 1:1 onto a numbered
section of the specification. It is NOT the production implementation
(that is Rust/WASM in rust/vwz-sign-wasm/).

Purpose
-------
1. Give a third party an unambiguous, runnable reading of the spec.
2. Act as a cross-check oracle: for a given (k, seed, msg) this file must
   produce byte-identical keys and signatures to the Rust implementation.
   Use `--digest` to print SHA-256 of the serialized outputs and compare
   against the Rust side.

Conformance: sections are labelled §N matching the specification document.

Usage
-----
    python vwz_reference.py                # self-test (keygen/sign/verify)
    python vwz_reference.py --digest       # emit conformance digests
    python vwz_reference.py --k 16 --seed 42 --msg "hello"
"""

import hashlib
import json
import sys
from typing import List, Optional, Sequence, Tuple

SPEC_VERSION = "0.2.0-spec"
SPEC_DOC = "fibemate-vwz-specification_20260906.md"

# The canonical conformance vectors (§13.2). `(k, seed, msg)`.
# Rust asserts against the same table in
# `signature::tests::test_conformance_vs_python_reference`.
CONFORMANCE_VECTORS = [
    (2, 42), (2, 2026), (4, 42), (4, 2026), (8, 42), (8, 2026),
]


def conformance_msg(k: int) -> bytes:
    return f"Fibemate VWZ test k={k}".encode()

# ------------------------------------------------------------------
# §1.1 Domain parameters
# ------------------------------------------------------------------

Q = 3329
MASK64 = (1 << 64) - 1

# ------------------------------------------------------------------
# §2 Finite field F_q
# ------------------------------------------------------------------


def fadd(a: int, b: int) -> int:
    s = a + b
    return s - Q if s >= Q else s


def fsub(a: int, b: int) -> int:
    return a - b if a >= b else Q - (b - a)


def fneg(a: int) -> int:
    return 0 if a == 0 else Q - a


def fmul(a: int, b: int) -> int:
    return (a * b) % Q


def fpow(base: int, exp: int) -> int:
    result = 1
    while exp > 0:
        if exp & 1:
            result = fmul(result, base)
        base = fmul(base, base)
        exp >>= 1
    return result


def finv(a: int) -> int:
    assert a != 0, "inv(0) is undefined"
    return fpow(a, Q - 2)


# ------------------------------------------------------------------
# Linear algebra over F_q  (§3.3, §6.4)
# ------------------------------------------------------------------


def vand(lam: int, m: int) -> List[int]:
    """§3.5 — vand(λ, m) = [1, λ, λ², …, λ^(m−1)]."""
    v = [1] * m
    for j in range(1, m):
        v[j] = fmul(v[j - 1], lam)
    return v


def dot(a: Sequence[int], b: Sequence[int]) -> int:
    s = 0
    for i in range(len(a)):
        s += a[i] * b[i]
    return s % Q


def mat_vec(a: Sequence[Sequence[int]], x: Sequence[int]) -> List[int]:
    return [dot(row, x) for row in a]


def mat_t_vec(a: Sequence[Sequence[int]], x: Sequence[int]) -> List[int]:
    ncols = len(a[0])
    out = []
    for j in range(ncols):
        s = 0
        for i, row in enumerate(a):
            s += row[j] * x[i]
        out.append(s % Q)
    return out


def transpose(a: Sequence[Sequence[int]]) -> List[List[int]]:
    if not a:
        return []
    return [[a[i][j] for i in range(len(a))] for j in range(len(a[0]))]


def mat_mul(a: Sequence[Sequence[int]], b: Sequence[Sequence[int]]) -> List[List[int]]:
    bt = transpose(b)
    return [[dot(a[i], bt[j]) for j in range(len(bt))] for i in range(len(a))]


def mat_inv(a: Sequence[Sequence[int]]) -> Optional[List[List[int]]]:
    """§3.4 — Gauss-Jordan inverse; None if singular."""
    n = len(a)
    aug = [list(a[i]) + [1 if i == j else 0 for j in range(n)] for i in range(n)]
    for col in range(n):
        piv = None
        for r in range(col, n):
            if aug[r][col] != 0:
                piv = r
                break
        if piv is None:
            return None
        aug[col], aug[piv] = aug[piv], aug[col]
        iv = finv(aug[col][col])
        for j in range(col, 2 * n):
            aug[col][j] = fmul(aug[col][j], iv)
        for row in range(n):
            if row == col:
                continue
            f = aug[row][col]
            if f == 0:
                continue
            for j in range(col, 2 * n):
                aug[row][j] = fsub(aug[row][j], fmul(f, aug[col][j]))
    return [r[n:] for r in aug]


def rref_and_ns(rows: Sequence[Sequence[int]]) -> List[List[int]]:
    """§6.4.1 — basis of the right nullspace {x : rows·x = 0} via RREF."""
    n = len(rows)
    if n == 0:
        return []
    m = len(rows[0])
    mat = [list(r) for r in rows]
    pivot_row: List[Tuple[int, int]] = []  # (col, row)
    r = 0
    for c in range(m):
        p = None
        for rr in range(r, n):
            if mat[rr][c] != 0:
                p = rr
                break
        if p is None:
            continue
        mat[r], mat[p] = mat[p], mat[r]
        iv = finv(mat[r][c])
        for j in range(m):
            mat[r][j] = fmul(mat[r][j], iv)
        for rr in range(n):
            if rr != r and mat[rr][c] != 0:
                f = mat[rr][c]
                for j in range(m):
                    mat[rr][j] = fsub(mat[rr][j], fmul(f, mat[r][j]))
        pivot_row.append((c, r))
        r += 1
        if r == n:
            break
    piv_cols = {c for c, _ in pivot_row}
    free = [c for c in range(m) if c not in piv_cols]
    basis = []
    for fc in free:
        vec = [0] * m
        vec[fc] = 1
        for pc, rr in pivot_row:
            vec[pc] = fneg(mat[rr][fc])
        basis.append(vec)
    return basis


def solve_linear(a: Sequence[Sequence[int]], b: Sequence[int]) -> Optional[List[int]]:
    """§6.4.3 — solve A·x = b; one particular solution, or None if inconsistent."""
    n = len(a)
    if n == 0:
        return []
    m = len(a[0])
    mat = [list(a[r]) + [b[r]] for r in range(n)]
    piv: List[int] = []
    r = 0
    for c in range(m):
        p = None
        for rr in range(r, n):
            if mat[rr][c] != 0:
                p = rr
                break
        if p is None:
            continue
        mat[r], mat[p] = mat[p], mat[r]
        iv = finv(mat[r][c])
        for j in range(m + 1):
            mat[r][j] = fmul(mat[r][j], iv)
        for rr in range(n):
            if rr != r and mat[rr][c] != 0:
                f = mat[rr][c]
                for j in range(m + 1):
                    mat[rr][j] = fsub(mat[rr][j], fmul(f, mat[r][j]))
        piv.append(c)
        r += 1
        if r == n:
            break
    for rr in range(n):
        if all(v == 0 for v in mat[rr][:m]) and mat[rr][m] != 0:
            return None
    sol = [0] * m
    for i, c in enumerate(piv):
        sol[c] = mat[i][m]
    return sol


# ------------------------------------------------------------------
# §3.1 Deterministic PRNG
# ------------------------------------------------------------------


class SeedRng:
    """64-bit LCG. Byte-compatibility-critical: do not 'improve'."""

    def __init__(self, seed: int):
        self.state = (seed + 0xDEADBEEF_CAFEBABE) & MASK64

    def next_u64(self) -> int:
        self.state = (self.state * 6364136223846793005 + 1442695040888963407) & MASK64
        return self.state

    def next_u16_mod(self, modulus: int) -> int:
        # §12 D-2: truncate u64 -> u32 BEFORE reducing. Normative.
        return (self.next_u64() & 0xFFFFFFFF) % modulus

    def randrange(self, lo: int, hi: int) -> int:
        return lo + self.next_u16_mod(hi - lo)


# ------------------------------------------------------------------
# §3.2 / §3.3 Key generation helpers
# ------------------------------------------------------------------


def distinct_lam(n: int, rng: SeedRng) -> List[int]:
    while True:
        ls = [rng.randrange(1, Q) for _ in range(n)]
        if len(set(ls)) == n:
            return ls


def random_invertible_matrix(m: int, rng: SeedRng) -> List[List[int]]:
    mat = [[1 if i == j else 0 for j in range(m)] for i in range(m)]
    for _ in range(m * m):
        i = rng.next_u16_mod(m)
        j = rng.next_u16_mod(m)
        if i == j:
            continue  # RNG already consumed — matches Rust
        f = rng.randrange(1, Q)
        for c in range(m):
            mat[i][c] = (mat[i][c] + f * mat[j][c]) % Q
    return mat


# ------------------------------------------------------------------
# §3 Key generation
# ------------------------------------------------------------------


class PublicKey:
    def __init__(self, k: int, psi: List[List[List[int]]]):
        self.k = k
        self.n = 2 * k + 2
        self.m = 2 * k + 1
        self.psi = psi


class SecretKey:
    def __init__(self, k, la, lb, lc, x2a_inv, x3a_inv, m2, m3, x1, seed):
        self.k = k
        self.n = 2 * k + 2
        self.m = 2 * k + 1
        self.la, self.lb, self.lc = la, lb, lc
        self.x2a_inv, self.x3a_inv = x2a_inv, x3a_inv
        self.m2, self.m3 = m2, m3
        self.x1 = x1
        self.seed = seed


def build_psi(k, la, lb, lc, x2a, x2b, x3a, x3b, x1) -> List[List[List[int]]]:
    """§3.5 — ψ[i1] = x1[i1]·( (X2aᵀvand(λa[i1]))⊗(X3aᵀvand(λc[i1]))
                             + (X2bᵀvand(λb[i1]))⊗(X3bᵀvand(λc[i1])) )

    Each slice is the sum of TWO rank-1 outer products ⇒ generically rank-2,
    which is what defeats the rank-1 extraction attack (§10.2).
    """
    n, m = 2 * k + 2, 2 * k + 1
    psi = [[[0] * m for _ in range(m)] for _ in range(n)]
    for i1 in range(n):
        ua = mat_t_vec(x2a, vand(la[i1], m))
        va = mat_t_vec(x3a, vand(lc[i1], m))
        ub = mat_t_vec(x2b, vand(lb[i1], m))
        vb = mat_t_vec(x3b, vand(lc[i1], m))
        for i2 in range(m):
            for i3 in range(m):
                a = fmul(ua[i2], va[i3])
                b = fmul(ub[i2], vb[i3])
                psi[i1][i2][i3] = fmul(x1[i1], fadd(a, b))
    return psi


def keygen(k: int, seed: int) -> Tuple[PublicKey, SecretKey]:
    """§3 — KeyGen(k, seed). Pure function of (k, seed)."""
    # §1.2 / §8.3: k < 2 makes |Z| = k+1 < 3, i.e. signing is impossible;
    # k > 255 cannot be encoded in the 1-byte k field of §8.1.
    if k < 2 or k > 255:
        raise ValueError(f"k must satisfy 2 <= k <= 255 (§1.2, §8.3); got {k}")
    rng = SeedRng(seed)
    n, m = 2 * k + 2, 2 * k + 1

    # §3.2 evaluation points — three independent distinct lists, in this order
    la = distinct_lam(n, rng)
    lb = distinct_lam(n, rng)
    lc = distinct_lam(n, rng)

    # §3.3 basis changes — four matrices, in this order
    x2a = random_invertible_matrix(m, rng)
    x2b = random_invertible_matrix(m, rng)
    x3a = random_invertible_matrix(m, rng)
    x3b = random_invertible_matrix(m, rng)

    # §3.4 derived secrets
    x2a_inv = mat_inv(x2a)
    x3a_inv = mat_inv(x3a)
    assert x2a_inv is not None and x3a_inv is not None
    m2 = mat_mul(x2b, x2a_inv)
    m3 = mat_mul(x3b, x3a_inv)
    x1 = [rng.randrange(1, Q) for _ in range(n)]

    psi = build_psi(k, la, lb, lc, x2a, x2b, x3a, x3b, x1)
    sk = SecretKey(k, la, lb, lc, x2a_inv, x3a_inv, m2, m3, x1, seed)
    return PublicKey(k, psi), sk


# ------------------------------------------------------------------
# §4 Public evaluation
# ------------------------------------------------------------------


def public_eval(pk: PublicKey, w2: Sequence[int], w3: Sequence[int]) -> List[int]:
    """t[i1] = Σ_{i2,i3} ψ[i1][i2][i3]·w2[i2]·w3[i3]"""
    m, n = pk.m, pk.n
    out = []
    for i1 in range(n):
        s = 0
        for i2 in range(m):
            if w2[i2] == 0:
                continue  # optional optimisation, mathematically identical
            for i3 in range(m):
                s += w2[i2] * w3[i3] * pk.psi[i1][i2][i3]
        out.append(s % Q)
    return out


# ------------------------------------------------------------------
# §5 Hash to sparse target
# ------------------------------------------------------------------


class _XofReader:
    """SHAKE-256 XOF reader. digest(N) prefixes digest(M) for M<N, so
    extending is safe and deterministic."""

    def __init__(self, msg: bytes):
        self.msg = msg
        self.buf = b""
        self.pos = 0
        self.len = 0
        self._fill(4096)

    def _fill(self, want: int) -> None:
        if want <= self.len:
            return
        newlen = max(want, self.len * 2)
        self.buf = hashlib.shake_256(self.msg).digest(newlen)
        self.len = newlen

    def read(self, count: int) -> bytes:
        if self.pos + count > self.len:
            self._fill(self.pos + count)
        out = self.buf[self.pos:self.pos + count]
        self.pos += count
        return out


def sample_uniform_below(reader: _XofReader, n: int) -> int:
    """§5.1 — rejection sampling, uniform in [0, n)."""
    if n == 1:
        return 0
    total = 1 << 16
    threshold = (total // n) * n
    while True:
        b = reader.read(2)
        v = (b[0] << 8) | b[1]
        if v < threshold:
            return v % n


def hash_to_sparse_target(msg: bytes, k: int) -> List[int]:
    """§5 — t ∈ F_q^n with exactly k+1 nonzero entries in [1, q−1]."""
    n = 2 * k + 2
    weight = k + 1
    reader = _XofReader(msg)

    positions = list(range(n))
    for i in range(weight):
        u = sample_uniform_below(reader, n - i)
        positions[i], positions[i + u] = positions[i + u], positions[i]
    chosen = sorted(positions[:weight])

    target = [0] * n
    for idx in chosen:
        v = sample_uniform_below(reader, Q - 1)
        target[idx] = v + 1
    return target


# ------------------------------------------------------------------
# §6 Signing
# ------------------------------------------------------------------


def sample_seed(keygen_seed: int, target: Sequence[int]) -> int:
    h = (keygen_seed + 0x9E3779B97F4A7C15) & MASK64
    for t in target:
        h = (h * 0x5851F42D4C957F2D + t + 0x14057B7EF767814F) & MASK64
    return h


def solve_preimage(sk: SecretKey, target: Sequence[int]) -> Optional[Tuple[List[int], List[int]]]:
    """§6.4 — Za/Zb split + nullspace sampling + linear solve."""
    m, n = sk.m, sk.n
    if len(target) != n:
        return None

    adapted = [fmul(target[i1], finv(sk.x1[i1])) for i1 in range(n)]
    z = [i for i in range(n) if adapted[i] == 0]
    s = [i for i in range(n) if adapted[i] != 0]
    if len(z) < 2:
        return None

    m3t = transpose(sk.m3)
    m2t = transpose(sk.m2)
    zl = len(z)
    rng = SeedRng(sample_seed(sk.seed, target))

    for a in range(1, zl):
        za = z[:a]
        zb = z[a - 1:]
        if len(za) + len(zb) != zl + 1:
            continue

        rows3 = [vand(sk.lc[i1], m) for i1 in za]
        rows3 += [mat_vec(m3t, vand(sk.lc[i1], m)) for i1 in zb]
        ns3 = rref_and_ns(rows3)
        if not ns3:
            continue

        zset_a, zset_b = set(za), set(zb)
        z_only_a = [i for i in za if i not in zset_b]
        z_only_b = [i for i in zb if i not in zset_a]

        for _attempt in range(400):
            u3 = [0] * m
            nonzero = False
            for basis in ns3:
                c = rng.randrange(1, Q)
                if c != 0:
                    nonzero = True
                for j in range(m):
                    u3[j] = fadd(u3[j], fmul(c, basis[j]))
            if not nonzero or all(x == 0 for x in u3):
                continue

            m3u3 = mat_vec(sk.m3, u3)

            p3a_s, p3b_s = [], []
            ok = True
            for i1 in s:
                vc = vand(sk.lc[i1], m)
                pa = dot(vc, u3)
                pb = dot(vc, m3u3)
                if pa == 0 or pb == 0:
                    ok = False
                    break
                p3a_s.append(pa)
                p3b_s.append(pb)
            if not ok:
                continue

            rows2, b2 = [], []
            for idx, i1 in enumerate(s):
                va = vand(sk.la[i1], m)
                vb = vand(sk.lb[i1], m)
                m2t_vb = mat_vec(m2t, vb)
                rows2.append([
                    fadd(fmul(va[j], p3a_s[idx]), fmul(m2t_vb[j], p3b_s[idx]))
                    for j in range(m)
                ])
                b2.append(adapted[i1])
            for i1 in z_only_a:
                rows2.append(mat_vec(m2t, vand(sk.lb[i1], m)))
                b2.append(0)
            for i1 in z_only_b:
                rows2.append(vand(sk.la[i1], m))
                b2.append(0)

            u2 = solve_linear(rows2, b2)
            if u2 is None:
                continue

            w2 = mat_vec(sk.x2a_inv, u2)
            w3 = mat_vec(sk.x3a_inv, u3)
            return w2, w3
    return None


def sign(sk: SecretKey, msg: bytes) -> Tuple[List[int], List[int]]:
    """§6 — deterministic Hash-and-Sign."""
    target = hash_to_sparse_target(msg, sk.k)
    res = solve_preimage(sk, target)
    if res is None:
        raise RuntimeError("Signing failed: target not sparse or tensor singular")
    return res


# ------------------------------------------------------------------
# §7 Verification
# ------------------------------------------------------------------


def verify(pk: PublicKey, msg: bytes, sig: Tuple[List[int], List[int]]) -> bool:
    w2, w3 = sig
    if len(w2) != pk.m or len(w3) != pk.m:
        return False
    target = hash_to_sparse_target(msg, pk.k)
    return public_eval(pk, w2, w3) == target


# ------------------------------------------------------------------
# §8 Serialization
# ------------------------------------------------------------------


def serialize_public_key(pk: PublicKey) -> bytes:
    buf = bytearray([pk.k])
    for i1 in range(pk.n):
        for i2 in range(pk.m):
            for i3 in range(pk.m):
                buf += pk.psi[i1][i2][i3].to_bytes(2, "little")
    return bytes(buf)


def serialize_signature(k: int, sig: Tuple[List[int], List[int]]) -> bytes:
    w2, w3 = sig
    buf = bytearray([k])
    for v in w2:
        buf += v.to_bytes(2, "little")
    for v in w3:
        buf += v.to_bytes(2, "little")
    return bytes(buf)


# ------------------------------------------------------------------
# Self-test / conformance digests
# ------------------------------------------------------------------


def self_test() -> None:
    print("VWZ reference — self test")
    print("-" * 62)
    for k in (2, 4, 8):
        pk, sk = keygen(k, 42)
        msg = f"Fibemate VWZ test k={k}".encode()
        sig = sign(sk, msg)
        assert verify(pk, msg, sig), f"k={k}: verify failed"
        assert not verify(pk, b"wrong message", sig), f"k={k}: accepted wrong msg"
        assert not verify(pk, msg + b"x", sig), f"k={k}: accepted modified msg"

        t = hash_to_sparse_target(msg, k)
        assert sum(1 for v in t if v) == k + 1, "weight must be k+1"
        assert len(t) == 2 * k + 2

        pk_bytes = serialize_public_key(pk)
        sig_bytes = serialize_signature(k, sig)
        assert len(pk_bytes) == 1 + 2 * pk.n * pk.m * pk.m
        assert len(sig_bytes) == 1 + 4 * pk.m

        print(f"  k={k:2d}  n={pk.n:2d} m={pk.m:2d}  pk={len(pk_bytes):6d}B "
              f"sig={len(sig_bytes):3d}B  OK")

    # §10.2 — every public slice must be rank-2, not rank-1
    pk, _ = keygen(4, 555)
    m = pk.m
    for i1 in range(pk.n):
        l0 = next((l for l in range(m) if any(pk.psi[i1][i2][l] for i2 in range(m))), None)
        assert l0 is not None
        u = [pk.psi[i1][i2][l0] for i2 in range(m)]
        j0 = next(j for j in range(m) if u[j])
        iv = finv(u[j0])
        v = [fmul(pk.psi[i1][j0][i3], iv) for i3 in range(m)]
        rank1 = all(fmul(u[i2], v[i3]) == pk.psi[i1][i2][i3]
                    for i2 in range(m) for i3 in range(m))
        assert not rank1, f"slice {i1} is rank-1 (fix ineffective)"
    print("  rank-2 slice check .............................. OK")

    # Determinism
    pk1, sk1 = keygen(4, 42)
    pk2, sk2 = keygen(4, 42)
    assert serialize_public_key(pk1) == serialize_public_key(pk2)
    assert sign(sk1, b"x") == sign(sk2, b"x")
    print("  determinism (keygen + sign) ..................... OK")
    print("-" * 62)
    print("ALL PASS")


def emit_digests() -> None:
    print("# VWZ conformance digests — compare with Rust "
          "keygen_seeded(k, seed) / sign(sk, msg)")
    print("# format: k | seed | msg | sha3_256(pk_bytes)[:16] | sha3_256(sig_bytes)[:16]")
    for k in (2, 4, 8):
        for seed in (42, 2026):
            pk, sk = keygen(k, seed)
            msg = f"Fibemate VWZ test k={k}".encode()
            sig = sign(sk, msg)
            assert verify(pk, msg, sig)
            pk_h = hashlib.sha3_256(serialize_public_key(pk)).hexdigest()[:32]
            sg_h = hashlib.sha3_256(serialize_signature(k, sig)).hexdigest()[:32]
            print(f"{k}\t{seed}\t{msg.decode()}\t{pk_h}\t{sg_h}")


def _hex_vec(v: Sequence[int]) -> str:
    """§8 — 16-bit little-endian per element."""
    return "".join(x.to_bytes(2, "little").hex() for x in v)


def emit_kat(path: str) -> None:
    """§13 — write a full byte-level Known-Answer Test file.

    The KAT carries the *complete* serialized bytes (not a digest), so a
    third-party implementation can be compared byte-for-byte. Intermediate
    values (`target`, `w2`, `w3`) are included so a mismatch can be localised
    to the module that produced it:

        target mismatch  -> §5   hash_to_sparse_target
        pk mismatch      -> §3   key generation
        w2/w3 mismatch   -> §6.4 preimage sampling
    """
    vectors = []
    for k, seed in CONFORMANCE_VECTORS:
        msg = conformance_msg(k)
        pk, sk = keygen(k, seed)
        target = hash_to_sparse_target(msg, k)
        w2, w3 = sign(sk, msg)
        assert verify(pk, msg, (w2, w3))
        vectors.append({
            "k": k,
            "seed": seed,
            "msg_hex": msg.hex(),
            "target_hex": _hex_vec(target),          # §5
            "pk_hex": serialize_public_key(pk).hex(),  # §3 + §8.1
            "w2_hex": _hex_vec(w2),                  # §6.4
            "w3_hex": _hex_vec(w3),                  # §6.4
            "sig_hex": serialize_signature(k, (w2, w3)).hex(),  # §8.2
        })
    kat = {
        "spec_doc": SPEC_DOC,
        "spec_version": SPEC_VERSION,
        "generator": "vwz_reference.py",
        "encoding": "hex; all field elements u16 little-endian",
        "vectors": vectors,
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(kat, fh, indent=2)
        fh.write("\n")
    print(f"wrote {len(vectors)} vectors -> {path}")


# ------------------------------------------------------------------
# §13 / layer-3 — negative (fault-injection) tests
# ------------------------------------------------------------------


def negative_tests() -> None:
    """Every item here is a *rejection* path: the scheme must say NO."""
    print("VWZ reference — negative / fault-injection tests")
    print("-" * 62)

    for k in (2, 4, 8):
        pk, sk = keygen(k, 42)
        msg = conformance_msg(k)
        w2, w3 = sign(sk, msg)
        sig_bytes = serialize_signature(k, (w2, w3))
        m = pk.m

        # N-1 tamper every byte of the signature: verify must reject.
        tampered = 0
        for i in range(1, len(sig_bytes)):  # skip the k byte (N-4)
            bad = bytearray(sig_bytes)
            bad[i] ^= 0x80                  # flip the high bit
            bw2, bw3 = parse_signature(bytes(bad))
            if verify(pk, msg, (bw2, bw3)):
                raise AssertionError(f"k={k}: accepted sig with byte {i} flipped")
            tampered += 1
        print(f"  k={k:2d}  N-1 tamper {tampered:3d} signature bytes ...... rejected")

        # N-1a tamper the message.
        assert not verify(pk, msg + b"!", (w2, w3))
        assert not verify(pk, b"", (w2, w3))
        print(f"  k={k:2d}  N-1a tampered/empty message ............. rejected")

        # N-2 all-zero signature (targets are never all-zero, wt = k+1 >= 3).
        zero = ([0] * m, [0] * m)
        assert not verify(pk, msg, zero), f"k={k}: accepted all-zero signature"
        print(f"  k={k:2d}  N-2 all-zero signature .................. rejected")

        # N-3 wrong-length signature vectors.
        assert not verify(pk, msg, (w2[:-1], w3))
        assert not verify(pk, msg, (w2, w3[:-1]))
        assert not verify(pk, msg, (w2 + [0], w3 + [0]))
        print(f"  k={k:2d}  N-3 wrong-length w2/w3 .................. rejected")

        # N-4 swapped w2/w3 (same length, so only the math rejects it).
        assert not verify(pk, msg, (w3, w2)), f"k={k}: accepted w2/w3 swapped"
        print(f"  k={k:2d}  N-4 w2/w3 swapped ....................... rejected")

        # N-5 signature valid under a different key.
        pk2, _ = keygen(k, 43)
        assert not verify(pk2, msg, (w2, w3)), f"k={k}: cross-key forgery accepted"
        print(f"  k={k:2d}  N-5 signature under a different key ..... rejected")

    # N-6 invalid parameters must raise, not silently produce garbage.
    for bad_k in (0, 1, -3):
        try:
            keygen(bad_k, 1)
        except ValueError:
            pass
        else:
            raise AssertionError(f"keygen(k={bad_k}) should have raised ValueError")
    print("  N-6 keygen(k<2) raises ValueError ................ OK")

    # N-7 malformed serializations must raise.
    for bad in (b"", b"\x04", b"\x04\x00\x00", b"\x02" + b"\x00" * 7):
        try:
            parse_signature(bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"parse_signature({bad!r}) should have raised")
    print("  N-7 malformed signature bytes raise ValueError ... OK")

    # N-8 unsignable target: |Z| < 2 (target with <= 1 zero position).
    pk, sk = keygen(4, 7)
    dense = [1] * pk.n
    assert solve_preimage(sk, dense) is None, "dense target must be unsignable"
    assert solve_preimage(sk, [1] * (sk.n + 1)) is None, "wrong-length target accepted"
    print("  N-8 dense / wrong-length target rejected ......... OK")

    print("-" * 62)
    print("NEGATIVE TESTS PASS")


def parse_signature(data: bytes) -> Tuple[List[int], List[int]]:
    """§8.3 — parse `sig_bytes`; raise ValueError on any violation."""
    if not data:
        raise ValueError("empty signature")
    k = data[0]
    if k < 2:
        raise ValueError(f"invalid k byte: {k} (§1.2 requires k >= 2)")
    m = 2 * k + 1
    if len(data) != 1 + 4 * m:
        raise ValueError(f"invalid signature length {len(data)} != {1 + 4 * m}")
    off = 1
    w2 = [int.from_bytes(data[off + 2 * j: off + 2 * j + 2], "little") for j in range(m)]
    off += 2 * m
    w3 = [int.from_bytes(data[off + 2 * j: off + 2 * j + 2], "little") for j in range(m)]
    return w2, w3


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--digest" in args:
        emit_digests()
    elif "--emit-kat" in args:
        emit_kat(args[args.index("--emit-kat") + 1])
    elif "--negative" in args:
        negative_tests()
    elif "--k" in args:
        k = int(args[args.index("--k") + 1])
        seed = int(args[args.index("--seed") + 1]) if "--seed" in args else 42
        msg = args[args.index("--msg") + 1].encode() if "--msg" in args else b"hello"
        pk, sk = keygen(k, seed)
        sig = sign(sk, msg)
        print("verify:", verify(pk, msg, sig))
        print("pk sha3-256:", hashlib.sha3_256(serialize_public_key(pk)).hexdigest())
        print("sig sha3-256:", hashlib.sha3_256(serialize_signature(k, sig)).hexdigest())
    else:
        self_test()
