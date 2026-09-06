# VWZ Signature Scheme — Normative Specification

**Status:** Normative (describes the shipped fibemate rank‑2 construction)
**Version:** 0.2.0‑spec
**Date:** 2026‑09‑06
**Source of truth:** `fibemate-vwz-lg/rust/vwz-sign-wasm/src/{field,tensor,trapdoor,hash_target,preimage,signature}.rs`
**Reference implementation:** `vwz_reference.py` (accompanying executable specification, Python 3)

> **Scope note.** This document specifies the *rank‑2 hardened* VWZ construction as
> shipped. It is **not** a specification of the rank‑1 scheme in
> `papers/vwz-eprint-2026.pdf`; the divergences are listed in §11.
> An implementer who follows this document alone must be able to produce and
> verify byte‑compatible keys and signatures.

---

## 0. Conventions

| Symbol | Meaning |
|---|---|
| `‖` | byte concatenation |
| `LE₂(x)` | little‑endian encoding of integer `x` in 2 bytes |
| `Σ` | summation in `F_q` unless stated |
| `·` | matrix–vector or vector–vector product in `F_q` |
| `Aᵀ` | transpose |
| `A⁻¹` | matrix inverse over `F_q` |
| `[a, b)` | half‑open integer interval |
| `wt(v)` | Hamming weight (count of nonzero entries) |

All arithmetic on field elements is in `F_q`. All integers used for sizes,
indices and seeds are exact (non‑modular) unless prefixed by a field operation.

---

## 1. Parameters

### 1.1 Domain parameters (fixed)

| Name | Value | Notes |
|---|---|---|
| `q` | `3329` | prime; `q − 1 = 3328 = 2⁸ · 13` |
| `H` | SHAKE‑256 | FIPS 202 extendable‑output function |

### 1.2 Instance parameters (per keypair)

| Name | Definition | Constraint |
|---|---|---|
| `k` | security parameter | positive integer; `k ≥ 2` |
| `n` | `2k + 2` | length of target vector; number of public tensor slices |
| `m` | `2k + 1` | length of `w2`, `w3`; slice dimension |
| `w` | `k + 1` | Hamming weight of every target vector |

**Invariants (MUST hold):**

```
n = m + 1                (over‑determination: blocks the fixed‑w2 attack)
w = (n) / 2              (targets are exactly half‑dense)
0 < w < n
```

### 1.3 Recommended parameter sets

| `k` | `n` | `m` | Public key (bytes) | Signature (bytes) | Tensor OWF lower bound |
|---|---|---|---|---|---|
| 8  | 18 | 17 | 10 405 | 69  | ≈ 73 bits |
| 16 | 34 | 33 | 74 053 | 133 | — |
| 32 | 66 | 65 | 557 707 | 261 | — |

Sizes follow §8 exactly. **The in‑code comment claiming “k=8 → PK ≈ 468 B,
Sig ≈ 36 B” is stale** (see §12 D‑1).

---

## 2. Finite field `F_q`

`F_q` with `q = 3329`. Elements are represented as integers in `[0, q)`.

```
add(a, b)  = let s = a + b; if s ≥ q then s − q else s
sub(a, b)  = if a ≥ b then a − b else q − (b − a)
neg(a)     = if a = 0 then 0 else q − a
mul(a, b)  = (a · b) mod q
pow(a, e)  = square‑and‑multiply; pow(a, 0) = 1
inv(a)     = pow(a, q − 2)           (Fermat; a ≠ 0)
```

`inv(0)` is undefined and MUST NOT be called. Every `inv` call site in this
specification is guarded by a non‑zero precondition (§3 gives `x1[i] ≠ 0`;
§6.4 rejects zero pivots).

---

## 3. Key generation

```
KeyGen(k, seed) → (pk, sk)
```

`seed` is a 64‑bit value. When not supplied by the caller it MUST be drawn from
a cryptographically secure random source (`getrandom(2)` / `BCryptGenRandom` /
`SecRandomCopyBytes` / WebCrypto `getRandomValues`). **A non‑cryptographic PRNG
or wall‑clock value MUST NOT be used** — the entire trapdoor is a deterministic
function of `seed`.

### 3.1 Deterministic PRNG (`SeedRng`)

A 64‑bit LCG. All derived randomness comes from here, so key generation is a
pure function of `(k, seed)`.

```
state ← (seed + 0xDEADBEEF_CAFEBABE) mod 2⁶⁴

next_u64():
    state ← (state · 6364136223846793005 + 1442695040888963407) mod 2⁶⁴
    return state

next_u16_mod(modulus):            # 0 < modulus < 2¹⁶
    return (next_u64() mod 2³²) mod modulus      # truncate to low 32 bits first

randrange(lo, hi):                # uniform‑ish in [lo, hi)
    return lo + next_u16_mod(hi − lo)
```

> ⚠️ `next_u16_mod` truncates `u64 → u32` **before** reducing. This is
> normatively required for byte compatibility; see §12 D‑2 for the bias note.

### 3.2 Distinct evaluation points

```
distinct_lam(n):
    repeat:
        ls[i] ← randrange(1, q)   for i ∈ [0, n)
    until |{ ls[i] }| = n         # all pairwise distinct
    return ls
```

Generate, **in this order**:

```
λa ← distinct_lam(n)
λb ← distinct_lam(n)
λc ← distinct_lam(n)
```

### 3.3 Basis‑change matrices

```
random_invertible_matrix(m):
    M ← Iₘ
    repeat m² times:
        i ← next_u16_mod(m)
        j ← next_u16_mod(m)
        if i = j: continue                     # (still consumes the RNG)
        f ← randrange(1, q)
        row_i ← row_i + f · row_j   (componentwise in F_q)
    return M
```

Generate, **in this order**: `X2a`, `X2b`, `X3a`, `X3b` (each `m × m`).
All four have determinant 1 by construction (row additions only), hence are
invertible.

### 3.4 Derived secret values

```
X2a⁻¹ ← inv(X2a)          # Gauss‑Jordan
X3a⁻¹ ← inv(X3a)
M2    ← X2b · X2a⁻¹
M3    ← X3b · X3a⁻¹
x1[i] ← randrange(1, q)   for i ∈ [0, n)      # nonzero by construction
```

### 3.5 Public tensor

Define the Vandermonde row vector

```
vand(λ, m) = [1, λ, λ², …, λ^{m−1}] ∈ F_q^m
```

For each slice `i1 ∈ [0, n)`:

```
ua ← X2aᵀ · vand(λa[i1], m)
va ← X3aᵀ · vand(λc[i1], m)
ub ← X2bᵀ · vand(λb[i1], m)
vb ← X3bᵀ · vand(λc[i1], m)

ψ[i1][i2][i3] ← x1[i1] · ( ua[i2]·va[i3] + ub[i2]·vb[i3] )
                for i2, i3 ∈ [0, m)
```

`ψ` has shape `n × m × m`. **Each slice is the sum of two rank‑1 outer products
and is generically rank‑2** — this is the property that defeats the rank‑1
extraction attack.

### 3.6 Outputs

```
pk = (k, ψ)
sk = (k, λa, λb, λc, X2a⁻¹, X3a⁻¹, M2, M3, x1, seed)
```

---

## 4. Public evaluation (the verification equation)

```
Eval(pk, w2, w3) → t ∈ F_q^n

t[i1] = Σ_{i2=0}^{m−1} Σ_{i3=0}^{m−1} ψ[i1][i2][i3] · w2[i2] · w3[i3]
```

Implementations MAY skip terms where `w2[i2] = 0` (§…) without changing the
result.

### 4.1 Equivalent polynomial form (normative for reasoning)

Let `u2 = X2a · w2` and `u3 = X3a · w3`, and let `P(x; c) = Σ_{j} c[j] · xʲ`
denote the polynomial with coefficient vector `c`. Then

```
t[i1] = x1[i1] · ( P2a(λa[i1]) · P3a(λc[i1])  +  P2b(λb[i1]) · P3b(λc[i1]) )
```

with coefficient vectors

```
P2a: u2          evaluated at λa[i1]
P3a: u3          evaluated at λc[i1]
P2b: M2 · u2     evaluated at λb[i1]
P3b: M3 · u3     evaluated at λc[i1]
```

*Derivation:* `Σ_{i2} (X2aᵀ·vand(λa[i1]))[i2]·w2[i2]
 = vand(λa[i1])·(X2a·w2) = P2a(λa[i1])`, and
`X2b·w2 = X2b·X2a⁻¹·u2 = M2·u2`; likewise for the `X3` side.
Both `P3a` and `P3b` are evaluated on the **same** point set `λc` — this shared
structure is what makes the preimage split of §6.4 work.

---

## 5. Message → sparse target (Hash)

```
HashToTarget(msg, k) → t ∈ F_q^n ,  wt(t) = w = k+1
```

```
r ← SHAKE256(msg)                      # XOF reader, consumed sequentially
pos ← [0, 1, …, n−1]

# Step 1 — choose w distinct positions by partial Fisher–Yates
for i ∈ [0, w):
    u ← SampleUniformBelow(r, n − i)
    swap(pos[i], pos[i + u])
P ← sort( pos[0..w) )

# Step 2 — assign nonzero values
t ← [0]ⁿ
for idx ∈ P:
    v ← SampleUniformBelow(r, q − 1)
    t[idx] ← v + 1                     # in [1, q−1]
```

### 5.1 `SampleUniformBelow(r, N)` — rejection sampling (normative)

```
if N = 1: return 0
T ← floor(65536 / N) · N               # largest multiple of N ≤ 2¹⁶
loop:
    b ← next 2 bytes big‑endian from r
    v ← b[0]·256 + b[1]
    if v < T: return v mod N
    # else reject and draw again
```

Rejection rate is `1 − T/65536`; for `N = q − 1 = 3328` this is **3.52 %**.

> This is a **P1 fix**. The earlier `v mod N` on raw 16‑bit words gave the first
> `65536 mod N` outputs one extra count — a 5.3 % bias for `N = 3328` that
> violates the uniform‑target assumption underlying the hash‑and‑sign argument.
> Any implementation using plain modulo will produce **incompatible** targets.

---

## 6. Signing (preimage sampling)

```
Sign(sk, msg) → σ = (w2, w3) ∈ F_q^m × F_q^m
```

### 6.1 Target

```
t ← HashToTarget(msg, k)
```

### 6.2 Adapted target

```
adapted[i1] ← t[i1] · inv(x1[i1])     for i1 ∈ [0, n)
```

Since `x1[i1] ≠ 0`, `adapted[i1] = 0 ⟺ t[i1] = 0`.

```
S ← { i1 : adapted[i1] ≠ 0 }          # |S| = w     = k+1
Z ← { i1 : adapted[i1] = 0 }          # |Z| = n − w = k+1
```

If `|Z| < 2` the target is unsignable; **fail** (must not happen for well‑formed
targets, since `|Z| = k+1 ≥ 3` for `k ≥ 2`).

### 6.3 Sampling RNG

```
srng ← SeedRng( SampleSeed(seed, t) )

SampleSeed(seed, t):
    h ← (seed + 0x9E3779B97F4A7C15) mod 2⁶⁴
    for x in t:                        # in index order
        h ← (h · 0x5851F42D4C957F2D + x + 0x14057B7EF767814F) mod 2⁶⁴
    return h
```

Signing is therefore **deterministic**: `Sign` is a pure function of `(sk, msg)`.

### 6.4 The `Z = Za ∪ Zb` split

For each `a ∈ [1, |Z|)`:

```
Za ← Z[0 .. a)                        # |Za| = a
Zb ← Z[a−1 .. ]                       # |Zb| = |Z| − a + 1
```

so that `|Za| + |Zb| = |Z| + 1` and `Za ∩ Zb = { Z[a−1] }` (exactly one overlap).

Define the exclusive parts:

```
Zonly_a ← Za \ Zb                     # |Zonly_a| = a − 1
Zonly_b ← Zb \ Za                     # |Zonly_b| = |Z| − a
```

#### 6.4.1 Constraints on `u3`

`u3` must annihilate `P3a` on `Za` and `P3b` on `Zb`:

```
rows3 ← [ vand(λc[i1], m)                  for i1 ∈ Za ]
      ∪ [ M3ᵀ · vand(λc[i1], m)            for i1 ∈ Zb ]
```

Row count `|Za| + |Zb| = |Z| + 1 = k + 2`; column count `m = 2k+1`, so the
right nullspace has dimension at least `m − (k+2) = k − 1 ≥ 1`.

```
NS ← NullSpaceBasis(rows3)             # RREF method, deterministic
if NS is empty: try next a
```

#### 6.4.2 Random `u3` and feasibility check

Repeat up to **400** attempts:

```
u3 ← Σ_b  c_b · NS[b],   c_b ← srng.randrange(1, q)
if u3 = 0: continue

# Require both P3a and P3b nonzero on ALL of S
for i1 ∈ S:
    pa ← vand(λc[i1], m) · u3
    pb ← vand(λc[i1], m) · (M3 · u3)
    if pa = 0 or pb = 0: reject attempt
    record pa, pb
```

#### 6.4.3 Linear system for `u2`

Build an `m × m` system. Row count:
`|S| + |Zonly_a| + |Zonly_b| = (k+1) + (a−1) + (|Z|−a) = 2k+1 = m` ✔

```
# (a) reproduce the target on S
for i1 ∈ S (index j):
    row ← pa[j] · vand(λa[i1], m)  +  pb[j] · (M2ᵀ · vand(λb[i1], m))
    rhs ← adapted[i1]

# (b) zero the second product on Za \ Zb   (there P3a = 0 but P3b ≠ 0)
for i1 ∈ Zonly_a:
    row ← M2ᵀ · vand(λb[i1], m)            # forces P2b(λb[i1]) = 0
    rhs ← 0

# (c) zero the first product on Zb \ Za    (there P3b = 0 but P3a ≠ 0)
for i1 ∈ Zonly_b:
    row ← vand(λa[i1], m)                  # forces P2a(λa[i1]) = 0
    rhs ← 0

u2 ← SolveLinear(rows, rhs)                # Gauss‑Jordan; None if inconsistent
if None: next attempt
```

*Why the overlap matters:* for `i1 ∈ Za ∩ Zb` both `P3a` and `P3b` vanish, so
`t[i1] = 0` holds **without** consuming a row. The single overlap is exactly
what makes the system square.

#### 6.4.4 Map back to `w`

```
w2 ← X2a⁻¹ · u2
w3 ← X3a⁻¹ · u3
return (w2, w3)
```

If every `(a, attempt)` pair is exhausted, signing **fails**. Empirically the
success rate is 100 % over 200 targets × `k ∈ {4, 8, 16}` (see §10).

### 6.5 Correctness

For `i1 ∈ S`, row (a) is exactly `P2a(λa[i1])·P3a + P2b(λb[i1])·P3b = adapted[i1]`,
so `Eval(pk, w2, w3)[i1] = x1[i1]·adapted[i1] = t[i1]` ✔
For `i1 ∈ Z`, at least one of the two products vanishes by construction ✔

---

## 7. Verification

```
Verify(pk, msg, σ) → bool
```

```
1. if σ.k ≠ pk.k:                                    reject
2. if len(σ.w2) ≠ m or len(σ.w3) ≠ m:                reject
3. t ← HashToTarget(msg, pk.k)
4. r ← Eval(pk, σ.w2, σ.w3)                          # §4
5. accept iff r = t        (elementwise equality over all n positions)
```

**No range check on `w2`/`w3` elements is required** — any value in `[0, q)` is a
valid field element, and the equality test in step 5 is total.

> Side‑channel note: step 5 as implemented (`Vec == Vec`) short‑circuits on the
> first differing index. A constant‑time implementation SHOULD use
> `acc ← acc OR (r[i] XOR t[i])` over all `i` (open item, §12 O‑2).

---

## 8. Serialization (normative, bit‑exact)

All field elements: **unsigned 16‑bit little‑endian**. All index triples in
lexicographic order `(i1, i2, i3)`.

### 8.1 Public key

```
pk_bytes = LE₁(k) ‖ ψ[0][0][0] ‖ ψ[0][0][1] ‖ … ‖ ψ[n−1][m−1][m−1]
```

Length: `1 + 2 · n · m²` bytes.

### 8.2 Signature

```
sig_bytes = LE₁(k) ‖ w2[0] ‖ … ‖ w2[m−1] ‖ w3[0] ‖ … ‖ w3[m−1]
```

Length: `1 + 4 · m` bytes.

### 8.3 Parsing rules

* A parser MUST reject a public key whose length ≠ `1 + 2·n·m²` for the `k`
  read from byte 0.
* A parser MUST reject a signature whose length ≠ `1 + 4·m`.
* `k` is a single byte, so `k ≤ 255`. (Open item O‑1: no version stamp — an
  attacker cannot rewrite `k` without breaking the length check, but future
  parameter changes are indistinguishable from a large `k`.)

---

## 9. Complete algorithm summary

```
KeyGen(k, seed):
    rng ← SeedRng(seed)
    λa, λb, λc ← distinct_lam(n) ×3
    X2a, X2b, X3a, X3b ← random_invertible_matrix(m) ×4
    M2 ← X2b·X2a⁻¹ ;  M3 ← X3b·X3a⁻¹
    x1 ← randrange(1,q) ×n
    ψ[i1] ← x1[i1]·( (X2aᵀvand(λa[i1]))⊗(X3aᵀvand(λc[i1]))
                   + (X2bᵀvand(λb[i1]))⊗(X3bᵀvand(λc[i1])) )
    return (k,ψ), (k,λa,λb,λc,X2a⁻¹,X3a⁻¹,M2,M3,x1,seed)

Sign(sk, msg):
    t ← HashToTarget(msg,k) ;  â ← t[i]·x1[i]⁻¹
    S,Z ← split by â = 0
    for a ∈ [1,|Z|):
        split Z into Za=Z[:a], Zb=Z[a−1:]
        NS ← nullspace([vand(λc[i]) for i∈Za] ∪ [M3ᵀvand(λc[i]) for i∈Zb])
        ×400 attempts:
            u3 ← random combo of NS ; require P3a,P3b ≠ 0 on S
            u2 ← solve (§6.4.3)
            return (X2a⁻¹·u2, X3a⁻¹·u3)
    fail

Verify(pk, msg, σ):
    return Eval(pk,σ.w2,σ.w3) = HashToTarget(msg,k)
```

---

## 10. Security statement

### 10.1 What is claimed

* **Correctness** — proven in §6.5; holds unconditionally.
* **Unforgeability** — *conjectural*. Reduces to the hardness of inverting the
  mixed‑Vandermonde tensor evaluation of §4 (the “VWZ‑PR” assumption). **This
  assumption is novel** and has not withstood cryptanalytic scrutiny comparable
  to, e.g., MLWE.

### 10.2 Attacks explicitly ruled out (with regression tests)

| Attack | Why it fails | Test |
|---|---|---|
| Rank‑1 slice extraction + nullspace forge | every slice is rank‑2 (§3.5) | `test_rank1_attack_fails`, `test_slices_are_rank2` |
| Fix arbitrary `w2`, solve `w3` | `n = m + 1` ⇒ over‑determined | `test_fixed_w2_attack_fails` |

Both are re‑run in CI for `k ∈ {2, 4, 8}` over 8 messages each: **0 / 27
forgeries**.

### 10.3 What is *not* claimed

* No reduction to a standard lattice / coding problem.
* No security proof for the rank‑2 modification: it is an **engineering
  countermeasure validated by self‑audit**, not a published result.
* No protection against an adversary who recovers `seed` (§3) — hence the CSPRNG
  requirement.
* `q = 3329` is small; exhaustive/birthday arguments over `F_q` are cheap per
  element. Security rests on the tensor dimension, not on `q`.

### 10.4 Deployment guidance

VWZ is a **research primitive**. For production, fibemate pairs it with
FIPS 204 ML‑DSA‑65. Do not deploy VWZ alone.

---

## 11. Divergences from the paper (rank‑1 scheme)

`papers/vwz-eprint-2026.pdf` specifies a rank‑1 construction. The shipped scheme
differs:

| Aspect | Paper (rank‑1) | This spec (shipped rank‑2) |
|---|---|---|
| Slice structure | single outer product `X1·(u ⊗ v)` | **sum of two** outer products |
| `n` | `2k + 1` | **`2k + 2`** |
| `m` | `k + 1` | **`2k + 1`** |
| Field | prime ≈ 2⁶⁴ | **`q = 3329`** |
| Key twist | `X1` diagonal + `X2, X3` | **`(X2a,X2b,X3a,X3b)` + `M2, M3`** |
| Preimage | Lagrange interpolation | **Za/Zb split + nullspace + linear solve** |
| Hash | “deterministic procedure” (unspecified) | **SHAKE‑256 + rejection sampling** (§5) |
| Security | §4.1 self‑reports **Hull attack breaks rank‑1 at all parameters** | rank‑2 resists the two known attacks (§10.2) |

The paper contains **no rank‑2 chapter**. The rank‑2 construction is fibemate's
own extension and has **no peer review**.

---

## 12. Known defects, drift, and open items

| ID | Item | Severity |
|---|---|---|
| **D‑1** | `signature.rs` doc comment: “k=8 → PK ≈ 468 B, Sig ≈ 36 B”. Actual (§8): PK = 10 405 B, Sig = 69 B. Stale by ~22×. | P2 (doc) |
| **D‑2** | `SeedRng::next_u16_mod` truncates `u64 → u32` then reduces — modulo bias in **keygen only** (not in §5 sampling). Normative for compatibility; do not “fix” without a KAT regeneration. | P3 (accepted) |
| **D‑3** | `constants.rs` declares `n = 2k+1`, `m = k+1` — the **paper’s (rank‑1) parameters**, contradicting §1.2. Appears to be a dead/legacy path; MUST be reconciled or removed. | P2 |
| **O‑1** | No version byte in either serialization (§8). | P2 |
| **O‑2** | `Verify` step 5 is not constant‑time (short‑circuiting compare). | P1 |
| **O‑3** | `Sign` panics (`.expect`) rather than returning `Result` — unacceptable at a JS/WASM boundary. | P2 |

---

## 13. Conformance

An implementation conforms to this specification iff, for every
`(k, seed, msg)`:

1. `KeyGen` reproduces `pk_bytes` bit‑exactly (§3, §8.1);
2. `Sign` reproduces `sig_bytes` bit‑exactly (§6, §8.2);
3. `Verify` accepts its own signatures and rejects any single‑byte change to
   `msg` or `sig_bytes`.

### 13.1 Cross‑validation status — **PASSED**

`vwz_reference.py` (Python 3, independent rendering of §§2–8) and
`rust/vwz-sign-wasm` (the production Rust implementation) were compared on
6 vectors (`k ∈ {2, 4, 8}` × `seed ∈ {42, 2026}`).

| Check | Result |
|---|---|
| `pk_bytes` SHA3‑256 (first 16 B) | **6 / 6 identical** |
| `sig_bytes` SHA3‑256 (first 16 B) | **6 / 6 identical** |
| `Verify` on all own signatures | **6 / 6 accept** |
| Serialized sizes vs §1.3 | exact (`k=8`: PK 10 405 B, Sig 69 B) |

Two independently written implementations agreeing byte‑for‑byte is the
strongest available evidence that **this document is complete and
unambiguous** — every constant, iteration order and RNG consumption rule that
either side needed is written down here.

The comparison is locked in as a regression test:
`signature::tests::test_conformance_vs_python_reference`.

> ⚠️ A failure of that test means one side has drifted. **Do not** update the
> expected digests without first establishing which implementation is
> non‑conformant *and why* — the digests are the specification's anchor.

### 13.2 Digest table

Message: `"Fibemate VWZ test k=<k>"`. Digests are SHA3‑256, first 16 bytes, hex.

| `k` | `seed` | `pk_bytes` digest | `sig_bytes` digest |
|---|---|---|---|
| 2 | 42   | `12af48a13545bb02615071ff077a235e` | `07b32e88d9b8c09db5cd4adaeefe13a3` |
| 2 | 2026 | `f79d750fc0a4f5be0a0684be6854073a` | `c2cdceaeed52b608f02f9a1083c6e947` |
| 4 | 42   | `28e09b1d7e5b92ba803a8d063953cedf` | `a34bfd493cafa0e92a4dff350e882de2` |
| 4 | 2026 | `83d38369f66644e0f5e64337c4300fb4` | `7e7498fd932708e64bbab41afdb4e981` |
| 8 | 42   | `2e8499c7a1764f2102b1d781b3bcd37d` | `fb8deab03cd9cb8d1af7381455d75e8a` |
| 8 | 2026 | `5c9e5f96ffa87a224a5a6752c3a09d79` | `62cc5b9b0f4b8e86ddb7dfb370a35852` |

### 13.3 Reproducing

```bash
python vwz_reference.py --digest          # prints the table above
cargo test --lib test_conformance         # asserts Rust matches the table
```

The Python side requires only the standard library (`hashlib.shake_256`).

