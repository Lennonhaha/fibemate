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
See [THREAT_MODEL.md](/docs/THREAT_MODEL.md) for detailed security assumptions.

## Recognition

We credit researchers who responsibly disclose vulnerabilities.
Thank you for helping make this project safer.