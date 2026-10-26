# Engineering Guidelines & Anti-False-Green Policies

> **Context**: distilled from the red-team audit and formal-verification replication of
> 2026-10-25/26. A "false green" — a CI check that passes without checking anything — is more
> dangerous than a red build: a red build announces itself, a false green does not.

## 1. Data semantics: never coerce `absent` into `0` (or into a default)

- **Rule**: for fields whose meaning is a claim, compare strictly and keep "absent"
  distinguishable from every value. No `|| 0`, no `?? 0`.
- **Context**: in CBOM, an omitted `nistQuantumSecurityLevel` makes no assertion about NIST
  categories, and says nothing about whether an assessment was performed; `0` asserts that
  none of the categories are met (MD5 is the real case). Folding absent into `0` erases the
  difference between "nothing claimed" and "known insecure".
- **Careful**: omission is not "not evaluated" either. It is the absence of a claim, so it
  cannot be read as a status.
- **Example**: `const level = cbom.nistQuantumSecurityLevel === undefined ? null : cbom.nistQuantumSecurityLevel;`
- **Where we hit it**: `cbom-tools/cbom-diff.js` used `version || 0`, which reported a
  downgrade whenever `bom.version` was omitted; the schema default for `version` is `1`, so
  the coerced value was not even a legal value. Fixed in fibemate-tools#91.

## 2. Build gates: a command-line `-o` does not override `ROOT` session options

- **Rule**: do not try to enforce a strict Isabelle build with
  `isabelle build -o quick_and_dirty=false`.
- **Context**: session `options` in `ROOT` take precedence over the command line. Measured on
  Isabelle2025-2, 2026-10-26: `isabelle build -b -c -o quick_and_dirty=false -D aligned` →
  `Finished VWZ_A3_Aligned (0:00:42 elapsed time)`, **RC=0** — a gate that is permanently
  green and checks nothing.
- **Correct approach**: `aligned/ROOT.strict` (the same session without
  `options [quick_and_dirty]`), copied over `ROOT` in CI in a scratch checkout. Measured:
  RC=1 with six `*** Cheating requires quick_and_dirty mode!` reports. The permissive build
  returning RC=0 means "the theories are accepted", not "the chain is `sorry`-free".

## 3. Fixtures: the file name must match what the harness selects

- **Rule**: name fixtures after the prefix the upstream test harness selects on.
- **Context**: CycloneDX selects JSON fixtures with `resourceName.startsWith("valid")` /
  `startsWith("invalid")` (`JsonSchemaVerificationTest.java:102/105`). A file named
  `cbom-family-only-mlkem-2.0.json` is skipped silently: the suite is green and that file was
  never validated.
- **Correct approach**: `valid-cbom-family-only-mlkem-2.0.json`.
- **Also**: a "VALID" result only means something next to an "INVALID" control that the same
  schema rejects.

## 4. Formal verification: scope every gate, and publish the counter

- **Rule**: define `outside` with an explicit session scope ("outside the `VWZ_A3_Aligned`
  session"), state that scaffolding is excluded, and ship the counting script whose output is
  quoted verbatim.
- **Context**: `grep -rn sorry` finds the 37 deliberate one-line placeholders in
  `skeleton/VWZ_A3_Skeleton.thy`, which contradicts a bare "0 outside" claim. Count
  proof-position `sorry` only (whole line trimmed equal to `sorry`); print raw token counts
  separately (67 repository-wide, 21 in the ledger file).
- **Cross-check**: the prover is the independent witness. The six open obligations the script
  reports are exactly the six lines Isabelle rejects in strict mode: 439, 446, 905, 1002,
  1089, 1150 (measured 2026-10-26).

## 5. The general shape of a gate

A gate has three parts, and all three have to be stated: **the command**, **the exact expected
output**, and **a negative control** — what must go red if the thing being checked is broken.
A gate without the third part is an assumption, not a check.
