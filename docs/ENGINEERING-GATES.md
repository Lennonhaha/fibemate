# Engineering gates and the faults they block

<!-- SPDX-License-Identifier: GPL-3.0-only -->

> 门禁不是功能的附属品，是故障模型的镜像。每新增一条门禁，必须写明它拦截的是哪一类故障；
> 没有对应故障模型的门禁，标记为 advisory，不计入覆盖。
>
> A gate is not an accessory to a feature; it is the mirror of a fault model. Every new gate must
> name the fault class it blocks. A gate with no fault class is advisory and does not count as
> coverage.

This page exists because a green check answers only one question: *did this particular assertion
run and hold?* It says nothing about what the check would have caught. `docs/known-soft-gates.md`
lists checks that cannot go red; this page lists checks that can, and what they are for.

Verified against `main` @ `bb7c788` on 2026-11-26. Gate set comes from the branch ruleset
(`required_status_checks`, 14 contexts) plus the scripts those jobs run.

## Fault classes

| ID | Fault | What it looks like in practice |
|---|---|---|
| **F1** | Zero coverage | The command runs, exits 0, and checked nothing — empty file list, empty matrix, `if: false`, or a job that never started (GitHub reports `skipped`/`neutral`, which a required check treats as satisfied). |
| **F2** | Silent fallback | The success path is also reachable by the degraded path: no native addon, no report, `null`, default config. The assertion holds on the fallback, so the primary path can be missing while green. |
| **F3** | Drift over time | A number, config, or evidence file is copied by hand and diverges from its source of truth. Every later gate validates the drifted copy and stays green. |
| **F4** | Label/config not effective | A control exists but is advisory or not wired in: a label with no check, a ruleset context that no job produces, a step ending in `\|\| true`. |
| **F5** | Epoch / version mismatch | State from another time or build is treated as current: a branch cut from a pre-squash head, a draft built before the fix, a device registered after the message it is expected to acknowledge. |
| **F6** | False green / false red from the gate itself | The gate's own logic is wrong: an aggregate passes when a child did not run, a threshold fires on noise, a comparator aligns by line number and reports a cascade of phantom diffs. |
| **F7** | Permission / credential misconfiguration | The job cannot do what it claims because its token scope, secret, or credential is wrong or absent — and nothing distinguishes that from a clean result. |

## Gates that can go red

Required checks (ruleset `main`, strict) are marked **R**. "Negative evidence" is the observable
proof that the gate fails when its fault is present — not a claim that it should.

| Gate | Where | What it asserts | Fault | Negative evidence |
|---|---|---|---|---|
| **lint** **R** | `.github/workflows/ci.yml` (`lint`) | ESLint over `packages/pqc-kem/src`, `test`, `src` with `--max-warnings 0` | F1 | Scope drift is the real risk: in 2026-08 the nightly linted a different file set than CI and produced "green here, red there". An unused binding fails it (#728 caught exactly this). |
| **bom-check** **R** | `ci.yml` (`bom-check`) | No BOM / encoding corruption in tracked files | F2 | Corruption is invisible in a GBK terminal, so "looks fine" is not evidence; `check-bom.cjs` reads the first three bytes. |
| **bench** **R** | `ci.yml` (`bench`) | Performance budget on hot paths | — (performance regression) | Budget breach fails the job. Not a fault class above; recorded so it is not mistaken for correctness coverage. |
| **sbom** **R** | `ci.yml` (`sbom`) | SBOM matches the lockfile/tree | F3 | `check-sbom-drift.cjs` fails when the checked-in SBOM and the tree disagree. |
| **docs-check** **R** | `ci.yml` (`docs-check`) | Docs build, links, claim copy | F3, F4 | Partly advisory: `markdownlint` and `markdown-link-check` end in `\|\| true` (`known-soft-gates.md` C1/C2), so link rot does **not** fail this job. Treat the docs half as advisory. |
| **dco** **R** | `.github/workflows/dco.yml` | Every commit in the PR range carries `Signed-off-by` matching its author | provenance (no F code) | PR #65 failed on a missing trailer; the check is git-only, no network. |
| **interop** **R** | `.github/workflows/interop.yml` | Cross-implementation agreement (Noble / native / JS) | F2 | Divergence between two independent implementations fails; a single implementation agreeing with itself cannot. |
| **ten checks** **R** | `.github/workflows/verify-all.yml` | KAT, noble parity, canonical signatures, input validation, core, edge cases, two gates, tarball contents, cold install | F1 | Catches "works in the repo, broken in the tarball" — the repo-only scope is the zero-coverage fault. Report is kept as an artifact. |
| **KAT-Regression** **R** | `.github/workflows/kat-regression.yml` | NIST vectors still produce byte-identical output | F2 | A KAT that scans checked-in text can pass while the live code fails; this job runs the vectors. |
| **codeql-gate** **R** | `.github/workflows/codeql.yml` (`codeql-gate`) + `scripts/codeql-gate.cjs` | The analysis job actually ran and succeeded | F1 | The required context is a separate job because a required `Analyze (...)` turns green on `skipped`/`neutral`; the gate script turns those into a failure (PR #582). |
| **evidence-immutable** **R** | `.github/workflows/evidence-immutable.yml` | No evidence path (.tsr, SHA256SUMS) is modified/renamed/deleted without an allowlisted reason | F3, F6 | Second step proves the gate goes red on a synthetic edit; without it the gate could pass vacuously. |
| **pr-baseline** **R** | `.github/workflows/pr-baseline.yml` | The PR does not carry already-merged work (patch identity via `git cherry`) | F5, F6 | Two incidents: a branch cut from a pre-squash head, and a squash that did not reproduce the reviewed change. Ancestry checks cannot see either. |
| **Fuzz** **R** | `.github/workflows/fuzz.yml` | Parsers survive adversarial input (jazzer harnesses) | — (robustness) | Crash or hang fails. Not a fault class above. |
| **all-checks** **R** | `ci.yml` (`all-checks`) | Aggregates the matrix; refuses `do-not-merge` | F6, F4 | Fails when a required child is missing and when the PR carries `do-not-merge` (#726). Known hole: a label added **after** checks start does not re-trigger, so this is a race, not a proof. |

Non-required gates that still fail their job:

| Gate | Where | Fault | Note |
|---|---|---|---|
| `check-tsr-copy.cjs` | inside `lint` (`ci.yml`) | F3 | Public copy quotes the counter; typed numbers drifted for two weeks (`374` vs `372`). Nine copy patterns are checked. |
| `readby-device-epoch` | `test/test-all.js`, run by `node-test` | F5 | A device registered after a message cannot block `isRead`. Before the fix 4/7 cases failed; the two control cases pin the behaviour that must not change. |
| `tvla-live-gate.cjs` | `nightly-phase2.yml` | F2, F6 | Exists because a text-scanning summary reported PASS while the live test measured \|t\| = 58–86 (#510). Allowlist = NTT + invNTT; two thresholds (4.5 warn, 10 fail) because single runs move by a few units. **Not a required check.** |
| coverage floor | `.github/workflows/coverage.yml` | F1 | 80 % statement/line floor. Branch coverage (67.85 %) is **not** gated. |
| `claim-check` / `claim-coverage` | `ci.yml` | F4, F3 | Registry entries must map to a gate; a claim with no evidence fails. |
| `nginx-drift` | `.github/workflows/nginx-drift.yml` | F3 | Compares repo config with live nginx. Not required; runs on push/schedule. |
| `deploy-dry-run` | `.github/workflows/deploy-dry-run.yml` | F3 | Observes live `/health` against `main`. Not required — a lagging deploy is expected to be red here and must not block PRs. |
| `check-encoding.cjs` / `check-bom.cjs` | `ci.yml`, deploy `[6b/8]` | F2 | Byte-level, not display-level. The deploy path also runs it against the release tree. |

## Coverage by fault class

| Fault | Hard gate(s) | Verdict |
|---|---|---|
| F1 zero coverage | `codeql-gate`, `all-checks`, coverage floor, `ten checks` | **Partial.** Covered where a denominator is asserted; a gate that iterates an empty glob is still green unless it counts its inputs. |
| F2 silent fallback | `interop`, `KAT-Regression`, `tvla-live-gate` (nightly), deploy `usingNative` + roundtrip | **Partial.** `tvla-live-gate` is not required, so the fallback fault is nightly-only for the DSA path. |
| F3 drift | `check-tsr-copy`, `sbom`, `evidence-immutable`, `nginx-drift` (advisory) | **Covered for numbers and evidence**; nginx drift is visible but not blocking. |
| F4 label/config | `all-checks` (do-not-merge step), `claim-check` | **Partial.** Labels added after checks start are not re-evaluated; `docs-check` halves are `\|\| true`. |
| F5 epoch/version | `readby-device-epoch`, `pr-baseline` | **Covered for these two surfaces.** No generic guard: any new predicate over time-stamped state needs its own epoch test. |
| F6 false green/red | `codeql-gate`, `evidence-immutable`, `pr-baseline` | **Partial.** Each of these was itself written after a false-green incident. There is no gate that audits gates; `known-soft-gates.md` is manual. |
| F7 permission/credential | **none** | **Uncovered as a gate, and the alert count that used to stand in for one is now zero.** `TokenPermissionsID` was 3 open on `fibemate-tauri` at `4c1118f`; after #121 moved two `contents: write` grants from workflow top level onto the one job that publishes (and kept the third, which creates the Release), the next Scorecard run closed all 5 tauri alerts. Nothing still fails a build when a workflow widens its token. Zero open alerts means "nobody has looked since", not "it cannot happen". |

Fault classes with **no hard gate**: F7 (permission/credential). Everything else is partial at best —
"partial" here means the class is caught on some surfaces and not on others, and the gate list above
says which.

## Gates named in review that do not exist in this repository

- `checked-scan` — no file, script, or job by that name in `fibemate` or `fibemate-tools`
  (`git grep -n "checked-scan"` returns nothing). The nearest real coverage is `claim-check` /
  `claim-coverage`, which map claims to evidence rather than scanning them.
  If a review refers to it, the reference is to another project or to a proposal.

## Advisory (does not count as coverage)

- `markdownlint-cli` and `markdown-link-check` in `docs-check` — `2>/dev/null || true`
  (`known-soft-gates.md` C1/C2).
- `check-crypto-policy.cjs` in `pqc-migration-verify.yml` — `|| true` (C3).
- OSV scan, OpenSSF Scorecard, `nginx-drift`, `deploy-dry-run` — visible, not required.
- `tvla-live-gate` — fails its own job, but that job is nightly and not in the ruleset.


## Alert taxonomy: Scorecard alerts are not CodeQL alerts

The two arrive in the same endpoint (`/code-scanning/alerts`), so a count that mixes them
describes nothing. Measured 2026-11-26 on `main`:

| Repository | Open | Composition | Real CodeQL |
|---|---:|---|---:|
| `fibemate` | 0 | — | 0 |
| `fibemate-tauri` | 0 | was 3 `TokenPermissionsID` + 2 `js/useless-assignment-to-local` @ `privacy.js:124,152` | 2 → 0 |
| `fibemate-tools` | 11 | `PinnedDependenciesID`×6, `FuzzingID`, `CIIBestPracticesID`, `CodeReviewID`, `MaintainedID`, `BranchProtectionID` — all Scorecard | **0** |

Consequences worth writing down:

- "11 CodeQL alerts in `fibemate-tools`" is wrong in both directions: none is CodeQL, and six of
  them are one rule about install commands, not six problems.
- `PinnedDependenciesID` here does **not** mean "pin `uses:` to a SHA". Every `uses:` in that
  repository already points at a 40-hex SHA. The alerts say `score is 7: npmCommand not pinned by
  hash` and point at `npm install --global npm@11.6.0`, `npm install --no-save ... ajv@8`,
  `pip install --upgrade build`. Clearing them means replacing ad-hoc installs with
  lockfile-based `npm ci` / hash-pinned `pip install --require-hashes` inside release paths —
  a change with blast radius, not a formatting pass.
- `BranchProtectionID` (`score is 4`) and `CodeReviewID` (0/26 approved changesets) are
  **accepted, not owed**: a single-maintainer repository cannot satisfy "someone else approved
  it", and setting `required_approving_review_count` to 1 would block every PR including the
  maintainer's own. Recorded as a decision so the next round does not re-open it as a todo.

### Where "no analysis found" is the real gap

Five repositories have no CodeQL workflow at all. Their zero is an **absence of scanning**, not a
clean result, and it must not be quoted as "0 alerts":

`fibemate-mobile`, `fibemate-react-native`, `pqc-hw-bench`, `lookingglass`, `lookingglass-v2`.

Any statement of the form "the org has N open alerts" has to say which repositories were scanned,
or it silently treats five unscanned repos as clean.

## Adding a gate

1. Name the fault class it blocks, or mark it advisory.
2. Show it red on a real or synthetic input, and say which input. A gate whose failure path has never
   been executed is F1 by construction.
3. If it asserts a denominator (files, vectors, devices, sessions), assert the denominator is non-zero.
4. If it can be satisfied by a fallback path, assert the primary path explicitly.
