# SECURITY-POSTURE.md — Security Posture Overview

> Consolidated view of FIBEMATE's security stance.
> Last updated: 2026-09-05
> Canonical vulnerability reporting: [SECURITY.md](./SECURITY.md)

## TL;DR

FIBEMATE is a **post-quantum cryptography engineering demonstration platform**,
**not a certified product**. Cryptographic components pass functional
verification, KAT, and software TVLA side-channel testing, but have **not
undergone third-party audit**. Experimental components (VWZ, LookingGlass)
provide **no cryptographic security guarantees** and are default-off.

## Document Map

| Document | Content |
|---|---|
| [SECURITY.md](./SECURITY.md) | Reporting policy, supported versions, disclosure |
| [docs/THREAT_MODEL.md](./docs/THREAT_MODEL.md) | Trust boundaries, assets, threat matrix, threat trees |
| [docs/security-model.md](./docs/security-model.md) | Security model & guarantees |
| [docs/security-limitations.md](./docs/security-limitations.md) | Known limitations (incl. X3DH anonymity review) |
| [docs/SECURITY-AUDIT-CHECKLIST.md](./docs/SECURITY-AUDIT-CHECKLIST.md) | Audit checklist |
| [docs/INCIDENT-RESPONSE-FLOW.md](./docs/INCIDENT-RESPONSE-FLOW.md) | Incident response runbook |
| [docs/INTEGRITY-MANIFEST.md](./docs/INTEGRITY-MANIFEST.md) | FIPS 140-3 §11.9 integrity baseline + evidence chain |
| `.well-known/security.txt` | RFC 9116 security contact file |

## Controls in Place

### Repository hygiene
- **Branch protection** on `main`: no force-push, no deletion, strict status checks
- **CodeQL** analysis (push + scheduled), alerts triaged to zero
- **OpenSSF Scorecard** (weekly + on push) — badge in README
- **SPDX headers** enforced in CI (`tools/add-spdx-headers.cjs check`) —
  100% of tracked source files carry `GPL-3.0-only` (public-domain/MIT/vendor
  files exempted and documented)
- **DCO** enforced on PR commits (`dco.yml`)
- **Encoding scan** in CI (`scripts/check-encoding.cjs`) — zero mojibake/U+FFFD
- **Dependabot** for dependency updates
- **Secret scanning**: no hardcoded keys/tokens in history; historical incidents
  documented in docs/audit-log/

### Cryptographic engineering
- **KAT verification** against NIST vectors (FIPS 203/204/205)
- **Cross-validation** against independent implementations (noble, liboqs)
- **Constant-time discipline** — blind SM2 scalar arithmetic (128-bit scalar
  masking + projective randomization), verified time-domain ML-KEM
- **Software TVLA** side-channel testing (SM2, N=10,000)
- **Integrity baseline** — FIPS 140-3 §11.9 module hash anchored by RFC 3161
  TSR evidence chain (see [docs/INTEGRITY-MANIFEST.md](./docs/INTEGRITY-MANIFEST.md))

### Platform hygiene
- Rate limiting on sensitive API routes; log sanitization
- TLS via nginx (Let's Encrypt, auto-renew)
- Server: key-based SSH only, `PasswordAuthentication=no`, production dirs
  read-only (`chattr +i`)
- Production integrity monitoring: `scripts/integrity-check.sh`
  (baseline sha256 + alerting)

## Residual Risk & Known Gaps

| Area | Status |
|---|---|
| Third-party audit | **Not performed** — RFP planned (Q4 2026) |
| Physical TVLA (ChipWhisperer) | Planned — Q4 2026 |
| Fuzz (OSS-Fuzz continuous) | Not running (post-8.31 item) |
| Dependency risk | `@noble/curves` (classical, quantum-vulnerable — acceptable for
  classical hybrid leg); `bcryptjs` legacy — see SECURITY.md §Dependency Risk |
| Coverage ≥ 95% | P3 (c8 + nyc instrumentation) |
| Sig verification of releases | Pending for desktop artifacts |

## Vulnerability Reporting

**Do NOT open a public issue.** Report via:

1. `security@fibemate.net` (monitored; response not guaranteed)
2. GitHub private advisory:
   https://github.com/Lennonhaha/fibemate/security/advisories

Acknowledgement ≤ 14 days · assessment ≤ 30 days · coordinated disclosure.
See [SECURITY.md](./SECURITY.md) for details.
