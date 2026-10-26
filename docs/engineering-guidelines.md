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

## 6. Containers: the entry point and the working directory are coupled

The official Isabelle image (`makarius/isabelle:Isabelle2025-2`) declares, as inspected:

```
Entrypoint: ["Isabelle/bin/isabelle"]     # relative, not absolute
WorkingDir: /home/isabelle
```

Adding a reproduction job produced three failures worth keeping, because each one looks
correct on the page:

- `ENTRYPOINT ["isabelle"]` fails with `exec: "isabelle": executable file not found in
  $PATH`. An exec-form entry point is not looked up in the image's `PATH`, and Isabelle is
  not on it. A shell-form entry point would be, which is why the two are not
  interchangeable.
- Inheriting that relative entry point while setting `WORKDIR /workspace` fails with
  `stat Isabelle/bin/isabelle: no such file or directory`. The relative path resolves
  against the working directory, so changing the latter breaks the former.
- `docker run -w /workspace` reproduces the same failure from the outside, even when the
  image sets no `WORKDIR` of its own.

The fix pins the absolute path and then refuses to trust it silently:

```dockerfile
RUN /home/isabelle/Isabelle/bin/isabelle version
ENTRYPOINT ["/home/isabelle/Isabelle/bin/isabelle"]
```

The `RUN` line is the part that matters. A layout learned from `docker image inspect` is an
assumption; exercising it in a build step turns it into a check. If the base image moves the
distribution, the image stops building with a clear error instead of failing at run time with
exit 127 and nothing else.

**General rule**: every fact you read out of a base image (paths, versions, entry points)
belongs in a `RUN` that exercises it, so the assumption fails at build time rather than in
front of a reviewer.

## 7. Heavy toolchains belong in CI, not on a laptop or a production host

Isabelle needs about 4 GB of memory for small sessions. The reproduction job therefore runs
on a stock public runner (4 cores, 16 GB) rather than on a development machine that has no
container runtime, or on a production server that already serves traffic with 1 GB of RAM.
That is not a performance question; running a multi-gigabyte toolchain next to a live site is
an availability risk.

The job takes about 11 minutes, most of it building `HOL-Computational_Algebra` and
`HOL-Number_Theory`, which the official image does not pre-build. That is a caching problem,
not a correctness problem, and it is tracked rather than hidden.

## 8. Two parsers reading the same document must share one "what is prose" mask

A document contains both claims and examples of claims. Every parser that reads those
documents has to agree about which is which — a directive parser that does not know about
code fences is a smoke detector with the sensor unplugged.

- **What happened**: `dispositions.js` (fibemate-tools#93) parsed `<!-- verifact: ... -->`
  directives, but only masked HTML comments — not fenced code blocks, not inline code.
  `claims.js`, reading the same files, had masked fences since it was written. The RFC's own
  example of an unimplemented disposition (`docs/rfc-verifact-dispositions.md:192`) is
  therefore read as a live declaration, and every real run aborted with `disposition_error`
  before reaching the gate. Fixed in #109.
- **Rule**: when two modules read one file format, the "is this prose?" decision belongs in
  one function that both call. If two modules each implement it, they will drift, and the
  drift is silent because each module's own tests pass.
- **Rule**: test with the shapes that exist in the documents, not a simplified fixture. The
  cases that broke were a fenced example, an inline-code example, and an unterminated fence
  (CommonMark: a fence without a closing marker runs to end of file).
- **Corollary**: a control case is mandatory — a test proving a *real* directive still parses.
  A mask that hides everything also passes "the example was ignored".

## 9. A table cell must not inherit its neighbour's unit

In `| keygen | 48 µs | 0.522 ms |`, the `µs` of the native column tokenises to `s`, and if
the extractor takes tokens from a window before the number, that `s` becomes part of the next
cell's key: `keygen-s`. The key drives candidate selection, so a poisoned key means wrong
candidates — and, historically, a hand-written exemption to silence the result.

- **Rule**: tokens taken from a prefix window must be checked for "this belongs to the
  previous number" (a trailing `<number><unit>` immediately before the current cell) and
  dropped when so.
- **Rule**: add the opposite control. `| keygen ms |` has a unit that genuinely belongs to the
  header; a fix that strips every trailing unit breaks it.
- **Symptom to look for**: exemption keys that contain a unit suffix (`keygen-s`, `keygen-ms`)
  are a fingerprint of this bug, not of a measurement disagreement.

## 10. A path glob is only as good as the string it is matched against

`sealed: ["docs/tsa/**"]` matched nothing, and the guard it was supposed to provide did not
exist — while the report stayed green (fibemate-tools#110).

- **Cause**: claim paths carry the repository prefix (`fibemate/www/docs/tsa/...`) because
  doc roots reach into sibling repos. A pattern anchored at `docs/` can never match them.
  Measured against the real paths: `docs/tsa/**` → false, `www/docs/tsa/**` → false,
  `**/docs/tsa/**` → true.
- **Rule**: test a new pattern against an actual path taken from a report, not against the
  path as it looks in your head. `**/`-anchoring is the safe default for cross-repo roots.
- **Rule**: an unmatched rule must be an error, not a warning. A configured-but-unused rule
  is indistinguishable from a rule that was deleted, except that everyone believes it works.
- **Rule**: `0 files scanned` is never a pass for the same reason.

## 11. CI must run the gate on real documents, and a zero must be red

`verifact-ci.yml` ran only `test/run.js`. The suite could not catch the #93 bug because no
test contained a fenced directive example — the real documents do. For the life of that bug,
CI was green while every real run aborted (fibemate-tools#111).

- **Rule**: at least one CI job runs the gate against documents that are not fixtures —
  either a committed corpus copied from real docs, or a checkout of the doc repositories.
- **Rule**: the job fails when the scanned document count is zero. A gate that scans nothing
  passes everything.
- **Rule**: mutation-check it. Change one number in a corpus document without touching its
  artifact and confirm CI goes red. A gate nobody has made fail is an assumption.
- **Prefer both**: the copied corpus on every push (fast, catches parser regressions), the
  real repositories nightly (catches document drift).
