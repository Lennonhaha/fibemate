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
- RTL source code is withheld pending security review

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

## Security-Related Documentation

- [Security Limitations](docs/security-limitations.md)
- [OpenSSF Best Practices](docs/openssf-roadmap.md)
- [Security Audit (Self-Conducted)](docs/ml-kem-768-external-audit-2026-07-27.md)
- [PQC Ecosystem Scan](tools/pqc-ecosystem-scan.json) — 147 dependencies, automated crypto audit
- [CARS Readiness Assessment](docs/cars-bias-analysis.md) — external-vs-internal scoring

## Dependency Risk Disposition

### @noble/curves (65 source references) — Quantum Vulnerable

**Risk**: Provides ECDSA/ECDH/EdDSA primitives (P-256, P-384, P-521, Ed25519). All elliptic curve cryptography is vulnerable to Shor's algorithm on a CRQC (cryptographically relevant quantum computer).

**Current usage in FIBEMATE**: Referenced in `packages/pqc-kem/` test infrastructure and cross-validation scripts only. **Not used** in core cryptographic paths — the double ratchet uses Node.js built-in crypto for P-256 ECDH, not `@noble/curves`.

**Disposition**: Accept (low risk). The package is a transitive test dependency, not a runtime cryptographic dependency. Verify with: `node tools/pqc-ecosystem-scan.js` — filtered by `risk=quantum_vulnerable` shows actual source-level usage.

**Migration plan** (Q4 2026): Remove from `devDependencies` by replacing test-vector validation with KAT-based checks that don't require ECC libraries.

### bcryptjs (2 source references) — Quantum Weakened

**Risk**: bcrypt is a password hashing function. Grover's algorithm halves the effective security bits of any brute-force search, including bcrypt iterations. However, bcrypt's work factor can simply be doubled (e.g., cost factor 10→11) to compensate.

**Current usage in FIBEMATE**: Used in `reg-server/` for demo user registration hashing. This is a demo server, not a production authentication system.

**Disposition**: Accept (educational demo). The demo server is for protocol illustration only. No real user credentials are stored. Increase cost factor from 10→12 as a defensive measure if the demo server ever leaves localhost.

**Migration plan** (Q4 2026): Replace with Argon2id if the registration server becomes non-demo.

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

## PGP Key

Not available. This project does not handle production secrets.
