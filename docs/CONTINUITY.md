# Continuity

This document records how the project keeps running if the sole maintainer
dies, is incapacitated, or is otherwise unable to continue. It is deliberately
concrete: it names the assets, where each one lives, and how a successor gets
control of it within a week.

## Assets

| Asset | Where it lives | Needed to |
|:---|:---|:---|
| Repository, issues, pull requests, CI | GitHub organisation account | merge changes, close issues, run releases |
| npm package `fibemate` and the `@fibemate/*` packages | npm account, publishing through a GitHub Trusted Publisher | publish a release |
| Release signatures | cosign keyless: the signature is bound to the workflow identity, there is no long-lived private key | verify a release |
| Domain `fibemate.net` and its DNS records | registrar account | keep the site and mail reachable |
| Production server | SSH key plus the hosting provider account | deploy, restart, restore |
| Application data | server-side SQLite file plus the hosting provider's snapshots | restore service |
| JWT signing key | server environment, or `data/.jwt-secret` on the host | keep issued sessions valid |

The release path needs no secret that has to be handed over: `release.yml`
signs with cosign keyless using the workflow's OIDC identity, and npm accepts
the publish because the workflow is a registered Trusted Publisher. A successor
with repository write access can therefore cut a release without holding a
long-lived signing key.

## Recovery path per platform

| Platform | How a successor regains control |
|:---|:---|
| GitHub | Transfer of an organisation is possible from another owner. With no second owner, GitHub Support handles account recovery for a deceased or incapacitated user when the request comes with the required legal documentation. |
| npm | npm Support can transfer package ownership; publishing also works from any account added to the Trusted Publisher configuration. |
| Registrar | Support-assisted account recovery, given the account identifiers and the legal documentation. |
| Hosting provider | Support-assisted recovery; snapshots are restorable from the provider console. |

## Seven-day checklist

1. Day 0: confirm the loss of access, notify the platforms listed above.
2. Day 1: regain repository access, or fork and publish from the mirror.
3. Day 2: publish a patch release through the existing workflow; the keyless
   signing path needs no key transfer.
4. Day 3: restore the service from the provider snapshot if the host is lost.
5. Day 4: rotate the JWT signing key and the TLS certificate if either may have
   been exposed.
6. Day 5: announce the change of custody in the repository and on the site.
7. Day 6-7: close out the issue tracker and hand the release cadence over.

## Current status

- **Maintainers:** one (bus factor 1). The project is actively looking for
  additional maintainers; see `GOVERNANCE.md`.
- **Offline custody:** implemented. The GitHub recovery codes, the registrar
  account credentials, the server SSH key and a database backup are stored
  encrypted on a removable medium that is kept offline. The decryption
  passphrase is held separately, in a sealed envelope, so the medium alone is
  not sufficient to use the material.
- **Succession:** assigned through a private legal authorisation document that
  names the successor. The successor can present it to GitHub, npm, the
  registrar and the hosting provider to recover control of the accounts, and
  then follow the checklist above. The document is not published, and neither
  is the successor's identity.
- **Why the successor is not named here:** publishing an individual or an entity
  behind an open-source project exposes them to unsolicited contact and links a
  personal legal arrangement to a public repository. The arrangement exists and
  is documented privately; its contents are available to a platform's trust and
  safety team on request, and to nobody else.

The recovery path does not depend on a handover of signing keys: releases are
signed keyless by the workflow identity and published through the npm Trusted
Publisher configuration, so a successor holding repository write access can cut
a release within the seven-day checklist.
