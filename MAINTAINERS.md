# Maintainers

## Current Maintainer

- **Lennonhaha** — Project creator and sole maintainer

### Scope
- Core cryptographic implementation (ML-KEM, SLH-DSA, SM2/3/4)
- FPGA/Verilog design (NTT, VWZ)
- Documentation and website (fibemate.net)
- CI/CD and release engineering
- Security vulnerability response

### Maintainer Responsibilities
1. Review and merge PRs
2. Respond to security reports (see SECURITY.md)
3. Manage releases and versioning
4. Maintain OpenSSF best practices compliance
5. Coordinate with external auditors (planned Q2 2027)

## Joining as a Contributor

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

### Areas Welcoming Contributions (Post 2026-08-31)
- Documentation: README translations, JSDoc improvements
- Testing: Additional KAT vectors, cross-platform verification
- CI/CD: Windows CI, multi-arch Docker builds
- Non-core scripts: `scripts/benchmark.cjs`, `scripts/verify-tsr.js`

### Cryptographic Review
Cryptographic PRs require review by someone with verifiable cryptographic expertise. If you have published papers, audit reports, or significant open-source crypto contributions, include those in your PR description.

## Decision-Making
- Sole maintainer makes all final decisions
- Community consensus is sought via GitHub Discussions
- Security-critical changes require documented review
- AI-assisted code must be explicitly labeled

## Communication
- GitHub Discussions: Architecture and design
- GitHub Issues: Bugs and feature requests
- Email: `security@fibemate.net` for security reports
- Open Source announcement: 2026-08-31
