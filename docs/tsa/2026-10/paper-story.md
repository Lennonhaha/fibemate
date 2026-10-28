# Paper story — FIBEMATE tooling line

Target venues, in order of fit:

1. **USENIX Security / CCS Artifact Track** — the tooling already has the shape artifacts
   need (reproducible packaging, signed releases, offline audit), and the artifact track
   rewards exactly the thing this work is strongest at: evidence that the artifact does what
   the paper says.
2. **ICSE / FSE (tool + empirical track)** — if the emphasis lands on "how practitioners get
   false assurance from SBOM tooling", the software-engineering venues are the better home.

Both need the same three contributions stated the same way. What follows is the story, not a
result set: every number is marked `[measured]`, `[in progress]` or `[planned]`.

## Working title

**False Green in Post-Quantum SBOM Tooling: Optional Fields, Silent Data Loss, and an
Auditable Alternative**

## Contribution 1 — Empirical: how the ecosystem produces false assurance

Claim: the dominant failure mode of CBOM/SBOM tooling for post-quantum migration is not a
crash or a wrong answer, it is a **well-formed, schema-valid document that silently carries
less information than it appears to**.

Two measured cases:

- **Silent field loss in a standards-conformant serializer.** In `cyclonedx-python-lib`
  11.12.0, `algorithmProperties.algorithmFamily` and `ellipticCurve` are dropped in both JSON
  and XML output; the result still validates against the CycloneDX 1.7 schema. `[measured]`
  Reported as an independent verification comment on the upstream tracking PR rather than as
  a bug report, because 1.7 support is a tracked known-missing feature, not a regression —
  the interesting part is the *silence*, not the gap.
- **Optional-field incompleteness in our own audit corpus.** 2,263 claims across 345 documents:
  before the sealed-artifact glob was repaired, `docs/tsa/**` matched zero real labels (real
  labels look like `fibemate/docs/tsa/…`), so 45 timestamped artifact declarations were judged
  `unbound` — a permanent zero-match rule, i.e. a rule that cannot fail loudly. `[measured]`
  After repair: `sealed=45`, `unbound 1768→1728`, `verified 138→135` (three of the 45 were
  previously counted as verified under a looser rule).

The generalisation to defend in the paper: **a tool that only reports "valid / invalid" cannot
distinguish "checked and clean" from "not checked at all"**. Practitioners read the first.

## Contribution 2 — Method: separating declaration state from evaluation state

Claim: audit results should be a **partial order with explicit unknowns**, not a boolean.

`verifact` assigns each claim a *declaration state* (is the artifact present, hashed, and
timestamped?) independently of an *evaluation state* (does the code do what the claim says?),
and refuses to collapse the two. Concretely:

- content-addressed binding between a claim and a file digest, so a claim cannot silently
  follow a file that changed;
- strict inequality checks (a claim is `verified` only if every required field matches; a
  missing field is `unbound`, never a pass);
- an explicit `ambiguous` bucket and a `drift` counter, both of which must be reported to the
  reader — the arithmetic on the published page has to reconcile
  (`137+0+213+1768=2118`, `2118+17+1=2136`, `2136+126=2262` `[measured]`), and a page that
  does not reconcile renders red instead of rendering normally.

The methodological contribution is the **reconciliation rule**: any summary number shown to a
user must be derivable from the counts displayed beside it. This is what makes the false-green
class detectable at all; it is also the cheapest possible defence and, in our survey of
comparable tools, an uncommon one. `[in progress: same-arithmetic check on Trivy/Syft output]`

## Contribution 3 — Tool and evaluation

Claim: the method is implementable end-to-end, and the tooling itself is auditable.

- **Generation**: `cbom-tools` (`cbom-tools` on npm) walks a repository and emits CycloneDX
  1.6 or 1.7 CBOMs, with a publish-contract test that keeps the shipped `files[]` list in sync
  with every runtime `require` — after 0.2.2 shipped a package missing one module.
- **Audit**: `verifact` (offline, no network at verification time) produces the claim
  ledger described above; `crypto-time-ledger` binds artifacts to RFC 3161 timestamps and
  exports a self-verifying offline bundle.
- **Model-output screening**: `crypto-hallucination-detector` scans generated code for
  cryptographic API misuse patterns. `[planned: quantitative study — N samples per model,
  precision/recall against a hand-labelled subset; the number that matters is the false
  positive rate on idiomatic correct code]`
- **Supply chain**: every published artifact is released through GitHub Actions with OIDC,
  Sigstore signatures and SLSA provenance; releases are verified by re-downloading from the
  registry and recomputing digests, not by trusting the publish log.

Evaluation plan, in the order the reviewers will ask for it:

1. **Comparative coverage** `[planned]`: the same ~340-document corpus through Trivy, Syft,
   CycloneDX CLI and this toolchain; report per-tool field retention against the 1.7 schema,
   with the specific fields each tool drops. The claim to beat is not "we find more" but
   "the others cannot report what they did not look at".
2. **False-green detection** `[in progress]`: mutation testing on each gate — delete the
   check, confirm the gate goes red. Every gate in this project is required to demonstrate
   this, and several were found to be green-but-vacuous on first attempt.
3. **Formal core** `[planned]`: map the claim-state lattice to Isabelle/HOL and prove the
   property that matters — a claim cannot reach `verified` without a matching digest, i.e. no
   path through the state machine skips the binding check. This replaces "we reviewed the
   code" with a machine-checked statement.
4. **Artifact quality**: time-to-first-audit on a clean machine, offline verification success
   from the exported bundle, and the release-verification procedure as a shell transcript.

## Threats to validity (state them before a reviewer does)

- The corpus is one project's documents plus one external library; the field-loss finding is
  generalisable only insofar as other serializers share the "optional field, silent drop"
  pattern — which is exactly what the comparative study must show.
- Counting claims is sensitive to how a "claim" is segmented; the paper must publish the
  segmentation rule and a sample, not just totals.
- Timestamps prove existence, not correctness. A TSR on a wrong file is a well-attested wrong
  file, and the paper should say so in those words.
- We are the authors of the tool being evaluated; the mutation tests and the external schema
  validation are there to make that bias expensive, not to remove it.

## Why this is not the previous three submissions

The three rejected drafts read as project documentation: what we built, in the order we built
it. This one opens with a failure mode that exists independently of us, measures it in someone
else's code as well as our own, states a method that would have caught it, and only then
presents tooling as the instantiation. The negative results — the fixture that cannot judge,
the gate that was green because its regex matched a string literal, the package that shipped
without a module — are evidence, not embarrassment, and they belong in the evaluation section.
