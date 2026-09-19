# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.3.x   | :white_check_mark: |
| < 3.3   | :x:                |

## Reporting a Vulnerability

**⚠️ IMPORTANT: This is an educational/research project, not production software.**

FIBEMATE is a post-quantum cryptography engineering demonstration platform. It is **NOT** intended for securing real-world communications.

### Known Limitations (Non-Exhaustive)

- Pure JavaScript implementations are **not constant-time**
- No hardware side-channel countermeasures beyond software simulation
- C native addon has not undergone fuzzing
- RTL (Verilog) source status: the NTT/FPGA core implementations (`fpga/rtl/`) are published alongside the repository. The VWZ research-line BRAM solver RTL remains withheld and awaits an internal readiness assessment (In Development, not yet Signoff).

### How to Report

If you discover a security issue that could affect users who may mistakenly use this project in production:

1. **Do NOT open a public issue**
2. Email: `security@fibemate.net` (monitored, but response time not guaranteed)
3. Include:
   - Description of the issue
   - Steps to reproduce
   - Impact assessment
   - Suggested fix (if any)

### Response Timeline

- Acknowledgment: Within 14 days
- Assessment: Within 30 days
- Fix/Disclosure: Timeline varies based on severity and complexity

### Disclosure Policy

Given the project's educational nature, we follow a **coordinated disclosure** approach:
- Critical issues: Fixed before public disclosure
- Low-severity issues: May be disclosed in regular development updates

### Coordinated Disclosure Timeline

- We follow **coordinated disclosure**. Public disclosure is deferred until a fix is available or a mutually agreed timeline is reached.
- Target embargo: **90 days from acknowledgment**, or earlier if a fix is released — whichever comes first.
- For this single-maintainer project these are best-effort targets, not contractual guarantees. If you have a hard deadline, state it in your report and we will coordinate.

### Bug Bounty

FIBEMATE is a single-maintainer educational/research project without funding. We **do not** operate a paid bounty program. However, we recognize and credit good-faith security research as follows:

| Severity | Reward |
|----------|--------|
| Critical (private key recovery, plaintext disclosure, KEM/DR break) | Public acknowledgment + named in `Acknowledgments` |
| High (authentication bypass, key confusion, downgrade) | Public acknowledgment + named in `Acknowledgments` |
| Medium (timing leak, non-catastrophic protocol flaw) | Named in `Acknowledgments` |
| Low (documentation error, hardening suggestion) | Noted in release notes where applicable |

**Eligibility**:
- Report via `security@fibemate.net` (not a public issue)
- Provide a reproducible proof-of-concept or clear impact assessment
- Do not exfiltrate data, disrupt services, or access data beyond what is needed to demonstrate the issue
- First reporter of a distinct issue receives the acknowledgment

**Non-eligibility**: issues in third-party dependencies (report upstream), social engineering, physical access, or denial-of-service without a cryptographic component.

This is a **recognition-only** program. It may evolve into a paid program if the project later receives grant or sponsorship funding.

## Security-Related Documentation

- [Security Limitations](docs/security-limitations.md)
- [OpenSSF Best Practices](docs/openssf-roadmap.md)
- [Security Audit (Self-Conducted)](docs/ml-kem-768-external-audit-2026-07-27.md)
- [PQC Ecosystem Scan](tools/pqc-ecosystem-scan.json) — 147 dependencies, automated crypto audit
- [CARS Readiness Assessment](docs/cars-bias-analysis.md) — external-vs-internal scoring

## Dependency Risk Disposition

### @noble/curves — Quantum Vulnerable (test-reference count: 65)

**Risk**: Provides ECDSA/ECDH/EdDSA primitives (P-256, P-384, P-521, Ed25519). All elliptic curve cryptography is vulnerable to Shor's algorithm on a CRQC (cryptographically relevant quantum computer).

> **Reference-count note**: The figure "65" is an automated scan count (`tools/pqc-ecosystem-scan.js`) of string matches / imports / type references within **test directories only** — *not* 65 distinct production usage points. Actual cryptographic use in core paths is zero (see "Current usage" below).

**Current usage in FIBEMATE**: Referenced in `packages/pqc-kem/` test infrastructure and cross-validation scripts only. **Not used** in core cryptographic paths — the double ratchet uses Node.js built-in crypto for P-256 ECDH, not `@noble/curves`.

**Disposition**: Accept (low risk). The package is a transitive test dependency, not a runtime cryptographic dependency. Verify with: `node tools/pqc-ecosystem-scan.js` — filtered by `risk=quantum_vulnerable` shows actual source-level usage.

**Migration plan** (Q4 2026): Remove from `devDependencies` by replacing test-vector validation with KAT-based checks that don't require ECC libraries.

### bcryptjs (2 source references) — Demo-Server Only

**Risk**: bcrypt is a *password hashing function*, not a symmetric cipher. Its strength comes from the cost factor and the entropy of the user-chosen password — not from a "key length" that Grover's algorithm halves. bcrypt does not have a meaningful "effective security bits" figure in that sense, so the claim that Grover halves its strength does not apply. The genuine weaknesses are: (1) pure-JS implementation quality, and (2) password entropy / offline dictionary-attack cost. Raising the cost factor (10→12) is justified by reducing offline dictionary-attack compute cost in the *classical* setting, not by Grover. `Argon2id` is the better long-term replacement because it is memory-hard and GPU/ASIC-resistant — again unrelated to Grover.

**Current usage in FIBEMATE**: Used in `reg-server/` for demo user registration hashing. This is a demo server, not a production authentication system. No real user credentials are stored.

**Disposition**: Accept (educational demo). The demo server is for protocol illustration only, restricted to localhost or strictly isolated environments. It must not be used in any real deployment. Increase cost factor from 10→12 if retained.

**Migration plan** (Q4 2026): Replace with Argon2id (memory-hard, GPU/ASIC-resistant) if the registration server is ever promoted beyond demo status.

## Scope of This Policy

This security policy applies to:
- FIBEMATE cryptographic implementations (JS/WASM/C/RTL)
- Documentation and examples that could be misused in production
- CI/CD infrastructure and release artifacts

**Out of scope:**
- Third-party dependencies (report to respective projects)
- Academic research discussions (use GitHub Discussions)
- Feature requests (use GitHub Issues)

## Security History

| Date | Issue | Status |
|------|-------|--------|
| 2026-07-27 | ML-KEM `samplePoly` bounds check | Fixed in audit |
| 2026-07-27 | Nonce truncation in hybrid KEX | Fixed in `fb8a73c` |
| 2026-07-25 | SM2 `_fastModP` infinite loop | Fixed in `02aeac5` |

## Acknowledgments

We thank security researchers who report issues in good faith. This project is a single-maintainer educational effort; patience with response times is appreciated.

## Encrypted Reporting

This project does not currently publish a PGP key. To report privately, use one of:

1. **GitHub Security Advisory (preferred)** — open a private vulnerability report via the repository's Security tab. It stays encrypted within GitHub and is the recommended channel.
2. **Email** — `security@fibemate.net` (plaintext only; do **not** send sensitive exploit details unencrypted). Mark the subject `SECURITY`.

Response commitment follows the [Response Timeline](#response-timeline) above: acknowledgment within 14 days, assessment within 30 days. These are best-effort, single-maintainer targets — not guarantees.
