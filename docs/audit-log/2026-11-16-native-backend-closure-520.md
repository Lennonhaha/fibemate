# #520 — Native ML-KEM backend: closure report

**Status:** the backend is restored and observed. The issue stays open until the three items in §7 are
done; nothing in this document asks for it to be closed yet.

**Date:** 2026-11-16 · **Repo:** `Lennonhaha/fibemate` · **Related:** #507, #521–#531,
`docs/audit-log/2026-11-16-deployment-drift-postmortem.md`, `docs/known-soft-gates.md`

---

## 1. What was wrong

Production served ML-KEM from the pure-JS implementation, silently, for about **75 days** (since
2026-09-02, the commit that introduced the `packages/pqc-kem/native/build/Release/mlkem.node` require
path). Three independent layers had to fail together for that to be invisible:

| layer | what it did | why nobody saw it |
|---|---|---|
| path intent | `src/index.js` required the addon from a path the deploy never built into | the require was wrapped in `try/catch` |
| deploy | `SYNC_TREES=src` only; `packages/` was copied by hand | nothing compared `packages/` to the commit |
| loader | `catch` returned a JS fallback, one log line at boot | the line was informational, not a failure |

A fourth layer made it durable: the CI job that **did** build the addon discarded it, and its "Verify
native addon loads" step printed `Backend: JS (no addon)` while exiting 0 — its round-trip assertion
passes on the fallback too. Every signal was green.

## 2. Timeline (GMT+8)

| time | event |
|---|---|
| 17:28 | `require(...)` of the addon fails with `MODULE_NOT_FOUND`; `/proc/<pid>/maps` has 0 mlkem mappings; `packages/pqc-kem/native/build` does not exist |
| 17:38 | build the addon from `383b2e5` on the host: `node-gyp rebuild` → `mlkem.node` 83,528 B (the only warning is the pre-existing `unused variable 'js_ss_s'`) |
| 17:40 | parity vs pure JS: keygen 20/20, encaps 20/20, cross-decaps 20/20, implicit-rejection 20/20; KAT 100/100; malformed inputs rejected on both paths |
| 17:44 | PR #521 (route-level input validation, 400 instead of 500) → merged `a08de8c`, deployed |
| 17:47 | addon copied into `/opt/fibemate-full/packages/pqc-kem/native/build/Release/`, **without restart**: 0 mappings, health 200 (proves the copy is inert) |
| 17:49 | `pm2 restart`: 5 mlkem mappings, `usingNative=true`, `/api/mlkem/test` 200 with 1184/2400/1088/32 byte keys |
| 18:05 | PR #522 postmortem merged `dcdf45e`; public comment on #520 |
| 18:11 | PR #523 (`/health` reports `mlkem.backend`, banner, `MLKEM_REQUIRE_NATIVE`) merged `d36d1f15`, deployed |
| 18:5x | staging instance on port 3003: decaps 400 branch 9/9, cross-credential isolation proven, zero writes to the production data directory |
| 19:0x | production `JWT_SECRET` rotated 10 → 64 hex; new-secret token 200, old-secret token 401 |
| 19:2x | PR #528 (`JWT_SECRET` length guard + `FIBEMATE_ENV_FILE`) merged `331e1a1`, deployed |
| 19:35 | `.env` 644 → 600 (backup kept); PR #531 opens the deploy-side assertion |
| 20:14 | watchdog: 4th consecutive `ok` — native, 5 mappings, median 1.57 ms |

## 3. Evidence that the restore is real (not a green tick)

| claim | how it was measured | result |
|---|---|---|
| native and JS agree | same `coins`, same `m`, byte comparison of pk/sk/ct/ss | 20/20 identical each |
| matches FIPS 203 vectors | `packages/pqc-kem/test/kat/mlkem-768-KAT.rsp`, 100 vectors | ek/dk/c/k 100/100 |
| implicit rejection preserved | flip 1 ciphertext byte, compare rejection secrets | 20/20 equal |
| package suite | `basic`, `input-length`, `internal-invariants`, `native-parity` | 17 tests pass, +82 checks |
| the process actually loads it | `/proc/<pid>/maps` filtered for `mlkem` | 5 entries (was 0) |
| it is the backend we think | `/health` → `mlkem.backend` | `native` |
| public surface | `/api/mlkem/test` | 200, sizes 1184/2400/1088/32, roundTrip true |
| performance | 5 sequential `/api/mlkem/test` timings | pure JS 5.0–6.4 ms → native 1.9–3.3 ms; watchdog median 1.57–2.51 ms |
| nothing else broke | health 200, `check-live` 4/4, error.log unchanged | pass |

The latency numbers are wall-clock over loopback and include HTTP overhead; they are reported as a
ratio (~2.5×), not as a benchmark.

## 4. What changed in the repo

| PR | merge | what it does |
|---|---|---|
| #521 | `a08de8c` | `/api/mlkem/encaps` and `/decaps` reject wrong-length or non-hex input with 400 instead of handing it to the primitive |
| #522 | `dcdf45e` | postmortem: five corrections to the first draft, root-cause chain, five preventive rules |
| #523 | `d36d1f15` | `/health` exposes `mlkem.backend` + detail; 6-line degradation banner at boot; `MLKEM_REQUIRE_NATIVE=1` makes degradation fatal; deploy `[3d]` addon manifest check, `[3e]` packages drift report |
| #524 | `83041ae` | deploy `[3d]`: `date` was given a quoted argument, printing `invalid date` and a blank build time while the deploy stayed green |
| #528 | `331e1a1` | `JWT_SECRET` from the environment must be ≥32 chars; `FIBEMATE_ENV_FILE` can point at another env file |
| #530 | `ad24d39` | docs: TVLA 36/36 → 3 of 9; KAT 10,000 → round-trip; SM2 CI compares vectors; soft-gate inventory |
| #531 | open | deploy `[3f]`: warn (or fail with `ENV_PERM_STRICT=1`) when the runtime `.env` is group/world readable |
| #525 | draft | CI builds the addon, records sha256 + build-info, uploads the artifact, and exits 2 if the addon did not load |

## 5. Monitoring now in place

Cron job `mlkem-native-watch-24h` (isolated, every 30 min, read-only over SSH):

- `usingNative === true`, `mlkem.backend === native`
- ≥1 `mlkem` mapping in `/proc/<pid>/maps`
- `/health` 200, `/api/mlkem/test` `roundTrip: true`, 5-sample median latency < 10 ms (baseline 1.6–2.5)
- no new fallback lines in `error.log`
- `check-live` 4/4

On any anomaly it writes `tmp/mlkem-ALERT.md`, emails `27202998@qq.com` with subject prefix
`[mlkem-watch][P0]`, and appends to `tmp/mlkem-watch.jsonl`. It never restarts, deploys, or edits a
server file. The 24 h window started 2026-11-16T10:05Z and ends ~2026-11-17T10:05Z.

## 6. Rollback

1. `rm -rf /opt/fibemate-full/packages/pqc-kem/native/build` then `pm2 restart fibemate` — the loader
   falls back to pure JS, `/health` reports `pure-js`, everything keeps working (that was the state for
   75 days).
2. Repo-level: `git revert` of #521/#523 and redeploy.
3. `.env`: `/root/fibemate-env-20261116-105445.bak` (pre-rotation) and
   `/root/fibemate-env-prechmod-20261116-113522.bak` (pre-chmod). Restoring the pre-rotation secret
   invalidates tokens issued since; that is the intended effect.

## 7. Still open — these are why #520 is not closed

| # | item | exit criterion | tracking |
|---|---|---|---|
| 1 | default hard failure | `MLKEM_REQUIRE_NATIVE` flipped on by default in production after the 24 h window is green, WARN removed from `[3d]` for the missing case | PR-B, after #525 |
| 2 | `packages/` inside the deploy guarantee | `packages/` either synced and hash-asserted or produced by a build; drift count 0, not 66 | #507, design in `docs/507-immutable-deploy-design.md` |
| 3 | CI-built addon consumed by the deploy | deploy takes the addon from the CI artifact (or builds it itself) and verifies the sha256 against the artifact manifest | #525 → PR-A/PR-B |
| 4 | `.env` permissions asserted in the deploy path | #531 merged and `ENV_PERM_STRICT=1` enabled | #529, #531 |
| 5 | cleanup | orphan `/opt/fibemate-full/addon/build/Release/mlkem.node` (78,760 B, Jul 22, referenced by nothing) removed after the window | this issue |

Closed since the issue was filed: decaps 400 verification (9/9 on an isolated instance, cross-credential
check, zero production writes), weak `JWT_SECRET` (rotated, proven with 200/401), the npm registry
diagnosis (#526: stale local cache, not a stale registry).

## 8. Refusals worth recording

- **The production decaps 400 path was not black-boxed against production.** It needs a valid token and a
  session; testing it there would have written to the production DB. It was verified on an isolated
  instance on port 3003 with its own data directory and its own secret, and isolation was proven by
  taking a token signed by that instance and getting **401** from production.
- **The addon was not hot-swapped under a running process.** It was copied first and confirmed inert
  (0 mappings, health 200), then a restart picked it up.
- **`pkill -f` was avoided** when cleaning up the staging process: the staging command line is identical
  to production's, so a pattern kill would have taken production with it. Only the recorded PID was
  killed.

## 9. Lessons

- A `catch` that keeps the service alive is a monitoring decision, not an error-handling convenience.
- "The deploy succeeded" must not be allowed to mean anything other than "the bytes on disk hash to the
  commit". `check-live` verifies the static site; it never inspected `packages/`.
- A binary is not covered by `git checkout`. Anything not produced by the deploy must be produced by
  something the deploy trusts, or it is drift with a version number.

Full rule list: `docs/known-soft-gates.md` (class D) and the five rules in
`docs/audit-log/2026-11-16-deployment-drift-postmortem.md` §5.
