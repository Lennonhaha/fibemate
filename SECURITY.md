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
- [External Audit Report](docs/ml-kem-768-external-audit-2026-07-27.md)

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
