# 0001 — Record architecture decisions

<!-- SPDX-License-Identifier: GPL-3.0-only -->

- **Date**: 2026-11-28
- **Status**: Accepted
- **Supersedes**: —

## Context

Most of this project's expensive knowledge lives in commit messages, issue threads and the
deploy scripts. Two incidents in November 2026 showed the cost: the release-symlink defect
(0002) and the `fibemate-core` 0.1.0 publish (0004) were both understood in discussion but
not written anywhere a reader would look first. External review also flagged the absence of
an ADR directory.

## Decision

Decisions that are expensive to reverse get a numbered record under `docs/adr/`. Each record
is short (one screen), dated, and names the evidence that would reopen it. Records are appended,
never rewritten; a change of mind is a new record that supersedes the old one.

We do not backfill every historical decision. We backfill the ones that (a) already caused an
incident, or (b) a reader would otherwise have to reverse-engineer from scripts.

## Consequences

- Reviewers can check "was this deliberate?" without reading git history.
- The records are only useful if they stay short; a long ADR is a design document and belongs
  in `docs/`.
- Issue #441 stays open until the public-number and SM2 baseline gaps get records too.
