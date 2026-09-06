# VWZ Formalization Plan — Proof Obligations & Tool Selection

**Status:** Planning (pre-tooling)
**Date:** 2026-09-06
**Spec anchor:** `fibemate-vwz-specification_20260906.md` (v0.2.0-spec)
**Reference impl:** `../scripts/vwz_reference.py` (executable spec, Python 3, stdlib only)
**Production impl:** `rust/vwz-sign-wasm/src/*.rs`
**Conformance:** 6/6 vectors byte-identical (Rust ⟷ Python), locked by
`signature::tests::test_conformance_vs_python_reference`; see spec §13.

---

## 0. Why formalize (and why not everything)

The spec §10 is explicit about what is **not** claimed: no reduction of
unforgeability to a standard assumption — "VWZ-PR" is novel and conjectural.
Machine-checked *security proofs* are therefore out of scope **by design**:
there is nothing to reduce to.

What CAN be formalized — and what this plan targets — is the **structural
layer**: the algebraic invariants that the construction must satisfy for the
hash-and-sign paradigm to be coherent at all. These are the properties that a
bug (like the modulo-bias P1#2 fix, or the CSPRNG P0#1 fix) would silently
break while unit tests on 3 seeds × 3 k-values would still pass.

Formalization turns "asserted on a few vectors" into "proved for all inputs".

## 1. Tool selection

| Option | Fit | Verdict |
|---|---|---|
| **Cryptol + SAW** (Galois) | DSL for crypto; SAW can extract *concrete* equivalence Rust↔spec; theorem proving via `:prove` on bounded/unbounded properties with SMT (Z3) | **Primary recommendation.** Cryptol's `:prove` handles the algebraic layer well; SAW would later link the *actual Rust* to the spec (stronger than Python cross-check) |
| **Coq / Lean** | Full dependent types; can prove correctness for *all* k (not just bounded) | Overkill for v0; the correctness theorem is parameterized by k with size-dependent linear algebra — heavy but doable. Defer until Cryptol layer is stable |
| **TLA+ / TLAPS** | Good for protocol/concurrency; weak for algebraic crypto | Not a fit for F_q arithmetic; already not present in repo |

**Recommendation:** start with **Cryptol** (install via
`cabal install cryptol` or the Galois binary bundle — needs Haskell toolchain
or a prebuilt release). All proof obligations below are written tool-agnostic
first; the Cryptol encoding is a mechanical transcription of spec §2–§8.

## 2. Proof obligations (theorems to machine-check)

Notation: `k ≥ 2`, `n = 2k+2`, `m = 2k+1`, `w = k+1`, `q = 3329`.
`F_q` arithmetic per spec §2. All variables range over valid domains.

### Layer A — field axioms (spec §2)

| ID | Obligation | Spec ref |
|---|---|---|
| A1 | `add(a,b) = add(b,a)`, `mul(a,b) = mul(b,a)` (commutativity) | §2 |
| A2 | `add(add(a,b),c) = add(a,add(b,c))`, same for `mul` (associativity) | §2 |
| A3 | `mul(a, add(b,c)) = add(mul(a,b), mul(a,c))` (distributivity) | §2 |
| A4 | `add(a, 0) = a`, `mul(a, 1) = a` (identity) | §2 |
| A5 | `add(a, neg(a)) = 0`; `mul(a, inv(a)) = 1` for `a ≠ 0` | §2 |
| A6 | `pow(a, e1+e2) = mul(pow(a,e1), pow(a,e2))`; `pow(pow(a,e1),e2) = pow(a,e1·e2)` | §2 |
| A7 | `inv(a) = pow(a, q-2)` is total on `a ≠ 0` and `inv(inv(a)) = a` | §2 |
| A8 | `add/sub/neg/mul` outputs ∈ `[0,q)` (well-typedness; representation invariant) | §2 |

### Layer B — key generation invariants (spec §3)

| ID | Obligation | Spec ref |
|---|---|---|
| B1 | `distinct_lam` returns n **pairwise distinct** values in `[1,q)` | §3.2 |
| B2 | `random_invertible_matrix` returns a matrix with **det = 1** (row-additions only) | §3.3 |
| B3 | `X2a, X2b, X3a, X3b` all invertible over F_q (consequence of B2) | §3.3–3.4 |
| B4 | `x1[i] ≠ 0` for all i (randrange(1,q)) — the precondition guarding every `inv(x1[i])` | §3.4, §6.2 |
| B5 | `M2 = X2b·X2a⁻¹`, `M3 = X3b·X3a⁻¹` are well-defined (B3) | §3.4 |
| B6 | Determinism: `KeyGen(k, seed)` is a pure function of `(k, seed)` | §3.1, §9 |
| B7 | Every slice `ψ[i1]` is **rank-2** (sum of two rank-1 outer products), generically not rank-1 | §3.5, §10.2 |
| B8 | ψ serialization length = `1 + 2·n·m²` (§8.1); k ≤ 255 for 1-byte k | §8.1, §8.3 |

### Layer C — hash-to-target (spec §5)

| ID | Obligation | Spec ref |
|---|---|---|
| C1 | `wt(HashToTarget(msg,k)) = k+1` exactly (targets half-dense) | §5 |
| C2 | All nonzero entries ∈ `[1, q-1]` (never 0 — signable positions well-defined) | §5 |
| C3 | `SampleUniformBelow` is unbiased: each value in `[0,N)` has probability exactly `1/N` (rejection sampling; P1#2 fix) | §5.1 |
| C4 | Zero set `Z` has size `n - (k+1) = k+1 ≥ 3` for k ≥ 2 → `|Z| ≥ 2`, signable | §6.2 |
| C5 | Determinism: same msg → same target (pure function of msg) | §5 |
| C6 | `adapted[i] = 0 ⟺ t[i] = 0` (x1[i] ≠ 0, so scaling preserves zero pattern) | §6.2 |

### Layer D — signing correctness (spec §6) ⭐ core

| ID | Obligation | Spec ref |
|---|---|---|
| D1 | **Correctness theorem**: for all `(k, seed, msg)`, if `Sign` succeeds then `Verify(pk, msg, σ) = true` — i.e. `Eval(pk, w2, w3) = HashToTarget(msg, k)` | §6.5, §7 |
| D2 | The `Za/Zb` split yields `|Za| + |Zb| = |Z| + 1` with exactly one shared index (overlap) | §6.4 |
| D3 | The u2 linear system is **square m×m** (row count = k+1 + (a-1) + (|Z|-a) = 2k+1 = m) | §6.4.3 |
| D4 | Nullspace of rows3 has dim ≥ k-1 ≥ 1 (rows ≤ columns) | §6.4.1 |
| D5 | For i1 ∈ S: row (a) of the system reproduces `adapted[i1]` exactly | §6.4.3 |
| D6 | For i1 ∈ Z: at least one of the two products vanishes (annihilation argument) | §6.4, §6.5 |
| D7 | Sign determinism: `Sign(sk, msg)` pure function of `(sk, msg)` (SampleSeed) | §6.3 |
| D8 | Termination/feasibility: success rate 100% over 200 targets × k∈{4,8,16} (empirical, §10) — formalize as: no target with `|Z|≥2` provably unsignable | §6.4 |

### Layer E — verification totality (spec §7)

| ID | Obligation | Spec ref |
|---|---|---|
| E1 | Verify is **total**: no panic on any input (length check + total equality) | §7 |
| E2 | Length/type rejection: σ.k ≠ pk.k or wrong w2/w3 length ⇒ reject | §7 |
| E3 | **Soundness of rejection** (negative layer): ∀ tampered sig/message (N-1..N-5), reject — *except* genuine forgeries which are conjecturally hard (NOT provable; §10.1) | §7, §10.2 |
| E4 | Parser totality: malformed bytes raise (never accept) | §8.3 |

### Layer F — serialization round-trips (spec §8)

| ID | Obligation | Spec ref |
|---|---|---|
| F1 | `parse(serialize(pk)) = pk`; `parse(serialize(σ)) = σ` (bijective round-trip) | §8 |
| F2 | Lengths: pk = `1+2nm²`, sig = `1+4m` (exact, matches §1.3 table) | §8.1–8.2 |
| F3 | Byte-order: all field elements u16 **little-endian**, lexicographic index order | §8 |

## 3. What is deliberately NOT formalized

| Item | Why not |
|---|---|
| Unforgeability (VWZ-PR hardness) | Conjectural novel assumption; no standard reduction exists (§10.1) — would be circular |
| Rank-1-attack resistance as "security" | Engineering countermeasure; only the *structural* claim (slices rank-2, B7) is formalizable |
| Side-channel resistance | Not a mathematical property; O-2 (constant-time verify) is a coding item |
| SHAKE-256 itself | Standard FIPS 202; treat as a cryptographic oracle `H` (spec §1.1) — formalizing Keccak adds nothing about VWZ |

## 4. Layered delivery (v0 → v2)

| Milestone | Content | Evidence |
|---|---|---|
| **v0 (this doc)** | Proof-obligation inventory + tool decision | Reviewed against spec §2–§8 + reference impl |
| **v1 — Cryptol encoding** | `.cry` modules: `Fq.cry` (Layer A), `KeyGen.cry` (B), `Hash.cry` (C), `Sign.cry` (D), `Verify.cry` (E), `Ser.cry` (F); property declarations per obligation ID | `cryptol :prove A1..F3` (SMT/Z3) — mechanical |
| **v2 — Rust↔spec link (SAW)** | SAW scripts extracting `vwz-sign-wasm` to prove **the shipped Rust** satisfies the Cryptol spec | `saw` equivalence proofs; stronger than Python cross-check |
| **v3 — unbounded-k (Coq/Lean, optional)** | Correctness (D1) for all k via dependent types | Full induction; significant effort — only if v1/v2 expose a genuine gap |

## 5. Risks & open items

| Item | Note |
|---|---|
| Toolchain install (Cryptol) | Needs Haskell/cabal or Galois binary bundle on Windows; may need WSL2. First blocker to resolve in v1 |
| Z3/SMT on q=3329 arithmetic | Small prime → bit-blasting feasible; expect proofs to be fast (seconds) |
| D1 proof shape | Correctness follows the §6.5 construction but the linear-solve branch (`solve_linear` returning None) needs a lemma: *if it returns a vector it satisfies the system* — Cryptol `:prove` on bounded k (2..16) first, induction deferred |
| D8 (always signable) | Empirically 100% but no proof; may be *false* for adversarial targets — flag for v3 |
| B7 rank-2 genericity | "Generically rank-2" is a measure argument; the checkable claim is "not rank-1 for produced keys" (already asserted in self-test; promote to `:prove` for k ∈ {2,4,8}) |

## 6. Relationship to existing assets

| Asset | Role |
|---|---|
| `vwz_reference.py` self-test | Runtime assertions (Layer A-F properties on sampled vectors) → **become Cryptol `:prove` targets** |
| `--negative` N-1..N-8 | Runtime rejection checks → Layer E3/E4 obligations |
| Rust conformance test (6/6 digests) | Anchor for byte-compatibility; v2 SAW link replaces "trust Rust" with "prove Rust" |
| Spec §13 digest table | Unchanged; any formalization must reproduce it (sanity: Cryptol eval of the 6 vectors must match) |

*Prepared by reviewing spec §§0–13 and vwz_reference.py in full (self-test +
negative + digest + KAT paths). No toolchain installed yet — v0 is
deliberately tool-agnostic so the obligation list survives any tool choice.*
