# Governance

FIBEMATE follows a **Benevolent Dictator for Now (BDFN)** model.

## Roles

| Role | Name | Responsibility |
|:---|:---|:---|
| **Project Lead** | Lennon (lennonhaha) | Architecture, security, release, final decision |

## Decision-Making

- The Project Lead is the sole maintainer and final decision-maker.
- All contributions are reviewed via GitHub Pull Requests.
- Security-critical changes require the Project Lead's approval.
- Contributors are encouraged to open Issues or Discussions before large changes.

## Bus Factor

**Current: 1.** The project acknowledges the single-maintainer risk.
Mitigation:
- Full source code, build scripts, and documentation are publicly available
- Cryptographic primitives are independently reproducible from FIPS 203
- Ongoing effort: actively seeking additional maintainers through community channels and
  university partnerships.

## Succession

If the Project Lead becomes unavailable, any individual or organization may fork the
repository under GPL-3.0 and continue development. The fork with the most community
support becomes the de facto successor.

## Code of Conduct

This project adopts the [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md).
Reports go to `security@fibemate.net` or `@Lennonhaha`; enforcement decisions are
made by the Project Lead, as described in that document.

## Changes

All governance changes are made via Pull Request and require Project Lead approval.

## Maintenance and support

FIBEMATE v3.x is actively maintained. The Project Lead triages issues and security
reports continuously and targets a patch release within 30 days for security fixes
(see SECURITY.md for the reporting process).

- **Support window:** each major version line is supported for at least 24 months from
  its first release. v3.3.0 was released on 2026-08-31, so v3.x is supported until at
  least 2028-08-31.
- **Upgrades:** releases are published on GitHub with a CHANGELOG entry describing
  breaking changes; upgrading means checking out the new tag and running `npm ci`, or
  installing the new package version.
- **Deprecations:** announced at least one minor release before removal.
- **No SLA:** this is a volunteer project. The support window describes intent, not a
  contractual guarantee, and there is no paid support tier.

## Engineering discipline

Day-to-day engineering and disclosure rules (anti-false-green, evidence-first claims,
numeric conventions, dependency and SBOM handling) are normative in
[docs/ENGINEERING-DISCIPLINE.md](./docs/ENGINEERING-DISCIPLINE.md).
That annex governs commits, CI, dependency updates and external materials; this
document remains normative for roles, decision-making and succession.

### Verification states: deploy, CI, and functional green (2026-11-25)

Three claims are distinct and must be reported separately. One does not imply another.

| State | Definition |
|:---|:---|
| **Deploy green** | `deploy-release.sh` finishes 8/8; `current` resolves to the new release; `/health` has `build.commit == served.commit == target` and `matches_process=true`; `current/data` resolves to `/opt/fibemate/shared/data` with the expected user count. |
| **CI green** | On the exact commit, all required status checks and the monitored non-required workflows (Fuzz, nightly) are `success`; a skipped workflow is not a pass unless the skip is the designed path. |
| **Functional green** | A real user on a real path (desktop client, real WebSocket, real database query) completes the target flow and the data actually lands — for example, `readBy` contains the recipient's real `deviceId`. |

**Deploy green + CI green does not imply functional green.** On 2026-11-24 the
`839e119` deployment passed 8/8 and `/health` was aligned, and CI was green, but V3
still failed: post-deploy messages had `readBy=[]`; the target flow was not verified.
A report that says only "green" without naming one of the three states is incomplete.

### Discipline amendments N1–N5 (2026-11-14)

These five rules are binding on all commits, CI gates and external materials. The
rationale, counter-examples and full criteria live in the annex; the table is the
short form used when reviewing a change.

| Rule | Requirement | Gate |
|:---|:---|:---|
| **N1** Findings must be filed | A conclusion-level finding must have an issue number **or** a CI step. A log/chat note alone does not close it. | Cannot be cited as "known" without one of the two |
| **N2** Official vectors test *this* implementation | Every cryptographic primitive needs a KAT that exercises our own code, with the object under test named in the test file. Third-party KATs are cross-checks only. | Missing KAT = red for that module |
| **N3** Single source for numbers | External numbers come from `docs/metrics.json`, each entry carrying value + scope + date + reproducible command. Documents are generated from it or verified by `scripts/check-metrics.cjs`. | `node scripts/check-metrics.cjs` must exit 0 |
| **N4** Check existence before writing | Before overwriting an existing file, check tracked status and diff. Creating a new file beats overwriting a same-named one. | Overwriting pre-existing content = incident |
| **N5** Historical truncation disclosure | Claims about events earlier than the local git horizon must be written as "verifiable lower bound + inference". | Unbounded historical assertion = not publishable |
