# Contributing to FIBEMATE

Thanks for your interest in contributing! FIBEMATE is a post-quantum cryptography full-stack engineering verification platform, licensed under GPLv3.

## Code of Conduct

- Be respectful and constructive.
- Assume good faith.
- Focus on the technical merit of ideas, not the person.

## AI-Assisted Contributions

AI-generated code (including from Copilot, ChatGPT, or similar tools) is welcome, but **must meet the same standards as human-written code**:

- The human contributor is fully responsible for the change
- AI-assisted PRs require the same review process
- AI does not count as an independent contributor for Bus Factor purposes
- Security-sensitive changes must include human analysis beyond AI output

See [OpenSSF Roadmap](docs/openssf-roadmap.md) for our policy on AI contributions.

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
2. Create a **feature branch** following naming conventions:
   - `feature/description` — new features
   - `fix/description` — bug fixes
   - `docs/description` — documentation
   - `security/description` — security fixes
   - `perf/description` — performance improvements
3. **Keep changes focused**: One PR = one logical change
4. **Test your changes**:
   ```bash
   npm test                          # Unit tests
   node ci-smoke.mjs --json 2>&1    # Integration smoke tests
   ```
5. **Verify no regressions** in existing KAT vectors
6. **Sign your commits** (DCO required):
   ```bash
   git commit -s -m "feat: description"
   ```
7. Submit the PR against `main` (not `master`)

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

## Developer Certificate of Origin (DCO)

By contributing to this project, you certify that:

- (a) The contribution was created in whole or in part by you and you have the right to submit it under the open source license indicated in the file; or
- (b) The contribution is based upon previous work that, to the best of your knowledge, is covered under an appropriate open source license and you have the right under that license to submit that work with modifications; or
- (c) The contribution was provided directly to you by some other person who certified (a), (b) or (c) and you have not modified it.

**All commits must be signed (`git commit -s`).** PRs without DCO sign-off will be rejected by CI.

## License

By contributing, you agree that your contributions will be licensed under the [GPLv3](LICENSE). FIBEMATE's GPLv3 license is non-negotiable — it ensures post-quantum cryptography remains auditable and free for everyone.

## Questions?

- [Discussions → Q&A](https://github.com/Lennonhaha/fibemate/discussions/categories/q-a)
- [Discussions → General](https://github.com/Lennonhaha/fibemate/discussions)

## Code Review

### Why Review Matters

FIBEMATE handles cryptographic code. Even a one-line change to an NTT routine or a
masking strategy can affect security guarantees. Every change — regardless of author —
must be reviewed.

### Review Process

1. **Self-review** (required): The author must review their own diff before requesting
   external review. Run this checklist manually:
   - I have explained *why* this change is needed in the PR description.
   - I have run the relevant test suite (unit + KAT + smoke).
   - I have verified no KAT vector regressions.
   - If cryptographic code: I have explained the security reasoning.
   - If performance code: I have included benchmark numbers (before/after).

2. **Automated review** (required): CI runs a standardised review pipeline on every PR:
   - ESLint / cargo clippy (code quality)
   - KAT regression check (correctness)
   - Security keyword scanner (catches unsafe patterns like `Math.random`, non-constant-time loops)
   - ShellCheck for shell scripts
   - `npm audit` / `cargo audit` for dependency vulnerabilities

3. **Human review** (where available): At least one external reviewer must approve
   before merge. For cryptographic changes, the reviewer should verify:
   - Algorithm logic against the published standard (FIPS 203, GB/T 32918, etc.)
   - No new side-channel vectors introduced.
   - Test vectors match reference implementations.

### Single-Maintainer Adaptation

FIBEMATE is currently maintained by one person. This is a recognised limitation for
OpenSSF "Silver" badge eligibility. Until external contributors join:

- **Automated review output serves as the de facto second-reviewer record.**
  Every merged PR must have a passing CI review run visible in the PR timeline.
- **Security-sensitive changes undergo a mandatory 24-hour cool-down**: the author
  must re-review their own change after at least 24 hours before merging.
- **Design reviews for cryptographic changes are archived** in
  [Discussions → Design Review](https://github.com/Lennonhaha/fibemate/discussions/categories/design-review)
  or captured in commit messages with reasoning.

### Merge Criteria

A PR may be merged when:

| Criterion | Required? | Verified by |
|-----------|-----------|-------------|
| All CI checks pass (lint, test, KAT, audit) | Required | GitHub Actions |
| At least one approving review | Required | GitHub PR review |
| No unresolved review comments | Required | GitHub PR timeline |
| Breaking change: prior discussion in Discussions | Required | Link in PR |
| Cryptographic change: security reasoning documented | Required | PR description |
| Documentation updated (API, architecture, README) | If applicable | PR diff |
| Benchmarks not degraded | If performance change | Benchmark comment |

### Review Records

All review decisions are permanently archived in:

1. **GitHub PR timeline** — automated review results + human review comments.
2. **Commit messages** — `Reviewed-by:` trailer where applicable.
3. **TSR timestamp chain** — major security milestone commits are timestamped
   (see `www/docs/tsa/` — TSR manifests link SHA256 of reviewed code versions).

For audit purposes, every merged cryptographic change must be traceable:
`PR` → `CI review run` → `commit SHA` → `TSR timestamp`.

### Exceptions

- **Release tagging** (version bumps, changelog): self-merge allowed after CI passes.
- **Documentation-only fixes** (typos, formatting): one approving review or 24h cool-down.
- **Emergency security fixes**: documented in SECURITY.md, retroactive review required.

