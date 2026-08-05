# Call for Collaborators — FIBEMATE

> **DRAFT** — prepared for the 2026-08-31 open-source launch. Not yet published.
> Companion to [`CONTRIBUTING.md`](CONTRIBUTING.md) (the rules) — this is the invitation.

---

## What is FIBEMATE?

FIBEMATE is a **post-quantum cryptography (PQC) full-stack engineering verification
platform**. It is not a production crypto library and does not claim to be one — it is
an *executable textbook* for understanding how PQC actually works, end to end: from
algorithm internals, through KAT/TVLA verification, into hybrid TLS 1.3 handshakes,
and down to FPGA hardware acceleration.

Think of it as the place where NIST standards, Chinese national cryptography (SM2/SM3/SM4),
and post-quantum protocols meet in one runnable, auditable codebase.

## Why this matters

- **The clock is real.** NIST published PQC standards in 2024; the migration deadline
  for many systems is 2035. Most engineers still can't *see* what a hybrid handshake
  looks like under the hood.
- **Auditability is the point.** Every major claim in FIBEMATE is backed by a runnable
  test or a timestamped evidence record (100+ RFC 3161 TSR entries), not prose.
- **It's lonely out there.** PQC tooling is either a black-box production library or
  impenetrable academic code. FIBEMATE sits deliberately in the middle: clear enough
  to learn from, rigorous enough to trust.

## What we've already built (so you know the bar)

| Layer | What's there |
|-------|--------------|
| Algorithms | ML-KEM-768 (FIPS 203), ML-DSA-65 (FIPS 204), SLH-DSA (FIPS 205), SM2/SM3/SM4 |
| Verification | KAT 10,000-round consistency, TVLA side-channel analysis, 100+ TSR evidence chain |
| Protocols | TLS 1.3 hybrid handshake (IANA #4590/#4588), double-ratchet PQ |
| Hardware | FPGA NTT accelerator (Artix-7), ILA+L4 timing closure |
| Visualization | 26 interactive pages (3D animations, dashboards, sequence diagrams) |
| Packaging | 7 npm packages, CI + Nightly green, OpenSSF Scorecard tracked |

## Who we're looking for

We grow in two tiers. You don't need a cryptography PhD for either — curiosity and
care beat credentials.

### Contributors (no write access required)

You're a contributor if you can:

- Run the project by following the README Quick Start
- Read and modify the code
- Submit a PR that passes CI

**Start here:** pick a
[`good-first-issue`](https://github.com/Lennonhaha/fibemate/issues?q=is%3Aissue+is%3Aopen+label%3Agood-first-issue),
or propose a change in
[Discussions → Ideas](https://github.com/Lennonhaha/fibemate/discussions/categories/ideas).

Documentation, tests, and examples all count. No cryptography background required.

### Collaborators (write access, merge PRs)

Collaborators hold `write` access and help maintain the project. We invite
contributors who have:

| Condition | Requirement |
|-----------|-------------|
| Track record | Submitted **2–3 quality PRs** (passing CI, following code style, constructive review) |
| Sustained involvement | Continues participating — not a one-PR-and-gone contributor |
| Trust | Established through contribution history, not by asking |

Collaborators are invited individually after we've worked together. We do not grant
write access to strangers.

## How we evaluate (the invisible filter)

| Dimension | What we look for |
|-----------|------------------|
| Code quality | PRs pass CI and follow the style in `CONTRIBUTING.md` |
| Communication | Issues/PRs are constructive and respect project direction |
| Focus | Deep work in one area beats scattered drive-by changes |
| Consistency | Sustained participation, not a single dropped PR |

## How to join

1. **Pick an issue or propose a change.** Start small.
2. **Submit a PR.** CI runs all tests automatically — you'll see results immediately.
3. **We review and give feedback.** Every change is reviewed, cryptographic or not.

We welcome everyone regardless of experience level. If you're stuck, ask in
[Discussions → Q&A](https://github.com/Lennonhaha/fibemate/discussions/categories/q-a).

## One honest note

FIBEMATE is maintained by a single person today. That's a known limitation, not a
secret — it's documented openly in our OpenSSF roadmap. Our goal is for FIBEMATE to
become a **community-owned PQC engineering resource**. If that sounds like something
you want to build with us, the door is open.

---

## Links

- 🔗 Repository: https://github.com/Lennonhaha/fibemate
- 💬 Discussions: https://github.com/Lennonhaha/fibemate/discussions
- 📋 Contributing rules: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- 🌐 Project site: https://fibemate.net
- 📜 License: GPLv3 (non-negotiable — keeps PQC auditable and free)
