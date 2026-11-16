# Known soft gates

<!-- SPDX-License-Identifier: GPL-3.0-only -->

> Purpose: a green check is only evidence if it can go red. This page lists every place where a check
> in this repository (or in the deploy path) is configured so that it *cannot* go red, or where a check
> can pass while proving nothing. It exists so that "CI is green" can be read with the right caveats
> instead of being taken as a blanket guarantee.
>
> Every entry below was verified by reading the file at the cited line on 2026-11-16 (`main` @ 331e1a1).

## How to read this page

Each entry says: what the check claims, what it actually proves today, and what has to be true before
it can be tightened. Nothing here is "we will fix it eventually" hand-waving - the last column is the
exit condition.

Categories:

- **A. Disabled hard gate** - a real gate that is switched off. Worst kind: a zero-effort red would be
  caught nowhere else.
- **B. Advisory by design** - cannot fail the build, but the file says why. Acceptable if the rationale
  still holds; must be re-read when the underlying situation changes.
- **C. Silently neutralised** - `|| true` / `2>/dev/null` with no comment, no warning, no issue. This is
  indistinguishable from a passing gate unless you read the YAML.
- **D. Logic-level false green** - the step runs, exits 0, and proves nothing.

---

## A. Disabled hard gates

| # | Location | What it claims | What it does today | Exit condition |
|---|---|---|---|---|
| A1 | `.github/workflows/native-build.yml:75` (`NIST KAT (100)` step) | ML-KEM-768 native addon matches the 100 NIST vectors | `if: false` - the step never runs. The KAT is only executed for the pure-JS path elsewhere | A C-addon KAT exists that can actually be compared (ACVP-based); then flip to `if: true` **and** assert a non-zero vector count |

Note: the JS-side vector KAT *does* run (`packages/pqc-kem/test/kat/mlkem-768-KAT.rsp`, 100 groups),
so vector comparison is not absent repo-wide - it is absent for the native binary, which is the artifact
that ships.

## B. Advisory by design

| # | Location | Why it cannot fail | Rationale on file | Re-read when |
|---|---|---|---|---|
| B1 | `.github/workflows/docs-tla-verify.yml:51,54` | job only runs when repo variable `TLA_OPK_GATE=true`, and is `continue-on-error: true` even then | job name says "informational - not gated yet" | the OPK TLA model stops being exploratory |
| B2 | `.github/workflows/nightly-phase2.yml:116` (`liboqs-cross`) | `continue-on-error: true` | "advisory: flip to a hard gate only once the pin proves stable" | liboqs 0.12.0 source build has been stable for ≥30 nightly runs |
| B3 | `.github/workflows/nightly-phase2.yml:153` (build-knob assertion) | `continue-on-error: true` | long comment: a wrong assertion must not skip the interop evidence below it; the assertion itself was rewritten after the 2026-11-07 string-table false positive | the interop run is split into its own job |
| B4 | `.github/workflows/repro-build-check.yml:67-70` | non-determinism only fails when `REPRO_STRICT=1` | emits `::warning::` + job summary verdict `NON-DETERMINISTIC WARN` | `gen-sbom.js` output is stable across runs |

## C. Silently neutralised

| # | Location | Command | What is lost |
|---|---|---|---|
| C1 | `.github/workflows/ci.yml:313` | `npx markdownlint-cli ... 2>/dev/null \|\| true` | markdown formatting never fails the docs job. `2>/dev/null` also hides the reason it might have failed |
| C2 | `.github/workflows/ci.yml:317` | `npx markdown-link-check ... 2>/dev/null \|\| true` | dead links in docs never fail. This is the gate that would have caught renamed evidence files |
| C3 | `.github/workflows/pqc-migration-verify.yml:78` | `node tools/check-crypto-policy.cjs --baseline /tmp/crypto-b.json \|\| true` | the policy check is decorative; the step only proves the scanner does not crash |

These three are the highest-value fixes: each is a one-word deletion (`|| true`) plus, for C1/C2,
removing `2>/dev/null` so that a *tool* failure is distinguishable from a *finding*.

## D. Logic-level false green

These are not YAML switches. The step is configured correctly and still proves nothing, because the
condition it asserts is satisfied by the fallback path it was meant to exclude.

### D1. `native-build.yml` - "Verify native addon loads"

The step printed `Backend: JS (no addon)` and exited 0. Its round-trip assertion
(`encapsulate` -> `decapsulate`) also passes on the pure-JS fallback, so a build that produced **no
addon at all** would still be green. This is exactly how the production addon went missing for ~75 days
without a single red check (see `docs/audit-log/2026-11-16-deployment-drift-postmortem.md`).

The step must assert what it says: `if (!pk.usingNative) { console.error(...); process.exit(2); }`.
A draft PR (#525, `ci/native-artifact`) adds exactly that check plus the sha256 manifest of the built
addon; it is unmerged, so `main` today still passes a build that produced no addon.

### D2. `scripts/deploy-fibemate.sh` - `date -d @"$VAR"` quoting

Step `[3d/6]` formatted the addon build time with `date -d @\"$VAR\"`. The extra quotes were passed
through to `date(1)`, which printed `date: invalid date '"1794822499"'` on stderr, returned non-zero, and
the deploy continued: `built` was simply empty in the log, and the run ended with `DEPLOY OK`. Fixed in
`#524` (`-d "@$VAR"`).

The lesson is not "quote correctly". It is that a **diagnostic** that fails silently converts evidence
into noise, and nobody re-reads a log line that has always been empty.

### D3. `packages/pqc-kem/index.js` - loader `catch`

The native loader wraps `require()` in a `catch` that returns the JS fallback with no console output.
Production ran pure JS for ~75 days while every health check said OK. Now: `src/index.js` prints a
6-line banner, `/health` exposes `mlkem.backend`, and `MLKEM_REQUIRE_NATIVE=1` turns the fallback into
a fatal error. See `#520`, `#523`.

---

## Rules for adding a new soft gate

1. Add it to this page in the same PR. A soft gate that is not listed here is a bug.
2. Say what it *would* have caught and why that is acceptable right now.
3. Give the exit condition - the observable event that means "harden this now", not a date.
4. Prefer `::warning::` over silence. `|| true` with no output is not a soft gate, it is a deleted gate.
5. Any check whose assertion can be satisfied by a fallback path must assert the **primary** path
   explicitly (D1 is the canonical example).

## Related

- `docs/audit-log/2026-11-16-deployment-drift-postmortem.md` - how three of these soft gates combined
  into 75 days of undetected drift.
- `RELEASE-DISCIPLINE.md` (repository root of `fibemate-tools`) - the release-side equivalent: "a gate
  must be falsifiable by a failing input".
