# Vulnerability Disclosure & Tracking

> v3.3-preview · 2026-07-22

## Reporting a Vulnerability

**Do not open a public issue.** Send findings to the project maintainer:

📧 **Security contact**: see `SECURITY.md` for current email

We aim to acknowledge within 48 hours and publish an advisory within 90 days of the initial report, or sooner if a fix is available. We support coordinated disclosure.

## Supported Versions

| Version | Status | Security fixes until |
|:---|:---|:---|
| v3.3-preview | 🔧 Active development | — |
| ≤ v3.2 | ❌ Unsupported | — |

## Vulnerability Severity Classification

| Level | Criteria | Response SLA |
|:---|:---|:---|
| **Critical** | Remote key recovery, secret-key exfiltration, TLS downgrade bypass | 48h acknowledgment, 7d fix |
| **High** | Memory corruption (if C addon added), IV/nonce reuse in production path | 7d acknowledgment, 30d fix |
| **Medium** | Timing side-channel in KAT-only path, non-exploitable API misuse | 30d acknowledgment |
| **Low** | Documentation errors, test gaps, speculative weaknesses | Next release |

## Vulnerability Registry

| ID | Date | Description | CVSS | Affected | Fixed In | Status |
|:---|:---|:---|:---|:---|:---|:---|
| FIB-2026-001 | 2026-06-23 | SM2-SM4 Hybrid AAD mismatch: `encryptWithSM2` used `pubKey[:32]` as AAD but `decryptWithSM2` used `sm4Key` → GCM auth tag always failed | — | ≤ v3.1 | v3.2 | ✅ Fixed |
| FIB-2026-002 | 2026-07-19 | ML-KEM-768 nonce truncation: `sampleNTT` SHAKE128 output was 504 bytes instead of 840, causing reject sampling to starve on edge inputs (KAT mismatch with noble/liboqs) | — | pre-v3.3 | v3.3-preview | ✅ Fixed |
| FIB-2026-003 | 2026-07-21 | `decapsulate(sk, ct)` parameter-order swap: older call sites passed `(secretKey, ciphertext)` but implementation expected `(ciphertext, secretKey)`; caught by liboqs 0.12.0 cross-validation | — | pre-v3.3 | v3.3-preview | ✅ Fixed |
| FIB-2026-004 | 2026-07-19 | `modMul` / `modAdd` did not handle negative inputs → NaN propagation in NTT domain; fixed with `((x % Q) + Q) % Q` normalization | — | pre-v3.3 | v3.3-preview | ✅ Fixed |
| FIB-2026-005 | 2026-06-18 | SM2 `k + r·N` scalar masking: `(k + rN) % N` modulo reduced mask to zero (≈ k exposed); fixed with raw `k + rN` integer (320-bit) as scalar | — | ≤ v3.0 | v3.1 | ✅ Fixed |

## Affected-Version Matrix

```
                 FIB-001  FIB-002  FIB-003  FIB-004  FIB-005
v3.0              ✗        ✗        ✗        ✗        ✗
v3.1              ✓        ✗        ✗        ✗        ✓
v3.2              ✓        ✗        ✗        ✗        ✓
v3.3-preview      ✓        ✓        ✓        ✓        ✓

✗ = affected   ✓ = fixed
```

## Vulnerability Report Template

```markdown
### Summary
[One-line description]

### Affected Component
[Which module/function, version range]

### Severity
[Critical / High / Medium / Low]

### Reproduction
[Minimal test case — ideally a single script]

### Expected Behavior
[What should happen]

### Actual Behavior
[What happens, including error messages or incorrect output]

### Suggested Fix
[Optional: if you have a proposed patch]

### Disclosure Timeline
- Reported: YYYY-MM-DD
- Acknowledged: YYYY-MM-DD
- Fix committed: YYYY-MM-DD
- Advisory published: YYYY-MM-DD
```

## Security Advisory Template

```markdown
# FIBEMATE Security Advisory FIB-YYYY-NNN

**Date**: YYYY-MM-DD
**Severity**: [Critical/High/Medium/Low]
**Affected**: [version range]
**Fixed in**: [version]

### Summary

### Impact

### Mitigation

### Credits

Reported by [name/org]. Coordinated disclosure.

### Timeline
```

## Known Non-Vulnerabilities (Won't Fix)

These are reported concerns that, after review, are not considered exploitable:

| Item | Reason |
|:---|:---|
| JavaScript JIT timing variation | No claim of constant-time in pure JS; documented limitation (§2.1 security-limitations.md) |
| IndexedDB key storage in browser | Browser sandbox is the trust boundary; CSP mitigations documented |
| No HSM support | Out of scope for v3.3; roadmap item |
| reg-server no authentication | Prototype; documented as "not for production" |
