# VWZ Research Line — Status Pointer

**Status: Experimental research, not deployed, not audited.**
Normative spec: `experimental/vwz-lg` branch, `docs/fibemate-vwz-specification_20260906.md` (v0.2.0-spec, rank-2, q=3329).

## Timeline

| Date | Event |
|---|---|
| 2026-08-16 | **Rank-1 construction completely broken** by independent third-party polynomial-time attack (rank-1 slice factorization → key-independent existential forgery, 36/36 forged signatures accepted). Full advisory: [`security-assessment/vwz-attack-assessment.md`](../security-assessment/vwz-attack-assessment.md) |
| 2026-09-06 | **Rank-2 hardened construction shipped** on `experimental/vwz-lg`: 306/306 slices rank=2, rank-1 attack 0/27, 44/44 boundary tests, no performance regression. **Verified only against the algebraic attack layer that broke rank-1 — not a security proof. No third-party cryptographic audit.** |

## Honest boundaries

- The underlying hardness assumption (VWZ-PR) is novel and conjectural, with no standard reduction.
- Unforgeability is explicitly outside the formalizable scope of our own verification plan (32 proof obligations, v0 complete; see formalization plan).
- LookingGlass obfuscation is broken by black-box table reconstruction (all variants) and is non-cryptographic — see its security assessment.
- VWZ is **not** used in any production path of FIBEMATE.

## Active work

- Cryptol/SAW formalization v1 (blocked on toolchain setup, 32 proof obligations listed).
- Rank-2 cryptanalysis challenge being re-issued (challenge page parameters being corrected from rank-1 era values).
