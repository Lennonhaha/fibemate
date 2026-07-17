# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| v3.x    | ✅ Active development |
| < v3.0  | ❌ Not supported    |

## Reporting a Vulnerability

This project implements experimental post-quantum cryptography.
**Do not rely on FIBEMATE production deployments for high-security applications**
without independent third-party audit.

If you discover a security vulnerability, please report it privately:

- **Email**: fibemate@fibemate.net
- **Expect response within**: 72 hours

### What to include:
- Description of the vulnerability
- Steps to reproduce (if applicable)
- Affected module(s) and version

### What NOT to do:
- Do **not** file a public GitHub Issue for security vulnerabilities
- Do **not** discuss unpatched vulnerabilities in public forums

## Cryptographic Disclosure

FIBEMATE implements ML-KEM-768 (FIPS 203), SLH-DSA (FIPS 205),
and Chinese national standards SM2/SM3/SM4 for educational and research purposes.
See [THREAT_MODEL.md](/docs/THREAT_MODEL.md) for detailed security assumptions
and [pqc-readiness](/docs/pqc-readiness.html) for the current PQC deployment status.

## Formal Security Guarantees

### TLS 1.3 Hybrid Key Exchange (X25519MLKEM768)

The hybrid KEM construction follows the IETF `draft-ietf-tls-hybrid-design` concatenation mode.
Its security is backed by two levels of formal proof:
- **ROM**: IND-CCA2 via Schage et al., ACM CCS 2024 (at least one component secure → hybrid secure)
- **QROM**: IND-CCA2 via Bergmann et al., ePrint 2025 (quantum-query-resistant composability)

### Application-Layer Hybrid KEX (Path C-2)
- TLA+ state machine verified: 7 invariants, 101,467 states, 0 violations (TSR lg-069, lg-078)

### Side-Channel Resistance
- ML-KEM-768 TVLA N=10,000 ✅
- SM2 TVLA 1-4th order moments N=10,000 ✅ (20/20, max |t|=1.82)
- HMAC-SM3 TVLA 8/8 ✅

## Recognition

We credit researchers who responsibly disclose vulnerabilities.
Thank you for helping make this project safer.