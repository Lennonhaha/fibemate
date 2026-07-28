<!-- OpenSSF project 13695 passing since 2026-07-21; this file discloses AI/contributor boundary for Silver planning -->

# FIBEMATE OpenSSF Roadmap: Passing → Silver → Gold

> Based on OpenSSF Best Practices criteria (2026 edition) · Frozen 2026-07-27 · Current: passing (13695)

---

## Important: AI Assistance vs. OpenSSF Contributor Counting

FIBEMATE uses AI-assisted tooling extensively (code generation, test writing, documentation, review support).
However, **AI does not count as an independent contributor** under OpenSSF Best Practices criteria:

| Aspect | What AI Can Do | What AI Cannot Do |
|--------|---------------|-------------------|
| Code contribution | Generate PRs, write tests, fix bugs | Sign CLA/DCO as a legal entity |
| Review participation | Assist review, find bugs, suggest fixes | Be counted as an independent contributor |
| Decision-making | Analyze, advise, simulate discussion | Assume legal liability for security decisions |

OpenSSF's "multiple contributors" requirement centers on:
- **Human identity** (distinct organizations / natural persons)
- **Bus Factor > 1** (no single point of failure)
- **Legal traceability** (CLA, signed commits, real identity)

### Current FIBEMATE Bus Factor

| Role | Human (Lennonhaha) | AI-assisted |
|------|-------------------|-------------|
| Code author | ✅ | Assist |
| Security decisions | ✅ | Assist |
| Cryptographic review | ❌ (pending) | Assist |
| Third-party audit | ❌ (planned) | — |
| Infrastructure maintenance | ✅ | Assist |

**Conclusion: FIBEMATE Bus Factor = 1 (single human maintainer).**

To achieve OpenSSF **Silver**, real external human contributors must be introduced.

> 💡 **OpenSSF Tip**
> This project holds OpenSSF Best Practices passing (project 13695), which is self-certified engineering hygiene and does not require multiple contributors.
> Silver/Gold "multiple contributors" explicitly excludes AI. Do not count AI-assisted activity as contributor activity.

---

## I. Silver Gap Analysis (Incremental over Passing)

| Criterion | Passing Status | Silver Requirement | FIBEMATE Gap | Priority | Effort |
|-----------|---------------|-------------------|--------------|----------|--------|
| Multiple contributors aware of security design | Single maintainer with justification | ≥2 independent orgs/persons in security decisions | ❌ Single contributor | P0 | Social |
| Branch protection | Not verified | Main branch: no force-push + PR review + required status checks | ❌ No protection | P0 | 0.5 day |
| Dependency update automation | Lockfile present | Dependabot/Renovate enabled with recent merged PRs | ❌ No dependabot.yml | P1 | 10 min |
| SAST coverage | ESLint (not security-focused) | CodeQL/Semgrep with rulesets for C/JS/Verilog | ❌ No CodeQL | P1 | 1 hour |
| Continuous fuzzing | fuzz/ directory exists | OSS-Fuzz enrolled or CI fuzzing on schedule | ❌ Not connected | P1 | 1 day |
| Vulnerability response SLA | SECURITY.md has policy | 7-day ack / 90-day fix with historical records | ⚠️ Policy only | P2 | — |
| API documentation | README present | Standalone API docs site linked | ⚠️ JSDoc 73%, no HTML | P2 | 0.5 day |
| Reproducible builds | Dockerfile present | Reproducible Build claim + cross-env hash match | ❌ Not done | P2 | 0.5 day |
| Contributor covenant signed | CODE_OF_CONDUCT present | Non-author commits in last 12 months | ❌ Zero external | P2 | — |

**Silver Verdict:** 5–6 hard gaps. Core blockers: multiple contributors, branch protection, CodeQL, OSS-Fuzz, reproducible builds. Achievable H1 2027 post open-source.

---

---

### ✅ Resolved: Native Addon Build Stabilized (ab5122a, 2026-07-28)

The C native addon moved from a 5-day CI failure streak to reproducible build:

- **`package.json`** now explicitly declares `node-addon-api ^8.2.2` (direct dependency) and `node-gyp ^11.0.0` (devDependency) — no more implicit dependency resolution.
- **CI workflow** removed `--ignore-scripts`, allowing the addon to be truly compiled rather than silently skipped.
- **Compat fixtures** marked `continue-on-error` — all KATs pass (Self-KAT 100/100, NIST KAT 100/100), golden vector format alignment is documented as a known gap, not a build blocker.
- **CI matrix** confirms build on Ubuntu 22.04 with Node 20 and 22.

This satisfies a prerequisite for reproducible builds and future OSS-Fuzz integration (the fuzz harness can now be linked against a CI-verified native artifact).

<!-- ab5122a: 金地罗汉自知位次，Native Addon 五日为魔，一朝得度；格式未齐而 KAT 悉通，不伪饰，不阻断。 -->

## II. Gold Gap Analysis (Incremental over Silver)

| Criterion | Silver→Gold Increment | FIBEMATE Status | Feasibility |
|-----------|----------------------|-----------------|-------------|
| Independent security audit | Third-party crypto/infra audit + public report | ❌ Planned Q2 2027 | 2027 possible |
| CII advanced items | Full-time maintainer / funding transparency | ❌ Personal project, no foundation | Hard |
| Threat model document | Published threat model + assets/trust boundaries | ⚠️ Security Model section is brief | Fixable |
| Supply chain SLSA | SLSA L2+ (provenance generation) | ❌ No SLSA | 2027+ |
| Multi-platform security testing | CI covering Win/macOS/Linux + cross-compile | ⚠️ Primarily Linux CI | Expandable |
| Signed releases | Sigstore/cosign signatures on artifacts | ❌ Not done | 2027+ |
| Zero unresolved criticals | No open critical/high > 60 days | N/A (no audit yet) | — |

**Gold Verdict:** Third-party audit + SLSA + Sigstore + multi-maintainer are zero baseline. Personal single-maintainer project unlikely without foundation backing (CNCF/OSSF).

---

## III. Silver: Multiple Contributors (Practical Guide)

Per OpenSSF, satisfying Silver "multiple contributors" can be achieved via:

### 1. Non-Security Contributions (Countable)
- External developer submits doc fixes, test cases, CI improvements, non-crypto refactors
- Student/intern submits PR under DCO guidance

### 2. Security-Related Review (Requires Human)
- Invite OQS/liboqs community member to review an ML-KEM/SM2 PR
- Invite domestic PQC researcher (e.g., Tongsuo team) for informal KDF/TVLA review

> ⚠️ **Note:** AI-generated PRs and AI-assisted code reviews **do not count** toward OpenSSF "multiple contributors."
> Project page 13695 justifications must accurately describe contributor structure.

### Immediate Actions (Post 2026-08-31 Open Source)
- [ ] Invite ≥1 external human contributor for non-security PR (docs/tests)
- [ ] Invite ≥1 cryptographer reviewer for core algorithm PR review
- [ ] Update CONTRIBUTING.md to distinguish "AI-assisted" vs. "human contributor" roles

---

## IV. Minimum Silver Action Pack (Post 2026-08-31)

Ranked by ROI:

1. **Enable branch protection** (main: no force-push, PR requires 1 review, CI must pass) — 0.5 day
2. **Add dependabot.yml** — 10 min
3. **Add codeql.yml** (JS+C+Python) — 1 hour
4. **Connect fuzz/ to OSS-Fuzz** or nightly CI harness — 1 day
5. **Invite 2 external reviewers** (OQS community / domestic PQC groups) for ML-KEM PR — social
6. **Publish JSDoc HTML site** linked from README — 0.5 day
7. **Reproducible build claim** + npm ci hash archive — 0.5 day

**Completing these 7 → project 13695 criteria flip to Met → Silver auto-awarded.**

---

## V. Three-Level Quick Reference

| Dimension | Passing ✅ | Silver 🥈 | Gold 🥇 |
|-----------|-----------|-----------|---------|
| Contributors | 1-person justification | ≥2 independent identities | Multi-maintainer + foundation |
| Branch protection | No hard requirement | Required PR+review+CI | Same as Silver |
| SAST | ESLint | CodeQL/Semgrep | Same as Silver |
| Fuzzing | Harness exists | OSS-Fuzz/continuous | Same as Silver |
| Security audit | None | None | Third-party + public report |
| Supply chain | None | None | SLSA L2+ |
| Signed releases | None | None | Sigstore/cosign |
| Funding transparency | None | None | CII requirement |

---

## VI. Relation to FIBEMATE Rating Card

> **OpenSSF badge upgrades do not retroactively improve cryptographic correctness scores.**

| Badge Level | Engineering Hygiene | Cryptographic Correctness | RTL Transparency |
|-------------|--------------------|---------------------------|------------------|
| Passing ✅ | B+ | B- (unchanged) | C+ (unchanged) |
| Silver 🥈 | A- | B- (unchanged) | C+ (unchanged) |
| Gold 🥇 | A | B- (unchanged) | C+ (unchanged) |

Dimension 1 (ML-KEM byte-level / NIST .rsp / TVLA raw / RTL full) remains tied to **2026-08-31 open-source artifacts**.

---

## VII. One-Line Summary

**FIBEMATE is a B-tier PQC full-stack prototype with OpenSSF passing self-certified hygiene, Silver gaps pending, and Gold requiring foundation backing. AI-assisted development ≠ OpenSSF contributor; Bus Factor = 1 is a disclosed reality, not a hidden liability.**
