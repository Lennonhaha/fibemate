# FIBEMATE Design Decisions

> **Rationale behind key choices that may surprise reviewers.**
> Created: 2026-07-18 · Updated when significant decisions are made.

---

## ML-KEM-768: Time-Domain vs NTT-Domain Representation

### Decision
FIBEMATE's ML-KEM-768 implementation uses **time-domain** coefficient representation for polynomials throughout the KEM pipeline, rather than the NTT-domain representation used by the NIST reference implementation and Jasmin (libjade).

### Rationale
- **Simplicity**: Time-domain operations are easier to verify, debug, and reason about. No conversion between domains is needed at each step.
- **Portability**: No dependency on NTT-specific optimizations for correctness. The implementation can be verified against textbook mathematical definitions directly.
- **Internal Consistency**: All operations are in the same domain, so KEM functions (keygen/encap/decap) are internally consistent. The same polynomial representation is used end-to-end.

### Implications
| Aspect | Status |
|--------|--------|
| Internal correctness (round-trip) | ✅ 6/6 PASS |
| Security (IND-CPA) | ✅ NOT affected — domain choice is a convention, not a security property |
| NIST KAT wire format compatibility | ❌ Not byte-compatible |
| Interoperability with liboqs/Jasmin | ❌ Not supported at this time |

### Why NIST KAT mismatch is expected
FIBEMATE and NIST reference use the **same polynomial** in **different representations** (time-domain coefficients vs NTT-domain coefficients). This is analogous to representing the same integer in decimal vs hexadecimal — the value is identical, but the byte-level encoding differs. Byte-for-byte KAT comparison is expected to fail. Security is not affected.

### Future
If NIST-standard wire format compatibility becomes required (e.g., for interoperability with liboqs or TLS libraries), an NTT-domain adapter can be added at the boundary layer. This is a **low-priority enhancement**.

### References
- NIST FIPS 203 §4 — ML-KEM specification
- Jasmin (libjade) ML-KEM implementation — NTT-domain reference
- `scripts/kat-jasmin-compare.js` — Cross-verify script

---

## ML-KEM-768: Nonce Truncation Bug (Fixed 2026-07-18)

### What happened
`samplePoly(seed, (i<<8)|j)` constructs a 16-bit nonce per FIPS 203 §4.3, but the nonce was passed to SHAKE128 via `new Uint8Array([...seed, nonce])`, which truncated it to 8 bits. This caused `A[0][j] ≡ A[1][j]` — the ML-KEM A matrix degenerated to a single repeated column.

### Root cause
Operator error: `Uint8Array` treats a single numeric argument as an array length, not an element. The correct construction is `new Uint8Array([...seed, nonce>>8, nonce&0xff])`.

### Impact
- **Security**: KEM security was reduced because the A matrix was degenerate
- **Internal tests**: Still passed (internally consistent)
- **External comparison**: Only caught by Jasmin (libjade) KAT cross-verification

### Fix
Commit `fb8a73c` — Replace `new Uint8Array([...seed, nonce])` with `new Uint8Array([...seed, nonce>>8, nonce&0xff])` in three locations:
- `packages/pqc-kem/src/ml-kem-768.js`
- `www/crypto/ml-kem-768.js`
- `www/crypto/crypto/ml-kem-768.js`

### Verification
| Test | Result |
|------|--------|
| A[0][0] ≠ A[1][0] (non-degenerate) | ✅ |
| Internal round-trip (keygen + encap + decap) | ✅ 6/6 PASS |
| Shared secret non-zero | ✅ |
| NIST KAT byte match | ❌ (expected — time-domain vs NTT-domain, see above) |

### Lesson
Test coverage that is purely internal can mask correctness bugs. External KAT cross-verification (Jasmin/libjade) is a critical complementary test. Added to CI (see below).

---

## C Native Addon (`addon/`)

### Decision
The `addon/` C native addon (ML-KEM-768, NTT) was previously part of the repository but has been removed. The path was `addon/build/Release/mlkem.node`. This addon was experimental and was not integrated into the production server.

### Status
- **Not present in repository** (neither local workspace nor server copy)
- **Not required** for current functionality
- **May be restored** in the future if native ML-KEM acceleration is needed

---

## LookingGlass & VWZ: Default-Off Research Components

### Decision
All research components (LookingGlass v1/v2, VWZ) are **default-off** and **not in the production encryption path**.

### Rationale (Four-Layer Defense, 2026-06-28)
1. **Security isolation**: Research modules have not undergone long-term peer review. Keeping them off ensures that even if an algebraic vulnerability or private key leakage exists, the main ML-KEM+SLH-DSA communication channel is completely uncontaminated.
2. **Engineering stability**: WASM volume control + FPGA/mobile compatibility + multi-layer sparse tensor edge cases are not exhausted.
3. **Documentation self-consistency**: The official site only shows the default-enabled standard PQC chain. What's documented vs what runs are identical.
4. **Compatibility umbrella**: Older browsers/firewalls/gateways are protected from session negotiation anomalies caused by complex tensor operations.

---

## File Naming Conventions

### TSR Evidence Files
- Format: `lg-XXX.{sha256,tsq,tsr}` or `vwz-XXX-{description}-{date}.tsr`
- `lg` prefix: LookingGlass PQC experiments
- `vwz` prefix: VWZ signature scheme
- Stored in `www/docs/tsa/{YYYY-MM-DD}/` directory

### Session Artifact Files
- Format: `<topic>_<YYYY-MM-DD>.md` or `<topic>_<YYYY-MM-DDTHHmm>.md`
- Located in workspace root (ephemeral session records)
- Purpose: Agent work summaries for continuity

---

*This document is maintained as part of the FIBEMATE project. Decisions are added when they are made and when they become relevant to understanding the codebase.*
