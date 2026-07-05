# Contributing to FIBEMATE

Thanks for your interest in contributing! FIBEMATE is a post-quantum cryptography full-stack engineering verification platform, licensed under GPLv3.

## Code of Conduct

- Be respectful and constructive.
- Assume good faith.
- Focus on the technical merit of ideas, not the person.

## How to Contribute

### Reporting Bugs

Open an [Issue](https://github.com/Lennonhaha/fibemate/issues) with:

1. **Title**: Short, descriptive summary
2. **Environment**: OS, Node.js version, browser (if applicable)
3. **Steps to reproduce**: Minimal, self-contained example
4. **Expected vs actual behavior**
5. **Relevant logs or error messages**

### Suggesting Features

Use [Discussions → Ideas](https://github.com/Lennonhaha/fibemate/discussions/categories/ideas) before opening a PR. Describe:

- The problem you want to solve
- Your proposed approach
- How it fits into FIBEMATE's scope (PQC primitives, hybrid KEM, FPGA, Chinese crypto, research modules)

### Pull Requests

1. **Fork** the repository
2. Create a **feature branch**: `git checkout -b feature/your-feature`
3. **Keep changes focused**: One PR = one logical change
4. **Test your changes**:
   ```bash
   npm test                          # Unit tests
   node ci-smoke.mjs --json 2>&1    # Integration smoke tests
   ```
5. **Verify no regressions** in existing KAT vectors
6. Submit the PR against `master`

### Commit Style

- Write in English
- Use imperative mood: "Fix NTT pipeline stall" not "Fixed NTT pipeline stall"
- First line ≤ 72 characters, then blank line, then details

### What We Accept

| Area | Welcome? | Notes |
|------|----------|-------|
| ML-KEM-768 / SLH-DSA | ✅ | Must match FIPS 203/205 KAT vectors |
| SM2 / SM3 / SM4 | ✅ | Must match GB/T test vectors |
| TLS 1.3 Hybrid KEM | ✅ | Path A (oqs-provider) or Path C (application-layer) |
| FPGA NTT (Artix-7) | ✅ | Vivado 2023.1+, WNS ≥ 0 |
| LookingGlass / VWZ | ⚠️ | Research-only; requires security discussion first |
| Documentation | ✅ | Fixes, translations, examples |
| Benchmarks | ✅ | Reproducible methodology |

### What We Don't Accept

- Breaking changes to public APIs without prior discussion
- Undocumented "security improvements" to cryptographic code
- Large binary files (use `git-lfs` or external hosting)
- Anything that weakens post-quantum security guarantees

## Development Setup

See [BUILD.md](BUILD.md) for full instructions. Quick start:

```bash
git clone https://github.com/Lennonhaha/fibemate.git
cd fibemate
npm install
node ci-smoke.mjs   # verify baseline
```

## Cryptographic Code Policy

- All cryptographic changes **must** pass existing KAT (Known Answer Test) vectors
- New cryptographic code **must** include KAT vectors referencing a published standard or test source
- Security-sensitive changes require a detailed explanation in the PR description
- **Never** commit private keys, test credentials, or `.env` files

## License

By contributing, you agree that your contributions will be licensed under the [GPLv3](LICENSE). FIBEMATE's GPLv3 license is non-negotiable — it ensures post-quantum cryptography remains auditable and free for everyone.

## Questions?

- [Discussions → Q&A](https://github.com/Lennonhaha/fibemate/discussions/categories/q-a)
- [Discussions → General](https://github.com/Lennonhaha/fibemate/discussions)
