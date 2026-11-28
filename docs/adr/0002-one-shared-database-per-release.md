# 0002 — Every release serves one shared SQLite database

<!-- SPDX-License-Identifier: GPL-3.0-only -->

- **Date**: 2026-11-28 (incident 2026-11-18, guards landed 2026-11-22)
- **Status**: Accepted
- **Supersedes**: —

## Context

Releases live in `/opt/fibemate/releases/<sha>` with `current` as a symlink. In November 2026 a
release-to-release migration dropped the `data/` symlink, so twelve releases each started from
their own 4096-byte empty database. Every account appeared to vanish: `POST /api/auth/login`
returned 401 in 1–5 ms (too fast for a bcrypt comparison), while the site, `/health` and pm2
all looked healthy.

## Decision

There is exactly one database: `/opt/fibemate/shared/data/fibemate.db`. Inside a release,
`data/` must be a symlink to `/opt/fibemate/shared/data`. `scripts/deploy-release.sh` step
`[2b/8]` refuses to deploy when the shared directory is missing, when `data/` is a real
directory, when `readlink` points elsewhere, or when the user count is below the floor.

## Consequences

- A deployment cannot silently start on an empty database; it fails closed instead.
- Deploys must create the symlink before `pm2 start`, and rollback must not copy `data/`.
- Diagnostic recipe: `lsof -p $(pgrep -f 'releases/' | head -1) | grep fibemate.db` must show
  the shared path. A fast 401 (1–5 ms) means "user not found", a slow one (~300 ms) means
  "wrong password".
- Revisit if the database ever moves to a server-backed store; the assertion is about the
  symlink, not about SQLite.
