# Engineering Verification of PQC

Working directory for the paper:

> **Engineering Verification of PQC: A Case Study on Formalizing VWZ in
> Isabelle/HOL and Supply Chain Integration (CBOM)**

## Status: outline

This is a skeleton. The structure, the argument, and every number are in place.
There are no remaining placeholder markers in the PDF: the `\todo{}` and
`\claim{}` macros are compiled out by default, and the internal checklist has
been resolved or moved into `%` comments in the `.tex` sources.

To see the draft markers again (useful when editing), set `\draftnotestrue` in
`main.tex`:

```latex
\draftnotestrue   % renders [TODO: ...] in red and [CLAIM TO VERIFY: ...] in orange
```

**Note on a bug that was here:** the earlier version defined `\todosvisible`
with `\newcommand` and then tested it with `\ifdefined`, which is always true —
so the orange markers rendered in every build, including the one that looked
finished. Fixed by switching to `\newif\ifdraftnotes`.

## What is settled and what is not

| Section | State |
|---|---|
| Abstract | numbers verified, prose drafted |
| 1 Introduction | drafted; BSI citation verified against the primary PDF |
| 2 Formalization | tier tables verified; T0/T1-A and all 15 open lemmas enumerated from source |
| 3 CBOM | drafted; component table verified against the artefact |
| 4 Case Study | drafted in full — this is the paper's contribution |
| 5 Limitations | drafted in full; snapshot commit pinned |
| 6 Conclusion | drafted |
| 7 Appendix | tables verified; commit SHAs and schema hashes filled in |

## Numbers

Every figure in the paper was re-derived from the repositories, not copied from
notes. To recheck:

```bash
node tools/count-obligations.cjs          # in fibemate-vwz
node scripts/build-cbom.js --check        # in fibemate
```

Counts that appear in the paper and their sources:

| Figure | Value | Source |
|---|---|---|
| Lemmas (whole corpus) | 185 | `count-obligations.cjs` |
| Theorems | 2 | same |
| `sorry` (whole corpus) | 17 | same |
| Ledger lemmas / `sorry` | 56 / 17 | same |
| Theorems | 1 | same |
| Theory files / bytes | 10 / 125,165 | `git ls-files`, `stat` |
| CBOM components | 9 | `tools/cbom-cyclonedx.json` |
| Distinct files | 304 | derived from `evidence.occurrences` |
| Occurrences | 647 | same |
| Quantum-safe / vulnerable | 7 / 2 | derived from `fibemate:quantumSecurity:level` |
| CBOM artefact bytes | 63,485 | `stat` |

## Build

```bash
pdflatex main && bibtex main && pdflatex main && pdflatex main
```

## Before submission

1. Confirm `\draftnotesfalse` is in effect and no `\todo{}` or `\claim{}`
   renders. (They are compiled out by default; this is now a check, not a task.)
2. Commit SHAs and the CBOM schema hash are filled in — re-check them against
   the repositories, since both will have moved.
3. The BSI citation is verified: document identifier `BMI26024`, cover date
   11 September 2026, imprint "Stand: August 2026", announced 12 October 2026;
   §4.3 names CycloneDX/CBOM, §4.6 says CBOM provision "can be set down in
   contracts", §4.1 carries the 2026/2030/2035 dates. Re-verify if the document
   is revised.
4. Decide the target venue and reformat: the current class is `article` for
   drafting. ePrint has no length limit; a workshop submission will need cutting,
   and Section 4 is the part to keep.

## Note on claims

The paper argues that unstated limitations are the characteristic failure of PQC
evidence. It would be self-refuting to submit it with any. If a claim cannot be
supported by a file in the repository, it should be deleted rather than softened.
