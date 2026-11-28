# 0003 — Device identity lives outside the WebView2 profile

<!-- SPDX-License-Identifier: GPL-3.0-only -->

- **Date**: 2026-11-28
- **Status**: Proposed
- **Supersedes**: —
- **Tracking**: #691 (identity binding), #752 (unbounded device rows)

## Context

The desktop client stores its device id in `localStorage` (`fk_device_id:<username>`).
Production data shows one row per login for an affected account: nine rows created at nine
login instants, each with the server default name, none ever touched again. The server already
does the right thing — it inserts only for an unknown id and calls `touchDevice` otherwise —
so the client is submitting a new id. The working hypothesis is that a WebView2 profile reset
(reinstall, profile repair) empties `localStorage` and `getOrCreate()` legitimately mints a
new id. That has not been proven from logs, because minting is silent.

Because `isRead` requires every active device of the recipient to acknowledge, orphan rows pin
messages at "unread" forever. A server-side containment shipped in #758: at login the account
keeps exactly one active device. That bounds the damage but does not stabilise the identity.

## Decision

Move the authoritative device id out of the WebView2 profile, next to the Rust key store in the
OS application-config directory, and keep `localStorage` as a cache only:

1. `device_identity_get(account)` / `device_identity_remember(account, id)` Tauri commands,
   backed by the app-config directory.
2. `device-id-client.js` reads `localStorage`, then the Rust store, then mints.
3. Minting logs a reason once (no stored id / owner mismatch / malformed) instead of failing
   silent.
4. Legacy `fk_device_id` keeps working as the mirror written on every remember.

## Consequences

- Device rows survive reinstalls, so read receipts stop depending on cleanup.
- Uninstall behaviour matters: if the installer removes app-config, the id still rotates. That
  is acceptable — it becomes visible in the mint reason instead of silently.
- Requires a client release (3.3.18+) and a reinstall test; not a hotfix.
