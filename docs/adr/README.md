# Architecture decision records

<!-- SPDX-License-Identifier: GPL-3.0-only -->

Short, dated records of decisions that are expensive to reverse. One file per decision,
numbered `NNNN-kebab-title.md`. A record states the context, the decision, the consequences,
and what evidence would make us revisit it. Records are immutable: a later record supersedes
an earlier one instead of editing it.

Status values: **Accepted**, **Proposed**, **Superseded by NNNN**, **Rejected**.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions in this directory | Accepted |
| [0002](0002-one-shared-database-per-release.md) | Every release serves one shared SQLite database, asserted at deploy time | Accepted |
| [0003](0003-device-identity-outside-webview-profile.md) | Device identity lives outside the WebView2 profile | Proposed |
| [0004](0004-fips203-not-kyber-round3.md) | `fibemate-core` implements FIPS 203 ML-KEM-768, not Kyber round-3 | Accepted |

Backlog: the remaining gaps tracked in issue #441 (public number sources, SM2/ML-KEM baseline)
get their own records once the numbers stop moving.
