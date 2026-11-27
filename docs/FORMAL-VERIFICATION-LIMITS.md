# Formal verification — what is proved, and what is assumed

This document exists because "formally verified" is a phrase that hides work. The Isabelle models in
`vwz-formalization` are **not** a proof of the deployed code. They are a proof of a model, under
assumptions, with holes that are explicitly marked `sorry`.

## Measured state (2026-11-27)

Counted with `grep -c '\bsorry\b'` over every `.thy` file, in both trees:

| Tree | `sorry` | Where |
|---|---|---|
| `vwz-formalization` | 63 | skeleton 40, VWZ_ObligationsAligned 17, VWZ_Rank 4, VWZ_Aux 1, VWZ_ModAlgebra 1 |
| `fibemate-vwz` | 74 | skeleton 40, VWZ_ObligationsAligned 31, VWZ_Aux 3 |

A third-party review quoted 41. That number does not match either tree today; we publish the
measured counts instead of the friendlier one. The difference is snapshot drift, not a fix.

## What the holes mean

The 40 in `skeleton/VWZ_A3_Skeleton.thy` are the largest group and the least dangerous: that file is
an abstract obligation skeleton — the assumptions are the point. The obligations in
`aligned/VWZ_ObligationsAligned.thy` are the ones that matter for the protocol argument:

1. **Field arithmetic is assumed, not proved.** `VWZ_Fq3329` defines the operations; the bridge from
   those definitions to the bytes the C/JS code actually manipulates is not formalised. If the
   implementation computes a different function than the model, every theorem still holds and the
   product is still wrong.
2. **Sampling is modelled as uniform.** The proofs assume `sample` returns the uniform distribution.
   A real RNG with bias, a seeded test hook left enabled, or a nonce truncation bug (exactly what
   `fibemate-core@0.1.0` shipped) satisfies none of the assumptions and none of the theorems.
3. **The adversary is bounded by the model.** The Rank and Obligations proofs assume the adversary
   performs the modelled operations. Side channels, timing, fault injection and implementation bugs
   are outside the model entirely.
4. **Composition is assumed.** The protocol proof assumes each primitive instance is independent and
   correctly keyed. Key reuse, a missing `H(ek)` check, or a downgrade path breaks composition
   without touching any lemma.

## What this means in practice

- Do not cite the Isabelle development as evidence that the shipped KEM is correct. Correctness of
  the shipped code is anchored by the NIST ACVP vectors, the KAT corpus, and differential testing
  against `@noble/post-quantum` — see `fibemate-core/test/`.
- The `sorry` list is a to-do list, not a safety margin. Closing them without closing the
  implementation-to-model gap would improve the count and not the assurance.
- Malicious input is out of scope for every theorem above. Input validation is tested separately
  (length checks, canonical encoding, `H(ek)` consistency) and is not claimed to be proved.
