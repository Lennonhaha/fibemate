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
